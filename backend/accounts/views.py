from django.shortcuts import render

from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import UserRateThrottle
from django.contrib.auth import update_session_auth_hash

from .serializers import RegisterSerializer, UserSerializer, ChangePasswordSerializer

class PrivatePinUnlockThrottle(UserRateThrottle):
    scope = 'private_pin_unlock'
    rate = '5/min'


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
        verified_email = user_info.get("verified_email")
        google_id = user_info.get("id")
        
        if not verified_email:
            return Response({"detail": "Google email is not verified."}, status=status.HTTP_400_BAD_REQUEST)
        
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            user = User.objects.create(email=email, username=email.split('@')[0])
            user.set_unusable_password()
            user.save()
        

        refresh = RefreshToken.for_user(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user, context={"request": request}).data
        })



class PrivatePinStatusView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        return Response({
            "is_set": bool(request.user.private_pin_hash)
        })

class SetPrivatePinView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        from django.contrib.auth.hashers import make_password, check_password
        
        current_pin = request.data.get("current_pin")
        new_pin = request.data.get("new_pin")
        
        if not new_pin or len(new_pin) < 6:
            return Response({"detail": "New PIN must be at least 6 characters long."}, status=status.HTTP_400_BAD_REQUEST)
            
        user = request.user
        
        if user.private_pin_hash:
            if not current_pin:
                return Response({"detail": "Current PIN is required to set a new PIN."}, status=status.HTTP_400_BAD_REQUEST)
            if not check_password(current_pin, user.private_pin_hash):
                return Response({"detail": "Incorrect current PIN."}, status=status.HTTP_400_BAD_REQUEST)
                
        user.private_pin_hash = make_password(new_pin)
        user.save(update_fields=['private_pin_hash'])
        
        return Response({"detail": "PIN set successfully."})

class UnlockPrivateGalleryView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [PrivatePinUnlockThrottle]
    
    def post(self, request):
        from django.contrib.auth.hashers import check_password
        import jwt
        from django.conf import settings
        from datetime import timedelta
        from django.utils import timezone
        
        pin = request.data.get("pin")
        user = request.user
        
        if not user.private_pin_hash:
            return Response({"detail": "No PIN has been set."}, status=status.HTTP_400_BAD_REQUEST)
            
        if not pin or not check_password(pin, user.private_pin_hash):
            return Response({"detail": "Incorrect PIN."}, status=status.HTTP_400_BAD_REQUEST)
            
        # Issue a short-lived token (e.g., 60 minutes)
        payload = {
            "user_id": user.id,
            "exp": timezone.now() + timedelta(minutes=60),
            "type": "private_access"
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
        
        return Response({"private_token": token})
