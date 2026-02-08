from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from urllib.parse import urlencode

import jwt
import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.database import SessionLocal
from models.user import User
from models.social_account import SocialAccount
from models.social_post import SocialPost
from models.clip import Clip
from models.upload import Upload
from routers.auth import get_current_user, cookie_options
from storage import get_storage

router = APIRouter(prefix="/social", tags=["social"])

SOCIAL_CTX_COOKIE = "cf_social_ctx"
SOCIAL_CTX_TTL_SECONDS = 10 * 60


# ---------------------------------------------------------
# Provider config (connect scopes)
# ---------------------------------------------------------

PROVIDERS: Dict[str, Dict[str, Any]] = {
    "youtube": {
        "label": "YouTube",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        "scopes": [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/youtube.upload",
        ],
        "pkce": True,
    },
    "tiktok": {
        "label": "TikTok",
        "auth_url": "https://www.tiktok.com/v2/auth/authorize/",
        "token_url": "https://open.tiktokapis.com/v2/oauth/token/",
        "userinfo_url": "https://open.tiktokapis.com/v2/user/info/",
        "scopes": ["user.info.basic", "video.upload"],
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


def _allowed_autopost_providers() -> set:
    raw = (os.getenv("AUTOPOST_PROVIDERS") or "youtube").strip()
    return {p.strip().lower() for p in raw.split(",") if p.strip()}


def _provider_conf(provider: str) -> Dict[str, Any]:
    p = PROVIDERS.get(provider)
    if not p:
        raise HTTPException(status_code=404, detail="Unknown provider")
    return p


def _client_id(provider: str) -> Optional[str]:
    return os.getenv(f"OAUTH_{provider.upper()}_CLIENT_ID")


def _client_secret(provider: str) -> Optional[str]:
    return os.getenv(f"OAUTH_{provider.upper()}_CLIENT_SECRET")


def _require_provider_ready(provider: str) -> Dict[str, Any]:
    conf = _provider_conf(provider)
    if not _client_id(provider) or not _client_secret(provider):
        raise HTTPException(status_code=400, detail=f"{conf.get('label')} OAuth not configured")
    return conf


def _base64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")


def _code_verifier() -> str:
    return _base64url(secrets.token_bytes(32))


def _code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return _base64url(digest)


def _set_social_ctx_cookie(response: JSONResponse, request: Request, ctx: dict):
    token = jwt.encode(ctx, os.getenv("SECRET_KEY") or "dev", algorithm="HS256")
    opts = cookie_options(request)
    response.set_cookie(
        key=SOCIAL_CTX_COOKIE,
        value=token,
        max_age=SOCIAL_CTX_TTL_SECONDS,
        path=opts["path"],
        httponly=opts["httponly"],
        secure=opts["secure"],
        samesite=opts["samesite"],
    )


def _decode_ctx(token: str) -> dict:
    try:
        return jwt.decode(token, os.getenv("SECRET_KEY") or "dev", algorithms=["HS256"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid social context")


def _clear_social_ctx_cookie(response: RedirectResponse, request: Request):
    opts = cookie_options(request)
    response.delete_cookie(
        key=SOCIAL_CTX_COOKIE,
        path=opts["path"],
        secure=opts["secure"],
        samesite=opts["samesite"],
    )


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
# Schemas
# ---------------------------------------------------------


class SocialAccountResponse(BaseModel):
    id: int
    provider: str
    account_id: Optional[str]
    account_name: Optional[str]
    status: str


class SocialPostRequest(BaseModel):
    provider: str
    clip_id: int
    caption: Optional[str] = None
    scheduled_at: Optional[str] = None  # ISO string


class SocialPostResponse(BaseModel):
    id: int
    provider: str
    status: str
    scheduled_at: Optional[str]
    posted_at: Optional[str]
    last_error: Optional[str]


# ---------------------------------------------------------
# Connect flow
# ---------------------------------------------------------


@router.post("/connect/{provider}/start")
def connect_start(
    provider: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    conf = _require_provider_ready(provider)
    client_id = _client_id(provider)
    if not client_id:
        raise HTTPException(status_code=400, detail="OAuth client not configured")

    state = secrets.token_urlsafe(24)
    verifier = _code_verifier()
    challenge = _code_challenge(verifier)

    redirect_uri = str(request.url_for("social_connect_callback", provider=provider))

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": " ".join(conf.get("scopes", [])),
        "state": state,
    }
    if conf.get("pkce", True):
        params["code_challenge"] = challenge
        params["code_challenge_method"] = "S256"
    if provider == "youtube":
        params["access_type"] = "offline"
        params["prompt"] = "consent"

    url = f"{conf['auth_url']}?{urlencode(params)}"

    resp = JSONResponse({"url": url})
    ctx = {
        "provider": provider,
        "state": state,
        "code_verifier": verifier,
        "user_id": current_user.id,
        "iat": int(time.time()),
    }
    _set_social_ctx_cookie(resp, request, ctx)
    return resp


@router.get("/connect/{provider}/callback", name="social_connect_callback")
def connect_callback(
    provider: str,
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    db: Session = Depends(get_db),
):
    conf = _require_provider_ready(provider)
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth code or state")

    ctx_token = request.cookies.get(SOCIAL_CTX_COOKIE)
    if not ctx_token:
        raise HTTPException(status_code=400, detail="Missing OAuth context")

    ctx = _decode_ctx(ctx_token)
    if ctx.get("provider") != provider or ctx.get("state") != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch")

    user_id = ctx.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid OAuth context")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    client_id = _client_id(provider)
    client_secret = _client_secret(provider)
    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="OAuth client not configured")

    redirect_uri = str(request.url_for("social_connect_callback", provider=provider))

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
    refresh_token = token_json.get("refresh_token")
    expires_in = token_json.get("expires_in")
    scopes = token_json.get("scope")

    if not access_token:
        raise HTTPException(status_code=400, detail="OAuth token missing")

    account_id = None
    account_name = None

    # fetch user info when possible
    if provider == "youtube":
        userinfo_resp = requests.get(
            conf["userinfo_url"],
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
        if userinfo_resp.status_code < 400:
            u = userinfo_resp.json()
            account_id = u.get("sub")
            account_name = u.get("name") or u.get("email")
    elif provider == "tiktok":
        userinfo_resp = requests.get(
            conf["userinfo_url"],
            params={"fields": "open_id,union_id,display_name"},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
        if userinfo_resp.status_code < 400:
            u = userinfo_resp.json().get("data", {}).get("user", {})
            account_id = u.get("open_id") or u.get("union_id")
            account_name = u.get("display_name")
    elif provider == "instagram":
        userinfo_resp = requests.get(
            conf["userinfo_url"],
            params={"fields": "id,username", "access_token": access_token},
            timeout=20,
        )
        if userinfo_resp.status_code < 400:
            u = userinfo_resp.json()
            account_id = u.get("id")
            account_name = u.get("username")

    existing = (
        db.query(SocialAccount)
        .filter(SocialAccount.user_id == user.id, SocialAccount.provider == provider)
        .first()
    )
    if not existing:
        existing = SocialAccount(user_id=user.id, provider=provider)
        db.add(existing)

    existing.account_id = account_id
    existing.account_name = account_name
    existing.access_token = access_token
    if refresh_token:
        existing.refresh_token = refresh_token
    existing.token_expires_at = (
        int(time.time()) + int(expires_in or 0) if expires_in else None
    )
    existing.scopes = scopes
    existing.status = "connected"

    db.commit()

    base = (os.getenv("FRONTEND_BASE_URL") or "http://localhost:3000").rstrip("/")
    response = RedirectResponse(url=f"{base}/app/settings?tab=social")
    _clear_social_ctx_cookie(response, request)
    return response


# ---------------------------------------------------------
# Accounts
# ---------------------------------------------------------


@router.get("/accounts", response_model=List[SocialAccountResponse])
def list_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(SocialAccount)
        .filter(SocialAccount.user_id == current_user.id)
        .order_by(SocialAccount.id.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "provider": r.provider,
            "account_id": r.account_id,
            "account_name": r.account_name,
            "status": r.status,
        }
        for r in rows
    ]


# ---------------------------------------------------------
# Posting
# ---------------------------------------------------------


def _refresh_google_token(provider: str, refresh_token: str) -> Optional[dict]:
    client_id = _client_id(provider)
    client_secret = _client_secret(provider)
    if not client_id or not client_secret:
        return None
    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=20,
    )
    if resp.status_code >= 400:
        return None
    return resp.json()


def _youtube_upload_video(access_token: str, title: str, description: str, video_path: str) -> str:
    init_resp = requests.post(
        "https://www.googleapis.com/upload/youtube/v3/videos"
        "?uploadType=resumable&part=snippet,status",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/mp4",
        },
        json={
            "snippet": {"title": title, "description": description},
            "status": {"privacyStatus": "public"},
        },
        timeout=30,
    )
    if init_resp.status_code >= 400:
        raise RuntimeError(f"YouTube init failed: {init_resp.text[:200]}")

    upload_url = init_resp.headers.get("Location")
    if not upload_url:
        raise RuntimeError("YouTube upload URL missing")

    with open(video_path, "rb") as f:
        upload_resp = requests.put(
            upload_url,
            data=f,
            headers={"Content-Type": "video/mp4"},
            timeout=120,
        )
    if upload_resp.status_code not in (200, 201):
        raise RuntimeError(f"YouTube upload failed: {upload_resp.text[:200]}")

    data = upload_resp.json() if upload_resp.text else {}
    return data.get("id") or ""


@router.post("/posts", response_model=SocialPostResponse)
def create_post(
    req: SocialPostRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = (req.provider or "").lower().strip()
    if provider not in PROVIDERS:
        raise HTTPException(400, "Unsupported provider")
    if provider not in _allowed_autopost_providers():
        raise HTTPException(400, "Provider pending approval")

    clip = (
        db.query(Clip)
        .join(Upload, Clip.upload_id == Upload.id)
        .filter(Clip.id == req.clip_id, Upload.user_id == current_user.id)
        .first()
    )
    if not clip:
        raise HTTPException(404, "Clip not found")

    when = None
    if req.scheduled_at:
        try:
            when = datetime.fromisoformat(req.scheduled_at.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(422, "scheduled_at must be ISO datetime")

    post = SocialPost(
        user_id=current_user.id,
        clip_id=clip.id,
        provider=provider,
        storage_key=clip.storage_key,
        caption=req.caption,
        status="scheduled" if when else "queued",
        scheduled_at=when,
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    return {
        "id": post.id,
        "provider": post.provider,
        "status": post.status,
        "scheduled_at": post.scheduled_at.isoformat() if post.scheduled_at else None,
        "posted_at": post.posted_at.isoformat() if post.posted_at else None,
        "last_error": post.last_error,
    }


@router.post("/posts/dispatch")
def dispatch_posts(
    limit: int = 3,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    posts = (
        db.query(SocialPost)
        .filter(
            SocialPost.user_id == current_user.id,
            SocialPost.status.in_(["queued", "scheduled"]),
            (SocialPost.scheduled_at == None) | (SocialPost.scheduled_at <= now),
        )
        .order_by(SocialPost.id.asc())
        .limit(max(1, min(5, int(limit))))
        .all()
    )

    if not posts:
        return {"processed": 0}

    processed = 0
    storage = get_storage()

    for post in posts:
        try:
            if post.provider not in _allowed_autopost_providers():
                raise RuntimeError("Provider pending approval")
            post.status = "posting"
            post.attempts = int(post.attempts or 0) + 1
            db.commit()

            account = (
                db.query(SocialAccount)
                .filter(SocialAccount.user_id == current_user.id, SocialAccount.provider == post.provider)
                .first()
            )
            if not account or not account.access_token:
                raise RuntimeError("No connected account")

            access_token = account.access_token
            if account.token_expires_at and account.token_expires_at < int(time.time()):
                if account.refresh_token:
                    refreshed = _refresh_google_token(post.provider, account.refresh_token)
                    if refreshed and refreshed.get("access_token"):
                        access_token = refreshed["access_token"]
                        account.access_token = access_token
                        if refreshed.get("expires_in"):
                            account.token_expires_at = int(time.time()) + int(refreshed["expires_in"])
                        db.commit()
                else:
                    raise RuntimeError("Access token expired")

            # Download clip
            tmp_path = None
            try:
                import tempfile
                fd, tmp_path = tempfile.mkstemp(prefix="orbito-post-", suffix=".mp4")
                os.close(fd)
                with open(tmp_path, "wb") as f:
                    body = storage.open(post.storage_key)
                    f.write(body.read())
            except Exception as e:
                raise RuntimeError(f"Failed to download clip: {e}")

            title = (post.caption or "Orbito Clip")[:80]
            desc = post.caption or ""

            if post.provider == "youtube":
                remote_id = _youtube_upload_video(access_token, title, desc, tmp_path)
                post.remote_id = remote_id
            else:
                raise RuntimeError("Provider integration pending")

            post.status = "posted"
            post.posted_at = datetime.now(timezone.utc)
            post.last_error = None
        except Exception as e:
            post.status = "failed"
            post.last_error = str(e)[:1000]
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
            db.commit()
            processed += 1

    return {"processed": processed}
