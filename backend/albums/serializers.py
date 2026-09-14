from rest_framework import serializers
from media.signing import signed_path

from .models import Album


class AlbumSerializer(serializers.ModelSerializer):
    cover_url = serializers.SerializerMethodField()
    media_count = serializers.SerializerMethodField()

    class Meta:
        model = Album
        fields = ["id", "name", "description", "cover_url", "media_count", "created_at", "updated_at"]

    def get_cover_url(self, obj):
        request = self.context.get("request")
        if not request:
            return None

        cover = obj.cover_media
        if not cover:
            cover = obj.media.filter(is_deleted=False).order_by("-taken_at").first()

        if cover:
            return request.build_absolute_uri(signed_path(cover.id, "thumbnail"))

        return None

    def get_media_count(self, obj):
        count = getattr(obj, "visible_media_count", None)
        return count if count is not None else obj.media.filter(is_deleted=False).count()