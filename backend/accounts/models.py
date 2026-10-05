from django.db import models

# Create your models here.
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    email = models.EmailField(unique=True)
    profile_image = models.URLField(blank=True, null=True)
    private_pin_hash = models.CharField(max_length=128, blank=True, null=True)

    def __str__(self):
        return self.email

class GoogleIntegration(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='google_integration')
    google_account_id = models.CharField(max_length=255, unique=True)
    email = models.EmailField()
    
    # OAuth Tokens
    access_token = models.TextField()
    refresh_token = models.TextField(null=True, blank=True)
    token_expiry = models.DateTimeField(null=True, blank=True)
    
    # Sync State
    is_syncing = models.BooleanField(default=False)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    next_page_token = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"Google Auth for {self.user.username}"