from django.contrib import admin
from .models import Face, Person


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "name", "is_hidden", "created_at"]
    list_filter = ["is_hidden", "user"]
    search_fields = ["name", "user__username"]
    raw_id_fields = ["cover_face"]


@admin.register(Face)
class FaceAdmin(admin.ModelAdmin):
    list_display = ["id", "media_id", "person", "confidence", "created_at"]
    list_filter = ["confidence"]
    raw_id_fields = ["media", "person"]
