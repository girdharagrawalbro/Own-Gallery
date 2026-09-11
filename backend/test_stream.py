import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

import asyncio
from media.models import Media
from telegram_storage.service import TelegramStorageService

def get_media_id():
    m = Media.objects.exclude(telegram_file_id="").first()
    return m.telegram_file_id if m else None

async def test(file_id):
    svc = TelegramStorageService()
    tg_file = await svc.bot.get_file(file_id)
    print("FILE PATH:", tg_file.file_path)
    print("FILE SIZE:", tg_file.file_size)

fid = get_media_id()
if fid:
    asyncio.run(test(fid))
else:
    print("No media")
