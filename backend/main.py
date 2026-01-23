import os
from dotenv import load_dotenv

# Load repo-root .env
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(BASE_DIR, ".env"))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, upload, jobs, health, clips, billing
from routers import storage as storage_router
from routers import upload_register

# ---------------------------------------------------------
# App
# ---------------------------------------------------------
app = FastAPI(title="Clipforge API")

# ---------------------------------------------------------
# CORS (cookie auth)
# ---------------------------------------------------------
APP_ENV = (os.getenv("APP_ENV") or "development").lower().strip()
FRONTEND_ORIGIN = (os.getenv("FRONTEND_ORIGIN") or "http://localhost:3000").strip()
DEV_CODESPACES_ORIGIN_REGEX = (
    os.getenv("DEV_CODESPACES_ORIGIN_REGEX")
    or r"^https://[a-z0-9-]+-3000\.app\.github\.dev$"
)

allow_origins = [FRONTEND_ORIGIN]
allow_origin_regex = None

if APP_ENV != "production":
    for o in ["http://localhost:3000", "http://127.0.0.1:3000"]:
        if o not in allow_origins:
            allow_origins.append(o)
    allow_origin_regex = DEV_CODESPACES_ORIGIN_REGEX

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
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
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

app.include_router(upload.router)
app.include_router(upload_register.router)

app.include_router(jobs.router)
app.include_router(storage_router.router)
app.include_router(clips.router)
app.include_router(billing.router)
