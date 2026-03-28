# Orbito Labs

Sister project to Orbito. Orbito Labs generates short AI videos from a prompt and lets you publish to connected social platforms.

## Codebase Map

See the repo-wide structure guide in:

- `docs/CODEBASE_MAP.md`

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

## Object Storage (GCS)

Orbito Labs supports Google Cloud Storage using the S3-compatible endpoint.

Set in `.env.prod`:

- `STORAGE_BACKEND=s3` (or `gcs`)
- `S3_BUCKET=<your-bucket>`
- `AWS_REGION=auto`
- `S3_ENDPOINT_URL=https://storage.googleapis.com`
- `S3_ADDRESSING_STYLE=path`
- `AWS_ACCESS_KEY_ID=<HMAC_ACCESS_KEY>`
- `AWS_SECRET_ACCESS_KEY=<HMAC_SECRET>`

Notes:
- Create HMAC keys for your service account from **Cloud Storage -> Settings -> Interoperability**.
- Add bucket CORS for browser PUT/GET from `https://clipforge.us` and `https://app.clipforge.us`.
