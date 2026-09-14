import hashlib
import logging
import os

from celery import shared_task
from django.utils import timezone

from telegram_storage.blob_storage import BlobStorageService
from telegram_storage.storage import StorageError, TelegramStorage

from . import processing
from .models import Media, MediaVariant

logger = logging.getLogger(__name__)


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def apply_taken_at(media, taken_at, source):
    """Keep the most trustworthy capture time seen so far."""
    if not taken_at:
        return
    priority = processing.TAKEN_AT_PRIORITY
    if priority.get(source, 0) > priority.get(media.taken_at_source, 0) or not media.taken_at:
        media.taken_at = taken_at
        media.taken_at_source = source


def _fail(media, message):
    media.status = "failed"
    media.upload_error = message[:2000]
    media.save(update_fields=["status", "upload_error", "updated_at"])


def _store_variant(storage, media, kind, path, mime_type, width=None, height=None):
    # Skip when an earlier attempt already stored it (task retries must not re-upload).
    if not path or media.variants.filter(kind=kind).exists():
        return
    stored = storage.upload(path, f"{kind}_{media.id}{os.path.splitext(path)[1]}", mime_type,
                            os.path.getsize(path))
    MediaVariant.objects.create(
        media=media,
        kind=kind,
        mime_type=mime_type,
        file_size=stored["size"],
        width=width,
        height=height,
        telegram_message_id=stored["message_id"],
        telegram_file_id=stored["file_id"],
    )


@shared_task(bind=True, max_retries=4, default_retry_delay=60, acks_late=True)
def upload_media_to_telegram(self, media_id):
    try:
        media = Media.objects.get(id=media_id)
    except Media.DoesNotExist:
        logger.warning("Media %s does not exist", media_id)
        return

    if media.status in ("completed", "duplicate"):
        return

    blob_name = media.temp_file_path
    if not blob_name:
        _fail(media, "Temporary upload file not found.")
        return

    storage = TelegramStorage()
    blob_storage = BlobStorageService()
    local_path = processing.temp_path(os.path.splitext(media.filename)[1], f"media_{media.id}_")
    generated = []

    try:
        blob_storage.download_file(blob_name, local_path)
        size = os.path.getsize(local_path)
        media.file_size = size

        if not media.file_hash:
            media.file_hash = _sha256(local_path)
            duplicate = (
                Media.objects.filter(user=media.user, file_hash=media.file_hash, status="completed")
                .exclude(pk=media.pk)
                .first()
            )
            if duplicate:
                media.status = "duplicate"
                media.upload_error = f"Already in your library (media {duplicate.id})."
                media.temp_file_path = None
                media.save()
                blob_storage.delete_file(blob_name)
                return
            media.save(update_fields=["file_hash", "file_size", "updated_at"])

        # Fail fast (no retries) when this server can't store a file this big.
        if size > storage.upload_limit:
            raise StorageError(
                f"File is {size // (1024 * 1024)} MB; this server can store at most "
                f"{storage.upload_limit // (1024 * 1024)} MB. Set TELEGRAM_API_ID and "
                "TELEGRAM_API_HASH to enable uploads up to 2 GB."
            )

        thumbnail_path = preview_path = stream_path = None
        preview_dims = (None, None)

        if media.media_type == "image":
            try:
                info = processing.process_image(local_path, media.mime_type)
                thumbnail_path, preview_path = info["thumbnail_path"], info["preview_path"]
                generated += [thumbnail_path, preview_path]
                media.width, media.height = info["width"], info["height"]
                preview_dims = (info["preview_width"], info["preview_height"])
                apply_taken_at(media, info["taken_at"], info["taken_at_source"])
            except Exception as exc:  # unreadable image: still keep the original
                logger.warning("Media %s: image processing failed: %s", media_id, exc)
        else:
            try:
                info = processing.probe_video(local_path)
                media.width, media.height, media.duration = info["width"], info["height"], info["duration"]
                apply_taken_at(media, info["taken_at"], "metadata")
                thumbnail_path, preview_path = processing.video_thumbnail(local_path, info["duration"])
                generated += [thumbnail_path, preview_path]
                plan = processing.plan_stream_variant(media.mime_type, info, local_path)
                if plan and not media.variants.filter(kind=MediaVariant.STREAM).exists():
                    stream_path = processing.build_stream_variant(local_path, plan, info)
                    generated.append(stream_path)
                    logger.info("Media %s: built %s stream variant", media_id, plan)
            except Exception as exc:
                logger.warning("Media %s: video processing failed: %s", media_id, exc)

        if not media.telegram_message_id:
            stored = storage.upload(local_path, media.filename, media.mime_type, size, thumbnail_path)
            media.telegram_message_id = stored["message_id"]
            media.telegram_file_id = stored["file_id"]
            media.telegram_file_unique_id = stored["file_unique_id"]
            media.telegram_thumbnail_file_id = stored["thumbnail_file_id"]
            media.save()

        _store_variant(storage, media, MediaVariant.PREVIEW, preview_path, "image/jpeg", *preview_dims)
        _store_variant(storage, media, MediaVariant.STREAM, stream_path, "video/mp4", media.width, media.height)

        media.status = "completed"
        media.upload_error = None
        media.processed_at = timezone.now()
        media.temp_file_path = None
        media.save()

        try:
            blob_storage.delete_file(blob_name)
        except Exception as exc:
            logger.warning("Media %s: failed to delete blob: %s", media_id, exc)

    except StorageError as exc:
        _fail(media, str(exc))
    except Exception as exc:
        logger.exception("Media %s: upload attempt failed", media_id)
        retry_after = getattr(exc, "retry_after", None) or getattr(exc, "seconds", None)
        try:
            raise self.retry(exc=exc, countdown=retry_after or 60 * (2 ** self.request.retries))
        except self.MaxRetriesExceededError:
            _fail(media, str(exc) or exc.__class__.__name__)
    finally:
        processing.remove_quietly(local_path, *generated)


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def delete_telegram_messages(self, message_ids):
    try:
        TelegramStorage().delete_messages(message_ids)
    except Exception as exc:
        raise self.retry(exc=exc)
