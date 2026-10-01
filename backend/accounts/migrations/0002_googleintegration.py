from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="GoogleIntegration",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("google_account_id", models.CharField(max_length=255, unique=True)),
                ("email", models.EmailField(max_length=254)),
                ("access_token", models.TextField()),
                ("refresh_token", models.TextField(blank=True, null=True)),
                ("token_expiry", models.DateTimeField(blank=True, null=True)),
                ("is_syncing", models.BooleanField(default=False)),
                ("last_sync_at", models.DateTimeField(blank=True, null=True)),
                ("next_page_token", models.CharField(blank=True, max_length=255, null=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="google_integration",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
