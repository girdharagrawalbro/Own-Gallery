from rest_framework.routers import DefaultRouter

from .upload_views import UploadSessionViewSet
from .views import MediaViewSet

router = DefaultRouter()

# Registered first so "media/uploads/..." isn't taken as a media id.
router.register("media/uploads", UploadSessionViewSet, basename="upload-session")
router.register("media", MediaViewSet, basename="media")

urlpatterns = router.urls
