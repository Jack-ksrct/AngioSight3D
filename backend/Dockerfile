FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
# The trained bundle is not baked into the image: docker-compose.yml mounts
# ./models over this path read-only, and training artifacts are built by
# backend.train rather than trusted at build time. Without a bundle the API
# starts in degraded mode (/health reports model_loaded: false) and /predict
# returns 503 until one is mounted.
ENV MODEL_DIR=/models
RUN addgroup --system cardiomap && adduser --system --ingroup cardiomap --no-create-home cardiomap
USER cardiomap
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
