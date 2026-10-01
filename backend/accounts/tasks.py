import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone
import logging
import tempfile
import os
import uuid

logger = logging.getLogger(__name__)

def refresh_google_token(integration):
    if not integration.refresh_token:
        return False
        
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "refresh_token": integration.refresh_token,
        "client_id": getattr(settings, "GOOGLE_CLIENT_ID", ""),
        "client_secret": getattr(settings, "GOOGLE_CLIENT_SECRET", ""),
        "grant_type": "refresh_token",
    }
    r = requests.post(token_url, data=data)
    if r.status_code == 200:
        tokens = r.json()
        integration.access_token = tokens["access_token"]
        integration.save(update_fields=["access_token"])
        return True
    return False

@shared_task(bind=True, max_retries=3)
def sync_google_photos_task(self, user_id):
    from .models import GoogleIntegration
    from media.models import Media
    from media.tasks import upload_media_to_telegram
    
    try:
        integration = GoogleIntegration.objects.get(user_id=user_id)
    except GoogleIntegration.DoesNotExist:
        return

    integration.is_syncing = True
    integration.save(update_fields=["is_syncing"])
    
    try:
        if not refresh_google_token(integration):
            logger.error(f"Failed to refresh Google token for user {user_id}")
            return
            
        url = "https://photoslibrary.googleapis.com/v1/mediaItems"
        headers = {"Authorization": f"Bearer {integration.access_token}"}
        
        params = {"pageSize": 50}
        if integration.next_page_token:
            params["pageToken"] = integration.next_page_token
            
        r = requests.get(url, headers=headers, params=params)
        
        if r.status_code == 401:
            # Token might be expired just now, try one more refresh
            refresh_google_token(integration)
            headers["Authorization"] = f"Bearer {integration.access_token}"
            r = requests.get(url, headers=headers, params=params)
            
        if r.status_code != 200:
            logger.error(f"Google Photos API error: {r.status_code} {r.text}")
            return
            
        data = r.json()
        media_items = data.get("mediaItems", [])
        
        for item in media_items:
            # Check if already synced
            if Media.objects.filter(external_id=item["id"], user_id=user_id).exists():
                continue
                
            media_metadata = item.get("mediaMetadata", {})
            creation_time = media_metadata.get("creationTime")
            mime_type = item.get("mimeType", "image/jpeg")
            filename = item.get("filename", f"{item['id']}.jpg")
            base_url = item.get("baseUrl")
            
            is_video = "video" in mime_type
            
            # Create Media record
            media = Media.objects.create(
                user_id=user_id,
                filename=filename,
                mime_type=mime_type,
                file_size=0, # We'll update this later
                width=int(media_metadata.get("width", 0)) or None,
                height=int(media_metadata.get("height", 0)) or None,
                media_type="video" if is_video else "image",
                source="google",
                external_id=item["id"],
                status="processing",
                taken_at=creation_time
            )
            
            # Queue ingestion task
            ingest_google_media_task.delay(media.id, base_url, is_video)
            
        integration.next_page_token = data.get("nextPageToken")
        integration.last_sync_at = timezone.now()
        
    except Exception as exc:
        logger.exception(f"Sync failed for user {user_id}")
    finally:
        integration.is_syncing = False
        integration.save(update_fields=["is_syncing", "next_page_token", "last_sync_at"])

@shared_task(bind=True, max_retries=3)
def ingest_google_media_task(self, media_id, base_url, is_video):
    from media.models import Media
    from media.tasks import upload_media_to_telegram
    
    try:
        media = Media.objects.get(id=media_id)
        
        # Download URL: d=download bytes, dv=download video
        download_url = f"{base_url}=dv" if is_video else f"{base_url}=d"
        
        r = requests.get(download_url, stream=True)
        if r.status_code != 200:
            media.status = "failed"
            media.upload_error = f"Failed to download from Google: {r.status_code}"
            media.save(update_fields=["status", "upload_error"])
            return
            
        fd, temp_path = tempfile.mkstemp(prefix=f"google_{media_id}_")
        with os.fdopen(fd, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    
        media.file_size = os.path.getsize(temp_path)
        media.temp_file_path = temp_path
        media.save(update_fields=["file_size", "temp_file_path"])
        
        # Now pass to standard processing task
        upload_media_to_telegram.delay(media.id)
        
    except Exception as exc:
        logger.exception(f"Failed to ingest Google media {media_id}")
        media.status = "failed"
        media.upload_error = str(exc)
        media.save(update_fields=["status", "upload_error"])
