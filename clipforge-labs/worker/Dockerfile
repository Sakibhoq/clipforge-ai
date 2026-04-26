FROM python:3.11-slim

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    ffmpeg \
    espeak-ng \
    fonts-dejavu-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

ARG INSTALL_ALIGNMENT_DEPS=0
ENV INSTALL_ALIGNMENT_DEPS=${INSTALL_ALIGNMENT_DEPS}

RUN pip install --upgrade pip && \
    pip install \
      python-dotenv \
      sqlalchemy \
      psycopg2-binary \
      boto3 \
      requests \
      google-auth \
      PyJWT && \
    if [ "$INSTALL_ALIGNMENT_DEPS" = "1" ]; then \
      pip install --index-url https://download.pytorch.org/whl/cpu torch && \
      pip install openai-whisper ; \
    fi

CMD ["python", "worker.py"]
