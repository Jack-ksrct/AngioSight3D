FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/train.py ./train.py
COPY data ./data
# Train the clinical models at build time so the bundle is baked into the image
RUN python train.py --data "data/extention of Z-Alizadeh sani   dataset.xlsx" --output /models
ENV MODEL_DIR=/models
RUN addgroup --system angiosight && adduser --system --ingroup angiosight --no-create-home angiosight
USER angiosight
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
