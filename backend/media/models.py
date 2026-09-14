import uuid

from django.conf import settings
from django.db import models


class Media(models.Model):

    MEDIA_TYPES = (
        ("image", "Image"),
        ("video", "Video"),
    )

    STATUS_CHOICES = (
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("duplicate", "Duplicate"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="media"
    )

    telegram_file_unique_id = models.TextField(null=True, blank=True)

    telegram_message_id = models.BigIntegerField(null=True, blank=True)

    telegram_file_id = models.TextField(null=True, blank=True)

    media_type = models.CharField(max_length=20, choices=MEDIA_TYPES)

    filename = models.CharField(max_length=255)

    mime_type = models.CharField(max_length=100, blank=True)

    file_size = models.BigIntegerField(default=0)

    width = models.IntegerField(null=True, blank=True)

    height = models.IntegerField(null=True, blank=True)

    duration = models.FloatField(null=True, blank=True)

    thumbnail = models.URLField(null=True, blank=True)

    telegram_thumbnail_file_id = models.TextField(null=True, blank=True)

    is_favorite = models.BooleanField(default=False)

    is_deleted = models.BooleanField(default=False)

    deleted_at = models.DateTimeField(null=True, blank=True)

    file_hash = models.CharField(max_length=64, blank=True, null=True, db_index=True)

    taken_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # How trustworthy taken_at is: "metadata" (absolute time from the file),
    # "client" (device-provided), "exif_local" (EXIF without timezone), "upload".
    taken_at_source = models.CharField(max_length=20, blank=True, default="")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="processing")
    upload_error = models.TextField(null=True, blank=True)
    temp_file_path = models.CharField(max_length=1024, null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            # Timeline query: WHERE user=? AND is_deleted=? ORDER BY taken_at DESC, created_at DESC
            models.Index(
                fields=["user", "is_deleted", "-taken_at", "-created_at"],
                name="media_timeline_idx",
            ),
        ]

    def __str__(self):
        return self.filename

    def variant(self, kind):
        # Uses the prefetch cache when present.
        for variant in self.variants.all():
            if variant.kind == kind:
                return variant
        return None


class MediaVariant(models.Model):
    """A derived file stored next to the original (preview image, playable video...)."""

    PREVIEW = "preview"
    STREAM = "stream"
    KIND_CHOICES = (
        (PREVIEW, "Preview image"),
        (STREAM, "Playback video"),
    )

    media = models.ForeignKey(Media, on_delete=models.CASCADE, related_name="variants")
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    mime_type = models.CharField(max_length=100)
    file_size = models.BigIntegerField(default=0)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    telegram_message_id = models.BigIntegerField(null=True, blank=True)
    telegram_file_id = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["media", "kind"], name="unique_media_variant_kind"),
        ]

    def __str__(self):
        return f"{self.media_id}:{self.kind}"


class SharedLink(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    media = models.ForeignKey(Media, on_delete=models.CASCADE, related_name="shared_links")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return str(self.id)
