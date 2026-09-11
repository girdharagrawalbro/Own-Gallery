from rest_framework import status, viewsets, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Album
from .serializers import AlbumSerializer


class AlbumViewSet(viewsets.ModelViewSet):

    serializer_class = AlbumSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']

    def get_queryset(self):
        return Album.objects.filter(
            user=self.request.user
        ).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="add-media"
    )
    def add_media(self, request, pk=None):

        album = self.get_object()

        media_ids = request.data.get("media_ids", [])

        if not isinstance(media_ids, list):
            return Response(
                {"error": "media_ids must be a list."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Only allow the user to add their own media
        from media.models import Media

        media = Media.objects.filter(
            id__in=media_ids,
            user=request.user,
            is_deleted=False
        )

        album.media.add(*media)

        return Response({
            "message": "Media added to album.",
            "added_count": media.count()
        })

    @action(
        detail=True,
        methods=["post"],
        url_path="remove-media"
    )
    def remove_media(self, request, pk=None):

        album = self.get_object()

        media_ids = request.data.get("media_ids", [])

        if not isinstance(media_ids, list):
            return Response(
                {"error": "media_ids must be a list."},
                status=status.HTTP_400_BAD_REQUEST
            )

        from media.models import Media

        media = Media.objects.filter(
            id__in=media_ids,
            user=request.user
        )

        album.media.remove(*media)

        return Response({
            "message": "Media removed from album.",
            "removed_count": media.count()
        })

    @action(
        detail=True,
        methods=["get"],
        url_path="media"
    )
    def album_media(self, request, pk=None):

        album = self.get_object()

        media = album.media.filter(
            user=request.user,
            is_deleted=False
        )

        serializer = self.get_serializer(
            album
        )

        from media.serializers import MediaSerializer

        media_serializer = MediaSerializer(
            media,
            many=True,
            context={"request": request}
        )

        return Response({
            "album": serializer.data,
            "media": media_serializer.data
        })