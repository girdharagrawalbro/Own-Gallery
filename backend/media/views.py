import asyncio

import os
import uuid
from django.conf import settings
from .tasks import upload_media_to_telegram

from telegram_storage.blob_storage import BlobStorageService
from django.http import StreamingHttpResponse
import urllib.parse
import mimetypes
from rest_framework.decorators import action
from django.utils import timezone

from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from .models import Media
from .serializers import MediaSerializer
from telegram_storage.service import TelegramStorageService
from .metadata import extract_image_taken_at, extract_video_taken_at


class UploadRateThrottle(UserRateThrottle):
    scope = "uploads"

class MediaViewSet(viewsets.ModelViewSet):
    serializer_class = MediaSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_throttles(self):
        if self.action == 'create':
            return [UploadRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        queryset = Media.objects.filter(user=self.request.user, is_deleted=False)
        
        is_favorite = self.request.query_params.get("is_favorite")
        if is_favorite == "true":
            queryset = queryset.filter(is_favorite=True)
            
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(filename__icontains=search)
            
        media_type = self.request.query_params.get("media_type")
        if media_type in ["image", "video"]:
            queryset = queryset.filter(media_type=media_type)
            
        album_id = self.request.query_params.get("album")
        if album_id:
            queryset = queryset.filter(albums__id=album_id)
            
        date = self.request.query_params.get("date")
        if date:
            queryset = queryset.filter(created_at__date=date)
            
        # Order by taken_at, fallback to created_at
        queryset = queryset.order_by("-taken_at", "-created_at")
        
        return queryset

    def create(self, request, *args, **kwargs):

        print("1. Request received")

        uploaded_file = request.FILES.get("file")

        if not uploaded_file:
            print("2. No file")
            return Response(
                {"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST
            )

        from django.conf import settings
        import os

        if uploaded_file.size > settings.MAX_UPLOAD_SIZE:
            return Response(
                {"error": f"File exceeds maximum upload size of {settings.MAX_UPLOAD_SIZE} bytes."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )

        print("2. File received:", uploaded_file.name)
        print("3. File size:", uploaded_file.size)
        print("4. Declared Content type:", uploaded_file.content_type)
        
        # Real MIME/Signature Validation
        import filetype
        file_header = uploaded_file.read(2048)
        uploaded_file.seek(0)
        kind = filetype.guess(file_header)
        
        if kind is None:
            return Response({"error": "Unsupported or invalid media type."}, status=status.HTTP_400_BAD_REQUEST)
        
        content_type = kind.mime
        print("5. Real Content type:", content_type)
        
        ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"]
        ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"]
        
        if content_type in ALLOWED_IMAGE_TYPES:
            media_type = "image"
        elif content_type in ALLOWED_VIDEO_TYPES:
            media_type = "video"
        else:
            return Response(
                {"error": "Unsupported or invalid media type."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Filename sanitization
        import re
        safe_filename = os.path.basename(uploaded_file.name)
        safe_filename = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', safe_filename)
        if not safe_filename:
            safe_filename = "unnamed_file"

        import hashlib
        sha256_hash = hashlib.sha256()
        for chunk in uploaded_file.chunks():
            sha256_hash.update(chunk)
        file_hash = sha256_hash.hexdigest()
        uploaded_file.seek(0)
        
        # Check for duplicate
        existing_media = Media.objects.filter(user=request.user, file_hash=file_hash).first()
        if existing_media:
            if existing_media.status == "completed":
                print("Duplicate file found, returning existing media")
                return Response(MediaSerializer(existing_media, context={"request": request}).data, status=status.HTTP_200_OK)
            else:
                print("Duplicate file found but status is not completed. Re-processing.")
        print("5. Creating Telegram service")
        
        taken_at = None
        
        client_timestamp = request.POST.get("client_timestamp")
        if client_timestamp:
            try:
                from datetime import datetime
                from django.utils.timezone import make_aware, is_aware
                client_timestamp = client_timestamp.replace("Z", "+00:00")
                dt = datetime.fromisoformat(client_timestamp)
                taken_at = make_aware(dt) if not is_aware(dt) else dt
            except Exception as e:
                print("Error parsing client_timestamp:", e)

        if not taken_at:
            if media_type == "image":
                taken_at = extract_image_taken_at(uploaded_file)
            elif media_type == "video":
                taken_at = extract_video_taken_at(uploaded_file)
            
        if not taken_at:
            taken_at = timezone.now()
      
        ext = os.path.splitext(uploaded_file.name)[1]
        blob_name = f"temp_uploads/{uuid.uuid4()}{ext}"

        # Save locally first
        temp_dir = os.path.join(settings.MEDIA_ROOT, "temp_uploads")
        os.makedirs(temp_dir, exist_ok=True)

        local_temp_path = os.path.join(temp_dir, os.path.basename(blob_name))

        with open(local_temp_path, "wb+") as destination:
            for chunk in uploaded_file.chunks():
                destination.write(chunk)

        print("6. Temp file saved locally:", local_temp_path)

        # Upload to Azure Blob Storage
        blob_storage = BlobStorageService()
        blob_storage.upload_file(local_temp_path, blob_name)

        print("7. Temp file uploaded to Blob:", blob_name)

        # Local file is no longer needed by Celery
        try:
            os.remove(local_temp_path)
        except Exception as e:
            print("Failed to remove local temp file:", e)

        if existing_media:
            media = existing_media
            media.status = "processing"
            media.temp_file_path = blob_name
            media.save()
        else:
            media = Media.objects.create(
                user=request.user,
                media_type=media_type,
                filename=safe_filename,
                mime_type=content_type,
                file_size=uploaded_file.size,
                taken_at=taken_at,
                file_hash=file_hash,
                status="processing",
                temp_file_path=blob_name,
            )

        upload_media_to_telegram.delay(media.id)

        return Response(MediaSerializer(media, context={"request": request}).data, status=status.HTTP_202_ACCEPTED)
    @action(detail=True, methods=["get"], url_path="content")
    def content(self, request, pk=None):

        try:
            media = self.get_queryset().get(pk=pk)
        except Media.DoesNotExist:
            return Response(
                {"error": "Media not found."}, status=status.HTTP_404_NOT_FOUND
            )

        content_type = media.mime_type
        if not content_type:
            content_type, _ = mimetypes.guess_type(media.filename)
            content_type = content_type or "application/octet-stream"

        if media.media_type == "image":
            from django.core.cache import caches
            from django.http import HttpResponse
            file_cache = caches["file_cache"]
            cache_key = f"media:{media.id}:content:{media.updated_at.timestamp()}"
            cached_data = file_cache.get(cache_key)
            if cached_data:
                response = HttpResponse(cached_data, content_type=content_type)
                safe_filename = urllib.parse.quote(media.filename.encode("utf-8"))
                response["Content-Disposition"] = f"inline; filename*=utf-8''{safe_filename}"
                return response

        if not media.telegram_file_id:
            if media.temp_file_path:
                from telegram_storage.blob_storage import BlobStorageService
                try:
                    blob_service = BlobStorageService()
                    blob_client = blob_service.container.get_blob_client(media.temp_file_path)
                    file_size = blob_client.get_blob_properties().size
                    
                    def blob_generator():
                        for chunk in blob_client.download_blob().chunks():
                            yield chunk
                    generator = blob_generator
                except Exception as e:
                    print(f"Blob error: {e}")
                    return Response(
                        {"error": "Media is still processing or unavailable."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
            else:
                return Response(
                    {"error": "Media is still processing or unavailable."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            telegram_service = TelegramStorageService()
            try:
                generator, file_size = asyncio.run(
                    telegram_service.get_file_stream_generator(media.telegram_file_id)
                )
            except Exception as e:
                print("Telegram download error:", repr(e))
                return Response(
                    {"error": "Unable to retrieve media from Telegram."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        # Stream both images and videos directly from Telegram
        # This prevents the server from holding large files in memory and improves Time-To-First-Byte
        response = StreamingHttpResponse(generator(), content_type=content_type)
        if file_size:
            response["Content-Length"] = str(file_size)

        safe_filename = urllib.parse.quote(media.filename.encode("utf-8"))
        response["Content-Disposition"] = f"inline; filename*=utf-8''{safe_filename}"

        return response

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):

        try:
            media = self.get_queryset().get(pk=pk)
        except Media.DoesNotExist:
            return Response(
                {"error": "Media not found."}, status=status.HTTP_404_NOT_FOUND
            )

        if not media.telegram_file_id:
            if media.temp_file_path:
                from telegram_storage.blob_storage import BlobStorageService
                try:
                    blob_service = BlobStorageService()
                    blob_client = blob_service.container.get_blob_client(media.temp_file_path)
                    file_size = blob_client.get_blob_properties().size
                    
                    def blob_generator():
                        for chunk in blob_client.download_blob().chunks():
                            yield chunk
                    generator = blob_generator
                except Exception as e:
                    print(f"Blob error: {e}")
                    return Response(
                        {"error": "Media is still processing or unavailable."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
            else:
                return Response(
                    {"error": "Media is still processing or unavailable."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            telegram_service = TelegramStorageService()
            try:
                generator, file_size = asyncio.run(
                    telegram_service.get_file_stream_generator(media.telegram_file_id)
                )
            except Exception as e:
                print("Telegram download error:", repr(e))
                return Response(
                    {"error": "Unable to retrieve media from Telegram."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        content_type = media.mime_type
        if not content_type:
            content_type, _ = mimetypes.guess_type(media.filename)
            content_type = content_type or "application/octet-stream"

        response = StreamingHttpResponse(generator(), content_type=content_type)

        safe_filename = urllib.parse.quote(media.filename.encode("utf-8"))
        response["Content-Disposition"] = f"inline; filename*=utf-8''{safe_filename}"
        
        if file_size:
            response["Content-Length"] = str(file_size)

        return response

    @action(detail=True, methods=["get"], url_path="thumbnail")
    def thumbnail(self, request, pk=None):

        try:
            media = self.get_queryset().get(pk=pk)
        except Media.DoesNotExist:
            return Response(
                {"error": "Media not found."}, status=status.HTTP_404_NOT_FOUND
            )

        if not media.telegram_thumbnail_file_id:
            if media.media_type == "image" and media.temp_file_path:
                from telegram_storage.blob_storage import BlobStorageService
                try:
                    blob_service = BlobStorageService()
                    blob_client = blob_service.container.get_blob_client(media.temp_file_path)
                    
                    def blob_generator():
                        for chunk in blob_client.download_blob().chunks():
                            yield chunk
                            
                    generator = blob_generator
                    thumbnail_bytes = b"".join([chunk for chunk in generator()])
                    
                    from django.http import HttpResponse
                    response = HttpResponse(thumbnail_bytes, content_type="image/jpeg")
                    safe_filename = urllib.parse.quote(f"thumb_{media.filename}".encode("utf-8"))
                    response["Content-Disposition"] = f"inline; filename*=utf-8''{safe_filename}"
                    return response
                except Exception as e:
                    print(f"Blob thumbnail error: {e}")
                    return Response(
                        {"error": "Thumbnail not available."}, status=status.HTTP_404_NOT_FOUND
                    )
            return Response(
                {"error": "Thumbnail not available."}, status=status.HTTP_404_NOT_FOUND
            )
            
        from django.core.cache import cache
        from django.http import HttpResponse
        cache_key = f"media:{media.id}:thumbnail:{media.updated_at.timestamp()}"
        cached_data = cache.get(cache_key)
        
        if cached_data:
            response = HttpResponse(cached_data, content_type="image/jpeg")
            safe_filename = urllib.parse.quote(f"thumb_{media.filename}".encode("utf-8"))
            response["Content-Disposition"] = f"inline; filename*=utf-8''{safe_filename}"
            return response

        telegram_service = TelegramStorageService()

        try:
            generator, file_size = asyncio.run(
                telegram_service.get_file_stream_generator(media.telegram_thumbnail_file_id)
            )
        except Exception as e:
            print("Telegram thumbnail error:", repr(e))
            return Response(
                {"error": "Unable to retrieve media from Telegram."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        thumbnail_bytes = b"".join([chunk for chunk in generator()])
        cache.set(cache_key, thumbnail_bytes, timeout=60*60*24*30)
        
        response = HttpResponse(thumbnail_bytes, content_type="image/jpeg")
        
        safe_filename = urllib.parse.quote(f"thumb_{media.filename}".encode("utf-8"))
        response["Content-Disposition"] = f"inline; filename*=utf-8''{safe_filename}"
        
        return response

    @action(detail=True, methods=["post"], url_path="trash")
    def trash(self, request, pk=None):

        try:
            media = Media.objects.get(pk=pk, user=request.user, is_deleted=False)
        except Media.DoesNotExist:
            return Response(
                {"error": "Media not found."}, status=status.HTTP_404_NOT_FOUND
            )

        media.is_deleted = True
        media.deleted_at = timezone.now()
        media.save(update_fields=["is_deleted", "deleted_at", "updated_at"])

        return Response({"message": "Media moved to trash."})

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, pk=None):

        try:
            media = Media.objects.get(pk=pk, user=request.user, is_deleted=True)
        except Media.DoesNotExist:
            return Response(
                {"error": "Media not found in trash."}, status=status.HTTP_404_NOT_FOUND
            )

        media.is_deleted = False
        media.deleted_at = None

        media.save(update_fields=["is_deleted", "deleted_at", "updated_at"])

        return Response({"message": "Media restored."})

    @action(detail=False, methods=["get"], url_path="trash")
    def trash_list(self, request):

        queryset = Media.objects.filter(user=request.user, is_deleted=True)

        serializer = self.get_serializer(queryset, many=True)

        return Response(serializer.data)
        
    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        from django.db.models import Sum
        queryset = Media.objects.filter(user=request.user, is_deleted=False)
        total_items = queryset.count()
        total_size = queryset.aggregate(total_size=Sum("file_size"))["total_size"] or 0
        
        return Response({
            "total_items": total_items,
            "total_size": total_size
        })

    @action(detail=True, methods=["post"], url_path="share")
    def create_share_link(self, request, pk=None):
        media = self.get_object()
        from .models import SharedLink
        import datetime
        from django.utils import timezone
        
        # Check if a non-expired link already exists
        existing = SharedLink.objects.filter(media=media).first()
        if existing:
            return Response({"url": request.build_absolute_uri(f"/share/{existing.id}/")})
            
        link = SharedLink.objects.create(media=media)
        # We can add an expiry later if needed, e.g. 7 days
        # link.expires_at = timezone.now() + datetime.timedelta(days=7)
        # link.save()
        
        url = request.build_absolute_uri(f"/share/{link.id}/")
        return Response({"url": url})

    @action(detail=True, methods=["delete"], url_path="permanent-delete")
    def permanent_delete(self, request, pk=None):
        try:
            media = Media.objects.get(pk=pk, user=request.user, is_deleted=True)
        except Media.DoesNotExist:
            return Response({"error": "Media not found in trash."}, status=status.HTTP_404_NOT_FOUND)

        # Delete from Telegram
        telegram_service = TelegramStorageService()
        try:
            # We don't have a direct delete_message in telegram_service, but we should try.
            # Assuming it will be added to TelegramStorageService later or we just delete from DB.
            pass
        except Exception:
            pass
        
        media.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["delete"], url_path="empty-trash")
    def empty_trash(self, request):
        queryset = Media.objects.filter(user=request.user, is_deleted=True)
        count = queryset.count()
        # Should delete from Telegram here ideally
        queryset.delete()
        return Response({"message": f"Emptied {count} items from trash."})

    @action(detail=False, methods=["post"], url_path="bulk-trash")
    def bulk_trash(self, request):
        media_ids = request.data.get("media_ids", [])
        if not isinstance(media_ids, list):
            return Response({"error": "media_ids must be a list."}, status=status.HTTP_400_BAD_REQUEST)
            
        Media.objects.filter(id__in=media_ids, user=request.user, is_deleted=False).update(
            is_deleted=True,
            deleted_at=timezone.now()
        )
        return Response({"message": f"{len(media_ids)} items moved to trash."})

    @action(detail=False, methods=["post"], url_path="bulk-favorite")
    def bulk_favorite(self, request):
        media_ids = request.data.get("media_ids", [])
        is_favorite = request.data.get("is_favorite", True)
        if not isinstance(media_ids, list):
            return Response({"error": "media_ids must be a list."}, status=status.HTTP_400_BAD_REQUEST)
            
        Media.objects.filter(id__in=media_ids, user=request.user, is_deleted=False).update(
            is_favorite=is_favorite
        )
        return Response({"message": f"{len(media_ids)} items favorite status updated."})
def shared_link_view(request, link_id):
    from django.shortcuts import get_object_or_404
    from django.http import HttpResponse
    from .models import SharedLink
    
    link = get_object_or_404(SharedLink, id=link_id)
    media = link.media
    
    # We need to construct the actual content URL using the DRF endpoint
    content_url = request.build_absolute_uri(f"/api/media/{media.id}/content/")
    
    if media.media_type == "image":
        media_html = f'<img src="{content_url}" alt="{media.filename}" style="max-width:100%; max-height:80vh; border-radius:8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">'
        og_type = "image"
    else:
        media_html = f'<video controls src="{content_url}" style="max-width:100%; max-height:80vh; border-radius:8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);"></video>'
        og_type = "video.other"

    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Shared Media - Own Gallery</title>
        <meta property="og:title" content="Shared from Own Gallery">
        <meta property="og:type" content="{og_type}">
        <meta property="og:url" content="{request.build_absolute_uri()}">
        <meta property="og:image" content="{content_url}">
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: #f0f2f5;
                margin: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
            }}
            .container {{
                text-align: center;
                padding: 20px;
                max-width: 800px;
            }}
            .footer {{
                margin-top: 20px;
                color: #65676b;
                font-size: 14px;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            {media_html}
            <div class="footer">
                Shared securely via Own Gallery
            </div>
        </div>
    </body>
    </html>
    """
    return HttpResponse(html)
