import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

import asyncio
from media.models import Media
from telegram_storage.service import TelegramStorageService
from media.metadata import extract_image_taken_at
import io

def get_media():
    m = Media.objects.filter(media_type="image").order_by('-created_at').first()
    return m.telegram_file_id if m else None

async def test(file_id):
    svc = TelegramStorageService()
    try:
        gen, _ = await svc.get_file_stream_generator(file_id)
        buf = io.BytesIO()
        for chunk in gen():
            buf.write(chunk)
        buf.seek(0)
        
        from PIL import Image, ExifTags
        img = Image.open(buf)
        exif = img.getexif()
        print("EXIF (base):", {ExifTags.TAGS.get(k, k): v for k, v in exif.items() if isinstance(v, (int, str, bytes))})
        
        exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
        print("EXIF IFD:", {ExifTags.TAGS.get(k, k): v for k, v in exif_ifd.items() if isinstance(v, (int, str, bytes))})
        
        buf.seek(0)
        print("Extracted taken_at:", extract_image_taken_at(buf))
        
    except Exception as e:
        print("Error:", e)

fid = get_media()
if fid:
    asyncio.run(test(fid))
else:
    print("No image")
