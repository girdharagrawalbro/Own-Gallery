import asyncio
import os
from celery import shared_task
from django.utils import timezone
from .models import Media
from telegram_storage.service import TelegramStorageService

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

    temp_path = media.temp_file_path
    if not temp_path or not os.path.exists(temp_path):
        media.status = "failed"
        media.upload_error = "Temporary file not found."
        media.save()
        print(f"Temp file missing for Media {media_id}")
        return

    try:
        telegram_service = TelegramStorageService()

        class LocalFileWrapper:
            def __init__(self, file_path, content_type):
                self.file_path = file_path
                self.content_type = content_type
                
            def read(self):
                with open(self.file_path, 'rb') as f:
                    return f.read()
                    
            def chunks(self):
                with open(self.file_path, 'rb') as f:
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

        file_obj = LocalFileWrapper(temp_path, media.mime_type)

        telegram_data = asyncio.run(telegram_service.upload_media(file_obj))

        media.telegram_message_id = telegram_data.get("message_id")
        media.telegram_file_id = telegram_data.get("file_id")
        media.telegram_file_unique_id = telegram_data.get("file_unique_id")
        media.telegram_thumbnail_file_id = telegram_data.get("thumbnail_file_id")

        if telegram_data.get("metadata"):
            meta = telegram_data["metadata"]
            if meta.get("width"): media.width = meta["width"]
            if meta.get("height"): media.height = meta["height"]
            if meta.get("duration"): media.duration = meta["duration"]

        media.status = "completed"
        media.processed_at = timezone.now()
        media.save()

        # Clean up temporary file
        try:
            os.remove(temp_path)
        except Exception as e:
            print(f"Failed to remove temp file {temp_path}: {e}")

    except Exception as e:
        print(f"Task failed for Media {media_id}: {e}")
        try:
            # Check if this is a temporary failure and we should retry
            # Let's retry on any exception for now up to max_retries
            self.retry(exc=e)
        except self.MaxRetriesExceededError:
            media.status = "failed"
            media.upload_error = str(e)
            media.save()
