import asyncio

from django.core.management.base import BaseCommand

from telegram_storage.service import TelegramStorageService


class Command(BaseCommand):

    help = "Test Telegram bot connection"

    def handle(self, *args, **options):

        async def test():
            service = TelegramStorageService()

            bot = await service.get_me()

            self.stdout.write(
                self.style.SUCCESS(
                    f"Connected to Telegram bot: @{bot.username}"
                )
            )

        asyncio.run(test())