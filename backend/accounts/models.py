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
