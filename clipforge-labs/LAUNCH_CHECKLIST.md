# Orbito Labs Launch Checklist

This checklist reflects the current codebase and the launch direction selected:
- Creator-focused short-form generator
- Tight cost control (seconds-based credits)
- Fast path to production on `clipforge.us`

Current checklist completion:
- Done items: `8`
- Remaining items: `24`
- Public-launch readiness from this checklist: `25%`

## 1) Done in code now

- [x] Generation duration guardrails: `4s / 6s / 8s` only
- [x] Credits economics in generation path: `1 credit = 1 second` (configurable)
- [x] Plan-aware max generation duration
- [x] Plan-aware concurrent generation job limits
- [x] Generation contract extended (`style_preset`, `seed`, `input_image_key`)
- [x] Billing credit grants aligned to launch-safe tiers:
  - Free trial: `5`
  - Starter: `40/mo`
  - Creator: `120/mo` (x pack multiplier)
  - Studio: `300/mo`
- [x] Billing UI copy aligned to credits-first model
- [x] Generate UI duration + estimated cost aligned to backend rules

## 2) Must complete before public launch

### Blockers
- [ ] Replace placeholder generation worker with real Google/Vertex generation pipeline
- [ ] End-to-end password reset backend flow (forgot/reset tokens + email)
- [ ] Remove or disable dev notice banner from production
- [ ] Verify Stripe live webhooks (`checkout.session.completed`) on production

### High priority
- [ ] Confirm OAuth app review/permissions for Facebook/TikTok/Instagram
- [ ] Enable `SOCIAL_DISPATCH_ENABLED=1` only after social approvals are live
- [ ] Move production DB to managed Postgres (RDS/Cloud SQL), not SQLite
- [ ] Move production storage to S3 (or GCS), not local disk
- [ ] Set budget alerts (monthly + anomaly)

### Reliability / Ops
- [ ] Fix backend test suite hang and make CI pass consistently
- [ ] Add uptime checks for frontend + API + `/health/ready`
- [ ] Add centralized logs and error alerting
- [ ] Add daily DB backup and periodic restore test

## 3) Pricing + credit policy (recommended launch)

- Free: `5 credits` one-time, watermark, low priority
- Starter: `40 credits/month`
- Creator: `120 credits/month`, packs enabled
- Studio: `300 credits/month`, priority + team workflow

Rule:
- `1 credit = 1 second generated`

## 4) Security checklist

- [ ] `SECRET_KEY` long random value
- [ ] `COOKIE_DOMAIN=.clipforge.us`
- [ ] `FRONTEND_ORIGIN=https://clipforge.us`
- [ ] `PUBLIC_API_BASE=https://api.clipforge.us`
- [ ] CORS and proxy headers verified
- [ ] Rate limiting enabled on auth + generation endpoints

## 5) Product readiness checklist

- [ ] Create → status → download flow works on desktop and mobile
- [ ] Credits are reserved before generation and refunded on failures
- [ ] Billing success/cancel states visible and understandable
- [ ] Error messaging is human-readable (no raw provider errors)
- [ ] History page filters and pagination are usable
