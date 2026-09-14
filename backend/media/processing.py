"""Metadata extraction and derived files (thumbnail, preview, playback stream)."""

import hashlib
import json
import os
import re
import struct
import subprocess
import tempfile
from datetime import datetime

from django.conf import settings
from django.utils.timezone import is_aware, make_aware
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # HEIC stays unreadable without pillow-heif
    pass

THUMBNAIL_SIDE = 320  # Telegram's maximum document thumbnail size
BROWSER_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
BROWSER_VIDEO_CODECS = {"h264", "vp8", "vp9", "av1"}
BROWSER_AUDIO_CODECS = {"aac", "mp3", "opus", "vorbis"}
BROWSER_VIDEO_CONTAINERS = {"video/mp4", "video/quicktime", "video/webm", "video/x-m4v"}


ALLOWED_IMAGE_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
    "image/avif", "image/bmp", "image/tiff",
}
ALLOWED_VIDEO_TYPES = {
    "video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "video/x-matroska",
    "video/3gpp", "video/x-msvideo", "video/mpeg", "video/x-ms-wmv",
}
_HEIF_BRANDS = {"heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs"}


def _isobmff_mime(header):
    """Classify ISO-BMFF files (MP4/MOV/HEIC/AVIF...) from their ftyp box."""
    if len(header) < 12 or header[4:8] != b"ftyp":
        return None
    box_size = int.from_bytes(header[0:4], "big")
    major = header[8:12].decode("latin-1")
    compatible = {
        header[i:i + 4].decode("latin-1")
        for i in range(16, min(box_size, len(header)) - 3, 4)
    }
    brands = {major} | compatible
    if major in ("avif", "avis"):
        return "image/avif"
    if major in _HEIF_BRANDS or (major in ("mif1", "msf1") and brands & _HEIF_BRANDS):
        return "image/heic"
    if major in ("mif1", "msf1"):
        return "image/avif" if "avif" in brands else "image/heif"
    if major == "qt  ":
        return "video/quicktime"
    if major.startswith(("M4V", "M4VH", "M4VP")):
        return "video/x-m4v"
    if major.startswith(("3gp", "3g2")):
        return "video/3gpp"
    if major.startswith(("M4A", "M4B", "M4P", "F4A")):
        return None  # audio only
    # mp41/mp42/isom/iso2-9/avc1/dash/MSNV/... are all MP4 video.
    return "video/mp4"


def detect_media_type(header):
    """Return (mime_type, media_type) from the first bytes of a file, or (None, None)."""
    import filetype

    mime = _isobmff_mime(header)
    if mime is None:
        kind = filetype.guess(header)
        mime = kind.mime if kind else None
        if mime == "image/apng":
            mime = "image/png"
    if mime in ALLOWED_IMAGE_TYPES:
        return mime, "image"
    if mime in ALLOWED_VIDEO_TYPES:
        return mime, "video"
    return None, None


def safe_filename(name):
    name = re.sub(r"[^\w\-. ]", "_", os.path.basename(name or "")).strip(" .")
    return name[:200] or "unnamed_file"


def hash_stream(chunks):
    digest = hashlib.sha256()
    for chunk in chunks:
        digest.update(chunk)
    return digest.hexdigest()


def quick_exif_taken_at(file_obj):
    """EXIF capture time without decoding pixels. Returns (datetime, source)."""
    try:
        with Image.open(file_obj) as img:
            return exif_taken_at(img)
    except Exception:
        return None, None
    finally:
        file_obj.seek(0)


def temp_path(suffix, prefix="media_"):
    fd, path = tempfile.mkstemp(suffix=suffix, prefix=prefix)
    os.close(fd)
    return path


def remove_quietly(*paths):
    for path in paths:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass


def _aware(dt):
    return dt if is_aware(dt) else make_aware(dt)


# -- images -----------------------------------------------------------------

TAKEN_AT_PRIORITY = {"metadata": 3, "client": 2, "exif_local": 1, "upload": 0, "": 0}


def exif_taken_at(img):
    """Return (datetime, source) from EXIF, or (None, None)."""
    exif = img.getexif()
    if not exif:
        return None, None
    # DateTimeOriginal/DateTimeDigitized live in the Exif IFD; DateTime in IFD0.
    exif_ifd = exif.get_ifd(0x8769)
    value = exif_ifd.get(36867) or exif_ifd.get(36868) or exif.get(306)
    if not value:
        return None, None
    text = str(value).strip("\x00 ")
    offset = str(exif_ifd.get(36881) or exif_ifd.get(36880) or "").strip("\x00 ")
    if offset:
        try:
            return datetime.strptime(f"{text} {offset}", "%Y:%m:%d %H:%M:%S %z"), "metadata"
        except ValueError:
            pass
    try:
        return _aware(datetime.strptime(text, "%Y:%m:%d %H:%M:%S")), "exif_local"
    except ValueError:
        return None, None


def process_image(path, mime_type):
    """Return metadata and generated file paths for an image.

    Keys: width, height, taken_at, thumbnail_path, preview_path (None when the
    original is already small and browser-friendly).
    """
    result = {
        "width": None, "height": None, "taken_at": None, "taken_at_source": None,
        "thumbnail_path": None, "preview_path": None, "preview_width": None, "preview_height": None,
    }
    with Image.open(path) as original:
        result["taken_at"], result["taken_at_source"] = exif_taken_at(original)
        is_animated = getattr(original, "is_animated", False)
        img = ImageOps.exif_transpose(original)
        img.load()
    result["width"], result["height"] = img.size

    if img.mode in ("RGBA", "LA", "P", "PA"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        background.paste(rgba, mask=rgba.getchannel("A"))
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    long_side = max(img.size)
    needs_preview = (
        not is_animated
        and (
            mime_type not in BROWSER_IMAGE_TYPES
            or long_side > settings.PREVIEW_MAX_SIDE
            or os.path.getsize(path) > 1024 * 1024
        )
    )
    if needs_preview:
        preview = img.copy()
        preview.thumbnail((settings.PREVIEW_MAX_SIDE, settings.PREVIEW_MAX_SIDE), Image.Resampling.LANCZOS)
        result["preview_path"] = temp_path(".jpg", "preview_")
        preview.save(result["preview_path"], "JPEG", quality=85, optimize=True, progressive=True)
        result["preview_width"], result["preview_height"] = preview.size

    thumb = img.copy()
    thumb.thumbnail((THUMBNAIL_SIDE, THUMBNAIL_SIDE), Image.Resampling.LANCZOS)
    result["thumbnail_path"] = save_thumbnail(thumb)
    return result


def save_thumbnail(img):
    """Save as JPEG under Telegram's 200 KB thumbnail limit."""
    path = temp_path(".jpg", "thumb_")
    for quality in (85, 75, 60):
        img.save(path, "JPEG", quality=quality, optimize=True)
        if os.path.getsize(path) <= 190 * 1024:
            break
    return path


# -- videos -----------------------------------------------------------------

def probe_video(path):
    cmd = [
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise ValueError(f"ffprobe failed: {result.stderr.strip()[:300]}")
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    fmt = data.get("format", {})
    video = next((s for s in streams if s.get("codec_type") == "video"
                  and not s.get("disposition", {}).get("attached_pic")), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)

    info = {
        "width": None, "height": None, "duration": None, "taken_at": None,
        "video_codec": video.get("codec_name") if video else None,
        "audio_codec": audio.get("codec_name") if audio else None,
        "pix_fmt": video.get("pix_fmt") if video else None,
    }
    if video:
        width, height = video.get("width"), video.get("height")
        if _rotation(video) in (90, 270):
            width, height = height, width
        info["width"], info["height"] = width, height

    duration = fmt.get("duration") or (video or {}).get("duration")
    if duration:
        try:
            info["duration"] = float(duration)
        except ValueError:
            pass

    creation_time = (fmt.get("tags") or {}).get("creation_time")
    if creation_time:
        try:
            parsed = _aware(datetime.fromisoformat(creation_time.replace("Z", "+00:00")))
            # Cameras without a clock write 1970/1904 epochs.
            if parsed.year > 1990:
                info["taken_at"] = parsed
        except ValueError:
            pass
    return info


def _rotation(stream):
    rotate = (stream.get("tags") or {}).get("rotate")
    if rotate is None:
        for side_data in stream.get("side_data_list", []):
            if "rotation" in side_data:
                rotate = side_data["rotation"]
                break
    try:
        return abs(int(float(rotate))) % 360
    except (TypeError, ValueError):
        return 0


def video_thumbnail(path, duration):
    """Grab a representative frame; returns (thumbnail_path, poster_path)."""
    frame_path = temp_path(".jpg", "frame_")
    offsets = [min(1.0, (duration or 0) / 3), 0]
    for offset in offsets:
        cmd = [
            "ffmpeg", "-y", "-v", "error", "-ss", f"{offset:.2f}", "-i", path,
            "-frames:v", "1", "-vf", f"scale='min({settings.PREVIEW_MAX_SIDE},iw)':-2", "-q:v", "3", frame_path,
        ]
        subprocess.run(cmd, capture_output=True, timeout=120)
        if os.path.exists(frame_path) and os.path.getsize(frame_path) > 0:
            break
    else:
        remove_quietly(frame_path)
        return None, None

    with Image.open(frame_path) as frame:
        thumb = frame.convert("RGB")
        thumb.thumbnail((THUMBNAIL_SIDE, THUMBNAIL_SIDE), Image.Resampling.LANCZOS)
        return save_thumbnail(thumb), frame_path


def moov_before_mdat(path):
    """True when an MP4/MOV has its index at the front (plays without seeking to the end)."""
    try:
        with open(path, "rb") as f:
            file_size = os.path.getsize(path)
            offset = 0
            while offset < file_size:
                f.seek(offset)
                header = f.read(16)
                if len(header) < 8:
                    return False
                box_size, box_type = struct.unpack(">I4s", header[:8])
                if box_size == 1:
                    box_size = struct.unpack(">Q", header[8:16])[0]
                elif box_size == 0:
                    box_size = file_size - offset
                if box_type == b"moov":
                    return True
                if box_type == b"mdat":
                    return False
                if box_size < 8:
                    return False
                offset += box_size
    except OSError:
        pass
    return False


def plan_stream_variant(mime_type, info, path):
    """Decide how to make a smoothly streamable copy: None, "remux" or "transcode"."""
    if settings.VIDEO_STREAM_VARIANTS == "off" or not info.get("video_codec"):
        return None
    video_codec = info["video_codec"]
    audio_codec = info.get("audio_codec")

    codec_ok = video_codec in BROWSER_VIDEO_CODECS or (
        video_codec == "hevc" and not settings.VIDEO_TRANSCODE_HEVC
    )
    audio_ok = audio_codec is None or audio_codec in BROWSER_AUDIO_CODECS
    pix_fmt = info.get("pix_fmt")
    # 10-bit is fine for HEVC/VP9/AV1 (phone HDR video) but not for H.264.
    pix_ok = pix_fmt in (None, "yuv420p", "yuvj420p") or (
        video_codec != "h264" and pix_fmt == "yuv420p10le"
    )

    if not codec_ok or not audio_ok or not pix_ok:
        return "transcode"
    if mime_type not in BROWSER_VIDEO_CONTAINERS:
        return "remux" if video_codec in ("h264", "hevc") else "transcode"
    if mime_type != "video/webm" and not moov_before_mdat(path):
        return "remux"
    return None


def build_stream_variant(path, plan, info):
    """Create an MP4 with the index up front. Returns the output path."""
    out = temp_path(".mp4", "stream_")
    if plan == "remux":
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", path, "-map", "0:v:0", "-map", "0:a:0?",
               "-c", "copy", "-movflags", "+faststart"]
        if info.get("video_codec") == "hevc":
            cmd += ["-tag:v", "hvc1"]  # required for Safari/iOS playback
        cmd.append(out)
    else:
        max_h = settings.VIDEO_STREAM_MAX_HEIGHT
        cmd = [
            "ffmpeg", "-y", "-v", "error", "-i", path, "-map", "0:v:0", "-map", "0:a:0?",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
            # Cap the short side (works for portrait and landscape).
            "-vf", f"scale='if(gt(iw,ih),-2,min({max_h},iw))':'if(gt(iw,ih),min({max_h},ih),-2)'",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2",
            "-movflags", "+faststart", out,
        ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=4 * 3600)
    if result.returncode != 0 or not os.path.exists(out) or os.path.getsize(out) == 0:
        remove_quietly(out)
        raise ValueError(f"ffmpeg {plan} failed: {result.stderr.strip()[-300:]}")
    return out
