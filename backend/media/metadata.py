import tempfile
import subprocess
import json
from datetime import datetime
from PIL import Image
from django.utils.timezone import make_aware, is_aware

def extract_image_taken_at(uploaded_file):
    try:
        img = Image.open(uploaded_file)
        exif = img.getexif()
        if exif:
            # 36867 is DateTimeOriginal
            dt_str = exif.get(36867) 
            if dt_str:
                # Format is typically "2023:10:04 12:34:56"
                dt = datetime.strptime(dt_str, "%Y:%m:%d %H:%M:%S")
                # Handle offset if present 36881 (OffsetTimeOriginal) e.g., "+05:30"
                offset = exif.get(36881)
                # For simplicity, we just make it aware in current timezone
                return make_aware(dt) if not is_aware(dt) else dt
    except Exception as e:
        print("Pillow error parsing EXIF:", e)
    finally:
        uploaded_file.seek(0)
    return None

def extract_video_taken_at(uploaded_file):
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4") as tmp:
            # Write chunks to temp file
            for chunk in uploaded_file.chunks():
                tmp.write(chunk)
            tmp.flush()
            
            # Run ffprobe
            cmd = [
                "ffprobe", 
                "-v", "quiet", 
                "-print_format", "json", 
                "-show_format", 
                tmp.name
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                data = json.loads(result.stdout)
                tags = data.get("format", {}).get("tags", {})
                creation_time = tags.get("creation_time")
                if creation_time:
                    # e.g., "2024-09-08T10:15:30.000000Z"
                    try:
                        # Depending on Python version, fromisoformat handles Z in 3.11+
                        creation_time = creation_time.replace("Z", "+00:00")
                        dt = datetime.fromisoformat(creation_time)
                        return make_aware(dt) if not is_aware(dt) else dt
                    except ValueError:
                        pass
    except Exception as e:
        print("ffprobe error:", e)
    finally:
        uploaded_file.seek(0)
    return None
