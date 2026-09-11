import asyncio

from django.core.management.base import BaseCommand

from telegram_storage.service import TelegramStorageService


class Command(BaseCommand):

    help = "Test Telegram channel connection"

    def handle(self, *args, **options):

        async def test():
            service = TelegramStorageService()

            message = await service.send_test_message()

            self.stdout.write(
                self.style.SUCCESS(
                    f"Message sent successfully. "
                    f"Telegram message ID: {message.message_id}"
                )
            )

        asyncio.run(test())
