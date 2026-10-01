from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("media", "__first__"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Person",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(blank=True, default="", max_length=255)),
                ("is_hidden", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="persons",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["name", "-created_at"]},
        ),
        migrations.CreateModel(
            name="Face",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("box_top", models.FloatField()),
                ("box_right", models.FloatField()),
                ("box_bottom", models.FloatField()),
                ("box_left", models.FloatField()),
                ("embedding", models.JSONField()),
                ("confidence", models.FloatField(default=1.0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "media",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="faces",
                        to="media.media",
                    ),
                ),
                (
                    "person",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="faces",
                        to="people.person",
                    ),
                ),
            ],
        ),
        migrations.AddField(
            model_name="person",
            name="cover_face",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="people.face",
            ),
        ),
        migrations.AddIndex(
            model_name="face",
            index=models.Index(fields=["media"], name="face_media_idx"),
        ),
        migrations.AddIndex(
            model_name="face",
            index=models.Index(fields=["person"], name="face_person_idx"),
        ),
    ]
