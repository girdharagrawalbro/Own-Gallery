from django.db import models

# Create your models here.
from django.db import models
from django.conf import settings
from django.db.models.signals import post_save, post_delete, m2m_changed
from django.dispatch import receiver
from utils.api_cache import increment_user_cache_version


class Album(models.Model):

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="albums"
    )

    name = models.CharField(
        max_length=255
    )

    description = models.TextField(
        blank=True
    )

    cover_media = models.ForeignKey(
        "media.Media",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+"
    )

    media = models.ManyToManyField(
        "media.Media",
        related_name="albums",
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return self.name

@receiver([post_save, post_delete], sender=Album)
def invalidate_album_cache(sender, instance, **kwargs):
    if hasattr(instance, 'user_id'):
        increment_user_cache_version(instance.user_id, "albums")

@receiver(m2m_changed, sender=Album.media.through)
def invalidate_album_media_cache(sender, instance, **kwargs):
    if hasattr(instance, 'user_id'):
        increment_user_cache_version(instance.user_id, "albums")