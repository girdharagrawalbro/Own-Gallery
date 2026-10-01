from django.urls import path
from . import views

urlpatterns = [
    path("people/", views.list_persons, name="people-list"),
    path("people/<int:pk>/", views.person_detail, name="person-detail"),
    path("people/<int:pk>/merge/", views.merge_persons, name="person-merge"),
    path("people/<int:pk>/remove-face/", views.remove_face, name="person-remove-face"),
    path("people/<int:pk>/media/", views.person_media, name="person-media"),
    path("media/<int:media_id>/faces/", views.media_faces, name="media-faces"),
]
