import logging
import os
import tempfile

from celery import shared_task
from django.conf import settings
from django.core.cache import cache

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
        import face_recognition  # optional heavy dependency
    except ImportError:
        logger.warning("face_recognition not installed – skipping face detection for media %s", media_id)
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
        file_id = (variant.telegram_file_id if variant else None) or media.telegram_thumbnail_file_id
        if not file_id:
            logger.debug("No file_id for media %s, skipping face detection", media_id)
            cache.set(f"{SCAN_CACHE_PREFIX}{media_id}", 1, timeout=SCAN_CACHE_TTL)
            return

        suffix = ".jpg"
        fd, local_path = tempfile.mkstemp(suffix=suffix, prefix=f"face_{media_id}_")
        os.close(fd)

        try:
            storage.download(file_id, local_path)
        except Exception as exc:
            logger.warning("Could not download media %s for face detection: %s", media_id, exc)
            os.unlink(local_path)
            return

        try:
            image = face_recognition.load_image_file(local_path)
            img_h, img_w = image.shape[:2]

            locations = face_recognition.face_locations(image, model="hog")
            # Mark this media as scanned so future periodic passes skip it even if 0 faces found
            cache.set(f"{SCAN_CACHE_PREFIX}{media_id}", 1, timeout=SCAN_CACHE_TTL)
            if not locations:
                return

            encodings = face_recognition.face_encodings(image, locations)

            faces_to_create = []
            for (top, right, bottom, left), encoding in zip(locations, encodings):
                faces_to_create.append(
                    Face(
                        media=media,
                        box_top=top / img_h,
                        box_right=right / img_w,
                        box_bottom=bottom / img_h,
                        box_left=left / img_w,
                        embedding=encoding.tolist(),
                        confidence=1.0,
                    )
                )

            if faces_to_create:
                Face.objects.bulk_create(faces_to_create)
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


@shared_task(bind=True, max_retries=2, default_retry_delay=300, acks_late=True)
def cluster_faces(self, user_id: int):
    """
    Group all faces for a user into Person clusters using DBSCAN.
    Safe to re-run: existing Person assignments are updated, not duplicated.
    """
    try:
        import numpy as np
        from sklearn.cluster import DBSCAN
    except ImportError:
        logger.warning("scikit-learn not installed – skipping clustering for user %s", user_id)
        return

    from .models import Face, Person

    faces = list(
        Face.objects.filter(media__user_id=user_id, media__is_deleted=False)
        .select_related("media__user")
        .order_by("id")
    )

    if len(faces) < 2:
        return

    try:
        embeddings = np.array([f.embedding for f in faces])

        eps = getattr(settings, "FACE_CLUSTER_EPS", 0.5)
        db = DBSCAN(eps=eps, min_samples=2, metric="euclidean", n_jobs=-1).fit(embeddings)
        labels = db.labels_

        # Build label → list of faces mapping
        from collections import defaultdict

        clusters: dict[int, list[Face]] = defaultdict(list)
        for face, label in zip(faces, labels):
            clusters[label].append(face)

        from django.contrib.auth import get_user_model

        User = get_user_model()
        user = User.objects.get(pk=user_id)

        for label, cluster_faces_list in clusters.items():
            if label == -1:
                # Noise faces: assign each to its own Person (or keep existing)
                for face in cluster_faces_list:
                    if face.person_id is None:
                        person = Person.objects.create(user=user)
                        face.person = person
                        face.save(update_fields=["person"])
                        person.cover_face = face
                        person.save(update_fields=["cover_face"])
                continue

            # Find the best existing Person for this cluster (majority vote)
            existing_persons = [f.person for f in cluster_faces_list if f.person_id is not None]
            if existing_persons:
                from collections import Counter

                best_person_id = Counter(p.pk for p in existing_persons).most_common(1)[0][0]
                person = Person.objects.get(pk=best_person_id)
            else:
                person = Person.objects.create(user=user)

            # Reassign all faces in this cluster
            face_ids = [f.pk for f in cluster_faces_list]
            Face.objects.filter(pk__in=face_ids).update(person=person)

            # Set cover face to the most central face (smallest average distance)
            embeddings_cluster = np.array([f.embedding for f in cluster_faces_list])
            centroid = embeddings_cluster.mean(axis=0)
            distances = np.linalg.norm(embeddings_cluster - centroid, axis=1)
            best_idx = int(np.argmin(distances))
            best_face = cluster_faces_list[best_idx]

            if person.cover_face_id != best_face.pk:
                person.cover_face = best_face
                person.save(update_fields=["cover_face"])

        logger.info(
            "Clustered %d faces into %d groups for user %s",
            len(faces),
            len([l for l in set(labels) if l != -1]),
            user_id,
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
