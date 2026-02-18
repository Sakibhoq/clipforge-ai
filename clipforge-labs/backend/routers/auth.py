from fastapi import APIRouter, HTTPException, Depends, Response, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
import os
import re
import secrets
import time
import jwt

from email_validator import EmailNotValidError, validate_email

from core.database import SessionLocal
from models.user import User
from core.config import APP_ENV, settings
from services.mailer import send_welcome_email

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

COOKIE_NAME = "cf_token"
TOKEN_TTL_DAYS = 7
PASSWORD_MIN_LENGTH = 8

LEGACY_SYNTHETIC_EMAIL_DOMAIN = "oauth.orbito.local"


def _synthetic_email_domain() -> str:
    raw = (os.getenv("OAUTH_SYNTHETIC_EMAIL_DOMAIN") or "oauth.clipforge.example").strip().lower()
    raw = raw.lstrip("@").strip()
    return raw or "oauth.clipforge.example"


def _normalize_legacy_synthetic_email(email: str) -> str:
    s = (email or "").strip()
    legacy = f"@{LEGACY_SYNTHETIC_EMAIL_DOMAIN}"
    if s.lower().endswith(legacy):
        local = s[: -len(legacy)]
        return f"{local}@{_synthetic_email_domain()}"
    return s


def _validate_signup_email_or_400(email: str):
    """
    Launch hardening: reject obvious fake/test emails on signup.

    This is NOT a guarantee the mailbox exists, but it blocks common placeholders
    and reserved/special-use domains.
    """
    em = (email or "").strip()
    domain = em.rsplit("@", 1)[-1].strip().lower() if "@" in em else ""
    if not domain:
        raise HTTPException(status_code=400, detail="Enter a valid email address")

    # Block common placeholder/reserved domains.
    blocked_domains = {"test.com", "example.com", "example.org", "example.net"}
    blocked_tlds = {"local", "test", "invalid", "example"}
    tld = domain.rsplit(".", 1)[-1] if "." in domain else ""
    if domain in blocked_domains or tld in blocked_tlds:
        raise HTTPException(status_code=400, detail="Please use a real email address")

    # In production, also require basic deliverability checks (MX/A records).
    if APP_ENV == "production":
        try:
            validate_email(em, check_deliverability=True)
        except EmailNotValidError:
            raise HTTPException(status_code=400, detail="Please use a valid, deliverable email address")


# =========================
# DB
# =========================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =========================
# Schemas
# =========================
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class MeResponse(BaseModel):
    name: str | None = None
    email: EmailStr
    plan: str
    credits: int


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# =========================
# JWT
# =========================
def create_token(email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "iat": now,
        "exp": now + timedelta(days=TOKEN_TTL_DAYS),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        return email
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


# =========================
# Cookies (LAUNCH SAFE)
# =========================
def _is_https(request: Request) -> bool:
    """
    Proxy-safe https detection.
    Codespaces/nginx/ALB often terminates TLS upstream and forwards:
      X-Forwarded-Proto: https
    """
    xf_proto = (request.headers.get("x-forwarded-proto") or "").lower().strip()
    if xf_proto:
        # Some proxies send a comma-separated list; first entry wins.
        xf_proto = xf_proto.split(",")[0].strip()
        return xf_proto == "https"

    # RFC 7239 Forwarded: for=...;proto=https;host=...
    forwarded = (request.headers.get("forwarded") or "").lower()
    if "proto=" in forwarded:
        try:
            # take first segment
            first = forwarded.split(",")[0]
            parts = [p.strip() for p in first.split(";") if p.strip()]
            for p in parts:
                if p.startswith("proto="):
                    proto = p.split("=", 1)[1].strip().strip('"')
                    return proto == "https"
        except Exception:
            pass

    # Common proxy headers
    xf_ssl = (request.headers.get("x-forwarded-ssl") or "").lower().strip()
    if xf_ssl in {"on", "1", "true", "yes"}:
        return True

    xf_port = (request.headers.get("x-forwarded-port") or "").strip()
    if xf_port == "443":
        return True

    # Cloudflare: CF-Visitor: {"scheme":"https"}
    cf_visitor = (request.headers.get("cf-visitor") or "").lower()
    if "\"scheme\":\"https\"" in cf_visitor or "scheme=https" in cf_visitor:
        return True

    return request.url.scheme == "https"


def _needs_cross_site_cookie(request: Request) -> bool:
    """
    If frontend is on a different origin (Codespaces: -3000.app.github.dev) talking
    to backend (-8000.app.github.dev), we must use SameSite=None + Secure=True.
    """
    origin = (request.headers.get("origin") or "").lower()
    return ".app.github.dev" in origin


def _matched_cookie_domain(request: Request, domain: str | None) -> str | None:
    """
    Only apply COOKIE_DOMAIN when the request host matches that domain.
    Prevents dev/Codespaces from forcing cookies onto unrelated domains.
    """
    if not domain:
        return None

    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.hostname
        or ""
    ).lower()

    dom = domain.lstrip(".").lower()
    if host == dom or host.endswith(f".{dom}"):
        return domain
    return None


def cookie_options(request: Request):
    https = _is_https(request)
    cross_site = _needs_cross_site_cookie(request)
    domain = _matched_cookie_domain(request, settings.COOKIE_DOMAIN or None)

    # If a shared cookie domain is configured (e.g. .orbito.cc),
    # force SameSite=None to ensure subdomain requests always include the cookie.
    if domain and https:
        return {
            "httponly": True,
            "secure": True,
            "samesite": "none",
            "path": "/",
            "domain": domain,
        }

    # Codespaces / cross-origin cookie auth:
    #   SameSite=None AND Secure=True (browser requirement)
    if https and cross_site:
        opts = {"httponly": True, "secure": True, "samesite": "none", "path": "/"}
        if domain:
            opts["domain"] = domain
        return opts

    # Local http dev:
    #   - Secure=False (required)
    #   - SameSite must NOT be "none" without Secure, or modern browsers reject it.
    if not https:
        opts = {"httponly": True, "secure": False, "samesite": "lax", "path": "/"}
        if domain:
            opts["domain"] = domain
        return opts

    # Normal production https same-site:
    opts = {"httponly": True, "secure": True, "samesite": "lax", "path": "/"}
    if domain:
        opts["domain"] = domain
    return opts


def set_auth_cookie(response: Response, request: Request, token: str):
    """
    IMPORTANT FIX:
    - Use a real datetime Expires (RFC-compliant). Some browsers will ignore cookies
      if Expires isn't a valid HTTP-date.
    - Keep Max-Age for consistency.
    """
    opts = cookie_options(request)
    max_age = TOKEN_TTL_DAYS * 24 * 60 * 60
    expires_dt = datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age,
        expires=expires_dt,
        path=opts["path"],
        httponly=opts["httponly"],
        secure=opts["secure"],
        samesite=opts["samesite"],
        domain=opts.get("domain"),
    )


def clear_auth_cookie(response: Response, request: Request):
    opts = cookie_options(request)
    response.delete_cookie(
        key=COOKIE_NAME,
        path=opts["path"],
        secure=opts["secure"],
        samesite=opts["samesite"],
        domain=opts.get("domain"),
    )


def _is_strong_password(password: str) -> bool:
    s = password or ""
    if len(s) < PASSWORD_MIN_LENGTH:
        return False
    if not re.search(r"[A-Z]", s):
        return False
    if not re.search(r"[a-z]", s):
        return False
    if not re.search(r"[0-9]", s):
        return False
    if not re.search(r"[^A-Za-z0-9]", s):
        return False
    return True


def _validate_password_or_400(password: str):
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password too long")

    if not _is_strong_password(password):
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least 8 characters and include at least 1 uppercase letter, "
                "1 lowercase letter, 1 number, and 1 special character."
            ),
        )


# =========================
# Auth dependency
# =========================
def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    email = decode_token(token)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        normalized = _normalize_legacy_synthetic_email(email)
        if normalized != email:
            user = db.query(User).filter(User.email == normalized).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Back-compat: migrate legacy synthetic OAuth emails off `.local` so /auth/me
    # (EmailStr response) and billing can work reliably.
    migrated = _normalize_legacy_synthetic_email(getattr(user, "email", ""))
    if migrated and migrated != getattr(user, "email", ""):
        conflict = db.query(User).filter(User.email == migrated).first()
        if not conflict:
            user.email = migrated
            db.commit()

    if not getattr(user, "is_active", True):
        raise HTTPException(status_code=401, detail="Account disabled")

    return user


# =========================
# Routes
# =========================
@router.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    password = (data.password or "").strip()
    name = (data.name or "").strip() or None
    email = str(data.email).strip()

    _validate_password_or_400(password)

    _validate_signup_email_or_400(email)

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="User already exists")

    # ✅ IMPORTANT: registering does NOT grant credits
    user = User(
        name=name,
        email=email,
        hashed_password=pwd_context.hash(password),
        plan="free",
        credits=0,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    # Fire-and-forget transactional welcome email.
    try:
        send_welcome_email(user.email, user.name)
    except Exception as exc:
        print(f"[auth] welcome email skipped: {type(exc).__name__}")

    return {"ok": True}


@router.post("/login")
def login(
    data: LoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not pwd_context.verify(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not getattr(user, "is_active", True):
        raise HTTPException(status_code=401, detail="Account disabled")

    token = create_token(user.email)
    set_auth_cookie(response, request, token)

    return {"ok": True}


@router.post("/logout")
def logout(response: Response, request: Request):
    clear_auth_cookie(response, request)
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)):
    return MeResponse(
        name=getattr(current_user, "name", None),
        email=current_user.email,
        plan=current_user.plan,
        credits=current_user.credits,
    )


@router.post("/password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not pwd_context.verify(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid password")

    new_password = (data.new_password or "").strip()
    if not new_password:
        raise HTTPException(status_code=400, detail="Missing new password")

    _validate_password_or_400(new_password)

    current_user.hashed_password = pwd_context.hash(new_password)
    db.commit()

    return {"ok": True}


@router.post("/delete")
def delete_account(
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Soft-delete account:
      - tombstone email to prevent re-use
      - disable account + wipe credits
      - clear auth cookie
    """
    tombstone = f"deleted+{current_user.id}+{int(time.time())}@orbi.to"
    current_user.email = tombstone
    current_user.is_active = False
    current_user.credits = 0
    current_user.plan = "free"
    current_user.trial_used = True
    current_user.stripe_customer_id = None
    current_user.last_stripe_event_id = None
    current_user.hashed_password = pwd_context.hash(secrets.token_urlsafe(32))

    db.commit()
    clear_auth_cookie(response, request)
    return {"ok": True}
