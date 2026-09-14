from django.contrib import admin
from django.urls import path, include
from media.views import shared_link_content, shared_link_view

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("media.urls")),
    path("api/", include("albums.urls")),
    path("share/<uuid:link_id>/", shared_link_view, name="shared-link"),
    path("share/<uuid:link_id>/content/", shared_link_content, name="shared-link-content"),
]
