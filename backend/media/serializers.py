from rest_framework import serializers

from .models import Media


class MediaSerializer(serializers.ModelSerializer):
    thumbnail_url = serializers.SerializerMethodField()
    content_url = serializers.SerializerMethodField()

    class Meta:
        model = Media
        fields = [
            "id",
            "media_type",
            "filename",
            "mime_type",
            "file_size",
            "width",
            "height",
            "duration",
            "thumbnail_url",
            "content_url",
            "is_favorite",
            "taken_at",
            "created_at",
            "updated_at",
        ]

    def get_thumbnail_url(self, obj):
        request = self.context.get("request")

        if not request:
            return None

        return request.build_absolute_uri(
            f"/api/media/{obj.id}/thumbnail/"
        )

    def get_content_url(self, obj):
        request = self.context.get("request")

        if not request:
            return None

        return request.build_absolute_uri(
            f"/api/media/{obj.id}/content/"
        )