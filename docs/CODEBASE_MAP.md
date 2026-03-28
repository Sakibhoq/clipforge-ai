# Codebase Map

This repo contains two related products:

- `frontend/`, `backend/`, `worker/`: the main Orbito app.
- `clipforge-labs/frontend/`, `clipforge-labs/backend/`, `clipforge-labs/worker/`: the Labs app for AI generation and editing.

## Main Orbito App

- `frontend/app/`: App Router pages and route groups.
- `frontend/components/`: reusable UI pieces shared across pages.
- `frontend/lib/`: browser-side helpers such as API clients and plan utilities.
- `frontend/proxy.ts`: request-time redirects, security headers, auth routing, and host normalization.
- `frontend/next.config.ts`: rewrite rules and frontend build config.

- `backend/main.py`: FastAPI app startup and router registration.
- `backend/routers/`: HTTP API endpoints grouped by feature.
- `backend/models/`: SQLAlchemy models.
- `backend/services/`: service-layer helpers for integrations and shared backend behavior.
- `backend/tests/`: backend regression tests.

- `worker/`: background processing for clips and automations.

## Orbito Labs

- `clipforge-labs/frontend/app/`: Labs pages such as generate, clips, and editor entrypoints.
- `clipforge-labs/frontend/components/`: Labs-specific UI, including the editor workspace.
- `clipforge-labs/frontend/lib/`: Labs browser-side helpers.
- `clipforge-labs/frontend/proxy.ts`: route normalization, auth redirects, and security headers for Labs.
- `clipforge-labs/frontend/next.config.ts`: Labs rewrites and frontend build config.

- `clipforge-labs/backend/main.py`: Labs API startup and router registration.
- `clipforge-labs/backend/routers/generate.py`: Labs generation, prompt-helper, voice preview, continuity, and job creation.
- `clipforge-labs/backend/routers/editor.py`: Labs editor project CRUD and full timeline rendering.
- `clipforge-labs/backend/routers/clips.py`: clip listing, download, crop/export, and clip-level editing APIs.
- `clipforge-labs/backend/models/`: Labs database models.
- `clipforge-labs/backend/tests/`: Labs backend regression tests.

- `clipforge-labs/worker/worker.py`: Labs render/generation worker pipeline.

## High-Value Entry Points

- Main marketing and app shell:
  - `frontend/app/(marketing)/`
  - `frontend/app/app/`
- Labs generator and editor:
  - `clipforge-labs/frontend/app/app/generate/GenerateClient.tsx`
  - `clipforge-labs/frontend/components/editor/EditorWorkspace.tsx`
- Labs generation backend:
  - `clipforge-labs/backend/routers/generate.py`
  - `clipforge-labs/backend/routers/editor.py`

## Safe Cleanup Rule

Only treat generated caches as disposable by default:

- `.next/`
- `.pytest_cache/`
- `__pycache__/`

Do not delete source files unless imports, routes, tests, and runtime usage all prove they are unused.
