from django.contrib.auth import get_user_model
from rest_framework import serializers


User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        min_length=8
    )
    invite_code = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "password",
            "invite_code",
        ]

    def validate_invite_code(self, value):
        import os
        expected_code = os.getenv("INVITE_CODE")
        if not expected_code:
            raise serializers.ValidationError("Registration is currently disabled.")
        if value != expected_code:
            raise serializers.ValidationError("Invalid invite code.")
        return value

    def create(self, validated_data):
        validated_data.pop("invite_code", None)
        password = validated_data.pop("password")

        user = User(**validated_data)
        user.set_password(password)
        user.save()

        return user

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "profile_image",
        ]
        read_only_fields = ["id", "username"]

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=8)