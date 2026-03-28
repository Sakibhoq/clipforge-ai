import os
import re
import threading
import hmac
from contextlib import asynccontextmanager
from collections import defaultdict, deque
from time import time
from dotenv import load_dotenv

# Load backend/.env when present.
# In containerized runtime main.py lives at /app/main.py, so backend .env is /app/.env.
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from routers import auth, upload, jobs, health, clips, billing, oauth, social, automations, storefront, contact, settings, labs
from routers import storage as storage_router
from routers import upload_register
from core.db_init import init_db

# ---------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------
_social_dispatch_stop = threading.Event()
_social_dispatch_thread: threading.Thread | None = None


def _social_dispatch_enabled() -> bool:
    return (os.getenv("SOCIAL_DISPATCH_ENABLED") or "1").strip().lower() in {"1", "true", "yes", "on"}


def _social_dispatch_loop() -> None:
    interval = max(5, int((os.getenv("SOCIAL_DISPATCH_INTERVAL_SECONDS") or "20").strip()))
    batch = max(1, min(100, int((os.getenv("SOCIAL_DISPATCH_BATCH_SIZE") or "20").strip())))

    while not _social_dispatch_stop.is_set():
        try:
            processed = social.dispatch_due_posts_global(limit=batch)
            if processed:
                print(f"[social-dispatch] processed={processed}")
        except Exception as e:
            print(f"[social-dispatch] error: {e}")
        _social_dispatch_stop.wait(interval)

def _startup_db() -> None:
    global _social_dispatch_thread
    # Keep DB setup in startup so local SQLite/dev environments self-initialize on boot.
    init_db()
    if _social_dispatch_enabled() and (_social_dispatch_thread is None or not _social_dispatch_thread.is_alive()):
        _social_dispatch_stop.clear()
        _social_dispatch_thread = threading.Thread(target=_social_dispatch_loop, name="social-dispatch", daemon=True)
        _social_dispatch_thread.start()


def _shutdown_background_workers() -> None:
    _social_dispatch_stop.set()
    if _social_dispatch_thread is not None and _social_dispatch_thread.is_alive():
        _social_dispatch_thread.join(timeout=2.0)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # FastAPI lifespan replaces deprecated on_event hooks and keeps startup/shutdown work paired together.
    _startup_db()
    try:
        yield
    finally:
        _shutdown_background_workers()


app = FastAPI(title="Orbito API", lifespan=lifespan)

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

AUTH_COOKIE_NAME = "cf_token"
CSRF_COOKIE_NAME = "cf_csrf"
CSRF_HEADER_NAME = "x-csrf-token"


def _parse_host(value: str) -> str:
    host = re.sub(r"^https?://", "", (value or "").strip()).split("/")[0].lower().strip()
    # Normalize host[:port] to host for TrustedHost matching.
    if host.startswith("["):
        return host
    return host.split(":")[0].strip()


def _build_trusted_hosts() -> list[str]:
    if APP_ENV != "production":
        return []

    explicit = [h.strip() for h in (os.getenv("TRUSTED_HOSTS") or "").split(",") if h.strip()]
    if explicit:
        return explicit

    hosts = {"localhost", "127.0.0.1"}
    # Internal docker service DNS names used for server-to-server relays.
    hosts.update({"backend", "frontend", "worker", "labs-backend", "labs-frontend", "labs-worker"})

    # Allow additional internal hosts via env (comma-separated).
    internal_extra = [h.strip() for h in (os.getenv("INTERNAL_TRUSTED_HOSTS") or "").split(",") if h.strip()]
    hosts.update(internal_extra)

    # Derive trusted internal hosts from common bridge origin env vars.
    for env_key in (
        "ORBITO_API_BASE",
        "LABS_ORBITO_API_BASE",
        "LABS_RUNTIME_API_URL",
        "LABS_INTERNAL_API_ORIGIN",
    ):
        derived = _parse_host(os.getenv(env_key) or "")
        if derived:
            hosts.add(derived)
    frontend_host = _parse_host(FRONTEND_ORIGIN)
    if frontend_host:
        hosts.add(frontend_host)
        if frontend_host.startswith("app."):
            root = frontend_host[len("app."):]
            hosts.update({f"api.{root}", f"*.api.{root}", f"*.{frontend_host}"})
        elif frontend_host.startswith("www."):
            root = frontend_host[len("www."):]
            hosts.update({f"app.{root}", f"api.{root}", f"*.{root}", f"*.app.{root}", f"*.api.{root}"})
        else:
            hosts.update({f"app.{frontend_host}", f"api.{frontend_host}", f"*.{frontend_host}", f"*.app.{frontend_host}", f"*.api.{frontend_host}"})

        if COOKIE_DOMAIN:
            base = COOKIE_DOMAIN.lstrip(".").lower()
            if base:
                hosts.update({base, f"*.{base}", f"app.{base}", f"api.{base}", f"*.app.{base}", f"*.api.{base}"})

    return sorted(h for h in hosts if h)


def _extract_client_ip(scope: Scope, request_headers: Headers) -> str:
    xff = request_headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip() or "unknown"
    xri = request_headers.get("x-real-ip")
    if xri:
        return xri.strip()
    return str((scope.get("client") or ("unknown", ""))[0])


def _is_csrf_required(path: str) -> bool:
    if path.startswith("/auth/login"):
        return False
    if path.startswith("/auth/register"):
        return False
    if path.startswith("/auth/forgot-password"):
        return False
    if path.startswith("/auth/reset-password"):
        return False
    if path.startswith("/auth/oauth/"):
        return False
    if path.startswith("/billing/webhook"):
        return False
    if path.startswith("/storage/local-upload"):
        return False
    return True


def _rate_limit_rule(method: str, path: str) -> tuple[int, int] | None:
    if method != "POST":
        return None

    if path.startswith("/auth/login"):
        return (10, 60)
    if path.startswith("/auth/register"):
        return (5, 60)
    if path.startswith("/auth/forgot-password"):
        return (5, 60)
    if path.startswith("/auth/reset-password"):
        return (8, 60)
    if path.startswith("/auth/password"):
        return (8, 60)
    if path.startswith("/billing/webhook"):
        return None
    if path.startswith("/storage/"):
        return (30, 60)
    if path.startswith("/uploads/"):
        return (30, 60)
    if path.startswith("/jobs/"):
        return (20, 60)
    if path.startswith("/clips/"):
        return (40, 60)
    if path.startswith("/social/"):
        return (20, 60)
    if path.startswith("/settings/"):
        return (20, 60)
    if path.startswith("/auth/"):
        return (25, 60)
    if path.startswith("/billing/"):
        return (20, 60)
    if path.startswith("/labs/"):
        return (20, 60)
    return (20, 60)


class SecurityPolicyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._requests: defaultdict[str, deque[float]] = defaultdict(deque)

    def _is_mutating(self, method: str) -> bool:
        return method in {"POST", "PUT", "PATCH", "DELETE"}

    def _is_rate_limited(self, key: str, limit: int, window: int) -> bool:
        now = time()
        queue = self._requests[key]
        cutoff = now - window
        while queue and queue[0] < cutoff:
            queue.popleft()
        if len(queue) >= limit:
            return True
        queue.append(now)
        return False

    async def dispatch(self, request, call_next):
        method = request.method.upper()
        path = request.url.path

        if APP_ENV == "production":
            headers = request.headers
            if method == "OPTIONS":
                return await call_next(request)

            if self._is_mutating(method):
                rule = _rate_limit_rule(method, path)
                if rule:
                    limit, window = rule
                    key = f"rl:{_extract_client_ip(request.scope, headers)}:{method}:{path}"
                    if self._is_rate_limited(key, limit=limit, window=window):
                        return JSONResponse(
                            status_code=429,
                            content={"detail": "Too many requests. Please retry in a little while."},
                        )

                if _is_csrf_required(path):
                    if request.cookies.get(AUTH_COOKIE_NAME):
                        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME, "")
                        csrf_header = request.headers.get(CSRF_HEADER_NAME, "")
                        if (not csrf_cookie) or (not csrf_header) or not hmac.compare_digest(csrf_cookie, csrf_header):
                            return JSONResponse(
                                status_code=403,
                                content={"detail": "CSRF validation failed. Refresh the page and try again."},
                            )

        return await call_next(request)

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

app.add_middleware(SecurityPolicyMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
trusted_hosts = _build_trusted_hosts()
if trusted_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)

def _scope_is_https(scope: Scope) -> bool:
    headers = Headers(scope=scope)
    xf_proto = (headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if xf_proto:
        return xf_proto == "https"
    return str(scope.get("scheme") or "").lower() == "https"


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if APP_ENV == "production" and _scope_is_https(scope):
                    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
                headers["X-Content-Type-Options"] = "nosniff"
                headers["X-Frame-Options"] = "DENY"
                headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
                headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
                headers["Cross-Origin-Opener-Policy"] = "same-origin"
                headers["Cross-Origin-Resource-Policy"] = "same-site"
            await send(message)

        await self.app(scope, receive, send_wrapper)


app.add_middleware(SecurityHeadersMiddleware)

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
app.include_router(labs.router)
