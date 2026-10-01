from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("media", "0010_media_latitude_media_location_name_media_longitude"),
    ]

    operations = [
        migrations.AddField(
            model_name="media",
            name="external_id",
            field=models.CharField(blank=True, db_index=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="media",
            name="source",
            field=models.CharField(default="local", max_length=20),
        ),
    ]
