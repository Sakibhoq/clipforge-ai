# Orbito (clipforge-ai)

Monorepo:
- `frontend/`: Next.js app
- `backend/`: FastAPI API
- `worker/`: video processing worker (claims jobs from DB)

## Dev (docker compose)

```bash
docker compose up --build
```

If your machine has the legacy Compose v1 binary instead:

```bash
docker-compose up --build
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000` (docs at `/docs`)

## Health

- Liveness: `GET /health`
- Readiness: `GET /health/ready` (DB + storage sanity)

## Migrations (Alembic)

Canonical migrations live in `backend/alembic/`.

From repo root:

```bash
alembic upgrade head
```

Or from inside `backend/`:

```bash
alembic -c alembic.ini upgrade head
```

Set `DATABASE_URL` to target managed Postgres (RDS or Cloud SQL).

## Production (EC2 or GCE)

1. Create `.env.prod` from `.env.prod.example` and fill real values.
2. Bring up the stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

If your EC2 uses `docker-compose`:

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

3. Put a reverse proxy in front of it (templates in `deploy/`).

### Google Cloud storage mode

Orbito supports Google Cloud Storage using the S3-compatible endpoint:

- `STORAGE_BACKEND=gcs`
- `S3_BUCKET=<your-bucket>`
- `S3_ENDPOINT_URL=https://storage.googleapis.com`
- `S3_ADDRESSING_STYLE=path`
- `AWS_ACCESS_KEY_ID=<gcs-hmac-access-key>`
- `AWS_SECRET_ACCESS_KEY=<gcs-hmac-secret>`
