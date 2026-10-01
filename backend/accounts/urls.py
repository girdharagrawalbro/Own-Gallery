from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from .views import (
    RegisterView, UserDetailView, ChangePasswordView, 
    GoogleLoginView, GoogleSyncView, 
    GooglePhotosListView, GooglePhotosImportView
)

urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("login/", TokenObtainPairView.as_view()),
    path("token/refresh/", TokenRefreshView.as_view()),
    path("me/", UserDetailView.as_view()),
    path("change-password/", ChangePasswordView.as_view()),
    path("google/", GoogleLoginView.as_view()),
    path("google/sync/", GoogleSyncView.as_view()),
    path("google/photos/", GooglePhotosListView.as_view()),
    path("google/import/", GooglePhotosImportView.as_view()),
]