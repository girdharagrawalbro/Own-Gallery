import io
import os
import shutil
import subprocess
import tempfile
from unittest import skipUnless

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from PIL import Image

from media import processing

HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def ftyp(major, compatible=()):
    brands = major.encode() + b"\0\0\0\0" + b"".join(b.encode() for b in compatible)
    return (8 + len(brands)).to_bytes(4, "big") + b"ftyp" + brands + b"\0" * 64


def jpeg_bytes(size=(10, 10), exif_tags=None):
    img = Image.new("RGB", size, "red")
    buf = io.BytesIO()
    exif = img.getexif()
    if exif_tags:
        exif_ifd = exif.get_ifd(0x8769)
        exif_ifd.update(exif_tags)
    img.save(buf, "JPEG", exif=exif)
    return buf.getvalue()


class DetectMediaTypeTests(SimpleTestCase):

    def test_mp4_brands_that_filetype_rejects(self):
        for brand in ("iso5", "iso6", "dash", "avc1", "mp42", "isom", "MSNV"):
            with self.subTest(brand=brand):
                self.assertEqual(processing.detect_media_type(ftyp(brand)), ("video/mp4", "video"))

    def test_other_isobmff_types(self):
        self.assertEqual(processing.detect_media_type(ftyp("qt  ")), ("video/quicktime", "video"))
        self.assertEqual(processing.detect_media_type(ftyp("3gp4")), ("video/3gpp", "video"))
        self.assertEqual(processing.detect_media_type(ftyp("M4V ")), ("video/x-m4v", "video"))
        self.assertEqual(processing.detect_media_type(ftyp("heic", ["mif1", "heic"])), ("image/heic", "image"))
        self.assertEqual(processing.detect_media_type(ftyp("mif1", ["heic"])), ("image/heic", "image"))
        self.assertEqual(processing.detect_media_type(ftyp("avif", ["mif1"])), ("image/avif", "image"))
        self.assertEqual(processing.detect_media_type(ftyp("M4A ")), (None, None))

    def test_non_isobmff(self):
        self.assertEqual(processing.detect_media_type(jpeg_bytes()), ("image/jpeg", "image"))
        self.assertEqual(processing.detect_media_type(b"\x1a\x45\xdf\xa3" + b"\x42\x82\x88matroska" + b"\0" * 40),
                         ("video/x-matroska", "video"))
        self.assertEqual(processing.detect_media_type(b"%PDF-1.7 hello"), (None, None))
        self.assertEqual(processing.detect_media_type(b""), (None, None))


class ExifTests(SimpleTestCase):

    def test_no_exif(self):
        upload = SimpleUploadedFile("a.jpg", jpeg_bytes())
        self.assertEqual(processing.quick_exif_taken_at(upload), (None, None))
        self.assertEqual(upload.tell(), 0)

    def test_local_exif_time(self):
        upload = SimpleUploadedFile("a.jpg", jpeg_bytes(exif_tags={36867: "2023:10:04 12:34:56"}))
        taken_at, source = processing.quick_exif_taken_at(upload)
        self.assertEqual(source, "exif_local")
        self.assertEqual((taken_at.year, taken_at.month, taken_at.day, taken_at.hour), (2023, 10, 4, 12))
        self.assertIsNotNone(taken_at.tzinfo)

    def test_exif_time_with_offset_is_absolute(self):
        upload = SimpleUploadedFile(
            "a.jpg", jpeg_bytes(exif_tags={36867: "2023:10:04 12:34:56", 36881: "+05:30"})
        )
        taken_at, source = processing.quick_exif_taken_at(upload)
        self.assertEqual(source, "metadata")
        self.assertEqual(taken_at.utcoffset().total_seconds(), 5.5 * 3600)

    def test_invalid_exif(self):
        upload = SimpleUploadedFile("a.jpg", jpeg_bytes(exif_tags={36867: "not a date"}))
        self.assertEqual(processing.quick_exif_taken_at(upload), (None, None))


@override_settings(PREVIEW_MAX_SIDE=1600)
class ProcessImageTests(SimpleTestCase):

    def _write(self, data, suffix=".jpg"):
        fd, path = tempfile.mkstemp(suffix=suffix)
        os.write(fd, data)
        os.close(fd)
        self.addCleanup(os.remove, path)
        return path

    def test_small_jpeg_has_no_preview(self):
        info = processing.process_image(self._write(jpeg_bytes((800, 600))), "image/jpeg")
        self.addCleanup(processing.remove_quietly, info["thumbnail_path"])
        self.assertEqual((info["width"], info["height"]), (800, 600))
        self.assertIsNone(info["preview_path"])
        with Image.open(info["thumbnail_path"]) as thumb:
            self.assertEqual(thumb.size, (320, 240))

    def test_large_image_gets_preview(self):
        info = processing.process_image(self._write(jpeg_bytes((4000, 3000))), "image/jpeg")
        self.addCleanup(processing.remove_quietly, info["thumbnail_path"], info["preview_path"])
        self.assertEqual((info["preview_width"], info["preview_height"]), (1600, 1200))

    def test_transparent_png_converted(self):
        img = Image.new("RGBA", (50, 40), (0, 0, 0, 0))
        buf = io.BytesIO()
        img.save(buf, "PNG")
        info = processing.process_image(self._write(buf.getvalue(), ".png"), "image/png")
        self.addCleanup(processing.remove_quietly, info["thumbnail_path"])
        self.assertTrue(os.path.getsize(info["thumbnail_path"]) > 0)


@skipUnless(HAS_FFMPEG, "ffmpeg not installed")
class VideoProcessingTests(SimpleTestCase):

    def _make_video(self, *args, suffix=".mp4"):
        fd, path = tempfile.mkstemp(suffix=suffix)
        os.close(fd)
        self.addCleanup(processing.remove_quietly, path)
        cmd = ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=2",
               "-f", "lavfi", "-i", "sine=duration=2", "-shortest", *args, path]
        subprocess.run(cmd, check=True, capture_output=True)
        return path

    def test_faststart_h264_needs_nothing(self):
        path = self._make_video("-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart")
        info = processing.probe_video(path)
        self.assertEqual((info["width"], info["height"], info["video_codec"]), (320, 240, "h264"))
        self.assertAlmostEqual(info["duration"], 2, delta=0.3)
        self.assertTrue(processing.moov_before_mdat(path))
        self.assertIsNone(processing.plan_stream_variant("video/mp4", info, path))

    def test_moov_at_end_is_remuxed(self):
        path = self._make_video("-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac")
        info = processing.probe_video(path)
        self.assertFalse(processing.moov_before_mdat(path))
        self.assertEqual(processing.plan_stream_variant("video/mp4", info, path), "remux")
        out = processing.build_stream_variant(path, "remux", info)
        self.addCleanup(processing.remove_quietly, out)
        self.assertTrue(processing.moov_before_mdat(out))

    def test_incompatible_codec_is_transcoded(self):
        path = self._make_video("-c:v", "mpeg4", "-c:a", "mp2", suffix=".avi")
        info = processing.probe_video(path)
        self.assertEqual(processing.plan_stream_variant("video/x-msvideo", info, path), "transcode")
        out = processing.build_stream_variant(path, "transcode", info)
        self.addCleanup(processing.remove_quietly, out)
        out_info = processing.probe_video(out)
        self.assertEqual((out_info["video_codec"], out_info["audio_codec"]), ("h264", "aac"))

    def test_thumbnail(self):
        path = self._make_video("-c:v", "libx264", "-pix_fmt", "yuv420p")
        thumb, poster = processing.video_thumbnail(path, 2)
        self.addCleanup(processing.remove_quietly, thumb, poster)
        with Image.open(thumb) as img:
            self.assertEqual(img.size, (320, 240))

    @override_settings(VIDEO_STREAM_VARIANTS="off")
    def test_variants_disabled(self):
        info = {"video_codec": "mpeg4", "audio_codec": "mp2"}
        self.assertIsNone(processing.plan_stream_variant("video/x-msvideo", info, "/nonexistent"))
