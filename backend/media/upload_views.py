"""Resumable chunked uploads.

Each chunk is staged straight into an Azure block blob, so no request carries
more than one chunk and a dropped connection only costs that chunk. Session
state lives in the cache (Redis).
"""

import math
import os
import uuid

from django.conf import settings
from django.core.cache import cache
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from telegram_storage.blob_storage import BlobStorageService

from . import processing
from .serializers import MediaSerializer
from .views import create_media_from_blob, parse_client_timestamp

SESSION_TTL = 24 * 3600


class UploadRateThrottle(UserRateThrottle):
    scope = "uploads"


def _session_key(upload_id):
    return f"upload-session:{upload_id}"


def _chunk_key(upload_id, index):
    return f"upload-session:{upload_id}:chunk:{index}"


def _all_keys(session, upload_id):
    return [_session_key(upload_id)] + [_chunk_key(upload_id, i) for i in range(session["total_chunks"])]


class UploadSessionViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]
    throttle_classes = [UploadRateThrottle]
    lookup_field = "upload_id"
    lookup_value_regex = r"[0-9a-f]{32}"

    def _get_session(self, request, upload_id):
        session = cache.get(_session_key(upload_id))
        if not session or session["user_id"] != request.user.id:
            return None
        return session

    def create(self, request):
        filename = str(request.data.get("filename") or "").strip()
        try:
            file_size = int(request.data.get("file_size"))
        except (TypeError, ValueError):
            return Response({"error": "file_size is required."}, status=status.HTTP_400_BAD_REQUEST)

        if not filename:
            return Response({"error": "filename is required."}, status=status.HTTP_400_BAD_REQUEST)
        if file_size <= 0:
            return Response({"error": "File is empty."}, status=status.HTTP_400_BAD_REQUEST)
        if file_size > settings.MAX_UPLOAD_SIZE:
            return Response(
                {"error": f"File exceeds maximum upload size of {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        declared = str(request.data.get("mime_type") or "")
        if declared and not declared.startswith(("image/", "video/")) and declared != "application/octet-stream":
            return Response({"error": "Only photos and videos can be uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        upload_id = uuid.uuid4().hex
        chunk_size = settings.UPLOAD_CHUNK_SIZE
        session = {
            "user_id": request.user.id,
            "filename": filename,
            "file_size": file_size,
            "chunk_size": chunk_size,
            "total_chunks": math.ceil(file_size / chunk_size),
            "client_timestamp": request.data.get("client_timestamp"),
            "blob_name": f"temp_uploads/{upload_id}{os.path.splitext(filename)[1].lower()[:10]}",
        }
        cache.set(_session_key(upload_id), session, timeout=SESSION_TTL)
        return Response(
            {"upload_id": upload_id, "chunk_size": chunk_size, "total_chunks": session["total_chunks"]},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["put"], url_path=r"chunks/(?P<index>\d+)")
    def chunk(self, request, upload_id=None, index=None):
        session = self._get_session(request, upload_id)
        if not session:
            return Response({"error": "Upload session not found or expired."}, status=status.HTTP_404_NOT_FOUND)

        index = int(index)
        if index >= session["total_chunks"]:
            return Response({"error": "Chunk index out of range."}, status=status.HTTP_400_BAD_REQUEST)

        is_last = index == session["total_chunks"] - 1
        expected = session["file_size"] - index * session["chunk_size"] if is_last else session["chunk_size"]
        # Read the raw body directly; request.body would enforce DATA_UPLOAD_MAX_MEMORY_SIZE.
        data = request._request.read(expected + 1)
        if len(data) != expected:
            return Response(
                {"error": f"Chunk {index} must be {expected} bytes, got {len(data)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if index == 0:
            mime_type, media_type = processing.detect_media_type(data[:8192])
            if not mime_type:
                return Response({"error": "Unsupported or invalid media type."}, status=status.HTTP_400_BAD_REQUEST)
            session.update(mime_type=mime_type, media_type=media_type)
            cache.set(_session_key(upload_id), session, timeout=SESSION_TTL)

        BlobStorageService().stage_block(session["blob_name"], index, data)
        # One key per chunk: parallel chunk requests can't overwrite each other.
        cache.set(_chunk_key(upload_id, index), True, timeout=SESSION_TTL)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, upload_id=None):
        session = self._get_session(request, upload_id)
        if not session:
            return Response({"error": "Upload session not found or expired."}, status=status.HTTP_404_NOT_FOUND)

        keys = [_chunk_key(upload_id, i) for i in range(session["total_chunks"])]
        received = cache.get_many(keys)
        missing = [i for i, key in enumerate(keys) if key not in received]
        if missing or not session.get("mime_type"):
            return Response(
                {"error": "Upload is incomplete.", "missing_chunks": missing or [0]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        blob = BlobStorageService()
        try:
            blob.commit_blocks(session["blob_name"], session["total_chunks"])
            committed_size = blob.size(session["blob_name"])
        except Exception:
            return Response(
                {"error": "Upload is incomplete.", "missing_chunks": list(range(session["total_chunks"]))},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if committed_size != session["file_size"]:
            return Response({"error": "Uploaded size does not match."}, status=status.HTTP_400_BAD_REQUEST)

        media = create_media_from_blob(
            user=request.user,
            blob_name=session["blob_name"],
            filename=session["filename"],
            mime_type=session["mime_type"],
            media_type=session["media_type"],
            size=session["file_size"],
            taken_at=parse_client_timestamp(session.get("client_timestamp")),
            taken_at_source="client",
        )
        cache.delete_many(_all_keys(session, upload_id))
        return Response(MediaSerializer(media, context={"request": request}).data, status=status.HTTP_202_ACCEPTED)

    def destroy(self, request, upload_id=None):
        session = self._get_session(request, upload_id)
        if session:
            cache.delete_many(_all_keys(session, upload_id))
            # Uncommitted blocks are discarded by Azure automatically after 7 days.
        return Response(status=status.HTTP_204_NO_CONTENT)
