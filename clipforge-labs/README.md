# Clipforge Labs

Sister project to Orbito. Clipforge Labs generates short AI videos from a prompt and lets you publish to connected social platforms.

## Dev (Docker Compose)

From `clipforge-labs/`:

```bash
docker compose up --build
```

- Frontend: `http://localhost:3100`
- Backend: `http://localhost:8100` (docs at `/docs`)

Generate a video:
- Open the app and go to **Generate**
- Enter a prompt
- By default, the worker creates placeholder assets.
- To enable real provider generation:
  - Set `LABS_GENERATION_PROVIDER=google`
  - Configure `GOOGLE_VIDEO_API_URL` and/or `GOOGLE_IMAGE_API_URL`
  - Set `GOOGLE_API_KEY` (or bearer token headers)
  - For voiceovers, set `GOOGLE_API_KEY` and keep `GOOGLE_TTS_API_URL`

## Production (EC2)

1. Copy `.env.prod.example` to `.env.prod` and fill values.
2. Bring up the stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Reverse proxy:
- `clipforge.us` -> `127.0.0.1:3100`
- `api.clipforge.us` -> `127.0.0.1:8100`
