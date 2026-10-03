from rest_framework import serializers
from media.serializers import MediaSerializer
from media.signing import signed_path
from .models import Face, Person


class FaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Face
        fields = [
            "id",
            "media_id",
            "box_top",
            "box_right",
            "box_bottom",
            "box_left",
            "confidence",
        ]
        read_only_fields = fields


class PersonListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the people grid."""

    face_count = serializers.SerializerMethodField()
    media_count = serializers.SerializerMethodField()
    # Thumbnail URL of the cover face's media, cropped to the face bbox
    cover_thumbnail_url = serializers.SerializerMethodField()
    cover_face = FaceSerializer(read_only=True)

    class Meta:
        model = Person
        fields = [
            "id",
            "name",
            "display_name",
            "is_hidden",
            "face_count",
            "media_count",
            "cover_face",
            "cover_thumbnail_url",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "display_name",
            "face_count",
            "media_count",
            "cover_face",
            "cover_thumbnail_url",
            "created_at",
        ]

    def get_face_count(self, obj):
        return obj.faces.count()

    def get_media_count(self, obj):
        return obj.faces.values("media_id").distinct().count()

    def get_cover_thumbnail_url(self, obj):
        media_id = obj.cover_face.media_id if obj.cover_face else None
        if media_id is None:
            # fallback: first face's media
            media_id = obj.faces.values_list("media_id", flat=True).first()
        if media_id is None:
            return None
        request = self.context.get("request")
        path = signed_path(media_id, "thumbnail")
        return request.build_absolute_uri(path) if request else path


class PersonDetailSerializer(PersonListSerializer):
    """Full serializer including recent media."""

    recent_media = serializers.SerializerMethodField()

    class Meta(PersonListSerializer.Meta):
        fields = PersonListSerializer.Meta.fields + ["recent_media"]

    def get_recent_media(self, obj):
        media_qs = (
            obj.faces.select_related("media")
            .values_list("media", flat=True)
            .distinct()
            .order_by("-media__taken_at")[:20]
        )
        from media.models import Media
        from media.serializers import MediaSerializer

        items = Media.objects.filter(pk__in=media_qs, is_deleted=False)
        request = self.context.get("request")
        return MediaSerializer(items, many=True, context={"request": request}).data
