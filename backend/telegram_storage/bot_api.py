"""Minimal synchronous Telegram Bot API client.

Uses one pooled httpx client per process so requests reuse TCP/TLS connections
instead of opening a new event loop and connection for every call.

Hard limits of the public Bot API: uploads <= 50 MB, downloads (getFile) <= 20 MB.
Bigger files need the MTProto backend (see mtproto.py).
"""

import logging
import os
import threading

logger = logging.getLogger(__name__)

import httpx
from django.core.cache import cache

BOT_API_UPLOAD_LIMIT = 50 * 1024 * 1024
BOT_API_DOWNLOAD_LIMIT = 20 * 1024 * 1024

# Attachment keys Telegram may use for a message, in order of preference.
ATTACHMENT_KEYS = ("document", "video", "animation", "audio", "voice", "video_note")


class TelegramApiError(Exception):
    def __init__(self, description, error_code=None, retry_after=None):
        super().__init__(description)
        self.error_code = error_code
        self.retry_after = retry_after


_http_lock = threading.Lock()
_http_client = None
_http_pid = None


def _http():
    global _http_client, _http_pid
    with _http_lock:
        if _http_client is None or _http_pid != os.getpid():
            _http_client = httpx.Client(
                timeout=httpx.Timeout(30.0, read=300.0, write=900.0),
                limits=httpx.Limits(max_connections=64, max_keepalive_connections=16),
                follow_redirects=True,
            )
            _http_pid = os.getpid()
        return _http_client


def extract_attachment(message):
    """Return the file dict of a Bot API message, whatever type Telegram gave it."""
    for key in ATTACHMENT_KEYS:
        if message.get(key):
            return message[key]
    photos = message.get("photo")
    if photos:
        return max(photos, key=lambda p: p.get("file_size", 0))
    return None


class BotApiClient:

    def __init__(self, token=None, channel_id=None):
        self.token = token or os.getenv("TELEGRAM_BOT_TOKEN")
        self.channel_id = channel_id or os.getenv("TELEGRAM_CHANNEL_ID")
        self.base_url = os.getenv("TELEGRAM_BOT_API_URL", "https://api.telegram.org").rstrip("/")
        if not self.token:
            raise ValueError("TELEGRAM_BOT_TOKEN is not configured")

    def _call(self, method, data=None, files=None):
        logger.debug("[BOT_API] Calling method=%s data=%s has_files=%s",
                     method, {k: v for k, v in (data or {}).items() if k != "chat_id"}, bool(files))
        response = _http().post(
            f"{self.base_url}/bot{self.token}/{method}", data=data, files=files
        )
        logger.debug("[BOT_API] Response method=%s status=%d", method, response.status_code)
        try:
            payload = response.json()
        except ValueError:
            logger.error("[BOT_API] method=%s HTTP %d non-JSON response", method, response.status_code)
            raise TelegramApiError(f"{method}: HTTP {response.status_code}", response.status_code)
        if not payload.get("ok"):
            params = payload.get("parameters") or {}
            logger.error("[BOT_API] method=%s FAILED error_code=%s description=%r retry_after=%s",
                         method, payload.get("error_code"),
                         payload.get("description"), params.get("retry_after"))
            raise TelegramApiError(
                payload.get("description", f"{method} failed"),
                payload.get("error_code"),
                params.get("retry_after"),
            )
        logger.debug("[BOT_API] method=%s OK", method)
        return payload["result"]

    def send_document(self, path, filename, mime_type, thumbnail_path=None):
        file_size = os.path.getsize(path)
        logger.info("[BOT_API] send_document file=%r mime=%s size=%d thumbnail=%s channel=%s",
                    filename, mime_type, file_size, thumbnail_path, self.channel_id)
        with open(path, "rb") as document:
            files = {"document": (filename, document, mime_type or "application/octet-stream")}
            thumb = open(thumbnail_path, "rb") if thumbnail_path else None
            try:
                if thumb:
                    files["thumbnail"] = ("thumb.jpg", thumb, "image/jpeg")
                message = self._call(
                    "sendDocument",
                    data={
                        "chat_id": self.channel_id,
                        # Keep every upload a plain file: no conversion to video/GIF.
                        "disable_content_type_detection": "true",
                        "disable_notification": "true",
                    },
                    files=files,
                )
            finally:
                if thumb:
                    thumb.close()

        attachment = extract_attachment(message)
        if not attachment:
            raise TelegramApiError("Telegram response did not contain a file")
        thumbnail = attachment.get("thumbnail") or attachment.get("thumb")
        return {
            "message_id": message["message_id"],
            "file_id": attachment["file_id"],
            "file_unique_id": attachment.get("file_unique_id"),
            "thumbnail_file_id": thumbnail["file_id"] if thumbnail else None,
            "size": attachment.get("file_size") or os.path.getsize(path),
        }

    def delete_message(self, message_id):
        self._call("deleteMessage", data={"chat_id": self.channel_id, "message_id": message_id})

    def _file_url(self, file_id, refresh=False):
        cache_key = f"tg:file_path:{file_id}"
        file_path = None if refresh else cache.get(cache_key)
        if not file_path:
            result = self._call("getFile", data={"file_id": file_id})
            file_path = result["file_path"]
            # Download links are valid for at least an hour.
            cache.set(cache_key, file_path, timeout=50 * 60)
        return f"{self.base_url}/file/bot{self.token}/{file_path}"

    def iter_range(self, file_id, start, end, chunk_size=256 * 1024):
        """Yield bytes start..end (inclusive) of a file."""
        remaining = end - start + 1
        for attempt in range(2):
            url = self._file_url(file_id, refresh=attempt > 0)
            with _http().stream(
                "GET", url, headers={"Range": f"bytes={start}-{end}"}, timeout=httpx.Timeout(30.0, read=120.0)
            ) as response:
                if response.status_code in (400, 404) and attempt == 0:
                    continue  # stale file_path, fetch a fresh one
                if response.status_code not in (200, 206):
                    raise TelegramApiError(f"File download failed: HTTP {response.status_code}")
                # Telegram ignored the Range header: skip up to the requested offset.
                skip = start if response.status_code == 200 else 0
                for chunk in response.iter_bytes(chunk_size):
                    if skip:
                        if len(chunk) <= skip:
                            skip -= len(chunk)
                            continue
                        chunk = chunk[skip:]
                        skip = 0
                    if len(chunk) > remaining:
                        chunk = chunk[:remaining]
                    remaining -= len(chunk)
                    yield chunk
                    if remaining <= 0:
                        return
                return

    def download_bytes(self, file_id):
        for attempt in range(2):
            response = _http().get(self._file_url(file_id, refresh=attempt > 0))
            if response.status_code in (400, 404) and attempt == 0:
                continue
            if response.status_code != 200:
                raise TelegramApiError(f"File download failed: HTTP {response.status_code}")
            return response.content
