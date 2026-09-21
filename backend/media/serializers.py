from rest_framework import serializers

from .models import Media
from .signing import signed_path


class MediaSerializer(serializers.ModelSerializer):
    thumbnail_url = serializers.SerializerMethodField()
    preview_url = serializers.SerializerMethodField()
    content_url = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

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
            "preview_url",
            "content_url",
            "download_url",
            "is_favorite",
            "status",
            "upload_error",
            "taken_at",
            "latitude",
            "longitude",
            "location_name",
            "deleted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [field for field in fields if field != "is_favorite"]

    def _url(self, obj, action):
        request = self.context.get("request")
        if not request:
            return None
        return request.build_absolute_uri(signed_path(obj.id, action))

    def get_thumbnail_url(self, obj):
        return self._url(obj, "thumbnail")

    def get_preview_url(self, obj):
        return self._url(obj, "preview")

    def get_content_url(self, obj):
        return self._url(obj, "content")

    def get_download_url(self, obj):
        return self._url(obj, "download")
