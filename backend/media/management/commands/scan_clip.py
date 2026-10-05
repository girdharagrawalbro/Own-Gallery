from django.core.management.base import BaseCommand
from media.models import Media
from media.search import embed_image
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Generates CLIP embeddings for all media items that do not have one.'

    def handle(self, *args, **options):
        # We process in batches to keep memory bounded.
        qs = Media.objects.filter(clip_embedding__isnull=True, status='completed').exclude(media_type='video')
        total = qs.count()
        self.stdout.write(f"Found {total} images without CLIP embeddings.")

        if total == 0:
            return

        from telegram_storage.storage import TelegramStorage, TelegramFile
        storage = TelegramStorage()

        processed = 0
        for media in qs.iterator(chunk_size=100):
            try:
                if not (media.telegram_message_id or media.telegram_file_id):
                    continue

                tg_file = TelegramFile(media.telegram_message_id, media.telegram_file_id, media.file_size)
                data = b"".join(storage.iter_range(tg_file, 0, media.file_size - 1))

                emb = embed_image(data)
                media.clip_embedding = emb.tolist()
                media.save(update_fields=['clip_embedding'])
                
                processed += 1
                if processed % 10 == 0:
                    self.stdout.write(f"Processed {processed}/{total}...")
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Failed to process media {media.id}: {e}"))

        self.stdout.write(self.style.SUCCESS(f"Successfully generated embeddings for {processed} items."))
