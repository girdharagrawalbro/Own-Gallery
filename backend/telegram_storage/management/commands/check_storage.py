import os

from django.core.management.base import BaseCommand

from telegram_storage.blob_storage import BlobStorageService
from telegram_storage.bot_api import BotApiClient
from telegram_storage.mtproto import MTProtoClient, mtproto_configured


class Command(BaseCommand):

    help = "Verify Telegram (Bot API + MTProto) and Azure Blob configuration"

    def handle(self, *args, **options):
        ok = True

        try:
            me = BotApiClient()._call("getMe")
            self.stdout.write(self.style.SUCCESS(f"Bot API: connected as @{me['username']}"))
            chat = BotApiClient()._call("getChat", data={"chat_id": os.getenv("TELEGRAM_CHANNEL_ID")})
            self.stdout.write(self.style.SUCCESS(f"Bot API: channel '{chat.get('title')}' reachable"))
        except Exception as exc:
            ok = False
            self.stdout.write(self.style.ERROR(f"Bot API: {exc}"))

        if mtproto_configured():
            try:
                client = MTProtoClient.get()
                client._ensure_started()
                self.stdout.write(self.style.SUCCESS(
                    "MTProto: logged in, channel resolved (uploads up to 2 GB, streaming of any size)"
                ))
            except Exception as exc:
                ok = False
                self.stdout.write(self.style.ERROR(f"MTProto: {exc!r}"))
        else:
            self.stdout.write(self.style.WARNING(
                "MTProto: not configured -> uploads limited to 50 MB and playback/download to 20 MB. "
                "Set TELEGRAM_API_ID and TELEGRAM_API_HASH (https://my.telegram.org)."
            ))

        try:
            BlobStorageService().container.get_container_properties()
            self.stdout.write(self.style.SUCCESS("Azure Blob: temp container reachable"))
        except Exception as exc:
            ok = False
            self.stdout.write(self.style.ERROR(f"Azure Blob: {exc}"))

        if not ok:
            raise SystemExit(1)
