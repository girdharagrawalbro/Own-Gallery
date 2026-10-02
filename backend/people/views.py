from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from media.models import Media
from media.serializers import MediaSerializer

from .models import Face, Person
from .serializers import PersonDetailSerializer, PersonListSerializer

User = get_user_model()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_persons(request):
    """GET /api/people/ — list all non-hidden persons for the user."""
    show_hidden = request.query_params.get("hidden") == "true"
    qs = (
        Person.objects.filter(user=request.user)
        .prefetch_related("faces__media", "cover_face__media")
        .order_by("name", "-created_at")
    )
    if not show_hidden:
        qs = qs.filter(is_hidden=False)

    serializer = PersonListSerializer(qs, many=True, context={"request": request})
    return Response(serializer.data)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def person_detail(request, pk):
    """GET/PATCH/DELETE /api/people/<pk>/"""
    try:
        person = Person.objects.prefetch_related("faces__media", "cover_face__media").get(
            pk=pk, user=request.user
        )
    except Person.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(PersonDetailSerializer(person, context={"request": request}).data)

    if request.method == "PATCH":
        allowed = {"name", "is_hidden"}
        data = {k: v for k, v in request.data.items() if k in allowed}
        serializer = PersonListSerializer(person, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    # DELETE
    person.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def merge_persons(request, pk):
    """POST /api/people/<pk>/merge/ — merge another person INTO this one.
    Body: { "into_id": <int> }
    """
    try:
        source = Person.objects.get(pk=pk, user=request.user)
    except Person.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    into_id = request.data.get("into_id")
    if not into_id:
        return Response({"detail": "into_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        target = Person.objects.get(pk=into_id, user=request.user)
    except Person.DoesNotExist:
        return Response({"detail": "Target person not found."}, status=status.HTTP_404_NOT_FOUND)

    if source.pk == target.pk:
        return Response({"detail": "Cannot merge a person with itself."}, status=status.HTTP_400_BAD_REQUEST)

    Face.objects.filter(person=source).update(person=target)
    source.delete()
    return Response(PersonListSerializer(target, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def remove_face(request, pk):
    """POST /api/people/<pk>/remove-face/ — detach a face from this person.
    Body: { "face_id": <int> }
    """
    try:
        person = Person.objects.get(pk=pk, user=request.user)
    except Person.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    face_id = request.data.get("face_id")
    try:
        face = Face.objects.get(pk=face_id, person=person)
    except Face.DoesNotExist:
        return Response({"detail": "Face not found for this person."}, status=status.HTTP_404_NOT_FOUND)

    # Create a standalone person for this misidentified face
    new_person = Person.objects.create(user=request.user)
    face.person = new_person
    face.save(update_fields=["person"])
    new_person.cover_face = face
    new_person.save(update_fields=["cover_face"])

    return Response({"detail": "Face removed."}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def person_media(request, pk):
    """GET /api/people/<pk>/media/ — paginated media containing this person."""
    try:
        person = Person.objects.get(pk=pk, user=request.user)
    except Person.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    media_ids = (
        person.faces.values_list("media_id", flat=True)
        .distinct()
    )
    qs = (
        Media.objects.filter(pk__in=media_ids, is_deleted=False)
        .prefetch_related("variants")
        .order_by("-taken_at", "-created_at")
    )

    # Simple manual pagination
    page = int(request.query_params.get("page", 1))
    page_size = int(request.query_params.get("page_size", 60))
    start = (page - 1) * page_size
    end = start + page_size

    total = qs.count()
    items = qs[start:end]
    serializer = MediaSerializer(items, many=True, context={"request": request})

    return Response(
        {
            "count": total,
            "next": f"?page={page + 1}" if end < total else None,
            "previous": f"?page={page - 1}" if page > 1 else None,
            "results": serializer.data,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def media_faces(request, media_id):
    """GET /api/media/<media_id>/faces/ — faces detected in a single photo."""
    faces = Face.objects.filter(media_id=media_id, media__user=request.user).select_related("person")
    data = [
        {
            "id": f.id,
            "person_id": f.person_id,
            "person_name": f.person.display_name if f.person else None,
            "box_top": f.box_top,
            "box_right": f.box_right,
            "box_bottom": f.box_bottom,
            "box_left": f.box_left,
            "confidence": f.confidence,
        }
        for f in faces
    ]
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def trigger_face_scan(request):
    """POST /api/people/scan/ — Trigger face detection scan for unscanned photos."""
    from .tasks import reprocess_undetected_faces

    force = bool(request.data.get("force", False))
    reprocess_undetected_faces.delay(user_id=request.user.id, limit=200, force=force)
    return Response(
        {
            "status": "queued",
            "message": "Face scan has been queued in the background. Identified people will appear shortly.",
        }
    )

