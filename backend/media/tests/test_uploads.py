import hashlib
import io
import os
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from media import tasks
from media.models import Media, MediaVariant

User = get_user_model()
MP4_HEADER = (24).to_bytes(4, "big") + b"ftypiso5\0\0\0\0iso5dash" + b"\0" * 64


def jpeg(size=(40, 30)):
    buf = io.BytesIO()
    Image.new("RGB", size, "blue").save(buf, "JPEG")
    return buf.getvalue()


class FakeBlobStore:
    """In-memory stand-in for BlobStorageService."""

    blobs = {}
    blocks = {}

    def upload_stream(self, stream, blob_name, length):
        self.blobs[blob_name] = stream.read()

    def stage_block(self, blob_name, index, data):
        self.blocks.setdefault(blob_name, {})[index] = bytes(data)

    def commit_blocks(self, blob_name, count):
        staged = self.blocks.get(blob_name, {})
        self.blobs[blob_name] = b"".join(staged[i] for i in range(count))

    def size(self, blob_name):
        return len(self.blobs[blob_name])

    def download_file(self, blob_name, destination):
        with open(destination, "wb") as f:
            f.write(self.blobs[blob_name])

    def delete_file(self, blob_name):
        self.blobs.pop(blob_name, None)


@override_settings(MEDIA_URL_SIGNING_KEY="test-key", UPLOAD_CHUNK_SIZE=64, MAX_UPLOAD_SIZE=10_000)
class UploadTests(TestCase):

    def setUp(self):
        cache.clear()
        FakeBlobStore.blobs, FakeBlobStore.blocks = {}, {}
        self.user = User.objects.create_user(username="u1", email="u1@example.com", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        for target in ("media.views.BlobStorageService", "media.upload_views.BlobStorageService"):
            patcher = patch(target, FakeBlobStore)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = patch("media.views.upload_media_to_telegram")
        self.task = patcher.start()
        self.addCleanup(patcher.stop)

    def start(self, data, filename="clip.mp4", **extra):
        response = self.client.post(
            "/api/media/uploads/",
            {"filename": filename, "file_size": len(data), "mime_type": "video/mp4", **extra},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def put_chunk(self, upload_id, index, data):
        return self.client.generic(
            "PUT", f"/api/media/uploads/{upload_id}/chunks/{index}/", data,
            content_type="application/octet-stream",
        )

    def test_chunked_upload_out_of_order(self):
        data = MP4_HEADER + os.urandom(150)
        session = self.start(data, client_timestamp="1700000000000")
        self.assertEqual(session["total_chunks"], 4)
        chunks = [data[i:i + 64] for i in range(0, len(data), 64)]
        for index in (2, 0, 3, 1, 1):  # out of order + a retried chunk
            self.assertEqual(self.put_chunk(session["upload_id"], index, chunks[index]).status_code, 204)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f"/api/media/uploads/{session['upload_id']}/complete/")
        self.assertEqual(response.status_code, 202, response.content)
        body = response.json()
        self.assertEqual((body["status"], body["media_type"], body["filename"]), ("processing", "video", "clip.mp4"))

        media = Media.objects.get(pk=body["id"])
        self.assertEqual(FakeBlobStore.blobs[media.temp_file_path], data)
        self.assertEqual((media.taken_at.year, media.taken_at_source), (2023, "client"))
        self.task.delay.assert_called_once_with(media.id)

    def test_complete_reports_missing_chunks(self):
        data = MP4_HEADER + os.urandom(100)
        session = self.start(data)
        self.put_chunk(session["upload_id"], 0, data[:64])
        response = self.client.post(f"/api/media/uploads/{session['upload_id']}/complete/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["missing_chunks"], [1, 2])

    def test_wrong_chunk_size_and_bad_type(self):
        data = b"%PDF" + os.urandom(100)
        session = self.start(data)
        self.assertEqual(self.put_chunk(session["upload_id"], 0, data[:10]).status_code, 400)
        response = self.put_chunk(session["upload_id"], 0, data[:64])
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported", response.json()["error"])

    def test_session_belongs_to_user(self):
        session = self.start(MP4_HEADER)
        other = User.objects.create_user(username="u2", email="u2@example.com", password="pw")
        self.client.force_authenticate(other)
        self.assertEqual(self.put_chunk(session["upload_id"], 0, MP4_HEADER[:64]).status_code, 404)

    def test_too_large(self):
        response = self.client.post("/api/media/uploads/", {"filename": "a.mp4", "file_size": 20_000}, format="json")
        self.assertEqual(response.status_code, 413)

    def test_legacy_multipart_upload_and_duplicate(self):
        data = jpeg()
        with self.captureOnCommitCallbacks(execute=True):
            first = self.client.post("/api/media/", {"file": SimpleUploadedFile("p.jpg", data)}, format="multipart")
        self.assertEqual(first.status_code, 202, first.content)
        media = Media.objects.get(pk=first.json()["id"])
        self.assertTrue(media.file_hash)

        media.status = "completed"
        media.save()
        second = self.client.post("/api/media/", {"file": SimpleUploadedFile("p.jpg", data)}, format="multipart")
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["id"], media.id)
        self.assertEqual(Media.objects.count(), 1)


@override_settings(MEDIA_URL_SIGNING_KEY="test-key")
class UploadTaskTests(TestCase):

    def setUp(self):
        FakeBlobStore.blobs, FakeBlobStore.blocks = {}, {}
        self.user = User.objects.create_user(username="u1", email="u1@example.com", password="pw")
        patcher = patch("media.tasks.BlobStorageService", FakeBlobStore)
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch("media.tasks.TelegramStorage")
        self.storage = patcher.start().return_value
        self.addCleanup(patcher.stop)
        self.storage.upload_limit = 50 * 1024 * 1024
        self.message_ids = iter(range(100, 200))
        self.storage.upload.side_effect = lambda path, *a, **k: {
            "message_id": next(self.message_ids), "file_id": "f", "file_unique_id": "u",
            "thumbnail_file_id": "t", "size": os.path.getsize(path),
        }

    def media_with_blob(self, data, **kwargs):
        FakeBlobStore.blobs["temp_uploads/x"] = data
        defaults = dict(user=self.user, media_type="image", filename="p.jpg", mime_type="image/jpeg",
                        file_size=len(data), status="processing", temp_file_path="temp_uploads/x")
        defaults.update(kwargs)
        return Media.objects.create(**defaults)

    def test_large_image_stored_with_preview(self):
        media = self.media_with_blob(jpeg((3000, 2000)))
        tasks.upload_media_to_telegram(media.id)
        media.refresh_from_db()
        self.assertEqual(media.status, "completed", media.upload_error)
        self.assertEqual((media.width, media.height, media.telegram_message_id), (3000, 2000, 100))
        preview = media.variants.get(kind=MediaVariant.PREVIEW)
        self.assertEqual((preview.width, preview.height, preview.telegram_message_id), (1600, 1067, 101))
        self.assertNotIn("temp_uploads/x", FakeBlobStore.blobs)
        # The original upload carries a generated thumbnail.
        self.assertIsNotNone(self.storage.upload.call_args_list[0][0][4])

    def test_duplicate_detected_after_chunked_upload(self):
        data = jpeg()
        Media.objects.create(user=self.user, media_type="image", filename="p.jpg", status="completed",
                             file_hash=hashlib.sha256(data).hexdigest())
        media = self.media_with_blob(data)
        tasks.upload_media_to_telegram(media.id)
        media.refresh_from_db()
        self.assertEqual(media.status, "duplicate")
        self.storage.upload.assert_not_called()

    def test_too_big_for_bot_api_fails_without_retry(self):
        self.storage.upload_limit = 10
        media = self.media_with_blob(jpeg())
        tasks.upload_media_to_telegram(media.id)
        media.refresh_from_db()
        self.assertEqual(media.status, "failed")
        self.assertIn("TELEGRAM_API_ID", media.upload_error)

    def test_retry_does_not_reupload_original(self):
        media = self.media_with_blob(jpeg((3000, 2000)))
        calls = {"n": 0}

        def flaky(path, *args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 2:  # preview upload fails once
                raise ConnectionError("network down")
            return {"message_id": 100 + calls["n"], "file_id": "f", "file_unique_id": "u",
                    "thumbnail_file_id": None, "size": os.path.getsize(path)}

        self.storage.upload.side_effect = flaky
        with patch.object(tasks.upload_media_to_telegram, "retry", side_effect=RuntimeError("retry")):
            with self.assertRaises(RuntimeError):
                tasks.upload_media_to_telegram(media.id)
        tasks.upload_media_to_telegram(media.id)
        media.refresh_from_db()
        self.assertEqual(media.status, "completed")
        self.assertEqual(media.telegram_message_id, 101)
        self.assertEqual(calls["n"], 3)  # original once, preview twice
