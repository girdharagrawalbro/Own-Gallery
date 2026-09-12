import os
import uuid
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from media.models import Media
from telegram_storage.blob_storage import BlobStorageService

media = Media.objects.last()
print(f"Media id={media.id}, type={media.media_type}, temp_path={media.temp_file_path}")

try:
    blob_service = BlobStorageService()
    blob_client = blob_service.container.get_blob_client(media.temp_file_path)
    file_size = blob_client.get_blob_properties().size
    print(f"Blob size: {file_size}")
    
    def blob_generator():
        for chunk in blob_client.download_blob().chunks():
            yield chunk
            
    generator = blob_generator
    image_bytes = b"".join([chunk for chunk in generator()])
    print(f"Successfully joined {len(image_bytes)} bytes!")
except Exception as e:
    print(f"Error: {e}")
