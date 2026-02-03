FROM python:3.10-slim

WORKDIR /app

# System deps (ffmpeg provides ffprobe for duration detection)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    nodejs \
    npm \
    ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Install backend requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend app code
COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
