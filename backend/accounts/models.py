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

class UserSettings(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="settings")
    theme = models.CharField(max_length=20, default="system", choices=(("light", "Light"), ("dark", "Dark"), ("system", "System")))
    grid_columns = models.IntegerField(default=3)
    backup_enabled = models.BooleanField(default=False)
    backup_wifi_only = models.BooleanField(default=True)
    backup_charging_only = models.BooleanField(default=False)
    backup_folders = models.JSONField(default=list, blank=True)

    def __str__(self):
        return f"{self.user.username}'s settings"

from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=User)
def create_user_settings(sender, instance, created, **kwargs):
    if created:
        UserSettings.objects.get_or_create(user=instance)
