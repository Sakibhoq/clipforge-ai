import os
import re
from dotenv import load_dotenv

# Load backend/.env when present.
# In containerized runtime main.py lives at /app/main.py, so backend .env is /app/.env.
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, upload, jobs, health, clips, billing, oauth, social, automations, storefront, contact, settings
from routers import storage as storage_router
from routers import upload_register
from core.db_init import init_db

# ---------------------------------------------------------
# Feature flags
# ---------------------------------------------------------
ENABLE_YOUTUBE_INGEST = (os.getenv("ENABLE_YOUTUBE_INGEST") or "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# ---------------------------------------------------------
# App
# ---------------------------------------------------------
app = FastAPI(title="Clipforge API")

# ---------------------------------------------------------
# DB init (sqlite dev convenience)
# ---------------------------------------------------------
@app.on_event("startup")
def _startup_db() -> None:
    init_db()

# ---------------------------------------------------------
# Optional: YouTube automated ingest (DISABLED by default in prod)
# ---------------------------------------------------------
if ENABLE_YOUTUBE_INGEST:
    from routers.youtube_ingest import router as youtube_router

    app.include_router(youtube_router)

# ---------------------------------------------------------
# CORS (cookie auth)
# ---------------------------------------------------------
APP_ENV = (os.getenv("APP_ENV") or "development").lower().strip()
FRONTEND_ORIGIN = (os.getenv("FRONTEND_ORIGIN") or "http://localhost:3000").strip()
COOKIE_DOMAIN = (os.getenv("COOKIE_DOMAIN") or "").strip()
DEV_CODESPACES_ORIGIN_REGEX = (
    os.getenv("DEV_CODESPACES_ORIGIN_REGEX")
    or r"^https://[a-z0-9-]+-3000\.app\.github\.dev$"
)

allow_origins = [FRONTEND_ORIGIN] if FRONTEND_ORIGIN else []
allow_origin_regex = None

FRONTEND_ORIGIN_REGEX = (os.getenv("FRONTEND_ORIGIN_REGEX") or "").strip()
regexes: list[str] = []
if FRONTEND_ORIGIN_REGEX:
    regexes.append(FRONTEND_ORIGIN_REGEX)

# Always allow cookie-domain subdomains when configured (works for prod + staging).
if COOKIE_DOMAIN:
    root = COOKIE_DOMAIN.lstrip(".")
    if root:
        regexes.append(rf"^https://([a-z0-9-]+\.)?{re.escape(root)}$")

if APP_ENV != "production":
    for o in ["http://localhost:3000", "http://127.0.0.1:3000"]:
        if o not in allow_origins:
            allow_origins.append(o)
    regexes.append(DEV_CODESPACES_ORIGIN_REGEX)

if not regexes and FRONTEND_ORIGIN.startswith("https://"):
    # Fallback: allow subdomains of the frontend root.
    root = FRONTEND_ORIGIN.replace("https://", "", 1)
    root = root.replace("app.", "", 1).replace("www.", "", 1)
    regexes.append(rf"^https://([a-z0-9-]+\.)?{re.escape(root)}$")

if regexes:
    allow_origin_regex = "|".join(f"(?:{r})" for r in regexes)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# Security headers
# ---------------------------------------------------------
def _request_is_https(request: Request) -> bool:
    xf_proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if xf_proto:
        return xf_proto == "https"
    return request.url.scheme == "https"


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    if APP_ENV == "production" and _request_is_https(request):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-site"
    return response

# ---------------------------------------------------------
# Routes
# ---------------------------------------------------------
@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "backend",
        "message": "Backend is running. Visit /docs for API documentation.",
    }

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(contact.router)
app.include_router(settings.router)
app.include_router(oauth.router)
app.include_router(social.router)
app.include_router(automations.router)
app.include_router(storefront.router)

app.include_router(upload.router)
app.include_router(upload_register.router)

app.include_router(jobs.router)
app.include_router(storage_router.router)
app.include_router(clips.router)
app.include_router(billing.router)
