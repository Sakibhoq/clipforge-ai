# Deploy templates

This folder contains copy-paste templates for a simple EC2 launch.

## Recommended production shape

- Docker Compose runs the app containers (frontend/backend/worker) on the EC2 host
- Reverse proxy (Nginx or Caddy) terminates TLS on ports 80/443
- `3000` and `8000` are bound to `127.0.0.1` only (see `docker-compose.prod.yml`)

## Files

- `deploy/nginx/orbito.conf`: Nginx vhost template for `orbito.cc` and `api.orbito.cc`
- `deploy/caddy/Caddyfile`: Caddy template (automatic TLS)
- `deploy/systemd/orbito-compose.service`: systemd unit template to keep Compose up on reboot

