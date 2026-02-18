# Deploy templates

This folder contains copy-paste templates for a simple EC2 launch.

## Recommended production shape

- Docker Compose runs the app containers (frontend/backend/worker) on the EC2 host
- Reverse proxy (Nginx or Caddy) terminates TLS on ports 80/443
- `3100` and `8100` are bound to `127.0.0.1` only (see `docker-compose.prod.yml`)

Compose note:
- Newer Docker installs use `docker compose ...` (plugin)
- Older installs use `docker-compose ...` (standalone)

## Files

- `deploy/nginx/clipforge-labs.conf`: Nginx vhost template for `clipforge.us` and `api.clipforge.us`
- `deploy/caddy/Caddyfile`: Caddy template (automatic TLS)
- `deploy/systemd/clipforge-labs-compose.service`: systemd unit template to keep Compose up on reboot

Notes:
- If you use `www.clipforge.us` or `app.clipforge.us`, add them to the server_name / host list.
