from __future__ import annotations

import base64
import hashlib
import json
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
        "scopes": ["user.info.basic", "video.upload", "video.publish"],
        "pkce": True,
        "client_id_param": "client_key",
        "client_secret_param": "client_secret",
    },
    "instagram": {
        "label": "Instagram",
        # Uses Facebook Login to obtain Graph permissions needed for publishing.
        "auth_url": "https://www.facebook.com/v20.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v20.0/oauth/access_token",
        "userinfo_url": "https://graph.facebook.com/me",
        "scopes": [
            "pages_show_list",
            "business_management",
        ],
        "pkce": True,
    },
    "facebook": {
        "label": "Facebook",
        "auth_url": "https://www.facebook.com/v20.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v20.0/oauth/access_token",
        "userinfo_url": "https://graph.facebook.com/me",
        "scopes": [
            "pages_show_list",
            "pages_read_engagement",
            "pages_manage_posts",
        ],
        "pkce": True,
    },
}


def _allowed_autopost_providers() -> set:
    raw = (os.getenv("AUTOPOST_PROVIDERS") or "youtube,tiktok,instagram,facebook").strip()
    return {p.strip().lower() for p in raw.split(",") if p.strip()}


def _safe_json_dumps(v: Any) -> str:
    try:
        return json.dumps(v or {})
    except Exception:
        return "{}"


def _safe_json_loads(v: Any) -> dict:
    if not v:
        return {}
    if isinstance(v, dict):
        return v
    try:
        return json.loads(str(v))
    except Exception:
        return {}


def _provider_conf(provider: str) -> Dict[str, Any]:
    p = PROVIDERS.get(provider)
    if not p:
        raise HTTPException(status_code=404, detail="Unknown provider")
    return p


def _client_id(provider: str) -> Optional[str]:
    val = os.getenv(f"OAUTH_{provider.upper()}_CLIENT_ID")
    if val:
        return val
    if provider == "youtube":
        return os.getenv("OAUTH_GOOGLE_CLIENT_ID")
    if provider == "instagram":
        return os.getenv("OAUTH_FACEBOOK_CLIENT_ID")
    return None


def _client_secret(provider: str) -> Optional[str]:
    val = os.getenv(f"OAUTH_{provider.upper()}_CLIENT_SECRET")
    if val:
        return val
    if provider == "youtube":
        return os.getenv("OAUTH_GOOGLE_CLIENT_SECRET")
    if provider == "instagram":
        return os.getenv("OAUTH_FACEBOOK_CLIENT_SECRET")
    return None


def _meta_config_id(provider: str) -> Optional[str]:
    if provider not in {"facebook", "instagram"}:
        return None
    specific = os.getenv(f"OAUTH_{provider.upper()}_CONFIG_ID")
    if specific:
        return specific
    return os.getenv("OAUTH_FACEBOOK_CONFIG_ID")


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


def _public_api_base() -> str:
    return (
        (
            os.getenv("PUBLIC_API_BASE")
            or os.getenv("API_BASE_URL")
            or os.getenv("BACKEND_PUBLIC_BASE")
            or os.getenv("FRONTEND_BASE_URL")
            or ""
        )
        .strip()
        .rstrip("/")
    )


def _absolute_storage_url(storage, key: str) -> str:
    """
    Return a publicly reachable URL for providers that ingest by URL.
    """
    try:
        url = storage.presign_get(key, expires_in=3600)  # type: ignore[attr-defined]
    except TypeError:
        url = storage.presign_get(key)  # type: ignore[attr-defined]
    url = str(url)
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if not url.startswith("/"):
        raise RuntimeError("Storage URL is not absolute")
    base = _public_api_base()
    if not base:
        raise RuntimeError("PUBLIC_API_BASE/API_BASE_URL is required for social posting in local-storage mode")
    return f"{base}{url}"


def _meta_pages(access_token: str) -> List[dict]:
    """
    List pages available to the connected Meta user token.
    """
    resp = requests.get(
        "https://graph.facebook.com/v20.0/me/accounts",
        params={
            "fields": "id,name,access_token,instagram_business_account{id,username}",
            "limit": 50,
            "access_token": access_token,
        },
        timeout=25,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Meta pages fetch failed: {resp.text[:250]}")
    data = resp.json() if resp.text else {}
    rows = data.get("data")
    return rows if isinstance(rows, list) else []


def _meta_pick_page(access_token: str, preferred_page_id: Optional[str] = None) -> dict:
    pages = _meta_pages(access_token)
    if not pages:
        raise RuntimeError("No Facebook Pages found for this account")
    if preferred_page_id:
        for page in pages:
            if str(page.get("id") or "") == str(preferred_page_id):
                return page
    return pages[0]


def _meta_pick_instagram(access_token: str, preferred_ig_id: Optional[str] = None) -> dict:
    pages = _meta_pages(access_token)
    with_ig = []
    for page in pages:
        ig = page.get("instagram_business_account") or {}
        ig_id = str(ig.get("id") or "").strip()
        if ig_id:
            with_ig.append(page)
    if not with_ig:
        raise RuntimeError("No Instagram Business account linked to this Facebook account")
    if preferred_ig_id:
        for page in with_ig:
            ig = page.get("instagram_business_account") or {}
            if str(ig.get("id") or "") == str(preferred_ig_id):
                return page
    return with_ig[0]


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


class SocialDisconnectResponse(BaseModel):
    status: str


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

    scope_sep = "," if provider in {"facebook", "instagram", "tiktok"} else " "
    client_id_param = conf.get("client_id_param", "client_id")
    params = {
        "response_type": "code",
        client_id_param: client_id,
        "redirect_uri": redirect_uri,
        "scope": scope_sep.join(conf.get("scopes", [])),
        "state": state,
    }
    meta_config_id = _meta_config_id(provider)
    if meta_config_id:
        params["config_id"] = meta_config_id
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
    elif provider in {"instagram", "facebook"}:
        userinfo_resp = requests.get(
            conf["userinfo_url"],
            params={"fields": "id,name", "access_token": access_token},
            timeout=20,
        )
        if userinfo_resp.status_code < 400:
            u = userinfo_resp.json()
            account_id = u.get("id")
            account_name = u.get("name")

    # For Meta providers, store best default target IDs for posting.
    if provider == "facebook":
        try:
            page = _meta_pick_page(access_token, preferred_page_id=account_id)
            account_id = str(page.get("id") or account_id or "")
            account_name = str(page.get("name") or account_name or "Facebook Page")
        except Exception:
            pass
    elif provider == "instagram":
        try:
            page = _meta_pick_instagram(access_token, preferred_ig_id=account_id)
            ig = page.get("instagram_business_account") or {}
            ig_id = str(ig.get("id") or "").strip()
            ig_name = str(ig.get("username") or "").strip()
            if ig_id:
                account_id = ig_id
            if ig_name:
                account_name = ig_name
        except Exception:
            pass

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
    existing.scopes = scopes if isinstance(scopes, str) else _safe_json_dumps(scopes)
    existing.status = "connected"

    db.commit()

    base = (os.getenv("FRONTEND_BASE_URL") or "http://localhost:3000").rstrip("/")
    response = RedirectResponse(url=f"{base}/app/studio?tab=social")
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


@router.post("/accounts/{provider}/disconnect", response_model=SocialDisconnectResponse)
def disconnect_account(
    provider: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = (provider or "").strip().lower()
    if p not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")

    account = (
        db.query(SocialAccount)
        .filter(SocialAccount.user_id == current_user.id, SocialAccount.provider == p)
        .first()
    )
    if not account:
        return {"status": "not_connected"}

    account.access_token = None
    account.refresh_token = None
    account.token_expires_at = None
    account.scopes = None
    account.status = "disconnected"
    db.commit()
    return {"status": "disconnected"}


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


def _refresh_tiktok_token(provider: str, refresh_token: str) -> Optional[dict]:
    client_id = _client_id(provider)
    client_secret = _client_secret(provider)
    if not client_id or not client_secret:
        return None
    resp = requests.post(
        "https://open.tiktokapis.com/v2/oauth/token/",
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_key": client_id,
            "client_secret": client_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=25,
    )
    if resp.status_code >= 400:
        return None
    return resp.json()


def _refresh_facebook_token(provider: str, access_token: str) -> Optional[dict]:
    client_id = _client_id(provider)
    client_secret = _client_secret(provider)
    if not client_id or not client_secret:
        return None
    resp = requests.get(
        "https://graph.facebook.com/v20.0/oauth/access_token",
        params={
            "grant_type": "fb_exchange_token",
            "client_id": client_id,
            "client_secret": client_secret,
            "fb_exchange_token": access_token,
        },
        timeout=25,
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


def _facebook_upload_video(page_access_token: str, page_id: str, title: str, description: str, video_url: str) -> str:
    resp = requests.post(
        f"https://graph-video.facebook.com/v20.0/{page_id}/videos",
        data={
            "file_url": video_url,
            "title": title,
            "description": description,
            "published": "true",
            "access_token": page_access_token,
        },
        timeout=60,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Facebook upload failed: {resp.text[:300]}")
    data = resp.json() if resp.text else {}
    return str(data.get("id") or "")


def _instagram_publish_reel(
    page_access_token: str,
    ig_user_id: str,
    caption: str,
    video_url: str,
) -> str:
    create_resp = requests.post(
        f"https://graph.facebook.com/v20.0/{ig_user_id}/media",
        data={
            "media_type": "REELS",
            "video_url": video_url,
            "caption": caption[:2200],
            "access_token": page_access_token,
        },
        timeout=45,
    )
    if create_resp.status_code >= 400:
        raise RuntimeError(f"Instagram media create failed: {create_resp.text[:300]}")

    created = create_resp.json() if create_resp.text else {}
    container_id = str(created.get("id") or "")
    if not container_id:
        raise RuntimeError("Instagram container id missing")

    # Wait until media container is ready.
    deadline = time.time() + 120
    status_code = ""
    while time.time() < deadline:
        st_resp = requests.get(
            f"https://graph.facebook.com/v20.0/{container_id}",
            params={
                "fields": "status_code,status,error_message",
                "access_token": page_access_token,
            },
            timeout=25,
        )
        if st_resp.status_code >= 400:
            raise RuntimeError(f"Instagram status check failed: {st_resp.text[:250]}")
        st = st_resp.json() if st_resp.text else {}
        status_code = str(st.get("status_code") or st.get("status") or "").upper()
        if status_code in {"FINISHED", "READY"}:
            break
        if status_code in {"ERROR", "EXPIRED"}:
            em = str(st.get("error_message") or "Instagram media processing failed")
            raise RuntimeError(em[:300])
        time.sleep(3)

    if status_code not in {"FINISHED", "READY"}:
        raise RuntimeError("Instagram media processing timed out")

    pub_resp = requests.post(
        f"https://graph.facebook.com/v20.0/{ig_user_id}/media_publish",
        data={
            "creation_id": container_id,
            "access_token": page_access_token,
        },
        timeout=35,
    )
    if pub_resp.status_code >= 400:
        raise RuntimeError(f"Instagram publish failed: {pub_resp.text[:300]}")
    pub = pub_resp.json() if pub_resp.text else {}
    return str(pub.get("id") or container_id)


def _tiktok_publish_video(access_token: str, title: str, description: str, video_url: str) -> str:
    privacy = (os.getenv("TIKTOK_DEFAULT_PRIVACY") or "PUBLIC_TO_EVERYONE").strip() or "PUBLIC_TO_EVERYONE"
    text = (description or title or "New Orbito clip").strip()
    payload = {
        "post_info": {
            "title": text[:150],
            "privacy_level": privacy,
            "disable_duet": False,
            "disable_comment": False,
            "disable_stitch": False,
        },
        "source_info": {
            "source": "PULL_FROM_URL",
            "video_url": video_url,
        },
    }
    resp = requests.post(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json=payload,
        timeout=45,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"TikTok publish init failed: {resp.text[:300]}")
    data = resp.json() if resp.text else {}
    d = data.get("data") if isinstance(data, dict) else {}
    return str((d or {}).get("publish_id") or (d or {}).get("video_id") or "")


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
            # Instagram publishing uses Meta Graph permissions; a connected Facebook
            # account can be used as fallback token source.
            if (not account or not account.access_token) and post.provider == "instagram":
                account = (
                    db.query(SocialAccount)
                    .filter(SocialAccount.user_id == current_user.id, SocialAccount.provider == "facebook")
                    .first()
                )
            if not account or not account.access_token:
                raise RuntimeError("No connected account")

            access_token = account.access_token
            if account.token_expires_at and account.token_expires_at < int(time.time()):
                refreshed = None
                if account.provider == "youtube" and account.refresh_token:
                    refreshed = _refresh_google_token(account.provider, account.refresh_token)
                elif account.provider == "tiktok" and account.refresh_token:
                    refreshed = _refresh_tiktok_token(account.provider, account.refresh_token)
                elif account.provider in {"facebook", "instagram"}:
                    refreshed = _refresh_facebook_token(account.provider, access_token)

                if refreshed and refreshed.get("access_token"):
                    access_token = str(refreshed["access_token"])
                    account.access_token = access_token
                    if refreshed.get("refresh_token"):
                        account.refresh_token = str(refreshed.get("refresh_token"))
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
            elif post.provider == "facebook":
                clip_url = _absolute_storage_url(storage, post.storage_key)
                page = _meta_pick_page(access_token, preferred_page_id=account.account_id)
                page_id = str(page.get("id") or "")
                page_token = str(page.get("access_token") or "")
                if not page_id or not page_token:
                    raise RuntimeError("Facebook Page access token missing")
                remote_id = _facebook_upload_video(page_token, page_id, title, desc, clip_url)
                post.remote_id = remote_id
            elif post.provider == "instagram":
                clip_url = _absolute_storage_url(storage, post.storage_key)
                page = _meta_pick_instagram(access_token, preferred_ig_id=account.account_id)
                ig = page.get("instagram_business_account") or {}
                ig_user_id = str(ig.get("id") or "").strip()
                page_token = str(page.get("access_token") or "").strip()
                if not ig_user_id:
                    raise RuntimeError("No Instagram Business account linked")
                if not page_token:
                    raise RuntimeError("Facebook Page access token missing for Instagram publish")
                remote_id = _instagram_publish_reel(page_token, ig_user_id, desc, clip_url)
                post.remote_id = remote_id
            elif post.provider == "tiktok":
                clip_url = _absolute_storage_url(storage, post.storage_key)
                remote_id = _tiktok_publish_video(access_token, title, desc, clip_url)
                post.remote_id = remote_id
            else:
                raise RuntimeError(f"Unsupported provider: {post.provider}")

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
