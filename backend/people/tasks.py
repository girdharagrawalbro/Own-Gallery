import logging
import os
import tempfile

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from utils.api_cache import increment_user_cache_version

logger = logging.getLogger(__name__)

SCAN_CACHE_PREFIX = "people:scanned:"
SCAN_CACHE_TTL = 86400 * 30  # 30 days

# Redis debounce key: run at most one cluster job per user per window
CLUSTER_LOCK_TTL = 90  # seconds
CLUSTER_COOLDOWN = 60  # delay before cluster fires after last detect


def _cluster_lock_key(user_id):
    return f"people:cluster_lock:{user_id}"


@shared_task(bind=True, max_retries=2, default_retry_delay=120, acks_late=True)
def detect_faces(self, media_id: int):
    """
    Detect faces in one photo and save Face rows.
    Runs on the same worker queue as uploads with a countdown delay so it
    naturally fills idle time between upload jobs.
    After detection, triggers cluster_faces for the user (debounced).
    """
    try:
        from .engines import get_engine  # optional heavy dependency (dlib / insightface)

        get_engine()
    except (ImportError, Exception, SystemExit, BaseException) as exc:
        logger.warning("Face engine could not be loaded – skipping face detection for media %s: %s", media_id, exc)
        return

    from media.models import Media
    from .models import Face

    try:
        media = Media.objects.select_related("user").get(pk=media_id, status="completed", media_type="image")
    except Media.DoesNotExist:
        return  # video or not yet processed

    # Skip if we already detected faces for this image
    if Face.objects.filter(media=media).exists():
        cache.set(f"{SCAN_CACHE_PREFIX}{media_id}", 1, timeout=SCAN_CACHE_TTL)
        return

    # Download the preview/thumbnail to a temp file
    try:
        from telegram_storage.storage import TelegramStorage

        storage = TelegramStorage()
        # Prefer the preview variant (higher resolution), fall back to thumbnail
        from media.models import MediaVariant

        variant = media.variants.filter(kind=MediaVariant.PREVIEW).first()

        message_id = variant.telegram_message_id if variant else None
        file_id = variant.telegram_file_id if variant else None

        if not message_id and not file_id:
            message_id = media.telegram_message_id
            file_id = media.telegram_file_id

        if not message_id and not file_id:
            logger.warning(
                "No Telegram reference for media %s, skipping face detection",
                media_id,
            )
            cache.set(f"{SCAN_CACHE_PREFIX}{media_id}", 1, timeout=SCAN_CACHE_TTL)
            return

        suffix = ".jpg"
        fd, local_path = tempfile.mkstemp(suffix=suffix, prefix=f"face_{media_id}_")
        os.close(fd)

        try:
            storage.download(
                message_id=message_id,
                file_id=file_id,
                destination=local_path,
            )
        except Exception as exc:
            logger.warning("Could not download media %s for face detection: %s", media_id, exc)
            os.unlink(local_path)
            return

        try:
            engine = get_engine()
            detected, (img_w, img_h) = engine.process(local_path)
            # Mark this media as scanned so future periodic passes skip it even if 0 faces found
            cache.set(f"{SCAN_CACHE_PREFIX}{media_id}", 1, timeout=SCAN_CACHE_TTL)
            if not detected:
                return

            faces_to_create = [
                Face(
                    media=media,
                    box_top=d["top"] / img_h,
                    box_right=d["right"] / img_w,
                    box_bottom=d["bottom"] / img_h,
                    box_left=d["left"] / img_w,
                    embedding=d["embedding"],
                    confidence=d["confidence"],
                    quality_score=d["quality"],
                    detection_model=engine.detection_model,
                    embedding_model=engine.embedding_model,
                )
                for d in detected
            ]

            if faces_to_create:
                Face.objects.bulk_create(faces_to_create)
                increment_user_cache_version(media.user_id, "people")
                logger.info("Detected %d face(s) in media %s", len(faces_to_create), media_id)

                # Debounced cluster: fire once per user after all detections settle
                lock_key = _cluster_lock_key(media.user_id)
                if cache.add(lock_key, 1, timeout=CLUSTER_LOCK_TTL):
                    cluster_faces.apply_async(
                        args=[media.user_id],
                        countdown=CLUSTER_COOLDOWN,
                    )

        finally:
            try:
                os.unlink(local_path)
            except OSError:
                pass

    except Exception as exc:
        logger.exception("detect_faces failed for media %s: %s", media_id, exc)
        raise self.retry(exc=exc)


def _face_pixel_area(face):
    """Approximate face size in source pixels (boxes are stored as fractions)."""
    width = face.media.width or 1
    height = face.media.height or 1
    return (face.box_right - face.box_left) * width * (face.box_bottom - face.box_top) * height


def _assign_single_face(face, user_id):
    """DBSCAN needs 2+ samples, so a lone face gets its own Person directly."""
    from .models import Person

    if face.person_id is not None:
        return

    person = Person.objects.create(user_id=user_id)
    face.person = person
    face.save(update_fields=["person"])

    person.cover_face = face
    person.save(update_fields=["cover_face"])

    logger.info(
        "Created Person %s for single face %s for user %s",
        person.id,
        face.id,
        user_id,
    )


def _cluster_group(faces, user, metric="cosine"):
    """
    Cluster ArcFace faces using cosine distance. Returns number of groups.
    Only high-quality faces seed clusters; low-quality faces are attached to the
    nearest person centroid when similar enough, else left ungrouped (a wrong
    merge is worse than an ungrouped face).
    """
    import numpy as np
    from collections import Counter, defaultdict
    from sklearn.cluster import AgglomerativeClustering

    from .models import Face, Person

    min_q = getattr(settings, "FACE_MIN_QUALITY", 0.5)
    seeds = [f for f in faces if f.quality_score >= min_q]
    weak = [f for f in faces if f.quality_score < min_q]
    eps = getattr(settings, "FACE_CLUSTER_COSINE_EPS", 0.55)

    if not seeds:
        return 0

    if len(seeds) == 1:
        labels = np.array([0])
    else:
        embeddings = np.array([f.embedding for f in seeds], dtype="float64")
        # Average linkage prevents chaining (different people merging)
        labels = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=eps,
            metric=metric,
            linkage="average",
        ).fit(embeddings).labels_

    clusters: dict[int, list] = defaultdict(list)
    for face, label in zip(seeds, labels):
        clusters[label].append(face)

    person_centroids = {}  # person_id -> unit-normalised centroid (cosine mode)
    for cluster_list in clusters.values():
        # Majority vote keeps existing Person ids stable across re-runs
        existing = [f.person_id for f in cluster_list if f.person_id is not None]
        if existing:
            person = Person.objects.get(pk=Counter(existing).most_common(1)[0][0])
        else:
            person = Person.objects.create(user=user)

        Face.objects.filter(pk__in=[f.pk for f in cluster_list]).update(person=person)

        emb = np.array([f.embedding for f in cluster_list], dtype="float64")
        centroid = emb.mean(axis=0)
        if metric == "cosine":
            # Quality-weighted centroid
            weights = np.array([max(f.quality_score, 1e-3) for f in cluster_list])
            centroid = (emb * weights[:, None]).sum(axis=0) / weights.sum()
            person_centroids[person.pk] = centroid / (np.linalg.norm(centroid) or 1.0)

        # Cover face: among the more typical half (closest to centroid), take the
        # largest in pixels — big faces give sharp avatars.
        distances = np.linalg.norm(emb - centroid, axis=1)
        cutoff = float(np.median(distances))
        candidates = [f for f, d in zip(cluster_list, distances) if d <= cutoff]
        best_face = max(candidates, key=_face_pixel_area)
        if person.cover_face_id != best_face.pk:
            person.cover_face = best_face
            person.save(update_fields=["cover_face"])

    # Attach low-quality faces to the closest centroid if clearly similar
    if weak and person_centroids:
        attach_sim = getattr(settings, "FACE_ATTACH_MIN_SIM", 0.5)
        ids = list(person_centroids)
        matrix = np.array([person_centroids[i] for i in ids])
        for face in weak:
            vec = np.array(face.embedding, dtype="float64")
            vec = vec / (np.linalg.norm(vec) or 1.0)
            sims = matrix @ vec
            best = int(np.argmax(sims))
            if sims[best] >= attach_sim and face.person_id != ids[best]:
                Face.objects.filter(pk=face.pk).update(person_id=ids[best])

    increment_user_cache_version(user.id, "people")
    return len(clusters)


@shared_task(bind=True, max_retries=2, default_retry_delay=300, acks_late=True)
def cluster_faces(self, user_id: int):
    """
    Group all faces for a user into Person clusters.
    Only ArcFace faces are clustered; legacy rows from other embedding models
    are ignored since their embeddings are not comparable.
    Safe to re-run: existing Person assignments are updated, not duplicated.
    """
    from .models import Face

    faces = list(
        Face.objects.filter(
            media__user_id=user_id,
            media__is_deleted=False,
            embedding_model__startswith="arcface",
        )
        .select_related("media__user")
        .order_by("id")
    )

    if not faces:
        return

    if len(faces) == 1:
        _assign_single_face(faces[0], user_id)
        return

    try:
        import numpy  # noqa: F401
        import sklearn  # noqa: F401
    except ImportError:
        logger.warning("scikit-learn not installed – skipping clustering for user %s", user_id)
        return

    try:
        from django.contrib.auth import get_user_model

        user = get_user_model().objects.get(pk=user_id)
        total_groups = _cluster_group(faces, user)

        logger.info(
            "Clustered %d faces into %d groups for user %s", len(faces), total_groups, user_id
        )

    except Exception as exc:
        logger.exception("cluster_faces failed for user %s: %s", user_id, exc)
        raise self.retry(exc=exc)


@shared_task
def reprocess_undetected_faces(user_id=None, limit=100, force=False):
    """
    Periodic beat task or on-demand trigger: find completed images without face detection and queue them.
    Skips images that were already scanned and had 0 faces via Redis cache lookup.
    """
    from media.models import Media

    qs = Media.objects.filter(
        status="completed",
        media_type="image",
        is_deleted=False,
        faces__isnull=True,
    ).order_by("-id")

    if user_id is not None:
        qs = qs.filter(user_id=user_id)

    # Fetch candidate media IDs in a larger batch so we can filter out cached 0-face images
    candidate_chunk_size = min(limit * 5, 1000)
    candidate_ids = list(qs.values_list("id", flat=True)[:candidate_chunk_size])

    if not candidate_ids:
        logger.info("No unscanned images found (user=%s)", user_id)
        return {"queued": 0, "skipped_cached": 0}

    if not force:
        cache_keys = [f"{SCAN_CACHE_PREFIX}{mid}" for mid in candidate_ids]
        cached_dict = cache.get_many(cache_keys)
        unscanned_ids = [mid for mid in candidate_ids if f"{SCAN_CACHE_PREFIX}{mid}" not in cached_dict]
    else:
        unscanned_ids = candidate_ids

    to_queue = unscanned_ids[:limit]
    for idx, mid in enumerate(to_queue):
        # Stagger countdown slightly (2s per image) so downloads & HOG detection don't burst CPU
        detect_faces.apply_async(args=[mid], countdown=idx * 2)

    skipped = len(candidate_ids) - len(unscanned_ids)
    logger.info(
        "Queued %d images for face detection (user=%s, scanned_cached_skipped=%d)",
        len(to_queue),
        user_id,
        skipped,
    )

    # If triggered for a user, schedule cluster_faces to run once the queued images settle
    if user_id and to_queue:
        cluster_delay = max(len(to_queue) * 2 + 10, CLUSTER_COOLDOWN)
        cluster_faces.apply_async(args=[user_id], countdown=cluster_delay)

    return {"queued": len(to_queue), "skipped_cached": skipped}
