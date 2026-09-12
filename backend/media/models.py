from django.db import models

# Create your models here.
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


    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="processing")
    upload_error = models.TextField(null=True, blank=True)
    temp_file_path = models.CharField(max_length=1024, null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.filename
