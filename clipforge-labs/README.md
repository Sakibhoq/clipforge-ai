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
- The worker creates a placeholder MP4 (Google video generation API wiring is stubbed and can be enabled later)

## Production (EC2)

1. Copy `.env.prod.example` to `.env.prod` and fill values.
2. Bring up the stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Reverse proxy:
- `clipforge.us` -> `127.0.0.1:3100`
- `api.clipforge.us` -> `127.0.0.1:8100`

