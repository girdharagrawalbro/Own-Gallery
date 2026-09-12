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

        if file.content_type.startswith("image/"):

            message = await self.bot.send_photo(
                chat_id=self.channel_id,
                photo=file,
                write_timeout=120,
                read_timeout=120,
                connect_timeout=60,
            )

            telegram_file = message.photo[-1]
            # Use index 1 (usually ~320px) for a decent quality thumbnail, instead of 0 (~90px)
            thumbnail_file = message.photo[1] if len(message.photo) > 1 else message.photo[0]

            width = telegram_file.width
            height = telegram_file.height
            duration = None

        elif file.content_type.startswith("video/"):
            
            kwargs = {
                "chat_id": self.channel_id,
                "video": file,
                "write_timeout": 300,
                "read_timeout": 300,
                "connect_timeout": 60,
            }
            if thumbnail:
                kwargs["thumbnail"] = thumbnail

            message = await self.bot.send_video(**kwargs)

            telegram_file = message.video
            # Telegram automatically generates a thumbnail for videos
            thumbnail_file = getattr(message.video, 'thumbnail', None)
            if not thumbnail_file:
                thumbnail_file = getattr(message.video, 'thumb', None)

            width = telegram_file.width
            height = telegram_file.height
            duration = telegram_file.duration

        else:
            raise ValueError("Unsupported media type")

        return {
            "message_id": message.message_id,
            "file_id": telegram_file.file_id,
            "file_unique_id": telegram_file.file_unique_id,
            "thumbnail_file_id": (
                thumbnail_file.file_id
                if thumbnail_file
                else None
            ),
            "width": width,
            "height": height,
            "duration": duration,

        }

    async def get_file_stream_generator(self, file_id, chunk_size=512 * 1024):
        import httpx
        telegram_file = await self.bot.get_file(file_id)
        url = telegram_file.file_path
        file_size = telegram_file.file_size

        def chunk_generator():
            with httpx.Client() as client:
                with client.stream("GET", url) as response:
                    response.raise_for_status()
                    for chunk in response.iter_bytes(chunk_size=chunk_size):
                        yield chunk

        return chunk_generator, file_size
