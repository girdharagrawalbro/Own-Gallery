import asyncio
import os
import tempfile

from celery import shared_task
from django.utils import timezone

from .models import Media
from telegram_storage.service import TelegramStorageService
from telegram_storage.blob_storage import BlobStorageService


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def upload_media_to_telegram(self, media_id):

    try:
        media = Media.objects.get(id=media_id)
    except Media.DoesNotExist:
        print(f"Media {media_id} does not exist.")
        return

    if media.status == "completed":
        print(f"Media {media_id} is already completed.")
        return

    blob_name = media.temp_file_path

    if not blob_name:
        media.status = "failed"
        media.upload_error = "Temporary Blob file not found."
        media.save()
        print(f"No Blob path for Media {media_id}")
        return

    local_temp_path = None

    try:
        print(f"Media {media_id}: downloading Blob {blob_name}")

        blob_storage = BlobStorageService()

        # Create temporary file inside Celery container
        ext = os.path.splitext(media.filename)[1]

        fd, local_temp_path = tempfile.mkstemp(
            suffix=ext,
            prefix=f"media_{media.id}_",
        )
        os.close(fd)

        blob_storage.download_file(
            blob_name,
            local_temp_path,
        )

        print(
            f"Media {media_id}: Blob downloaded to {local_temp_path}"
        )

        telegram_service = TelegramStorageService()

        class LocalFileWrapper:

            def __init__(self, file_path, content_type):
                self.file_path = file_path
                self.content_type = content_type

            def read(self):
                with open(self.file_path, "rb") as f:
                    return f.read()

            def chunks(self):
                with open(self.file_path, "rb") as f:
                    while chunk := f.read(8192):
                        yield chunk

            @property
            def size(self):
                return os.path.getsize(self.file_path)

            @property
            def name(self):
                return os.path.basename(self.file_path)

            def seek(self, offset):
                pass

            def close(self):
                pass

        file_obj = LocalFileWrapper(
            local_temp_path,
            media.mime_type,
        )

        print(f"Media {media_id}: uploading to Telegram")

        thumbnail_obj = None
        local_thumb_path = None
        if media.mime_type and media.mime_type.startswith("video/"):
            try:
                import subprocess
                fd_thumb, local_thumb_path = tempfile.mkstemp(suffix=".jpg", prefix=f"thumb_{media.id}_")
                os.close(fd_thumb)
                
                # Extract a frame at 1 second mark (or 0 if very short)
                cmd = [
                    "ffmpeg", "-y", "-i", local_temp_path,
                    "-ss", "00:00:01.000", "-vframes", "1",
                    "-vf", "scale='min(320,iw)':-1", # Resize to ~320px width for Telegram
                    local_thumb_path
                ]
                result = subprocess.run(cmd, capture_output=True)
                
                # If extraction at 1 second fails, try at 0 seconds
                if result.returncode != 0 or not os.path.exists(local_thumb_path) or os.path.getsize(local_thumb_path) == 0:
                    cmd[5] = "00:00:00.000"
                    subprocess.run(cmd, capture_output=True)

                if os.path.exists(local_thumb_path) and os.path.getsize(local_thumb_path) > 0:
                    thumbnail_obj = open(local_thumb_path, "rb")
                    print(f"Media {media_id}: Video thumbnail extracted successfully.")
                else:
                    print(f"Media {media_id}: Failed to extract video thumbnail.")
            except Exception as e:
                print(f"Media {media_id}: Exception during video thumbnail extraction: {e}")

        try:
            telegram_data = asyncio.run(
                telegram_service.upload_media(file_obj, thumbnail=thumbnail_obj)
            )
        finally:
            if thumbnail_obj:
                thumbnail_obj.close()
            if local_thumb_path and os.path.exists(local_thumb_path):
                os.remove(local_thumb_path)

        media.telegram_message_id = telegram_data.get("message_id")
        media.telegram_file_id = telegram_data.get("file_id")
        media.telegram_file_unique_id = telegram_data.get(
            "file_unique_id"
        )
        media.telegram_thumbnail_file_id = telegram_data.get(
            "thumbnail_file_id"
        )

        if telegram_data.get("metadata"):
            meta = telegram_data["metadata"]

            if meta.get("width"):
                media.width = meta["width"]

            if meta.get("height"):
                media.height = meta["height"]

            if meta.get("duration"):
                media.duration = meta["duration"]

        media.status = "completed"
        media.processed_at = timezone.now()
        media.save()

        print(f"Media {media_id}: Telegram upload completed")

        # Delete Blob after successful Telegram upload
        try:
            blob_storage.delete_file(blob_name)
            print(f"Media {media_id}: Blob deleted")
        except Exception as e:
            print(
                f"Media {media_id}: Failed to delete Blob: {e}"
            )

        # Delete Celery local temporary file
        try:
            if local_temp_path and os.path.exists(local_temp_path):
                os.remove(local_temp_path)
        except Exception as e:
            print(
                f"Media {media_id}: Failed to remove local temp file: {e}"
            )

    except Exception as e:

        print(f"Task failed for Media {media_id}: {e}")

        # Clean local temporary file
        try:
            if local_temp_path and os.path.exists(local_temp_path):
                os.remove(local_temp_path)
        except Exception:
            pass

        try:
            self.retry(exc=e)

        except self.MaxRetriesExceededError:

            media.status = "failed"
            media.upload_error = str(e)
            media.save()