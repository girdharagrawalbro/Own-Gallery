import hashlib
import logging
import os
import threading
import time
from contextlib import contextmanager
from datetime import timedelta

from celery import shared_task
from celery.signals import worker_ready
from django.core.cache import cache
from django.utils import timezone

from telegram_storage.blob_storage import BlobStorageService
from telegram_storage.storage import StorageError, TelegramStorage

from . import processing
from .models import Media, MediaVariant

logger = logging.getLogger(__name__)

# A running task holds this lock and refreshes it; when it is absent the item isn't being worked on.
LOCK_TTL = 10 * 60
LOCK_REFRESH = 60
# Processing items untouched this long with no lock held lost their task (e.g. the worker dropped
# its reserved messages on a broker reconnect, which Redis only redelivers after visibility_timeout).
STALLED_AFTER = timedelta(minutes=2)
REQUEUE_INTERVAL = 5 * 60


def _lock_key(media_id):
    return f"media-task:lock:{media_id}"


def _requeue_key(media_id):
    return f"media-task:requeued:{media_id}"


@contextmanager
def _media_lock(media_id):
    """Yield True if this process now owns the item; a heartbeat keeps the lock alive while it runs."""
    key = _lock_key(media_id)
    if not cache.add(key, os.getpid(), timeout=LOCK_TTL):
        yield False
        return
    stop = threading.Event()

    def heartbeat():
        while not stop.wait(LOCK_REFRESH):
            try:
                cache.touch(key, LOCK_TTL)
            except Exception as exc:
                logger.warning("Media %s: lock refresh failed: %s", media_id, exc)

    threading.Thread(target=heartbeat, name=f"media-lock-{media_id}", daemon=True).start()
    try:
        yield True
    finally:
        stop.set()
        cache.delete(key)


def requeue_stalled(queryset, limit=50):
    """Re-dispatch processing items whose task was lost. Safe to call often (e.g. from status polls)."""
    cutoff = timezone.now() - STALLED_AFTER
    candidates = (
        queryset.filter(status="processing", updated_at__lt=cutoff, temp_file_path__isnull=False)
        .values_list("id", flat=True)[:limit]
    )
    requeued = []
    for media_id in candidates:
        if cache.get(_lock_key(media_id)) is not None:
            continue
        if not cache.add(_requeue_key(media_id), 1, timeout=REQUEUE_INTERVAL):
            continue
        upload_media_to_telegram.delay(media_id)
        requeued.append(media_id)
    if requeued:
        logger.warning("Requeued stalled uploads: %s", requeued)
    return requeued


@worker_ready.connect
def _requeue_on_worker_start(**kwargs):
    try:
        requeue_stalled(Media.objects.all(), limit=500)
    except Exception:
        logger.exception("Could not requeue stalled uploads on worker start")


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


MAX_TOTAL_ATTEMPTS = 8  # across retries and requeues


@shared_task(bind=True, max_retries=4, default_retry_delay=60, acks_late=True)
def upload_media_to_telegram(self, media_id):
    with _media_lock(media_id) as acquired:
        if not acquired:
            logger.info("Media %s: already being processed, skipping duplicate delivery", media_id)
            return
        _upload_media_to_telegram(self, media_id)


def _upload_media_to_telegram(self, media_id):
    try:
        media = Media.objects.get(id=media_id)
    except Media.DoesNotExist:
        logger.warning("Media %s does not exist", media_id)
        return

    if media.status in ("completed", "duplicate", "failed"):
        return

    attempts_key = f"media-task:attempts:{media_id}"
    cache.add(attempts_key, 0, timeout=24 * 3600)
    if cache.incr(attempts_key) > MAX_TOTAL_ATTEMPTS:
        _fail(media, media.upload_error or "Processing kept failing; please upload again.")
        return

    blob_name = media.temp_file_path
    if not blob_name:
        _fail(media, "Temporary upload file not found.")
        return

    started = time.monotonic()
    timings = {}
    logger.info("Media %s: attempt %d started, %.1fs after upload", media_id, self.request.retries + 1,
                (timezone.now() - media.updated_at).total_seconds())

    storage = TelegramStorage()
    blob_storage = BlobStorageService()
    local_path = processing.temp_path(os.path.splitext(media.filename)[1], f"media_{media.id}_")
    generated = []
    logger.info("[TASK] media_id=%d: using_mtproto=%s temp_path=%s", media_id, storage.uses_mtproto, local_path)

    def mark(step, since):
        timings[step] = round(time.monotonic() - since, 2)
        return time.monotonic()

    try:
        step = time.monotonic()
        logger.info("[TASK] media_id=%d: downloading blob=%s", media_id, blob_name)
        blob_storage.download_file(blob_name, local_path)
        step = mark("download", step)
        size = os.path.getsize(local_path)
        logger.info("[TASK] media_id=%d: blob downloaded size=%d bytes (%.2fs)", media_id, size, timings.get("download", 0))
        media.file_size = size

        if not media.file_hash:
            logger.debug("[TASK] media_id=%d: computing SHA-256", media_id)
            media.file_hash = _sha256(local_path)
            logger.info("[TASK] media_id=%d: hash=%s", media_id, media.file_hash)
            duplicate = (
                Media.objects.filter(user=media.user, file_hash=media.file_hash, status="completed")
                .exclude(pk=media.pk)
                .first()
            )
            if duplicate:
                logger.info("[TASK] media_id=%d: DUPLICATE of media_id=%d — marking duplicate", media_id, duplicate.id)
                media.status = "duplicate"
                media.upload_error = f"Already in your library (media {duplicate.id})."
                media.temp_file_path = None
                media.save()
                blob_storage.delete_file(blob_name)
                return
            media.save(update_fields=["file_hash", "file_size", "updated_at"])

        # Fail fast (no retries) when this server can't store a file this big.
        if size > storage.upload_limit:
            logger.error("[TASK] media_id=%d: file too large size=%d limit=%d", media_id, size, storage.upload_limit)
            raise StorageError(
                f"File is {size // (1024 * 1024)} MB; this server can store at most "
                f"{storage.upload_limit // (1024 * 1024)} MB. Set TELEGRAM_API_ID and "
                "TELEGRAM_API_HASH to enable uploads up to 2 GB."
            )

        step = mark("hash", step)
        thumbnail_path = preview_path = stream_path = None
        preview_dims = (None, None)

        if media.media_type == "image":
            logger.info("[TASK] media_id=%d: processing IMAGE mime=%s", media_id, media.mime_type)
            try:
                info = processing.process_image(local_path, media.mime_type)
                thumbnail_path, preview_path = info["thumbnail_path"], info["preview_path"]
                generated += [thumbnail_path, preview_path]
                media.width, media.height = info["width"], info["height"]
                preview_dims = (info["preview_width"], info["preview_height"])
                apply_taken_at(media, info["taken_at"], info["taken_at_source"])
                logger.info("[TASK] media_id=%d: image processed %dx%d thumbnail=%s preview=%s",
                            media_id, media.width or 0, media.height or 0, thumbnail_path, preview_path)
            except Exception as exc:  # unreadable image: still keep the original
                logger.warning("[TASK] media_id=%d: image processing failed: %s", media_id, exc)
        else:
            logger.info("[TASK] media_id=%d: processing VIDEO mime=%s", media_id, media.mime_type)
            try:
                info = processing.probe_video(local_path)
                media.width, media.height, media.duration = info["width"], info["height"], info["duration"]
                apply_taken_at(media, info["taken_at"], "metadata")
                logger.info("[TASK] media_id=%d: video probed %dx%d dur=%.1fs codec=%s",
                            media_id, media.width or 0, media.height or 0,
                            media.duration or 0, info.get("video_codec"))
                thumbnail_path, preview_path = processing.video_thumbnail(local_path, info["duration"])
                generated += [thumbnail_path, preview_path]
                plan = processing.plan_stream_variant(media.mime_type, info, local_path)
                logger.info("[TASK] media_id=%d: stream variant plan=%s", media_id, plan)
                if plan and not media.variants.filter(kind=MediaVariant.STREAM).exists():
                    stream_path = processing.build_stream_variant(local_path, plan, info)
                    generated.append(stream_path)
                    logger.info("Media %s: built %s stream variant", media_id, plan)
            except Exception as exc:
                logger.warning("[TASK] media_id=%d: video processing failed: %s", media_id, exc)

        step = mark("process", step)
        if not media.telegram_message_id:
            logger.info("[TASK] media_id=%d: uploading to Telegram (size=%d thumbnail=%s)",
                        media_id, size, thumbnail_path)
            stored = storage.upload(local_path, media.filename, media.mime_type, size, thumbnail_path)
            media.telegram_message_id = stored["message_id"]
            media.telegram_file_id = stored["file_id"]
            media.telegram_file_unique_id = stored["file_unique_id"]
            media.telegram_thumbnail_file_id = stored["thumbnail_file_id"]
            media.save()
            logger.info("[TASK] media_id=%d: Telegram upload OK message_id=%s file_id=%s",
                        media_id, stored["message_id"], stored["file_id"])
        else:
            logger.info("[TASK] media_id=%d: Telegram upload skipped (already uploaded message_id=%s)",
                        media_id, media.telegram_message_id)

        step = mark("telegram_original", step)
        _store_variant(storage, media, MediaVariant.PREVIEW, preview_path, "image/jpeg", *preview_dims)
        _store_variant(storage, media, MediaVariant.STREAM, stream_path, "video/mp4", media.width, media.height)
        mark("telegram_variants", step)

        media.status = "completed"
        media.upload_error = None
        media.processed_at = timezone.now()
        media.temp_file_path = None
        media.save()

        logger.info("Media %s: completed in %.1fs %s (%s MB, mtproto=%s)", media_id, time.monotonic() - started,
                    timings, round(size / 1048576, 1), storage.uses_mtproto)

        try:
            blob_storage.delete_file(blob_name)
        except Exception as exc:
            logger.warning("Media %s: failed to delete blob: %s", media_id, exc)

    except StorageError as exc:
        _fail(media, str(exc))
    except Exception as exc:
        logger.exception("Media %s: attempt %d failed after %.1fs %s", media_id, self.request.retries + 1,
                         time.monotonic() - started, timings)
        retry_after = getattr(exc, "retry_after", None) or getattr(exc, "seconds", None)
        countdown = retry_after or 30 * (2 ** self.request.retries)
        media.upload_error = f"Attempt {self.request.retries + 1} failed: {exc or exc.__class__.__name__}"[:2000]
        media.save(update_fields=["upload_error", "updated_at"])
        # Keep requeue_stalled from cutting the backoff short while the retry waits.
        cache.set(_requeue_key(media_id), 1, timeout=countdown + REQUEUE_INTERVAL)
        try:
            raise self.retry(exc=exc, countdown=countdown)
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
