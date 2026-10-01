from django.conf import settings
from django.db import models


class Person(models.Model):
    """A cluster of faces that belong to the same individual."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="persons",
    )
    # User-provided name; blank means "Unnamed"
    name = models.CharField(max_length=255, blank=True, default="")
    # The face that best represents this person (shown as avatar)
    cover_face = models.ForeignKey(
        "Face",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    is_hidden = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "-created_at"]

    def __str__(self):
        return self.name or f"Person #{self.pk}"

    @property
    def display_name(self):
        return self.name or "Unnamed"

    @property
    def face_count(self):
        return self.faces.count()

    @property
    def media_count(self):
        return self.faces.values("media_id").distinct().count()


class Face(models.Model):
    """A single detected face within one photo."""

    media = models.ForeignKey(
        "media.Media",
        on_delete=models.CASCADE,
        related_name="faces",
    )
    person = models.ForeignKey(
        Person,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="faces",
    )
    # Bounding box stored as fractions of image dimensions (0.0 – 1.0)
    # so it survives any resize/variant generation.
    box_top = models.FloatField()
    box_right = models.FloatField()
    box_bottom = models.FloatField()
    box_left = models.FloatField()
    # 128-dimensional embedding from face_recognition (dlib)
    embedding = models.JSONField()
    # Detection confidence (1.0 = high confidence from face_recognition)
    confidence = models.FloatField(default=1.0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["media"], name="face_media_idx"),
            models.Index(fields=["person"], name="face_person_idx"),
        ]

    def __str__(self):
        return f"Face #{self.pk} in media #{self.media_id}"
