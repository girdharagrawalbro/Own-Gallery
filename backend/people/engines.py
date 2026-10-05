"""
Face detection + embedding using InsightFace (SCRFD detector + ArcFace recognition).

Each call to `process` returns a list of dicts:
  {top, right, bottom, left (pixels), embedding (list[float]), confidence, quality}
The engine exposes `detection_model` / `embedding_model` identifiers stored on Face rows.

NOTE: InsightFace pretrained model packs are licensed for non-commercial research use.
Review the licence before shipping buffalo_l in a commercial product.
"""

import logging

from django.conf import settings

logger = logging.getLogger(__name__)

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = InsightFaceEngine()
    return _engine


class InsightFaceEngine:
    detection_model = "scrfd_10g"

    def __init__(self):
        from insightface.app import FaceAnalysis

        model_name = getattr(settings, "INSIGHTFACE_MODEL", "buffalo_l")
        self.embedding_model = f"arcface_{model_name}"
        self._app = FaceAnalysis(
            name=model_name,
            root=getattr(settings, "INSIGHTFACE_ROOT", "~/.insightface"),
            providers=["CPUExecutionProvider"],
            allowed_modules=["detection", "recognition"],
        )
        size = getattr(settings, "INSIGHTFACE_DET_SIZE", 640)
        self._app.prepare(ctx_id=-1, det_size=(size, size))

    def process(self, path):
        import numpy as np
        from PIL import Image

        # No EXIF transpose: boxes must match raw pixels (see FaceCropView._crop_face).
        img = Image.open(path).convert("RGB")
        w, h = img.size
        bgr = np.asarray(img)[:, :, ::-1].copy()
        found = self._app.get(bgr)

        faces = []
        for f in found:
            x1, y1, x2, y2 = [float(v) for v in f.bbox]
            x1, y1 = max(x1, 0.0), max(y1, 0.0)
            x2, y2 = min(x2, float(w)), min(y2, float(h))
            side = min(x2 - x1, y2 - y1)
            if side <= 0:
                continue
            det = float(f.det_score)
            # Quality heuristic: detector confidence scaled by face size (full credit >= 80px)
            quality = det * min(1.0, side / 80.0)
            emb = np.asarray(f.normed_embedding, dtype="float32")
            faces.append(
                {
                    "top": y1, "right": x2, "bottom": y2, "left": x1,
                    "embedding": emb.tolist(), "confidence": det, "quality": quality,
                }
            )
        return faces, (w, h)
