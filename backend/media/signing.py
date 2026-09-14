"""Signed, cacheable media URLs.

`<img>`/`<video>` tags and native image loaders can't send an Authorization
header, so file endpoints accept `?exp=<unix>&sig=<hmac>` instead. The expiry is
bucketed so a URL stays byte-for-byte identical for a whole rotation period,
which lets browsers and the app cache thumbnails and video segments.
"""

import base64
import hashlib
import hmac
import time
from urllib.parse import urlencode

from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed


def current_expiry(now=None):
    period = settings.MEDIA_URL_ROTATION_SECONDS
    now = int(now if now is not None else time.time())
    # Valid for between one and two periods from now.
    return (now // period + 2) * period


def make_signature(media_id, expires):
    message = f"media:{media_id}:{expires}".encode()
    digest = hmac.new(settings.MEDIA_URL_SIGNING_KEY.encode(), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest[:18]).decode()


def verify_signature(media_id, expires, signature, now=None):
    try:
        expires = int(expires)
    except (TypeError, ValueError):
        return False
    if expires < (now if now is not None else time.time()):
        return False
    return hmac.compare_digest(make_signature(media_id, expires), str(signature))


def signed_path(media_id, action, **params):
    expires = current_expiry()
    query = {"exp": expires, "sig": make_signature(media_id, expires), **params}
    return f"/api/media/{media_id}/{action}/?{urlencode(query)}"


class SignedMediaGrant:
    """`request.auth` value for requests authorised by a signed URL."""

    def __init__(self, media):
        self.media = media


class SignedMediaAuthentication(BaseAuthentication):

    def authenticate_header(self, request):
        # DRF uses the first authenticator's header to pick 401 over 403; clients
        # rely on 401 to trigger their token refresh.
        return 'Bearer realm="api"'

    def authenticate(self, request):
        signature = request.query_params.get("sig")
        expires = request.query_params.get("exp")
        if not signature or not expires:
            return None

        pk = (getattr(request, "parser_context", None) or {}).get("kwargs", {}).get("pk")
        if pk is None or not verify_signature(pk, expires, signature):
            raise AuthenticationFailed("Invalid or expired media link.")

        from .models import Media

        media = Media.objects.select_related("user").filter(pk=pk).first()
        if media is None or not media.user.is_active:
            raise AuthenticationFailed("Invalid or expired media link.")
        return media.user, SignedMediaGrant(media)
