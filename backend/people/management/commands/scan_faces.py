import logging
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from media.models import Media
from people.tasks import (
    SCAN_CACHE_PREFIX,
    cluster_faces,
    detect_faces,
    reprocess_undetected_faces,
)

User = get_user_model()
logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Scan photos for faces and cluster them into People."

    def add_arguments(self, parser):
        parser.add_argument(
            "-u",
            "--user",
            type=str,
            help="Filter by username or user ID.",
        )
        parser.add_argument(
            "-l",
            "--limit",
            type=int,
            default=200,
            help="Maximum number of photos to scan (default: 200, 0 for all).",
        )
        parser.add_argument(
            "-f",
            "--force",
            action="store_true",
            help="Force rescan of photos previously scanned with 0 faces (bypass Redis cache).",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run face detection synchronously in this process instead of queuing in Celery.",
        )
        parser.add_argument(
            "--cluster-only",
            action="store_true",
            help="Only run face clustering without scanning new photos.",
        )
        parser.add_argument(
            "--reset-legacy",
            action="store_true",
            help="Delete faces from older embedding models (e.g. dlib) so photos are re-scanned "
            "with InsightFace. Unnamed people left empty are removed; named people are kept.",
        )
        parser.add_argument(
            "--hard-reset",
            action="store_true",
            help="Clear ALL faces, people, clear cache, purge celery queues, and start scanning from scratch.",
        )

    def handle(self, *args, **options):
        user_identifier = options.get("user")
        limit = options.get("limit") or 1000000
        force = options.get("force", False)
        sync = options.get("sync", False)
        cluster_only = options.get("cluster_only", False)

        if options.get("hard_reset"):
            from people.models import Face, Person
            import os

            count = Face.objects.all().count()
            Face.objects.all().delete()
            Person.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Deleted ALL {count} face(s) and people."))

            self.stdout.write("Clearing redis cache...")
            cache.clear()

            self.stdout.write("Purging celery queues...")
            os.system("celery -A config purge -f")

            force = True

        elif options.get("reset_legacy"):
            from people.models import Face, Person

            legacy = Face.objects.exclude(embedding_model__startswith="arcface")
            if options.get("user"):
                legacy = legacy.filter(media__user__username=options["user"]) if not str(
                    options["user"]
                ).isdigit() else legacy.filter(media__user_id=int(options["user"]))
            count = legacy.count()
            legacy.delete()
            Person.objects.filter(faces__isnull=True, name="").delete()
            self.stdout.write(self.style.WARNING(f"Deleted {count} legacy face(s)."))
            force = True  # photos were already marked scanned in the cache

        user = None
        if user_identifier:
            try:
                if str(user_identifier).isdigit():
                    user = User.objects.get(pk=int(user_identifier))
                else:
                    user = User.objects.get(username=user_identifier)
            except User.DoesNotExist:
                raise CommandError(f"User '{user_identifier}' not found.")

        if cluster_only:
            user_ids = [user.id] if user else list(User.objects.values_list("id", flat=True))
            for uid in user_ids:
                self.stdout.write(f"Clustering faces for user ID {uid}...")
                if sync:
                    cluster_faces(uid)
                else:
                    cluster_faces.delay(uid)
            self.stdout.write(self.style.SUCCESS("Clustering completed/dispatched."))
            return

        user_id = user.id if user else None

        if sync:
            self.stdout.write(f"Scanning photos synchronously (user={user_id}, limit={limit}, force={force})...")
            qs = Media.objects.filter(
                status="completed",
                media_type="image",
                is_deleted=False,
                faces__isnull=True,
            ).order_by("-id")
            if user_id:
                qs = qs.filter(user_id=user_id)

            candidate_chunk = list(qs.values_list("id", flat=True)[: limit * 5 if limit else 1000])
            if not force and candidate_chunk:
                cache_keys = [f"{SCAN_CACHE_PREFIX}{mid}" for mid in candidate_chunk]
                cached_dict = cache.get_many(cache_keys)
                unscanned_ids = [mid for mid in candidate_chunk if f"{SCAN_CACHE_PREFIX}{mid}" not in cached_dict]
            else:
                unscanned_ids = candidate_chunk

            to_process = unscanned_ids[:limit]
            self.stdout.write(
                f"Found {len(to_process)} photos to scan ({len(candidate_chunk) - len(unscanned_ids)} skipped from cache)."
            )

            processed_count = 0
            for mid in to_process:
                self.stdout.write(f"Detecting faces in media #{mid}...")
                try:
                    detect_faces(mid)
                    processed_count += 1
                except Exception as exc:
                    self.stderr.write(self.style.ERROR(f"Error on media #{mid}: {exc}"))

            self.stdout.write(self.style.SUCCESS(f"Finished scanning {processed_count} photos."))

            # Trigger clustering
            users_to_cluster = [user_id] if user_id else list(User.objects.values_list("id", flat=True))
            for uid in users_to_cluster:
                self.stdout.write(f"Clustering faces for user {uid}...")
                try:
                    cluster_faces(uid)
                except Exception as exc:
                    self.stderr.write(self.style.ERROR(f"Error clustering for user {uid}: {exc}"))
            self.stdout.write(self.style.SUCCESS("Clustering completed."))
        else:
            self.stdout.write(f"Queueing face scan in Celery (user={user_id}, limit={limit}, force={force})...")
            res = reprocess_undetected_faces(user_id=user_id, limit=limit, force=force)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Queued {res.get('queued', 0)} images ({res.get('skipped_cached', 0)} skipped via cache)."
                )
            )
