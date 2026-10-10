from django.contrib import admin
from django.urls import path, include
from media.views import shared_link_content, shared_link_view

from django.http import JsonResponse

def app_version(request):
    return JsonResponse({
        "versionCode": 3,
        "versionName": "2.0.0",
        "apkUrl": "https://github.com/girdharagrawalbro/Own-Gallery/releases/latest/download/app-release.apk",
        "forceUpdate": False,
        "sha256": "dummy_sha256_hash_value"
    })

urlpatterns = [
    path("version.json", app_version, name="app-version"),
    path("secret-admin-123/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("media.urls")),
    path("api/", include("albums.urls")),
    path("api/", include("people.urls")),
    path("share/<uuid:link_id>/", shared_link_view, name="shared-link"),
    path("share/<uuid:link_id>/content/", shared_link_content, name="shared-link-content"),
]

