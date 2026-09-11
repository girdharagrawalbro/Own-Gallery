import tempfile
import io
from datetime import datetime
from PIL import Image
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from media.metadata import extract_image_taken_at, extract_video_taken_at
from django.utils.timezone import is_aware

class MetadataExtractorTests(TestCase):

    def setUp(self):
        # Create a dummy image with no EXIF
        img = Image.new('RGB', (10, 10), color='red')
        self.no_exif_io = io.BytesIO()
        img.save(self.no_exif_io, format='JPEG')
        self.no_exif_io.seek(0)
        self.no_exif_file = SimpleUploadedFile("no_exif.jpg", self.no_exif_io.read(), content_type="image/jpeg")

        # Create dummy image with EXIF (DateTimeOriginal: 36867)
        img_exif = Image.new('RGB', (10, 10), color='blue')
        exif = img_exif.getexif()
        exif[36867] = "2023:10:04 12:34:56"
        self.exif_io = io.BytesIO()
        img_exif.save(self.exif_io, format='JPEG', exif=exif)
        self.exif_io.seek(0)
        self.exif_file = SimpleUploadedFile("exif.jpg", self.exif_io.read(), content_type="image/jpeg")
        
        # Create dummy image with invalid EXIF date
        img_invalid = Image.new('RGB', (10, 10), color='green')
        exif_inv = img_invalid.getexif()
        exif_inv[36867] = "invalid_date_format"
        self.invalid_exif_io = io.BytesIO()
        img_invalid.save(self.invalid_exif_io, format='JPEG', exif=exif_inv)
        self.invalid_exif_io.seek(0)
        self.invalid_exif_file = SimpleUploadedFile("invalid.jpg", self.invalid_exif_io.read(), content_type="image/jpeg")

    def test_image_no_exif(self):
        dt = extract_image_taken_at(self.no_exif_file)
        self.assertIsNone(dt)
        self.assertEqual(self.no_exif_file.tell(), 0) # cursor reset

    def test_image_with_exif(self):
        dt = extract_image_taken_at(self.exif_file)
        self.assertIsNotNone(dt)
        self.assertEqual(dt.year, 2023)
        self.assertEqual(dt.month, 10)
        self.assertEqual(dt.day, 4)
        self.assertEqual(dt.hour, 12)
        self.assertEqual(dt.minute, 34)
        self.assertEqual(dt.second, 56)
        self.assertTrue(is_aware(dt))
        self.assertEqual(self.exif_file.tell(), 0)

    def test_image_invalid_exif(self):
        dt = extract_image_taken_at(self.invalid_exif_file)
        self.assertIsNone(dt)
        self.assertEqual(self.invalid_exif_file.tell(), 0)

    def test_video_no_metadata(self):
        # A dummy file that ffprobe will fail to parse
        dummy_video = SimpleUploadedFile("dummy.mp4", b"not a real video", content_type="video/mp4")
        dt = extract_video_taken_at(dummy_video)
        self.assertIsNone(dt)
        self.assertEqual(dummy_video.tell(), 0)
