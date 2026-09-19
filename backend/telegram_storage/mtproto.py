"""MTProto (Telethon) backend: files up to 2 GB with random-access downloads.

Enabled when TELEGRAM_API_ID and TELEGRAM_API_HASH are set (get them at
https://my.telegram.org). It logs in with the same bot token, so the bot keeps
owning the channel and messages uploaded through the Bot API remain readable
(channel message ids are identical in both APIs).

Django/Celery code is synchronous, so each process runs one Telethon client on a
private event loop thread and sync callers hop onto it.
"""

import asyncio
import hashlib
import logging
import os
import threading
import time
from collections import OrderedDict

from django.core.cache import cache

logger = logging.getLogger(__name__)

MTPROTO_UPLOAD_LIMIT = 2000 * 1024 * 1024
CHUNK_SIZE = 512 * 1024  # Telethon's maximum request size
MESSAGE_CACHE_SIZE = 1024
MESSAGE_CACHE_TTL = 30 * 60

_END = object()


def mtproto_configured():
    return bool(
        os.getenv("TELEGRAM_API_ID") and os.getenv("TELEGRAM_API_HASH") and os.getenv("TELEGRAM_BOT_TOKEN")
    )


def _channel_peer(channel_id):
    channel_id = (channel_id or "").strip()
    if channel_id.lstrip("-").isdigit():
        return int(channel_id)
    return channel_id  # @username


class MTProtoClient:
    _instance = None
    _instance_pid = None
    _instance_lock = threading.Lock()

    @classmethod
    def get(cls):
        with cls._instance_lock:
            # Recreate after fork (gunicorn/celery workers): event loops don't survive fork.
            if cls._instance is None or cls._instance_pid != os.getpid():
                cls._instance = cls()
                cls._instance_pid = os.getpid()
            return cls._instance

    def __init__(self):
        self.api_id = int(os.getenv("TELEGRAM_API_ID"))
        self.api_hash = os.getenv("TELEGRAM_API_HASH")
        self.bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
        self.channel_id = os.getenv("TELEGRAM_CHANNEL_ID")
        token_hash = hashlib.sha256(self.bot_token.encode()).hexdigest()[:16]
        self.session_cache_key = f"tg:mtproto:session:{token_hash}"

        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._loop.run_forever, name="telethon", daemon=True)
        self._thread.start()
        self._start_lock = threading.Lock()
        self._client = None
        self._entity = None
        self._messages = OrderedDict()

    # -- plumbing ---------------------------------------------------------

    def _run(self, coro, timeout=None):
        return asyncio.run_coroutine_threadsafe(coro, self._loop).result(timeout)

    def _ensure_started(self):
        if self._client is not None:
            return
        with self._start_lock:
            if self._client is not None:
                return
            # Reuse one bot authorization across processes/restarts: logging in
            # again on every boot quickly hits Telegram's flood limits.
            session = cache.get(self.session_cache_key) or os.getenv("TELEGRAM_MTPROTO_SESSION", "")
            started = time.monotonic()
            new_session = self._run(self._start(session), timeout=90)
            if new_session:
                cache.set(self.session_cache_key, new_session, timeout=None)


    async def _start(self, session):
        from telethon import TelegramClient
        from telethon.sessions import StringSession

        client = TelegramClient(
            StringSession(session),
            self.api_id,
            self.api_hash,
            receive_updates=False,
            connection_retries=5,
            retry_delay=1,
            auto_reconnect=True,
            flood_sleep_threshold=60,
        )
        await client.connect()
        new_session = None
        if not await client.is_user_authorized():
            await client.sign_in(bot_token=self.bot_token)
            new_session = client.session.save()
        self._entity = await client.get_input_entity(_channel_peer(self.channel_id))
        self._client = client
        return new_session

    async def _get_message(self, message_id, refresh=False):
        cached = self._messages.get(message_id)
        if cached and not refresh and time.monotonic() - cached[0] < MESSAGE_CACHE_TTL:
            self._messages.move_to_end(message_id)
            return cached[1]
        message = await self._client.get_messages(self._entity, ids=message_id)
        if message is None or message.media is None:
            raise FileNotFoundError(f"Telegram message {message_id} has no media")
        self._messages[message_id] = (time.monotonic(), message)
        while len(self._messages) > MESSAGE_CACHE_SIZE:
            self._messages.popitem(last=False)
        return message

    # -- downloads --------------------------------------------------------

    async def _aiter_range(self, message_id, start, end):
        from telethon.errors import FileReferenceExpiredError

        remaining = end - start + 1
        for attempt in range(2):
            message = await self._get_message(message_id, refresh=attempt > 0)
            try:
                async for chunk in self._client.iter_download(
                    message.media,
                    offset=start,
                    request_size=CHUNK_SIZE,
                    chunk_size=CHUNK_SIZE,
                    file_size=message.file.size,
                ):
                    data = bytes(chunk)
                    if len(data) > remaining:
                        data = data[:remaining]
                    remaining -= len(data)
                    start += len(data)
                    yield data
                    if remaining <= 0:
                        return
                return
            except FileReferenceExpiredError:
                if attempt:
                    raise

    @staticmethod
    async def _next(agen):
        try:
            return await agen.__anext__()
        except StopAsyncIteration:
            return _END

    def iter_range(self, message_id, start, end):
        """Synchronous generator of bytes start..end (inclusive)."""
        self._ensure_started()
        agen = self._aiter_range(message_id, start, end)
        try:
            while True:
                chunk = self._run(self._next(agen), timeout=120)
                if chunk is _END:
                    return
                yield chunk
        finally:
            # Runs on normal completion and when the HTTP client disconnects.
            try:
                self._run(agen.aclose(), timeout=10)
            except Exception:
                pass

    async def _download_thumbnail(self, message_id):
        message = await self._get_message(message_id)
        return await self._client.download_media(message, bytes, thumb=-1)

    def download_thumbnail(self, message_id):
        self._ensure_started()
        return self._run(self._download_thumbnail(message_id), timeout=60)

    # -- uploads / deletes ------------------------------------------------

    async def _upload(self, path, filename, mime_type, thumbnail_path):
        from telethon.tl.types import DocumentAttributeFilename

        message = await self._client.send_file(
            self._entity,
            path,
            force_document=True,
            mime_type=mime_type or None,
            thumb=thumbnail_path,
            attributes=[DocumentAttributeFilename(filename)],
            silent=True,
        )
        self._messages[message.id] = (time.monotonic(), message)
        return {
            "message_id": message.id,
            "file_id": None,
            "file_unique_id": None,
            "thumbnail_file_id": None,
            "size": message.file.size if message.file else os.path.getsize(path),
        }

    def upload(self, path, filename, mime_type, thumbnail_path=None):
        self._ensure_started()
        return self._run(self._upload(path, filename, mime_type, thumbnail_path), timeout=3 * 3600)

    async def _delete(self, message_ids):
        await self._client.delete_messages(self._entity, message_ids)
        for message_id in message_ids:
            self._messages.pop(message_id, None)

    def delete_messages(self, message_ids):
        self._ensure_started()
        self._run(self._delete(list(message_ids)), timeout=60)
