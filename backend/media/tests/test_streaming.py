from datetime import datetime, timezone as dt_timezone
from unittest.mock import patch
from urllib.parse import urlparse

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from media.models import Media, MediaVariant
from media.signing import current_expiry, make_signature, signed_path, verify_signature
from media.streaming import RangeNotSatisfiable, parse_range
from telegram_storage.bot_api import extract_attachment
from telegram_storage.storage import StorageError

User = get_user_model()
PAYLOAD = bytes(range(256)) * 4  # 1024 bytes


def fake_iter_range(tg_file, start, end):
    yield PAYLOAD[start:end + 1]


class ParseRangeTests(SimpleTestCase):

    def test_ranges(self):
        self.assertIsNone(parse_range(None, 100))
        self.assertIsNone(parse_range("bytes=0-1,5-6", 100))  # multi-range -> full body
        self.assertEqual(parse_range("bytes=0-", 100), (0, 99))
        self.assertEqual(parse_range("bytes=10-19", 100), (10, 19))
        self.assertEqual(parse_range("bytes=90-500", 100), (90, 99))
        self.assertEqual(parse_range("bytes=-10", 100), (90, 99))
        self.assertEqual(parse_range("bytes=-500", 100), (0, 99))

    def test_unsatisfiable(self):
        for header in ("bytes=100-", "bytes=50-10", "bytes=-0"):
            with self.subTest(header=header), self.assertRaises(RangeNotSatisfiable):
                parse_range(header, 100)


@override_settings(MEDIA_URL_SIGNING_KEY="test-key", MEDIA_URL_ROTATION_SECONDS=100)
class SigningTests(SimpleTestCase):

    def test_expiry_is_stable_within_period(self):
        self.assertEqual(current_expiry(now=1000), current_expiry(now=1099))
        self.assertEqual(current_expiry(now=1000), 1200)

    def test_verify(self):
        sig = make_signature(5, 1200)
        self.assertTrue(verify_signature(5, 1200, sig, now=1100))
        self.assertFalse(verify_signature(6, 1200, sig, now=1100))
        self.assertFalse(verify_signature(5, 1300, sig, now=1100))
        self.assertFalse(verify_signature(5, 1200, sig, now=1201))
        self.assertFalse(verify_signature(5, "abc", sig))


class ExtractAttachmentTests(SimpleTestCase):

    def test_video_sent_as_animation_or_document(self):
        self.assertEqual(extract_attachment({"animation": {"file_id": "a"}})["file_id"], "a")
        self.assertEqual(extract_attachment({"document": {"file_id": "d"}})["file_id"], "d")
        photos = {"photo": [{"file_id": "s", "file_size": 1}, {"file_id": "b", "file_size": 9}]}
        self.assertEqual(extract_attachment(photos)["file_id"], "b")
        self.assertIsNone(extract_attachment({"text": "hi"}))


@override_settings(MEDIA_URL_SIGNING_KEY="test-key")
class MediaFileEndpointTests(TestCase):

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username="u1", email="u1@example.com", password="pw")
        self.other = User.objects.create_user(username="u2", email="u2@example.com", password="pw")
        self.client = APIClient()
        self.media = Media.objects.create(
            user=self.user, media_type="video", filename="clip.mp4", mime_type="video/mp4",
            file_size=len(PAYLOAD), status="completed", telegram_message_id=42, telegram_file_id="fid",
        )
        patcher = patch("media.views.TelegramStorage")
        self.storage = patcher.start().return_value
        self.storage.iter_range.side_effect = fake_iter_range
        self.addCleanup(patcher.stop)

    def signed_url(self, action, media=None):
        return signed_path((media or self.media).id, action)

    def get(self, action, media=None, **headers):
        return self.client.get(self.signed_url(action, media), **headers)

    def test_signed_url_needs_no_login(self):
        response = self.get("content")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), PAYLOAD)
        self.assertEqual(response["Content-Length"], "1024")
        self.assertEqual(response["Accept-Ranges"], "bytes")
        self.assertIn("immutable", response["Cache-Control"])

    def test_range_request(self):
        response = self.get("content", HTTP_RANGE="bytes=100-199")
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response["Content-Range"], "bytes 100-199/1024")
        self.assertEqual(response["Content-Length"], "100")
        self.assertEqual(b"".join(response.streaming_content), PAYLOAD[100:200])

    def test_open_ended_and_unsatisfiable_ranges(self):
        response = self.get("content", HTTP_RANGE="bytes=1000-")
        self.assertEqual(response["Content-Range"], "bytes 1000-1023/1024")
        self.assertEqual(b"".join(response.streaming_content), PAYLOAD[1000:])
        self.assertEqual(self.get("content", HTTP_RANGE="bytes=5000-").status_code, 416)

    def test_head_does_not_touch_storage(self):
        response = self.client.head(self.signed_url("content"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Length"], "1024")
        self.storage.iter_range.assert_not_called()

    def test_etag_revalidation(self):
        etag = self.get("content")["ETag"]
        self.assertEqual(self.get("content", HTTP_IF_NONE_MATCH=etag).status_code, 304)

    def test_stream_variant_preferred_for_playback_but_not_download(self):
        MediaVariant.objects.create(media=self.media, kind="stream", mime_type="video/mp4",
                                    file_size=512, telegram_message_id=43)
        content = self.get("content")
        self.assertEqual(content["Content-Length"], "512")
        b"".join(content.streaming_content)
        self.assertEqual(self.storage.iter_range.call_args[0][0].message_id, 43)

        download = self.get("download")
        self.assertEqual(download["Content-Length"], "1024")
        self.assertIn("attachment;", download["Content-Disposition"])

    def test_tampered_signature_rejected(self):
        response = self.client.get(self.signed_url("content").replace("sig=", "sig=x"))
        self.assertEqual(response.status_code, 401)

    def test_signature_for_other_media_rejected(self):
        other_media = Media.objects.create(user=self.other, media_type="image", filename="b.jpg",
                                           mime_type="image/jpeg", file_size=10, telegram_message_id=7)
        query = urlparse(self.signed_url("content")).query
        response = self.client.get(f"/api/media/{other_media.id}/content/?{query}")
        self.assertEqual(response.status_code, 401)

    def test_signature_does_not_grant_api_access(self):
        query = urlparse(self.signed_url("content")).query
        self.assertEqual(self.client.get(f"/api/media/{self.media.id}/?{query}").status_code, 403)
        self.assertEqual(self.client.post(f"/api/media/{self.media.id}/trash/?{query}").status_code, 403)

    def test_unauthenticated_without_signature(self):
        self.assertEqual(self.client.get(f"/api/media/{self.media.id}/content/").status_code, 401)

    def test_owner_header_auth_still_works_and_others_get_404(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(f"/api/media/{self.media.id}/content/").status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/media/{self.media.id}/content/").status_code, 404)

    def test_thumbnail_cached_after_first_fetch(self):
        self.storage.read_thumbnail.return_value = b"jpegbytes"
        self.assertEqual(self.get("thumbnail").content, b"jpegbytes")
        self.get("thumbnail")
        self.assertEqual(self.storage.read_thumbnail.call_count, 1)

    def test_storage_limit_error_is_reported(self):
        self.storage.iter_range.side_effect = StorageError("too big")
        response = self.get("content")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["error"], "too big")

    def test_error_on_first_chunk_is_a_502_not_a_truncated_200(self):
        def failing(tg_file, start, end):
            raise ConnectionError("login failed")
            yield b""  # pragma: no cover - makes this a generator

        self.storage.iter_range.side_effect = failing
        self.assertEqual(self.get("content").status_code, 502)

    def test_missing_thumbnail_falls_back_without_looping(self):
        self.storage.read_thumbnail.return_value = None
        self.assertEqual(self.get("thumbnail").status_code, 404)  # video, no preview
        self.assertEqual(self.get("preview").status_code, 404)

        small = Media.objects.create(user=self.user, media_type="image", filename="s.png", mime_type="image/png",
                                     file_size=len(PAYLOAD), status="completed", telegram_message_id=50)
        response = self.get("thumbnail", media=small)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), PAYLOAD)
        self.get("thumbnail", media=small)
        self.assertEqual(self.storage.read_thumbnail.call_count, 2)  # "no thumbnail" is cached per item

    def test_file_requests_are_not_throttled(self):
        self.storage.read_thumbnail.return_value = b"jpegbytes"
        with patch("rest_framework.throttling.UserRateThrottle.get_rate", return_value="1/hour"):
            for _ in range(3):
                self.assertEqual(self.get("thumbnail").status_code, 200)


@override_settings(MEDIA_URL_SIGNING_KEY="test-key")
class MediaApiTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username="u1", email="u1@example.com", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def make(self, **kwargs):
        defaults = dict(user=self.user, media_type="image", filename="a.jpg", mime_type="image/jpeg",
                        file_size=10, status="completed")
        defaults.update(kwargs)
        return Media.objects.create(**defaults)

    def test_list_contains_signed_urls_and_hides_duplicates(self):
        visible = self.make()
        self.make(status="duplicate")
        response = self.client.get("/api/media/?page_size=100")
        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual([m["id"] for m in results], [visible.id])
        for key in ("thumbnail_url", "preview_url", "content_url", "download_url"):
            self.assertIn("sig=", results[0][key])
        self.assertEqual(results[0]["status"], "completed")

    def test_retrieve_shows_duplicate_for_polling(self):
        duplicate = self.make(status="duplicate")
        self.assertEqual(self.client.get(f"/api/media/{duplicate.id}/").json()["status"], "duplicate")

    def test_favorite_action_and_readonly_fields(self):
        media = self.make()
        response = self.client.post(f"/api/media/{media.id}/favorite/", {"is_favorite": True}, format="json")
        self.assertTrue(response.json()["is_favorite"])
        self.client.patch(f"/api/media/{media.id}/", {"filename": "hacked.exe", "media_type": "video"}, format="json")
        media.refresh_from_db()
        self.assertEqual((media.filename, media.media_type), ("a.jpg", "image"))

    def test_search_by_year_and_month(self):
        old = self.make(taken_at=datetime(2019, 3, 1, tzinfo=dt_timezone.utc), filename="x.jpg")
        self.make(taken_at=datetime(2024, 9, 1, tzinfo=dt_timezone.utc), filename="y.jpg")
        ids = [m["id"] for m in self.client.get("/api/media/?search=march 2019").json()["results"]]
        self.assertEqual(ids, [old.id])

    def test_timeline(self):
        self.make(taken_at=datetime(2024, 9, 1, tzinfo=dt_timezone.utc))
        self.make(taken_at=datetime(2024, 9, 20, tzinfo=dt_timezone.utc))
        self.make(taken_at=datetime(2023, 1, 5, tzinfo=dt_timezone.utc))
        months = self.client.get("/api/media/timeline/").json()["months"]
        self.assertEqual(months, [{"month": "2024-09", "count": 2}, {"month": "2023-01", "count": 1}])

    @patch("media.views.delete_telegram_messages")
    def test_permanent_delete_removes_telegram_messages(self, delete_task):
        media = self.make(is_deleted=True, telegram_message_id=11)
        MediaVariant.objects.create(media=media, kind="preview", mime_type="image/jpeg", telegram_message_id=12)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(f"/api/media/{media.id}/permanent-delete/")
        self.assertEqual(response.status_code, 204)
        delete_task.delay.assert_called_once_with([11, 12])

    def test_status_batch_returns_only_own_items(self):
        mine = self.make(status="processing")
        done = self.make(status="completed")
        other_user = User.objects.create_user(username="u9", email="u9@example.com", password="pw")
        foreign = Media.objects.create(user=other_user, media_type="image", filename="z.jpg", file_size=1)
        response = self.client.get(f"/api/media/status/?ids={mine.id},{done.id},{foreign.id},abc")
        statuses = {m["id"]: m["status"] for m in response.json()["results"]}
        self.assertEqual(statuses, {mine.id: "processing", done.id: "completed"})

    def test_check_hashes(self):
        self.make(file_hash="a" * 64, status="completed")
        self.make(file_hash="b" * 64, status="failed")
        response = self.client.post("/api/media/check-hashes/", {"hashes": ["A" * 64, "b" * 64, "c" * 64]},
                                    format="json")
        self.assertEqual(response.json()["existing"], ["a" * 64])

