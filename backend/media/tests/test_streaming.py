from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from media.models import Media
from unittest.mock import patch, MagicMock
from django.http import StreamingHttpResponse

User = get_user_model()

class StreamingEndpointTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="password")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.media = Media.objects.create(
            user=self.user,
            telegram_message_id=1,
            telegram_file_id="dummy_file_id",
            telegram_thumbnail_file_id="dummy_thumb_id",
            media_type="image",
            filename="test_image.jpg",
            mime_type="image/jpeg",
            file_size=1024,
            width=800,
            height=600,
        )

    @patch("media.views.TelegramStorageService")
    def test_content_streaming_response(self, MockService):
        mock_instance = MockService.return_value
        
        # Mock get_file_stream_generator to return a dummy generator and file size
        def dummy_generator():
            yield b"chunk1"
            yield b"chunk2"
            
        async def mock_get_file_stream_generator(file_id):
            return dummy_generator, 1024
            
        mock_instance.get_file_stream_generator.side_effect = mock_get_file_stream_generator

        url = reverse('media-content', kwargs={'pk': self.media.pk})
        response = self.client.get(url)

        self.assertIsInstance(response, StreamingHttpResponse)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], "image/jpeg")
        self.assertIn("inline; filename*=utf-8''test_image.jpg", response['Content-Disposition'])
        self.assertEqual(response['Content-Length'], "1024")
        
        # Verify content
        content = b"".join(response.streaming_content)
        self.assertEqual(content, b"chunk1chunk2")

    @patch("media.views.TelegramStorageService")
    def test_download_streaming_response(self, MockService):
        mock_instance = MockService.return_value
        
        def dummy_generator():
            yield b"download_chunk"
            
        async def mock_get_file_stream_generator(file_id):
            return dummy_generator, 500
            
        mock_instance.get_file_stream_generator.side_effect = mock_get_file_stream_generator

        url = reverse('media-download', kwargs={'pk': self.media.pk})
        response = self.client.get(url)

        self.assertIsInstance(response, StreamingHttpResponse)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], "image/jpeg")
        self.assertIn("attachment; filename*=utf-8''test_image.jpg", response['Content-Disposition'])
        self.assertEqual(response['Content-Length'], "500")

    @patch("media.views.TelegramStorageService")
    def test_thumbnail_streaming_response(self, MockService):
        mock_instance = MockService.return_value
        
        def dummy_generator():
            yield b"thumb_chunk"
            
        async def mock_get_file_stream_generator(file_id):
            return dummy_generator, 100
            
        mock_instance.get_file_stream_generator.side_effect = mock_get_file_stream_generator

        url = reverse('media-thumbnail', kwargs={'pk': self.media.pk})
        response = self.client.get(url)

        self.assertIsInstance(response, StreamingHttpResponse)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], "image/jpeg")
        self.assertIn("inline; filename*=utf-8''thumb_test_image.jpg", response['Content-Disposition'])
        self.assertEqual(response['Content-Length'], "100")
