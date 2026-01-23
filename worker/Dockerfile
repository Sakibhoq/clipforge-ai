FROM python:3.10-slim

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN pip install --upgrade pip && \
    pip install --index-url https://download.pytorch.org/whl/cpu torch && \
    pip install \
        openai-whisper \
        requests \
        python-dotenv \
        sqlalchemy \
        boto3 \
        "numpy==1.26.4" \
        "opencv-python-headless==4.11.0.86" \
        "mediapipe==0.10.21"

CMD ["python", "worker.py"]
