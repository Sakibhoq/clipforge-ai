from __future__ import annotations

import base64
import hashlib
import os
import re
import secrets
import time
from typing import Dict, Optional
from urllib.parse import urlencode

import jwt
import requests
from requests import RequestException
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.config import settings
from core.database import SessionLocal
from models.user import User
from routers.auth import cookie_options, create_token, set_auth_cookie
from services.mailer import send_welcome_email

router = APIRouter(prefix="/auth/oauth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

OAUTH_CTX_COOKIE = "cf_oauth_ctx"
OAUTH_CTX_TTL_SECONDS = 10 * 60  # 10 minutes
PUBLIC_API_BASE = os.getenv("PUBLIC_API_BASE") or os.getenv("API_BASE_URL")

LEGACY_SYNTHETIC_EMAIL_DOMAIN = "oauth.orbito.local"


def _synthetic_email_domain() -> str:
    """
    Domain used for synthetic OAuth emails when a provider does not return an email.

    IMPORTANT:
    - Must be accepted by `email_validator` because other endpoints (e.g. /auth/me)
      use Pydantic EmailStr validation.
    - Historically we used oauth.orbito.local, but `.local` is rejected as reserved.
    """
    raw = (os.getenv("OAUTH_SYNTHETIC_EMAIL_DOMAIN") or "oauth.orbito.example").strip().lower()
    raw = raw.lstrip("@").strip()
    return raw or "oauth.orbito.example"


class OAuthStartRequest(BaseModel):
    next: Optional[str] = None


# ---------------------------------------------------------
# Provider registry (config via env)
# ---------------------------------------------------------

PROVIDERS: Dict[str, Dict[str, object]] = {
    "google": {
        "label": "Google",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        "scopes": ["openid", "email", "profile"],
        "pkce": True,
    },
    # YouTube uses Google OAuth with extended scopes
    "youtube": {
        "label": "YouTube",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        "scopes": ["openid", "email", "profile", "https://www.googleapis.com/auth/youtube.readonly"],
        "pkce": True,
    },
    "apple": {
        "label": "Apple",
        "auth_url": "https://appleid.apple.com/auth/authorize",
        "token_url": "https://appleid.apple.com/auth/token",
        "userinfo_url": None,
        "scopes": ["name", "email"],
        "pkce": True,
    },
    "facebook": {
        "label": "Facebook",
        "auth_url": "https://www.facebook.com/v20.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v20.0/oauth/access_token",
        "userinfo_url": "https://graph.facebook.com/me",
        # Keep login scopes minimal by default.
        # Some Meta app configurations reject `email` during review/setup.
        # We can still identify users by provider id and synthesize account email if needed.
        "scopes": ["public_profile"],
        "pkce": True,
    },
    "discord": {
        "label": "Discord",
        "auth_url": "https://discord.com/api/oauth2/authorize",
        "token_url": "https://discord.com/api/oauth2/token",
        "userinfo_url": "https://discord.com/api/users/@me",
        "scopes": ["identify", "email"],
        "pkce": True,
    },
    "tiktok": {
        "label": "TikTok",
        "auth_url": "https://www.tiktok.com/v2/auth/authorize/",
        "token_url": "https://open.tiktokapis.com/v2/oauth/token/",
        "userinfo_url": "https://open.tiktokapis.com/v2/user/info/",
        "scopes": ["user.info.basic"],
        "pkce": True,
        "client_id_param": "client_key",
        "client_secret_param": "client_secret",
    },
    "instagram": {
        "label": "Instagram",
        "auth_url": "https://api.instagram.com/oauth/authorize",
        "token_url": "https://api.instagram.com/oauth/access_token",
        "userinfo_url": "https://graph.instagram.com/me",
        "scopes": ["user_profile"],
        "pkce": True,
    },
}

# Limit sign-in providers. If creds are present for key launch providers,
# auto-enable them so UI doesn't get stuck on Google-only by default.
ENABLED_PROVIDERS = {
    p.strip().lower()
    for p in (os.getenv("OAUTH_ENABLED_PROVIDERS") or "google").split(",")
    if p.strip()
}
for _p in ("google", "facebook", "instagram", "tiktok"):
    if os.getenv(f"OAUTH_{_p.upper()}_CLIENT_ID") and os.getenv(f"OAUTH_{_p.upper()}_CLIENT_SECRET"):
        ENABLED_PROVIDERS.add(_p)

def _safe_err_body(resp: requests.Response) -> str:
    """
    Best-effort extraction of an error message from OAuth providers without
    leaking tokens. Keep this short and safe for logs/UI.
    """
    try:
        data = resp.json()
        if isinstance(data, dict):
            # Common OAuth error shapes
            for k in ("error_description", "error", "message", "detail"):
                v = data.get(k)
                if isinstance(v, str) and v.strip():
                    return v.strip()[:500]
        return str(data)[:500]
    except Exception:
        txt = (resp.text or "").strip()
        return txt[:500]


def _provider_profile(provider: str, userinfo: dict) -> dict:
    if not isinstance(userinfo, dict):
        return {}
    if provider == "tiktok":
        data = userinfo.get("data")
        if isinstance(data, dict):
            user = data.get("user")
            if isinstance(user, dict):
                return user
        return {}
    return userinfo


def _provider_unique_id(provider: str, userinfo: dict) -> Optional[str]:
    profile = _provider_profile(provider, userinfo)
    if provider == "tiktok":
        return profile.get("open_id") or profile.get("union_id")
    return (
        profile.get("sub")
        or profile.get("id")
        or profile.get("user_id")
    )


def _provider_display_name(provider: str, userinfo: dict) -> Optional[str]:
    profile = _provider_profile(provider, userinfo)
    name = (
        profile.get("name")
        or profile.get("display_name")
        or profile.get("username")
    )
    if name:
        return str(name)
    given = profile.get("given_name")
    family = profile.get("family_name")
    if given or family:
        return " ".join([p for p in [given, family] if p]).strip() or None
    return None


def _synthetic_oauth_email(provider: str, provider_id: str) -> str:
    safe = re.sub(r"[^a-z0-9._-]+", "-", provider_id.lower()).strip("._-")
    safe = (safe or "user")[:24]
    digest = hashlib.sha1(provider_id.encode("utf-8")).hexdigest()[:10]
    return f"{provider}_{safe}_{digest}@{_synthetic_email_domain()}"


def _provider_conf(provider: str) -> Dict[str, object]:
    if provider not in ENABLED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    p = PROVIDERS.get(provider)
    if not p:
        raise HTTPException(status_code=404, detail="Unknown provider")
    return p


def _client_id(provider: str) -> Optional[str]:
    # Meta often requires a separate "consumer" app (Facebook Login) for auth,
    # while a "business" app is used for publishing scopes in /social/connect.
    # Support separate creds so auth login doesn't break publishing integration.
    if provider == "facebook":
        return os.getenv("OAUTH_FACEBOOK_LOGIN_CLIENT_ID") or os.getenv("OAUTH_FACEBOOK_CLIENT_ID")
    return os.getenv(f"OAUTH_{provider.upper()}_CLIENT_ID")


def _client_secret(provider: str) -> Optional[str]:
    if provider == "facebook":
        return os.getenv("OAUTH_FACEBOOK_LOGIN_CLIENT_SECRET") or os.getenv("OAUTH_FACEBOOK_CLIENT_SECRET")
    return os.getenv(f"OAUTH_{provider.upper()}_CLIENT_SECRET")


def _facebook_config_id() -> Optional[str]:
    v = (os.getenv("OAUTH_FACEBOOK_CONFIG_ID") or "").strip()
    return v or None


def _facebook_use_config_id() -> bool:
    # Login flow is intentionally kept on explicit minimal scopes (public_profile)
    # to avoid Meta "Invalid Scopes" failures while app settings/review are in flux.
    # Keep config_id disabled here; use /social/connect for Meta business scopes.
    return False


def _require_provider_ready(provider: str) -> Dict[str, object]:
    conf = _provider_conf(provider)
    if not _client_id(provider) or not _client_secret(provider):
        raise HTTPException(status_code=400, detail=f"{conf.get('label')} OAuth not configured")
    return conf


def _safe_next_path(next_path: Optional[str]) -> str:
    if not next_path or not isinstance(next_path, str):
        return "/app"
    if not next_path.startswith("/"):
        return "/app"
    if next_path.startswith("//"):
        return "/app"
    return next_path


def _redirect_uri(request: Request, provider: str) -> str:
    if PUBLIC_API_BASE:
        return f"{PUBLIC_API_BASE.rstrip('/')}/auth/oauth/{provider}/callback"
    return str(request.url_for("oauth_callback", provider=provider))


def _base64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")


def _code_verifier() -> str:
    return _base64url(secrets.token_bytes(32))


def _code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return _base64url(digest)


def _set_oauth_ctx_cookie(response: Response, request: Request, ctx: dict):
    token = jwt.encode(ctx, settings.SECRET_KEY, algorithm="HS256")
    opts = cookie_options(request)
    response.set_cookie(
        key=OAUTH_CTX_COOKIE,
        value=token,
        max_age=OAUTH_CTX_TTL_SECONDS,
        path=opts["path"],
        httponly=opts["httponly"],
        secure=opts["secure"],
        samesite=opts["samesite"],
        domain=opts.get("domain"),
    )


def _clear_oauth_ctx_cookie(response: RedirectResponse, request: Request):
    opts = cookie_options(request)
    response.delete_cookie(
        key=OAUTH_CTX_COOKIE,
        path=opts["path"],
        secure=opts["secure"],
        samesite=opts["samesite"],
        domain=opts.get("domain"),
    )


def _decode_oauth_ctx(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")


# ---------------------------------------------------------
# DB dependency
# ---------------------------------------------------------


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------
# Routes
# ---------------------------------------------------------

@router.get("/providers")
def oauth_providers():
    """
    Returns which OAuth providers are configured.
    """
    out = []
    for key, conf in PROVIDERS.items():
        if key not in ENABLED_PROVIDERS:
            continue
        out.append(
            {
                "provider": key,
                "label": conf.get("label"),
                "configured": bool(_client_id(key) and _client_secret(key)),
            }
        )
    return {"providers": out}

def _build_oauth_start(provider: str, request: Request, next_path: Optional[str]) -> tuple[str, dict]:
    conf = _require_provider_ready(provider)

    client_id = _client_id(provider)
    if not client_id:
        raise HTTPException(status_code=400, detail="OAuth client not configured")

    state = secrets.token_urlsafe(24)
    verifier = _code_verifier()
    challenge = _code_challenge(verifier)

    redirect_uri = _redirect_uri(request, provider)

    client_id_param = str(conf.get("client_id_param", "client_id"))
    params = {
        "response_type": "code",
        client_id_param: client_id,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    scopes = conf.get("scopes", [])
    if scopes:
        params["scope"] = " ".join(scopes)

    if conf.get("pkce", True):
        params["code_challenge"] = challenge
        params["code_challenge_method"] = "S256"

    if provider == "apple":
        params["response_mode"] = "query"
    if provider in {"google", "youtube"}:
        params["access_type"] = "offline"
        params["prompt"] = "consent"
    if provider == "facebook" and _facebook_use_config_id():
        # Disabled by default; kept for future compatibility.
        config_id = _facebook_config_id()
        if config_id:
            params["config_id"] = config_id
            params["override_default_response_type"] = "true"

    auth_url = conf["auth_url"]
    url = f"{auth_url}?{urlencode(params)}"

    ctx = {
        "provider": provider,
        "state": state,
        "code_verifier": verifier,
        "next": _safe_next_path(next_path),
        "iat": int(time.time()),
    }
    return url, ctx


@router.get("/{provider}/start")
def oauth_start_get(
    provider: str,
    request: Request,
    next: Optional[str] = None,
):
    url, ctx = _build_oauth_start(provider, request, next)
    resp = RedirectResponse(url=url, status_code=307)
    _set_oauth_ctx_cookie(resp, request, ctx)
    return resp


@router.post("/{provider}/start")
def oauth_start(
    provider: str,
    request: Request,
    payload: OAuthStartRequest,
):
    url, ctx = _build_oauth_start(provider, request, payload.next)
    resp = JSONResponse({"url": url})
    _set_oauth_ctx_cookie(resp, request, ctx)
    return resp


@router.get("/{provider}/callback", name="oauth_callback")
def oauth_callback(
    provider: str,
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    db: Session = Depends(get_db),
):
    conf = _require_provider_ready(provider)
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth code or state")

    ctx_token = request.cookies.get(OAUTH_CTX_COOKIE)
    if not ctx_token:
        raise HTTPException(status_code=400, detail="Missing OAuth context")

    ctx = _decode_oauth_ctx(ctx_token)
    if ctx.get("provider") != provider or ctx.get("state") != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch")

    client_id = _client_id(provider)
    client_secret = _client_secret(provider)
    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="OAuth client not configured")

    redirect_uri = _redirect_uri(request, provider)

    token_data = {
        conf.get("client_id_param", "client_id"): client_id,
        conf.get("client_secret_param", "client_secret"): client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    if conf.get("pkce", True) and ctx.get("code_verifier"):
        token_data["code_verifier"] = ctx["code_verifier"]

    try:
        token_resp = requests.post(
            conf["token_url"],
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=20,
        )
    except RequestException as e:
        # Network/DNS/TLS/timeouts. Avoid leaking secrets; just log error type.
        print(f"[oauth] token exchange request failed provider={provider} err={type(e).__name__}")
        raise HTTPException(status_code=502, detail="OAuth token exchange request failed")

    if token_resp.status_code >= 400:
        msg = _safe_err_body(token_resp)
        print(f"[oauth] token exchange failed provider={provider} status={token_resp.status_code} msg={msg!r}")
        raise HTTPException(status_code=400, detail="OAuth token exchange failed")

    try:
        token_json = token_resp.json()
    except Exception:
        print(f"[oauth] token exchange non-json response provider={provider} status={token_resp.status_code}")
        raise HTTPException(status_code=502, detail="OAuth token exchange returned an invalid response")
    access_token = token_json.get("access_token")
    id_token = token_json.get("id_token")

    if not access_token and not id_token:
        raise HTTPException(status_code=400, detail="OAuth token missing")

    userinfo = {}
    if provider == "apple":
        if not id_token:
            raise HTTPException(status_code=400, detail="Apple OAuth missing id_token")
        try:
            userinfo = jwt.decode(id_token, options={"verify_signature": False})
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid Apple id_token")
    elif provider == "facebook":
        try:
            userinfo_resp = requests.get(
                conf["userinfo_url"],
                params={"fields": "id,name,email", "access_token": access_token},
                timeout=20,
            )
        except RequestException as e:
            print(f"[oauth] userinfo request failed provider={provider} err={type(e).__name__}")
            raise HTTPException(status_code=502, detail="OAuth userinfo request failed")

        if userinfo_resp.status_code >= 400:
            msg = _safe_err_body(userinfo_resp)
            print(f"[oauth] userinfo failed provider={provider} status={userinfo_resp.status_code} msg={msg!r}")
            raise HTTPException(status_code=400, detail="OAuth userinfo request failed")

        try:
            userinfo = userinfo_resp.json()
        except Exception:
            raise HTTPException(status_code=502, detail="OAuth userinfo returned an invalid response")
    elif provider == "tiktok":
        try:
            userinfo_resp = requests.get(
                conf["userinfo_url"],
                params={"fields": "open_id,union_id,display_name,avatar_url"},
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=20,
            )
        except RequestException as e:
            print(f"[oauth] userinfo request failed provider={provider} err={type(e).__name__}")
            raise HTTPException(status_code=502, detail="OAuth userinfo request failed")

        if userinfo_resp.status_code >= 400:
            msg = _safe_err_body(userinfo_resp)
            print(f"[oauth] userinfo failed provider={provider} status={userinfo_resp.status_code} msg={msg!r}")
            raise HTTPException(status_code=400, detail="OAuth userinfo request failed")

        try:
            userinfo = userinfo_resp.json()
        except Exception:
            raise HTTPException(status_code=502, detail="OAuth userinfo returned an invalid response")
    elif provider == "instagram":
        try:
            userinfo_resp = requests.get(
                conf["userinfo_url"],
                params={"fields": "id,username", "access_token": access_token},
                timeout=20,
            )
        except RequestException as e:
            print(f"[oauth] userinfo request failed provider={provider} err={type(e).__name__}")
            raise HTTPException(status_code=502, detail="OAuth userinfo request failed")

        if userinfo_resp.status_code >= 400:
            msg = _safe_err_body(userinfo_resp)
            print(f"[oauth] userinfo failed provider={provider} status={userinfo_resp.status_code} msg={msg!r}")
            raise HTTPException(status_code=400, detail="OAuth userinfo request failed")

        try:
            userinfo = userinfo_resp.json()
        except Exception:
            raise HTTPException(status_code=502, detail="OAuth userinfo returned an invalid response")
    else:
        try:
            userinfo_resp = requests.get(
                conf["userinfo_url"],
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=20,
            )
        except RequestException as e:
            print(f"[oauth] userinfo request failed provider={provider} err={type(e).__name__}")
            raise HTTPException(status_code=502, detail="OAuth userinfo request failed")

        if userinfo_resp.status_code >= 400:
            msg = _safe_err_body(userinfo_resp)
            print(f"[oauth] userinfo failed provider={provider} status={userinfo_resp.status_code} msg={msg!r}")
            raise HTTPException(status_code=400, detail="OAuth userinfo request failed")

        try:
            userinfo = userinfo_resp.json()
        except Exception:
            raise HTTPException(status_code=502, detail="OAuth userinfo returned an invalid response")

    email = None
    provider_id = None
    name = None
    if isinstance(userinfo, dict):
        email = userinfo.get("email")
        provider_id = _provider_unique_id(provider, userinfo)
        name = _provider_display_name(provider, userinfo)

    # Some providers (notably TikTok/Instagram) do not provide email via OAuth.
    # Use a stable synthetic email keyed by provider account id so users can still sign in.
    if not email and provider_id:
        email = _synthetic_oauth_email(provider, str(provider_id))

    if not email:
        raise HTTPException(
            status_code=400,
            detail=f"{conf.get('label')} did not return an email or account id. Try another login method.",
        )

    # Find or create user
    email = str(email).strip()

    # Back-compat: older deployments used a `.local` synthetic email domain which is
    # rejected by `email_validator` (Pydantic EmailStr) and can break /auth/me.
    legacy_email = None
    synthetic_domain = _synthetic_email_domain()
    if email.lower().endswith(f"@{synthetic_domain}"):
        local = email[: -(len(synthetic_domain) + 1)]
        legacy_email = f"{local}@{LEGACY_SYNTHETIC_EMAIL_DOMAIN}"

    user = db.query(User).filter(User.email == email).first()
    if not user and legacy_email:
        user = db.query(User).filter(User.email == legacy_email).first()
        if user:
            # Migrate to the new synthetic domain if no conflict exists.
            conflict = db.query(User).filter(User.email == email).first()
            if not conflict:
                user.email = email
                db.commit()
    created_user = False
    if not user:
        random_pw = secrets.token_urlsafe(20)
        user = User(
            name=name,
            email=email,
            hashed_password=pwd_context.hash(random_pw),
            plan="free",
            credits=0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        created_user = True
    elif name and not getattr(user, "name", None):
        user.name = name
        db.commit()

    # Send welcome email only for Google OAuth signups.
    # Email/password signups are handled in /auth/register.
    if created_user and provider == "google":
        try:
            send_welcome_email(user.email, user.name)
        except Exception as exc:
            print(f"[oauth] welcome email skipped provider={provider} err={type(exc).__name__}")

    # Issue session cookie
    token = create_token(user.email)
    next_path = _safe_next_path(ctx.get("next"))
    base = (os.getenv("FRONTEND_BASE_URL") or "http://localhost:3000").rstrip("/")
    redirect_to = f"{base}{next_path}"

    response = RedirectResponse(url=redirect_to)
    set_auth_cookie(response, request, token)
    _clear_oauth_ctx_cookie(response, request)
    return response
