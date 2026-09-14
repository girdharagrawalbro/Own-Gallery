"""Single entry point for storing and reading files in the Telegram channel.

Routes each operation to MTProto (large files, random access) when it is
configured and falls back to the Bot API otherwise.
"""

from dataclasses import dataclass

from .bot_api import BOT_API_DOWNLOAD_LIMIT, BOT_API_UPLOAD_LIMIT, BotApiClient
from .mtproto import MTPROTO_UPLOAD_LIMIT, MTProtoClient, mtproto_configured


class StorageError(Exception):
    """Operation can't succeed with the current configuration (don't retry)."""


@dataclass
class TelegramFile:
    message_id: int | None
    file_id: str | None
    size: int


class TelegramStorage:

    def __init__(self):
        self.uses_mtproto = mtproto_configured()

    @property
    def upload_limit(self):
        return MTPROTO_UPLOAD_LIMIT if self.uses_mtproto else BOT_API_UPLOAD_LIMIT

    def upload(self, path, filename, mime_type, size, thumbnail_path=None):
        if size > self.upload_limit:
            raise StorageError(
                f"File is {size // (1024 * 1024)} MB; the Telegram Bot API accepts at most "
                f"{self.upload_limit // (1024 * 1024)} MB. Set TELEGRAM_API_ID and "
                "TELEGRAM_API_HASH on the server to store files up to 2 GB."
            )
        if self.uses_mtproto:
            return MTProtoClient.get().upload(path, filename, mime_type, thumbnail_path)
        return BotApiClient().send_document(path, filename, mime_type, thumbnail_path)

    def iter_range(self, file: TelegramFile, start, end):
        if self.uses_mtproto and file.message_id:
            return MTProtoClient.get().iter_range(file.message_id, start, end)
        if not file.file_id:
            raise StorageError("This file can only be read through MTProto (TELEGRAM_API_ID/HASH).")
        if file.size and file.size > BOT_API_DOWNLOAD_LIMIT:
            raise StorageError(
                "Files over 20 MB can't be downloaded through the Telegram Bot API. "
                "Set TELEGRAM_API_ID and TELEGRAM_API_HASH on the server."
            )
        return BotApiClient().iter_range(file.file_id, start, end)

    def read_thumbnail(self, message_id, thumbnail_file_id):
        if thumbnail_file_id:
            return BotApiClient().download_bytes(thumbnail_file_id)
        if self.uses_mtproto and message_id:
            return MTProtoClient.get().download_thumbnail(message_id)
        return None

    def delete_messages(self, message_ids):
        message_ids = [m for m in message_ids if m]
        if not message_ids:
            return
        if self.uses_mtproto:
            MTProtoClient.get().delete_messages(message_ids)
            return
        client = BotApiClient()
        for message_id in message_ids:
            client.delete_message(message_id)
