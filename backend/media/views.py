import calendar
import logging
import mimetypes
import os
import uuid
from datetime import datetime, timedelta

from django.conf import settings
from django.core.cache import cache, caches
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.html import escape
from django.utils.timezone import is_aware, make_aware
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.throttling import UserRateThrottle

from telegram_storage.blob_storage import BlobStorageService
from telegram_storage.storage import StorageError, TelegramFile, TelegramStorage

from . import processing
from .models import Media, MediaVariant, SharedLink
from .serializers import MediaSerializer
from .signing import SignedMediaAuthentication, SignedMediaGrant
from .streaming import bytes_response, ranged_response
from .tasks import apply_taken_at, delete_telegram_messages, requeue_stalled, upload_media_to_telegram

logger = logging.getLogger(__name__)

FILE_ACTIONS = {"content", "thumbnail", "preview", "download"}
MONTHS = {name.lower(): number for number, name in enumerate(calendar.month_name) if name}
MONTHS.update({name.lower(): number for number, name in enumerate(calendar.month_abbr) if name})


class UploadRateThrottle(UserRateThrottle):
    scope = "uploads"


class MediaPagination(PageNumberPagination):
    page_size = 60
    page_size_query_param = "page_size"
    max_page_size = 200


def parse_client_timestamp(value):
    if not value or value in ("undefined", "null"):
        return None
    try:
        if str(value).isdigit():  # epoch milliseconds
            return datetime.fromtimestamp(int(value) / 1000, tz=timezone.get_current_timezone())
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if is_aware(dt) else make_aware(dt)
    except (ValueError, OverflowError, OSError):
        return None


def filter_media(queryset, params):
    if params.get("is_favorite") == "true":
        queryset = queryset.filter(is_favorite=True)

    media_type = params.get("media_type")
    if media_type in ("image", "video"):
        queryset = queryset.filter(media_type=media_type)

    album_id = params.get("album")
    if album_id and album_id.isdigit():
        queryset = queryset.filter(albums__id=album_id)

    date = params.get("date")
    if date:
        queryset = queryset.filter(taken_at__date=date)

    search = (params.get("search") or "").strip()
    if search:
        query = Q()
        for term in search.split():
            term_query = Q(filename__icontains=term)
            lowered = term.lower()
            if term.isdigit() and len(term) == 4:
                term_query |= Q(taken_at__year=int(term))
            elif lowered in MONTHS:
                term_query |= Q(taken_at__month=MONTHS[lowered])
            elif lowered in ("video", "videos"):
                term_query |= Q(media_type="video")
            elif lowered in ("photo", "photos", "image", "images"):
                term_query |= Q(media_type="image")
            query &= term_query
        queryset = queryset.filter(query)
    return queryset


def create_media_from_blob(*, user, blob_name, filename, mime_type, media_type, size,
                           file_hash=None, taken_at=None, taken_at_source="upload", existing=None):
    """Create (or reset) a processing Media row and queue the Telegram upload."""
    safe_filename = processing.safe_filename(filename)
    if existing:
        media = existing
        media.status = "processing"
        media.upload_error = None
        media.temp_file_path = blob_name
        media.save()
    else:
        media = Media.objects.create(
            user=user,
            media_type=media_type,
            filename=safe_filename,
            mime_type=mime_type,
            file_size=size,
            taken_at=taken_at or timezone.now(),
            taken_at_source=taken_at_source if taken_at else "upload",
            file_hash=file_hash,
            status="processing",
            temp_file_path=blob_name,
        )
    transaction.on_commit(lambda: upload_media_to_telegram.delay(media.id))
    return media


class MediaViewSet(viewsets.ModelViewSet):
    serializer_class = MediaSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = MediaPagination
    authentication_classes = [SignedMediaAuthentication, *api_settings.DEFAULT_AUTHENTICATION_CLASSES]
    lookup_value_regex = r"\d+"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # A signed media link only grants access to that file's bytes.
        if isinstance(request.auth, SignedMediaGrant) and self.action not in FILE_ACTIONS:
            raise PermissionDenied("Media links can't be used for this request.")

    def get_throttles(self):
        # Grids load hundreds of thumbnails and players issue many range requests.
        if self.action in FILE_ACTIONS:
            return []
        if self.action == "create":
            return [UploadRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        queryset = Media.objects.filter(user=self.request.user)
        if self.action == "retrieve":
            # Upload polling needs to see failed/duplicate items too.
            return queryset.filter(is_deleted=False)
        queryset = queryset.filter(is_deleted=False).exclude(status="duplicate")
        ordering = self.request.query_params.get("ordering", "date")
        if ordering == "added":
            return filter_media(queryset, self.request.query_params).order_by("-created_at", "-id")
        return filter_media(queryset, self.request.query_params).order_by("-taken_at", "-created_at")

    # -- uploads -------------------------------------------------------------

    def create(self, request, *args, **kwargs):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        if uploaded_file.size > settings.MAX_UPLOAD_SIZE:
            return Response(
                {"error": f"File exceeds maximum upload size of {settings.MAX_UPLOAD_SIZE} bytes."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        header = uploaded_file.read(8192)
        uploaded_file.seek(0)
        mime_type, media_type = processing.detect_media_type(header)
        if not mime_type:
            return Response({"error": "Unsupported or invalid media type."}, status=status.HTTP_400_BAD_REQUEST)

        file_hash = processing.hash_stream(uploaded_file.chunks())
        uploaded_file.seek(0)

        existing = (
            Media.objects.filter(user=request.user, file_hash=file_hash)
            .exclude(status="duplicate")
            .order_by("status")  # "completed" < "failed" < "processing"
            .first()
        )
        if existing and existing.status == "completed":
            return Response(MediaSerializer(existing, context={"request": request}).data, status=status.HTTP_200_OK)
        recently_queued = existing and existing.updated_at > timezone.now() - timedelta(hours=1)
        if existing and existing.status == "processing" and existing.temp_file_path and recently_queued:
            return Response(MediaSerializer(existing, context={"request": request}).data,
                            status=status.HTTP_202_ACCEPTED)

        holder = Media(taken_at=None, taken_at_source="")
        apply_taken_at(holder, parse_client_timestamp(request.data.get("client_timestamp")), "client")
        if media_type == "image":
            apply_taken_at(holder, *processing.quick_exif_taken_at(uploaded_file))
            uploaded_file.seek(0)

        blob_name = f"temp_uploads/{uuid.uuid4()}{os.path.splitext(uploaded_file.name)[1].lower()}"
        BlobStorageService().upload_stream(uploaded_file, blob_name, uploaded_file.size)

        media = create_media_from_blob(
            user=request.user,
            blob_name=blob_name,
            filename=uploaded_file.name,
            mime_type=mime_type,
            media_type=media_type,
            size=uploaded_file.size,
            file_hash=file_hash,
            taken_at=holder.taken_at,
            taken_at_source=holder.taken_at_source,
            existing=existing,
        )
        return Response(MediaSerializer(media, context={"request": request}).data, status=status.HTTP_202_ACCEPTED)

    # -- file bytes ------------------------------------------------------------

    def _file_media(self, request, pk):
        if isinstance(request.auth, SignedMediaGrant):
            return request.auth.media
        # Owners can still see thumbnails of trashed items.
        return get_object_or_404(Media, pk=pk, user=request.user)

    @staticmethod
    def _content_type(mime_type, filename):
        return mime_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"

    def _stream_original(self, request, media, disposition):
        content_type = self._content_type(media.mime_type, media.filename)
        storage = TelegramStorage()

        if media.telegram_message_id or media.telegram_file_id:
            tg_file = TelegramFile(media.telegram_message_id, media.telegram_file_id, media.file_size)
            etag = f'"m{media.id}-{media.telegram_message_id or media.telegram_file_unique_id}"'
            return ranged_response(
                request, size=media.file_size, content_type=content_type, filename=media.filename,
                disposition=disposition, etag=etag,
                open_range=lambda start, end: storage.iter_range(tg_file, start, end),
            )

        if media.temp_file_path:
            # Still processing: serve from the temporary upload.
            blob = BlobStorageService()
            try:
                size = blob.size(media.temp_file_path)
            except Exception:
                raise Http404("Media is not available yet.")
            response = ranged_response(
                request, size=size, content_type=content_type, filename=media.filename,
                disposition=disposition,
                open_range=lambda start, end: blob.iter_range(media.temp_file_path, start, end),
            )
            response["Cache-Control"] = "private, no-store"
            return response

        raise Http404("Media is not available.")

    def _guard(self, handler):
        try:
            return handler()
        except StorageError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Http404:
            raise
        except Exception:
            logger.exception("Media file request failed")
            return Response({"error": "Unable to retrieve media from storage."}, status=status.HTTP_502_BAD_GATEWAY)

    @action(detail=True, methods=["get"], url_path="content")
    def content(self, request, pk=None):
        media = self._file_media(request, pk)

        def handler():
            stream = media.variants.filter(kind=MediaVariant.STREAM).first() if media.media_type == "video" else None
            if stream:
                storage = TelegramStorage()
                tg_file = TelegramFile(stream.telegram_message_id, stream.telegram_file_id, stream.file_size)
                return ranged_response(
                    request, size=stream.file_size, content_type=stream.mime_type,
                    filename=f"{os.path.splitext(media.filename)[0]}.mp4",
                    etag=f'"s{media.id}-{stream.telegram_message_id or stream.id}"',
                    open_range=lambda start, end: storage.iter_range(tg_file, start, end),
                )
            return self._stream_original(request, media, "inline")

        return self._guard(handler)

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        media = self._file_media(request, pk)
        return self._guard(lambda: self._stream_original(request, media, "attachment"))

    @action(detail=True, methods=["get"], url_path="thumbnail")
    def thumbnail(self, request, pk=None):
        media = self._file_media(request, pk)

        def handler():
            data = self._thumbnail_bytes(media)
            if data:
                return bytes_response(request, data, content_type="image/jpeg",
                                      etag=f'"t{media.id}-{media.telegram_message_id}"')
            preview = self._preview_response(request, media)
            if preview:
                return preview
            if self._is_small_browser_image(media):
                return self._stream_original(request, media, "inline")
            raise Http404("Thumbnail not available.")

        return self._guard(handler)

    @action(detail=True, methods=["get"], url_path="preview")
    def preview(self, request, pk=None):
        media = self._file_media(request, pk)

        def handler():
            preview = self._preview_response(request, media)
            if preview:
                return preview
            if media.media_type == "image" and media.mime_type in processing.BROWSER_IMAGE_TYPES:
                return self._stream_original(request, media, "inline")
            data = self._thumbnail_bytes(media)
            if data:
                return bytes_response(request, data, content_type="image/jpeg",
                                      etag=f'"t{media.id}-{media.telegram_message_id}"')
            raise Http404("Preview not available.")

        return self._guard(handler)

    @staticmethod
    def _is_small_browser_image(media):
        return (media.media_type == "image" and media.mime_type in processing.BROWSER_IMAGE_TYPES
                and media.file_size <= 2 * 1024 * 1024)

    @staticmethod
    def _thumbnail_bytes(media):
        if not (media.telegram_message_id or media.telegram_thumbnail_file_id):
            return None
        cache_key = f"media:{media.id}:thumb:{media.telegram_message_id}"
        data = cache.get(cache_key)
        if data is None:
            data = TelegramStorage().read_thumbnail(
                media.telegram_message_id, media.telegram_thumbnail_file_id
            ) or b""
            # Also remember "no thumbnail" so grids don't hit Telegram on every load.
            cache.set(cache_key, data, timeout=7 * 24 * 3600 if data else 24 * 3600)
        return data or None

    @staticmethod
    def _preview_response(request, media):
        variant = media.variants.filter(kind=MediaVariant.PREVIEW).first()
        if not variant:
            return None
        file_cache = caches["file_cache"]
        cache_key = f"media:{media.id}:preview:{variant.telegram_message_id or variant.id}"
        data = file_cache.get(cache_key)
        if data is None:
            tg_file = TelegramFile(variant.telegram_message_id, variant.telegram_file_id, variant.file_size)
            data = b"".join(TelegramStorage().iter_range(tg_file, 0, variant.file_size - 1))
            file_cache.set(cache_key, data)
        return bytes_response(request, data, content_type=variant.mime_type,
                              etag=f'"p{media.id}-{variant.telegram_message_id or variant.id}"')

    # -- listing helpers -----------------------------------------------------------

    @action(detail=False, methods=["get"], url_path="timeline")
    def timeline(self, request):
        months = (
            self.get_queryset()
            .order_by()
            .annotate(month=TruncMonth("taken_at"))
            .values("month")
            .annotate(count=Count("id"))
            .order_by("-month")
        )
        return Response({
            "months": [
                {"month": row["month"].strftime("%Y-%m"), "count": row["count"]}
                for row in months if row["month"]
            ]
        })

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        totals = Media.objects.filter(user=request.user, is_deleted=False, status="completed").aggregate(
            total_items=Count("id"), total_size=Sum("file_size")
        )
        return Response({"total_items": totals["total_items"], "total_size": totals["total_size"] or 0})

    @action(detail=False, methods=["get"], url_path="status")
    def status_batch(self, request):
        """Upload progress for many items in one request: ?ids=1,2,3 (max 200)."""
        ids = [int(part) for part in request.query_params.get("ids", "").split(",") if part.strip().isdigit()][:200]
        queryset = Media.objects.filter(user=request.user, id__in=ids)
        try:
            # Clients poll this while waiting, so it doubles as the recovery path for lost tasks.
            requeue_stalled(queryset)
        except Exception:
            logger.exception("Could not requeue stalled uploads")
        return Response({"results": self.get_serializer(queryset, many=True).data})

    @action(detail=False, methods=["post"], url_path="check-hashes")
    def check_hashes(self, request):
        """Which of these SHA-256 hashes are already stored (lets clients skip re-uploading)."""
        hashes = request.data.get("hashes", [])
        if not isinstance(hashes, list) or len(hashes) > 500:
            return Response({"error": "hashes must be a list of at most 500 items."},
                            status=status.HTTP_400_BAD_REQUEST)
        wanted = {str(h).lower() for h in hashes if isinstance(h, str) and len(h) == 64}
        existing = Media.objects.filter(
            user=request.user, file_hash__in=wanted, status__in=["processing", "completed"]
        ).values_list("file_hash", flat=True)
        return Response({"existing": sorted(set(existing))})

    # -- mutations -----------------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="favorite")
    def favorite(self, request, pk=None):
        media = self.get_object()
        media.is_favorite = bool(request.data.get("is_favorite", not media.is_favorite))
        media.save(update_fields=["is_favorite", "updated_at"])
        return Response(self.get_serializer(media).data)

    @action(detail=True, methods=["post"], url_path="trash")
    def trash(self, request, pk=None):
        media = get_object_or_404(Media, pk=pk, user=request.user, is_deleted=False)
        media.is_deleted = True
        media.deleted_at = timezone.now()
        media.save(update_fields=["is_deleted", "deleted_at", "updated_at"])
        return Response({"message": "Media moved to trash."})

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, pk=None):
        media = get_object_or_404(Media, pk=pk, user=request.user, is_deleted=True)
        media.is_deleted = False
        media.deleted_at = None
        media.save(update_fields=["is_deleted", "deleted_at", "updated_at"])
        return Response({"message": "Media restored."})

    @action(detail=False, methods=["get"], url_path="trash")
    def trash_list(self, request):
        queryset = Media.objects.filter(user=request.user, is_deleted=True).order_by("-deleted_at")
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=True, methods=["post"], url_path="share")
    def create_share_link(self, request, pk=None):
        media = self.get_object()
        link = SharedLink.objects.filter(media=media).first() or SharedLink.objects.create(media=media)
        return Response({"url": request.build_absolute_uri(f"/share/{link.id}/")})

    def _delete_permanently(self, queryset):
        message_ids = []
        for media in queryset.prefetch_related("variants"):
            message_ids.append(media.telegram_message_id)
            message_ids.extend(v.telegram_message_id for v in media.variants.all())
        count = queryset.count()
        queryset.delete()
        message_ids = [m for m in message_ids if m]
        if message_ids:
            transaction.on_commit(lambda: delete_telegram_messages.delay(message_ids))
        return count

    def perform_destroy(self, instance):
        self._delete_permanently(Media.objects.filter(pk=instance.pk))

    @action(detail=True, methods=["delete"], url_path="permanent-delete")
    def permanent_delete(self, request, pk=None):
        queryset = Media.objects.filter(pk=pk, user=request.user, is_deleted=True)
        if not queryset.exists():
            return Response({"error": "Media not found in trash."}, status=status.HTTP_404_NOT_FOUND)
        self._delete_permanently(queryset)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["delete"], url_path="empty-trash")
    def empty_trash(self, request):
        count = self._delete_permanently(Media.objects.filter(user=request.user, is_deleted=True))
        return Response({"message": f"Emptied {count} items from trash."})

    @action(detail=False, methods=["post"], url_path="bulk-trash")
    def bulk_trash(self, request):
        media_ids = request.data.get("media_ids", [])
        if not isinstance(media_ids, list):
            return Response({"error": "media_ids must be a list."}, status=status.HTTP_400_BAD_REQUEST)
        updated = Media.objects.filter(id__in=media_ids, user=request.user, is_deleted=False).update(
            is_deleted=True, deleted_at=timezone.now(), updated_at=timezone.now()
        )
        return Response({"message": f"{updated} items moved to trash."})

    @action(detail=False, methods=["post"], url_path="bulk-favorite")
    def bulk_favorite(self, request):
        media_ids = request.data.get("media_ids", [])
        is_favorite = bool(request.data.get("is_favorite", True))
        if not isinstance(media_ids, list):
            return Response({"error": "media_ids must be a list."}, status=status.HTTP_400_BAD_REQUEST)
        updated = Media.objects.filter(id__in=media_ids, user=request.user, is_deleted=False).update(
            is_favorite=is_favorite, updated_at=timezone.now()
        )
        return Response({"message": f"{updated} items favorite status updated."})


# -- public share links ----------------------------------------------------------------

def _shared_media(link_id):
    link = get_object_or_404(SharedLink.objects.select_related("media"), id=link_id)
    if link.expires_at and link.expires_at < timezone.now():
        raise Http404("This link has expired.")
    if link.media.is_deleted:
        raise Http404("This media is no longer available.")
    return link.media


def shared_link_content(request, link_id):
    media = _shared_media(link_id)
    storage = TelegramStorage()
    stream = media.variants.filter(kind=MediaVariant.STREAM).first() if media.media_type == "video" else None
    source = stream or media
    if not (source.telegram_message_id or source.telegram_file_id):
        raise Http404("Media is still processing.")
    tg_file = TelegramFile(source.telegram_message_id, source.telegram_file_id, source.file_size)
    content_type = source.mime_type or "application/octet-stream"
    return ranged_response(
        request, size=source.file_size, content_type=content_type, filename=media.filename,
        etag=f'"share-{media.id}-{source.telegram_message_id}"',
        open_range=lambda start, end: storage.iter_range(tg_file, start, end),
    )


def shared_link_view(request, link_id):
    from django.http import HttpResponse

    media = _shared_media(link_id)
    content_url = request.build_absolute_uri(f"/share/{link_id}/content/")
    title = escape(media.filename)

    if media.media_type == "image":
        media_html = f'<img src="{content_url}" alt="{title}">'
        og_type = "image"
    else:
        media_html = f'<video controls playsinline preload="metadata" src="{content_url}"></video>'
        og_type = "video.other"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} - Own Gallery</title>
  <meta property="og:title" content="Shared from Own Gallery">
  <meta property="og:type" content="{og_type}">
  <meta property="og:url" content="{escape(request.build_absolute_uri())}">
  <meta property="og:image" content="{content_url}">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #111;
           color: #bbb; margin: 0; display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; }}
    img, video {{ max-width: 100vw; max-height: 88vh; border-radius: 8px; }}
    .footer {{ margin-top: 16px; font-size: 14px; }}
  </style>
</head>
<body>
  {media_html}
  <div class="footer">Shared via Own Gallery</div>
</body>
</html>"""
    return HttpResponse(html)
