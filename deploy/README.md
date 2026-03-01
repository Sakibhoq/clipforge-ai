# Deploy templates

This folder contains copy-paste templates for a simple EC2 launch.

## Recommended production shape

- Docker Compose runs the app containers (frontend/backend/worker) on the EC2 host

For Google Cloud migration guidance, use `deploy/GCP_MIGRATION.md`.
- Reverse proxy (Nginx or Caddy) terminates TLS on ports 80/443
- `3000` and `8000` are bound to `127.0.0.1` only (see `docker-compose.prod.yml`)

Compose note:
- Newer Docker installs use `docker compose ...` (plugin)
- Older installs use `docker-compose ...` (standalone)

## Files

- `deploy/nginx/orbito.conf`: Nginx vhost template for `orbito.cc` and `api.orbito.cc`
- `deploy/caddy/Caddyfile`: Caddy template (automatic TLS)
- `deploy/systemd/orbito-compose.service`: systemd unit template to keep Compose up on reboot

Notes:
- The templates also include `app.orbito.cc` (if you keep an `app` DNS record).
