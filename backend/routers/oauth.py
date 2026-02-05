from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time
from typing import Dict, Optional
from urllib.parse import urlencode

import jwt
import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.config import settings
from core.database import SessionLocal
from models.user import User
from routers.auth import cookie_options, create_token, set_auth_cookie

router = APIRouter(prefix="/auth/oauth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

OAUTH_CTX_COOKIE = "cf_oauth_ctx"
OAUTH_CTX_TTL_SECONDS = 10 * 60  # 10 minutes
PUBLIC_API_BASE = os.getenv("PUBLIC_API_BASE") or os.getenv("API_BASE_URL")


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
        "auth_url": "https://www.facebook.com/v18.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v18.0/oauth/access_token",
        "userinfo_url": "https://graph.facebook.com/me",
        "scopes": ["email", "public_profile"],
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

# Limit sign-in providers (launch-safe). Default to Google-only.
ENABLED_PROVIDERS = {
    p.strip().lower()
    for p in (os.getenv("OAUTH_ENABLED_PROVIDERS") or "google").split(",")
    if p.strip()
}


def _provider_conf(provider: str) -> Dict[str, object]:
    if provider not in ENABLED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    p = PROVIDERS.get(provider)
    if not p:
        raise HTTPException(status_code=404, detail="Unknown provider")
    return p


def _client_id(provider: str) -> Optional[str]:
    return os.getenv(f"OAUTH_{provider.upper()}_CLIENT_ID")


def _client_secret(provider: str) -> Optional[str]:
    return os.getenv(f"OAUTH_{provider.upper()}_CLIENT_SECRET")


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


def _set_oauth_ctx_cookie(response: JSONResponse, request: Request, ctx: dict):
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
    )


def _clear_oauth_ctx_cookie(response: RedirectResponse, request: Request):
    opts = cookie_options(request)
    response.delete_cookie(
        key=OAUTH_CTX_COOKIE,
        path=opts["path"],
        secure=opts["secure"],
        samesite=opts["samesite"],
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


@router.post("/{provider}/start")
def oauth_start(
    provider: str,
    request: Request,
    payload: OAuthStartRequest,
):
    conf = _require_provider_ready(provider)

    client_id = _client_id(provider)
    if not client_id:
        raise HTTPException(status_code=400, detail="OAuth client not configured")

    state = secrets.token_urlsafe(24)
    verifier = _code_verifier()
    challenge = _code_challenge(verifier)

    redirect_uri = _redirect_uri(request, provider)

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": " ".join(conf.get("scopes", [])),
        "state": state,
    }

    # PKCE (default on)
    if conf.get("pkce", True):
        params["code_challenge"] = challenge
        params["code_challenge_method"] = "S256"

    # Provider-specific auth params
    if provider == "apple":
        params["response_mode"] = "query"
    if provider in {"google", "youtube"}:
        params["access_type"] = "offline"
        params["prompt"] = "consent"

    auth_url = conf["auth_url"]
    url = f"{auth_url}?{urlencode(params)}"

    resp = JSONResponse({"url": url})
    ctx = {
        "provider": provider,
        "state": state,
        "code_verifier": verifier,
        "next": _safe_next_path(payload.next),
        "iat": int(time.time()),
    }
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

    token_resp = requests.post(
        conf["token_url"],
        data=token_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=20,
    )
    if token_resp.status_code >= 400:
        raise HTTPException(status_code=400, detail="OAuth token exchange failed")

    token_json = token_resp.json()
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
        userinfo_resp = requests.get(
            conf["userinfo_url"],
            params={"fields": "id,name,email", "access_token": access_token},
            timeout=20,
        )
        userinfo = userinfo_resp.json() if userinfo_resp.status_code < 400 else {}
    elif provider == "tiktok":
        userinfo_resp = requests.get(
            conf["userinfo_url"],
            params={"fields": "open_id,union_id,display_name,avatar_url"},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
        userinfo = userinfo_resp.json() if userinfo_resp.status_code < 400 else {}
    elif provider == "instagram":
        userinfo_resp = requests.get(
            conf["userinfo_url"],
            params={"fields": "id,username", "access_token": access_token},
            timeout=20,
        )
        userinfo = userinfo_resp.json() if userinfo_resp.status_code < 400 else {}
    else:
        userinfo_resp = requests.get(
            conf["userinfo_url"],
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
        userinfo = userinfo_resp.json() if userinfo_resp.status_code < 400 else {}

    email = None
    if isinstance(userinfo, dict):
        email = userinfo.get("email")
    if not email:
        raise HTTPException(
            status_code=400,
            detail=f"{conf.get('label')} did not return an email. Enable email scope or use another login method.",
        )

    # Find or create user
    user = db.query(User).filter(User.email == email).first()
    if not user:
        random_pw = secrets.token_urlsafe(20)
        user = User(
            email=email,
            hashed_password=pwd_context.hash(random_pw),
            plan="free",
            credits=0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Issue session cookie
    token = create_token(user.email)
    next_path = _safe_next_path(ctx.get("next"))
    base = (os.getenv("FRONTEND_BASE_URL") or "http://localhost:3000").rstrip("/")
    redirect_to = f"{base}{next_path}"

    response = RedirectResponse(url=redirect_to)
    set_auth_cookie(response, request, token)
    _clear_oauth_ctx_cookie(response, request)
    return response
