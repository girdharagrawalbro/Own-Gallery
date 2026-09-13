import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from media.models import Media

# Let's see the most recent media types
for m in Media.objects.all().order_by('-id')[:5]:
    print(f"ID: {m.id}, Filename: {m.filename}, media_type: {m.media_type}, mime_type: {m.mime_type}, status: {m.status}, error: {m.upload_error}")
