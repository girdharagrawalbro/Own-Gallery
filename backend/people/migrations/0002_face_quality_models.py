from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("people", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="face",
            name="quality_score",
            field=models.FloatField(default=1.0),
        ),
        migrations.AddField(
            model_name="face",
            name="detection_model",
            field=models.CharField(default="hog", max_length=64),
        ),
        migrations.AddField(
            model_name="face",
            name="embedding_model",
            field=models.CharField(default="dlib_128", max_length=64),
        ),
    ]
