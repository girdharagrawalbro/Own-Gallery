from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from .views import (
    RegisterView, UserDetailView, ChangePasswordView, 
    GoogleLoginView,
    PrivatePinStatusView, SetPrivatePinView, UnlockPrivateGalleryView,
    UserSettingsView
)

urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("login/", TokenObtainPairView.as_view()),
    path("token/refresh/", TokenRefreshView.as_view()),
    path("me/", UserDetailView.as_view()),
    path("change-password/", ChangePasswordView.as_view()),
    path("google/", GoogleLoginView.as_view()),

    path("private-pin/status/", PrivatePinStatusView.as_view()),
    path("private-pin/set/", SetPrivatePinView.as_view()),
    path("private-pin/unlock/", UnlockPrivateGalleryView.as_view()),
    path("settings/", UserSettingsView.as_view()),
]