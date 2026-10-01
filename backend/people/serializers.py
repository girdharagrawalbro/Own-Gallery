from rest_framework import serializers
from media.serializers import MediaSerializer
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
        if obj.cover_face and obj.cover_face.media:
            return obj.cover_face.media.thumbnail
        # fallback: first face's media
        first_face = obj.faces.select_related("media").first()
        if first_face and first_face.media:
            return first_face.media.thumbnail
        return None


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
