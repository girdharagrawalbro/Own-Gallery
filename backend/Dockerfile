FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libpq5 \
       ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Media requests are I/O bound (waiting on Telegram), so use many threads per
# worker: a video stream holds a thread for as long as the viewer keeps loading.
ENV GUNICORN_WORKERS=2 \
    GUNICORN_THREADS=24

CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --worker-class gthread --workers ${GUNICORN_WORKERS} --threads ${GUNICORN_THREADS} --timeout 120 --graceful-timeout 30 --keep-alive 15 --access-logfile -"]
