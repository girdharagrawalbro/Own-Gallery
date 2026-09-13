import os

from telegram import Bot


class TelegramStorageService:

    def __init__(self):
        self.bot = Bot(token=os.getenv("TELEGRAM_BOT_TOKEN"))

        self.channel_id = os.getenv("TELEGRAM_CHANNEL_ID")

    async def get_me(self):
        return await self.bot.get_me()

    async def send_test_message(self):
        message = await self.bot.send_message(
            chat_id=self.channel_id, text="Gallery backend connection test"
        )

        return message

    async def upload_media(self, file, thumbnail=None):
        kwargs = {
            "chat_id": self.channel_id,
            "document": file,
            "write_timeout": 300,
            "read_timeout": 300,
            "connect_timeout": 60,
        }
        if thumbnail:
            kwargs["thumbnail"] = thumbnail

        message = await self.bot.send_document(**kwargs)

        telegram_file = message.document
        thumbnail_file = getattr(telegram_file, 'thumbnail', None)
        if not thumbnail_file:
            thumbnail_file = getattr(telegram_file, 'thumb', None)

        return {
            "message_id": message.message_id,
            "file_id": telegram_file.file_id,
            "file_unique_id": telegram_file.file_unique_id,
            "thumbnail_file_id": (
                thumbnail_file.file_id
                if thumbnail_file
                else None
            ),
        }

    async def get_file_stream_generator(self, file_id, chunk_size=512 * 1024, range_header=None):
        import httpx
        telegram_file = await self.bot.get_file(file_id)
        url = telegram_file.file_path
        file_size = telegram_file.file_size

        headers = {}
        if range_header:
            headers["Range"] = range_header

        def chunk_generator():
            with httpx.Client() as client:
                with client.stream("GET", url, headers=headers) as response:
                    # Ignore 416 Range Not Satisfiable in case browser sends bad range
                    if response.status_code not in (200, 206):
                        response.raise_for_status()
                    for chunk in response.iter_bytes(chunk_size=chunk_size):
                        yield chunk

        return chunk_generator, file_size
