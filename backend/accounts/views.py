from django.shortcuts import render

from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import update_session_auth_hash

from .serializers import RegisterSerializer, UserSerializer, ChangePasswordSerializer


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

class UserDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            if not user.check_password(serializer.validated_data.get("old_password")):
                return Response({"old_password": ["Wrong password."]}, status=status.HTTP_400_BAD_REQUEST)
            
            user.set_password(serializer.validated_data.get("new_password"))
            user.save()
            update_session_auth_hash(request, user)
            return Response({"detail": "Password updated successfully."}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

import os
import requests
from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken
from .models import GoogleIntegration

class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        auth_code = request.data.get("auth_code")
        redirect_uri = request.data.get("redirect_uri", "postmessage")
        
        if not auth_code:
            return Response({"detail": "Auth code is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Exchange auth_code for tokens
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "code": auth_code,
            "client_id": getattr(settings, "GOOGLE_CLIENT_ID", "") or os.getenv("GOOGLE_CLIENT_ID", ""),
            "client_secret": getattr(settings, "GOOGLE_CLIENT_SECRET", "") or os.getenv("GOOGLE_CLIENT_SECRET", ""),
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
        
        r = requests.post(token_url, data=data)
        if r.status_code != 200:
            return Response({"detail": "Failed to exchange token", "error": r.json()}, status=status.HTTP_400_BAD_REQUEST)
            
        tokens = r.json()
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        
        # Get user info
        info_r = requests.get("https://www.googleapis.com/oauth2/v2/userinfo", headers={"Authorization": f"Bearer {access_token}"})
        if info_r.status_code != 200:
            return Response({"detail": "Failed to get user info"}, status=status.HTTP_400_BAD_REQUEST)
            
        user_info = info_r.json()
        email = user_info.get("email")
        google_id = user_info.get("id")
        
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        user, created = User.objects.get_or_create(email=email, defaults={"username": email.split('@')[0]})
        
        integration, _ = GoogleIntegration.objects.get_or_create(
            user=user, 
            defaults={
                "google_account_id": google_id,
                "email": email,
                "access_token": access_token,
                "refresh_token": refresh_token,
            }
        )
        if refresh_token:
            integration.refresh_token = refresh_token
        integration.access_token = access_token
        integration.save()
        
        refresh = RefreshToken.for_user(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user, context={"request": request}).data
        })

class GoogleSyncView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            integration = request.user.google_integration
            return Response({
                "connected": True,
                "email": integration.email,
                "is_syncing": integration.is_syncing,
                "last_sync_at": integration.last_sync_at,
            })
        except GoogleIntegration.DoesNotExist:
            return Response({"connected": False})

    def post(self, request):
        try:
            integration = request.user.google_integration
            from accounts.tasks import sync_google_photos_task
            sync_google_photos_task.delay(request.user.id)
            return Response({"detail": "Sync started"})
        except GoogleIntegration.DoesNotExist:
            return Response({"detail": "Not connected"}, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request):
        try:
            request.user.google_integration.delete()
            return Response({"detail": "Disconnected"})
        except GoogleIntegration.DoesNotExist:
            return Response({"detail": "Not connected"}, status=status.HTTP_400_BAD_REQUEST)

class GooglePhotosListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            integration = request.user.google_integration
        except GoogleIntegration.DoesNotExist:
            return Response({"detail": "Not connected"}, status=status.HTTP_400_BAD_REQUEST)

        from accounts.tasks import refresh_google_token
        
        url = "https://photoslibrary.googleapis.com/v1/mediaItems"
        headers = {"Authorization": f"Bearer {integration.access_token}"}
        
        params = {"pageSize": 50}
        page_token = request.query_params.get("pageToken")
        if page_token:
            params["pageToken"] = page_token
            
        r = requests.get(url, headers=headers, params=params)
        
        if r.status_code == 401:
            refresh_google_token(integration)
            headers["Authorization"] = f"Bearer {integration.access_token}"
            r = requests.get(url, headers=headers, params=params)
            
        if r.status_code != 200:
            return Response({"detail": f"Google API Error {r.status_code}", "error": r.text}, status=status.HTTP_400_BAD_REQUEST)
            
        # Return mediaItems and nextPageToken
        return Response(r.json())

class GooglePhotosImportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            integration = request.user.google_integration
        except GoogleIntegration.DoesNotExist:
            return Response({"detail": "Not connected"}, status=status.HTTP_400_BAD_REQUEST)

        media_items = request.data.get("mediaItems", [])
        if not media_items:
            return Response({"detail": "No items provided"}, status=status.HTTP_400_BAD_REQUEST)

        from media.models import Media
        from accounts.tasks import ingest_google_media_task
        
        for item in media_items:
            # item should have id, baseUrl, mimeType, mediaMetadata
            item_id = item.get("id")
            if not item_id: continue
            
            if Media.objects.filter(external_id=item_id, user_id=request.user.id).exists():
                continue
                
            media_metadata = item.get("mediaMetadata", {})
            mime_type = item.get("mimeType", "image/jpeg")
            filename = item.get("filename", f"{item_id}.jpg")
            base_url = item.get("baseUrl")
            
            if not base_url: continue
            
            is_video = "video" in mime_type
            
            media = Media.objects.create(
                user_id=request.user.id,
                filename=filename,
                mime_type=mime_type,
                file_size=0,
                width=int(media_metadata.get("width", 0)) or None,
                height=int(media_metadata.get("height", 0)) or None,
                media_type="video" if is_video else "image",
                source="google",
                external_id=item_id,
                status="processing",
                taken_at=media_metadata.get("creationTime")
            )
            
            ingest_google_media_task.delay(media.id, base_url, is_video)

        return Response({"detail": f"Started import for {len(media_items)} items."})

