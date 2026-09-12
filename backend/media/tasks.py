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

        telegram_data = asyncio.run(
            telegram_service.upload_media(file_obj)
        )

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