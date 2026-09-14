import os
import threading
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from django.core.cache import cache
from django.test import SimpleTestCase

from telegram_storage import bot_api
from telegram_storage.bot_api import BotApiClient
from telegram_storage.mtproto import MTProtoClient
from telegram_storage.storage import StorageError, TelegramFile, TelegramStorage

PAYLOAD = os.urandom(3 * 1024 * 1024 + 123)
ENV = {"TELEGRAM_BOT_TOKEN": "123:abc", "TELEGRAM_CHANNEL_ID": "-100123", "TELEGRAM_API_ID": "1",
       "TELEGRAM_API_HASH": "hash"}


class FakeTelethonClient:
    """Mimics TelegramClient.iter_download: fixed-size chunks aligned to request_size."""

    def __init__(self):
        self.closed_early = threading.Event()

    async def iter_download(self, media, offset, request_size, chunk_size, file_size):
        aligned = offset - offset % request_size
        position = aligned
        first = True
        try:
            while position < file_size:
                chunk = PAYLOAD[position:position + chunk_size]
                if first:
                    chunk = chunk[offset - aligned:]
                    first = False
                position += chunk_size
                yield memoryview(chunk)
        except GeneratorExit:
            self.closed_early.set()
            raise


class MTProtoBridgeTests(SimpleTestCase):

    def setUp(self):
        patcher = patch.dict(os.environ, ENV)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = MTProtoClient()
        self.fake = FakeTelethonClient()
        self.client._client = self.fake  # skip network login
        message = SimpleNamespace(media=object(), file=SimpleNamespace(size=len(PAYLOAD)))

        async def get_message(message_id, refresh=False):
            return message

        self.client._get_message = get_message

    def tearDown(self):
        self.client._loop.call_soon_threadsafe(self.client._loop.stop)

    def test_exact_ranges(self):
        for start, end in [(0, 99), (1000, 600_000), (512 * 1024 - 1, 512 * 1024), (len(PAYLOAD) - 10, len(PAYLOAD) - 1)]:
            with self.subTest(start=start, end=end):
                data = b"".join(self.client.iter_range(7, start, end))
                self.assertEqual(data, PAYLOAD[start:end + 1])

    def test_client_disconnect_closes_download(self):
        stream = self.client.iter_range(7, 0, len(PAYLOAD) - 1)
        next(stream)
        stream.close()  # what Django does when the viewer goes away
        self.assertTrue(self.fake.closed_early.wait(5))


class BotApiRangeTests(SimpleTestCase):

    def setUp(self):
        cache.clear()
        self.requests = []

    def use_transport(self, honor_range):
        def handler(request):
            self.requests.append(request)
            if request.url.path.endswith("/getFile"):
                return httpx.Response(200, json={"ok": True, "result": {"file_path": "videos/f.mp4"}})
            header = request.headers.get("Range")
            if honor_range and header:
                start, end = (int(x) for x in header.split("=")[1].split("-"))
                return httpx.Response(206, content=PAYLOAD[start:end + 1])
            return httpx.Response(200, content=PAYLOAD)

        client = httpx.Client(transport=httpx.MockTransport(handler))
        patcher = patch.object(bot_api, "_http", return_value=client)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_range_honored(self):
        self.use_transport(honor_range=True)
        data = b"".join(BotApiClient(token="t", channel_id="c").iter_range("fid", 10, 2_000_000))
        self.assertEqual(data, PAYLOAD[10:2_000_001])

    def test_range_ignored_by_server(self):
        self.use_transport(honor_range=False)
        data = b"".join(BotApiClient(token="t", channel_id="c").iter_range("fid", 300_000, 300_099))
        self.assertEqual(data, PAYLOAD[300_000:300_100])

    def test_file_path_is_cached(self):
        self.use_transport(honor_range=True)
        client = BotApiClient(token="t", channel_id="c")
        b"".join(client.iter_range("fid", 0, 10))
        b"".join(client.iter_range("fid", 0, 10))
        self.assertEqual(sum(r.url.path.endswith("/getFile") for r in self.requests), 1)


class StorageRoutingTests(SimpleTestCase):

    @patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": "t", "TELEGRAM_API_ID": "", "TELEGRAM_API_HASH": ""})
    def test_bot_api_limits_are_explicit(self):
        storage = TelegramStorage()
        self.assertFalse(storage.uses_mtproto)
        with self.assertRaisesMessage(StorageError, "TELEGRAM_API_ID"):
            storage.iter_range(TelegramFile(1, "fid", 25 * 1024 * 1024), 0, 10)
        with self.assertRaisesMessage(StorageError, "50 MB"):
            storage.upload("/nonexistent", "a.mp4", "video/mp4", 60 * 1024 * 1024)

    @patch.dict(os.environ, ENV)
    def test_mtproto_used_for_large_files(self):
        with patch.object(MTProtoClient, "get") as get:
            TelegramStorage().iter_range(TelegramFile(9, None, 900 * 1024 * 1024), 0, 10)
        get.return_value.iter_range.assert_called_once_with(9, 0, 10)
