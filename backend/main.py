import os
from dotenv import load_dotenv

# Load repo-root .env (clipforge-ai/.env)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(BASE_DIR, ".env"))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

# If you deploy behind a proxy (Codespaces / render / nginx), this helps FastAPI
# understand the original scheme/host for cookies/redirects/logs.

from routers import auth, upload, jobs, health, clips, billing
from routers import storage as storage_router
from routers import upload_register

app = FastAPI(title="Clipforge API")

# =========================================================
# CORS (PRODUCTION-FIRST, cookie auth)
#
# - Cookie-based auth requires:
#     allow_credentials=True
#     allow_origins MUST be explicit (cannot be "*")
#
# - Production: allow ONLY your real frontend origin via FRONTEND_ORIGIN
# - Dev (Codespaces/local): allow localhost + Codespaces regex
#
# Env:
#   APP_ENV=production|development   (default: development)
#   FRONTEND_ORIGIN=https://clipforge.ai   (your real frontend)
#   DEV_CODESPACES_ORIGIN_REGEX=^https://...-3000\.app\.github\.dev$
# =========================================================
APP_ENV = (os.getenv("APP_ENV") or "development").lower().strip()
FRONTEND_ORIGIN = (os.getenv("FRONTEND_ORIGIN") or "http://localhost:3000").strip()
DEV_CODESPACES_ORIGIN_REGEX = (
    os.getenv("DEV_CODESPACES_ORIGIN_REGEX")
    or r"^https://[a-z0-9-]+-3000\.app\.github\.dev$"
)

allow_origins = [FRONTEND_ORIGIN]

# Only broaden in non-production for local/Codespaces dev
allow_origin_regex = None
if APP_ENV != "production":
    # Local dev convenience
    for o in ["http://localhost:3000", "http://127.0.0.1:3000"]:
        if o not in allow_origins:
            allow_origins.append(o)
    allow_origin_regex = DEV_CODESPACES_ORIGIN_REGEX

# Proxy headers first (safe)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.on_event("startup")
def on_startup():
    pass


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "backend",
        "message": "Backend is running. Visit /docs for API documentation.",
    }


# Routers
app.include_router(health.router)
app.include_router(auth.router)

app.include_router(upload.router)              # local upload (dev)
app.include_router(upload_register.router)     # register S3 upload

app.include_router(jobs.router)
app.include_router(storage_router.router)      # presign
app.include_router(clips.router)               # clips API
app.include_router(billing.router)             # billing (Stripe)
