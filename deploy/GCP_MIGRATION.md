# Orbito AWS -> Google Cloud Migration Runbook

This runbook keeps your app architecture the same (Docker Compose on one VM) and migrates infrastructure around it.

## 1) Target GCP resources

- Compute Engine VM (Ubuntu) for `frontend`, `backend`, `worker`
- Cloud SQL for PostgreSQL
- Cloud Storage bucket for media
- Artifact Registry (optional, if you later move away from on-VM builds)
- Cloud DNS zone for `orbito.cc` (optional; you can keep your current DNS provider)

## 2) Storage mode for Orbito

Use GCS in S3-compatible mode:

- `STORAGE_BACKEND=gcs`
- `S3_BUCKET=<bucket-name>`
- `S3_ENDPOINT_URL=https://storage.googleapis.com`
- `S3_ADDRESSING_STYLE=path`
- `AWS_REGION=auto` (or `us-east-1`)
- `AWS_ACCESS_KEY_ID=<gcs-hmac-access-key>`
- `AWS_SECRET_ACCESS_KEY=<gcs-hmac-secret>`

## 3) Database migration (Postgres recommended)

1. Create Cloud SQL Postgres instance.
2. Export data from current DB.
3. Import into Cloud SQL.
4. Set:
   - `DATABASE_URL=postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME`
5. Run migrations:
   - `alembic upgrade head`

## 4) VM deployment

On the new GCP VM:

```bash
git clone https://github.com/Sakibhoq/clipforge-ai.git
cd clipforge-ai
git checkout release/clean-deploy-2026-01-16
cp .env.prod.example .env.prod
# fill .env.prod values
docker-compose -f docker-compose.prod.yml up -d --build frontend backend worker
docker-compose -f docker-compose.prod.yml ps
```

## 5) Domain cutover

1. Point `app.orbito.cc` to new VM public IP.
2. Point `api.orbito.cc` to same VM (or separate backend host if used).
3. Keep low DNS TTL (60-300s) during migration.

## 6) OAuth callback update (required)

No provider callbacks should change if domains stay the same (`api.orbito.cc`), but verify these exactly:

- Google: `https://api.orbito.cc/auth/oauth/google/callback`
- TikTok: `https://api.orbito.cc/auth/oauth/tiktok/callback`
- Facebook login: `https://api.orbito.cc/auth/oauth/facebook/callback`
- Social connect endpoints:
  - `https://api.orbito.cc/social/connect/*/callback`

## 7) Production verification checklist

- `GET https://api.orbito.cc/health/ready` returns OK
- Login works (Google/Facebook if enabled)
- Upload and clip generation works
- Clip playback/download URLs work
- Social connection flows work
- Stripe webhook receives events

## 8) Rollback plan

If any critical failure appears:

1. Repoint DNS back to AWS endpoints.
2. Re-enable old stack.
3. Keep GCP VM running for debugging.

