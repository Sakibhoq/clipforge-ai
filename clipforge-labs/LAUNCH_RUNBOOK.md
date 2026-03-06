# Clipforge Labs Launch Runbook (Step-by-Step)

This runbook is the shortest safe path to launch `clipforge.us` with the current codebase.

## 0) Decide launch mode (required)

Choose one of these before public traffic:

- `Private beta` (recommended now): real users invited manually, tight credit caps, generation volume controlled.
- `Public launch`: open signup, stronger abuse controls, production-grade monitoring and support coverage.

## 1) Final pre-launch product config

1. Confirm pricing + credits policy in product and Stripe:
   - Free trial: `5` credits one-time
   - Starter: `40` credits/month
   - Creator: `120` credits/month (pack multiplier applies)
   - Studio: custom / manual
2. Confirm generation guardrails:
   - Durations allowed: `4s`, `6s`, `8s`
   - Concurrency caps by plan are enforced
   - Credits reserve before job start and refund on job failure
3. Confirm UI language is credits-first (`1 credit = 1 second`).

## 2) Stripe production setup

1. In Stripe (live mode), create products/prices:
   - Starter monthly
   - Creator monthly
   - Creator yearly (if enabled)
   - Free trial mapping (if handled via checkout metadata flow)
2. Set webhook endpoint to:
   - `https://api.clipforge.us/billing/webhook`
3. Subscribe webhook events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy live secrets into backend env:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_*`

## 3) Google Cloud setup (hosting + APIs)

1. Compute + network:
   - VM in your selected region
   - Static external IP attached
   - Firewall allows `80` and `443`
2. Storage:
   - Create bucket for generated outputs
   - Set lifecycle policy (delete old temp assets)
   - If using GCS with S3-compatible API, create HMAC keys for service account
3. API enablement:
   - Vertex AI API (when real generation path is added)
   - IAM Service Account Credentials API (if needed for auth flows)
4. Budget controls:
   - Create monthly budget alerts (50%, 80%, 100%)
   - Add anomaly alerting

## 4) DNS and TLS

At Namecheap DNS, configure A records to the VM static IP:

- `@` -> `<VM_IP>`
- `www` -> `<VM_IP>`
- `app` -> `<VM_IP>`
- `api` -> `<VM_IP>`

On server, use Caddy (or Nginx) reverse proxy with TLS:

- `clipforge.us`, `www.clipforge.us`, `app.clipforge.us` -> frontend
- `api.clipforge.us` -> backend

Verify:

- `curl -fsS https://api.clipforge.us/health`
- `curl -fsS https://api.clipforge.us/health/ready`

## 5) Server environment + secrets

Use `.env.prod.example` as template and set real values for:

- Core:
  - `APP_ENV=production`
  - `SECRET_KEY`
  - `COOKIE_DOMAIN=.clipforge.us`
  - `FRONTEND_BASE_URL=https://clipforge.us`
  - `PUBLIC_API_BASE=https://api.clipforge.us`
- Database:
  - `DATABASE_URL` (managed Postgres recommended)
- Storage:
  - `STORAGE_BACKEND=s3` (or `gcs`)
  - `S3_BUCKET`
  - `AWS_REGION=auto` (for GCS S3 endpoint)
  - `S3_ENDPOINT_URL=https://storage.googleapis.com`
  - `S3_ADDRESSING_STYLE=path`
  - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (GCS HMAC keys)
- Billing:
  - Stripe keys + price IDs + webhook secret
- OAuth:
  - Google/Facebook/TikTok client IDs/secrets
  - Exact redirect URIs for each provider
- Generation:
  - `LABS_CREDIT_USD_VALUE=0.10`
  - `LABS_VIDEO_REAL_USD_PER_SECOND=0.50`
  - `LABS_VIDEO_LOW_COST_USD_PER_SECOND=0.10`
  - `LABS_VIDEO_HD_MARKUP=2.7`
  - `LABS_VIDEO_4K_MARKUP=3.0`
  - `LABS_IMAGE_REAL_USD_PER_IMAGE=0.04`
  - `LABS_IMAGE_LOW_COST_USD_PER_IMAGE=0.02`
  - `LABS_IMAGE_MARKUP=6.0`
  - `LABS_VOICE_WORDS_PER_CREDIT=300`
  - `LABS_VOICE_MIN_CREDITS=1`
  - `LABS_GENERATION_PROVIDER=google` (or `stub` for placeholder mode)
  - `GOOGLE_API_KEY`
  - `GOOGLE_VIDEO_API_URL` / `GOOGLE_IMAGE_API_URL` (if using a Google/Vertex gateway)
  - `GOOGLE_TTS_API_URL` (defaults to Google Cloud Text-to-Speech)

## 6) Deploy application

From server project directory:

1. Pull latest code
2. Build and start services
3. Run DB migrations
4. Verify container health

Example flow:

```bash
cd ~/clipforge-ai/clipforge-labs
sudo docker-compose -f docker-compose.prod.yml pull
sudo docker-compose -f docker-compose.prod.yml build --no-cache
sudo docker-compose -f docker-compose.prod.yml up -d
```

If migrations are used in your deploy process, run them before opening traffic.

## 7) Mandatory smoke tests (before opening traffic)

1. Auth:
   - Register/login/logout
   - Password reset
   - OAuth login callback success
2. Billing:
   - Start checkout for each enabled plan
   - Successful webhook credit grant
   - Cancel flow and plan/status sync
3. Generation:
   - Create generation job
   - Job moves `queued -> running -> done`
   - MP4 playback/download works
4. Credits:
   - Credits deducted on job start
   - Credits refunded on forced failure
5. Core pages:
   - `/`, `/pricing`, `/app/generate`, `/app/billing`, `/app/clips`

## 8) Go-live controls

1. Set social dispatch flag only when providers are fully approved:
   - `SOCIAL_DISPATCH_ENABLED=1` only after approvals
2. Keep initial usage limits strict:
   - low concurrency
   - short durations only
   - free trial capped
3. Keep manual rollback ready:
   - previous image tag or previous git SHA
   - known-good env backup

## 9) First 72 hours post-launch

Track these every day:

- Job success rate
- Avg generation latency
- Credit burn per active user
- Stripe checkout conversion
- Error rate by endpoint
- Abuse attempts (auth/generation spikes)

Immediate triggers for action:

- Generation failure rate > 5%
- Unexpected credit drain
- Webhook failures
- API p95 latency spikes

## 10) Current hard blockers to true public scale

1. Worker still uses placeholder generation path (not real Vertex generation yet)
2. Managed Postgres + managed backups should replace SQLite for production scale
3. Full alerting/observability coverage should be enabled before broad public traffic
4. OAuth provider app approvals (TikTok/Facebook/Instagram) must be fully live

---

When all steps above are complete and smoke tests pass, Clipforge Labs is launch-ready for controlled public traffic.
