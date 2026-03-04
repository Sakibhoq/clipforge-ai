from __future__ import annotations

import base64
import hashlib
import json
import math
import os
import re
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

from core.config import settings
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


def _social_ctx_secret_or_500() -> str:
    secret = (settings.SECRET_KEY or "").strip()
    if not secret:
        raise HTTPException(status_code=500, detail="SECRET_KEY is not configured")
    return secret


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
            "pages_read_engagement",
            "business_management",
            "instagram_basic",
            "instagram_content_publish",
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
            "business_management",
        ],
        "pkce": True,
    },
}

PLAN_LABELS: Dict[str, str] = {
    "free": "Free",
    "starter": "Starter",
    "creator": "Creator",
    "studio": "Studio",
}

PLAN_POSTING_PROVIDER_ALLOWLIST: Dict[str, set[str]] = {
    "free": set(),
    "starter": {"facebook", "instagram"},
    "creator": set(PROVIDERS.keys()),
    "studio": set(PROVIDERS.keys()),
}

YOUTUBE_PRIVACY_STATUSES = {"public", "unlisted", "private"}
TIKTOK_PUBLISH_MODES = {"DIRECT_POST", "MEDIA_UPLOAD"}
TIKTOK_PRIVACY_LEVELS = {
    "PUBLIC_TO_EVERYONE",
    "MUTUAL_FOLLOW_FRIENDS",
    "FOLLOWER_OF_CREATOR",
    "SELF_ONLY",
}


def _allowed_autopost_providers() -> set:
    raw = (os.getenv("AUTOPOST_PROVIDERS") or "youtube,tiktok,instagram,facebook").strip()
    return {p.strip().lower() for p in raw.split(",") if p.strip()}


def _meta_request_publish_scopes() -> bool:
    raw = (os.getenv("OAUTH_META_REQUEST_PUBLISH_SCOPES") or "").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    # Production default: request publish scopes so Instagram/Facebook posting works.
    app_env = (os.getenv("APP_ENV") or "").strip().lower()
    return app_env == "production"


def _effective_connect_scopes(provider: str, scopes: List[str]) -> List[str]:
    out = [str(s).strip() for s in (scopes or []) if str(s).strip()]
    if provider not in {"facebook", "instagram"}:
        return out

    # Meta OAuth often hard-fails with "Invalid Scopes" until app review /
    # advanced access is approved. Keep connect stable by default and allow
    # publish-scope requests only when explicitly enabled.
    if _meta_request_publish_scopes():
        return out

    blocked = {
        "pages_read_engagement",
        "pages_manage_posts",
        "instagram_basic",
        "instagram_content_publish",
        # Not required for our current Graph calls and can be restricted/trigger
        # Meta "Invalid Scopes" until app review / advanced access is approved.
        "business_management",
    }
    return [s for s in out if s not in blocked]


def _normalized_plan_key(raw_plan: Any) -> str:
    plan = str(raw_plan or "").strip().lower()
    if plan in PLAN_POSTING_PROVIDER_ALLOWLIST:
        return plan

    # Normalize legacy / suffixed plan names from older Stripe metadata flows.
    token = re.sub(r"[^a-z0-9]+", "_", plan).strip("_")
    if token in PLAN_POSTING_PROVIDER_ALLOWLIST:
        return token

    aliases = {
        "free_trial": "free",
        "trial": "free",
        "trialing": "free",
        "starter_monthly": "starter",
        "starter_yearly": "starter",
        "creator_plus": "creator",
        "creator_monthly": "creator",
        "creator_yearly": "creator",
        "pro": "creator",
        "pro_plus": "creator",
        "studio_monthly": "studio",
        "studio_yearly": "studio",
    }
    if token in aliases:
        return aliases[token]

    if token.startswith("starter") or "starter" in token:
        return "starter"
    if token.startswith("creator") or token.startswith("pro") or "creator" in token:
        return "creator"
    if token.startswith("studio") or "studio" in token:
        return "studio"

    return "free"


def _allowed_posting_providers_for_plan(raw_plan: Any) -> set[str]:
    plan = _normalized_plan_key(raw_plan)
    return set(PLAN_POSTING_PROVIDER_ALLOWLIST.get(plan, set()))


def _plan_label(raw_plan: Any) -> str:
    return PLAN_LABELS.get(_normalized_plan_key(raw_plan), "Free")


def _enforce_connect_provider_access(*, user: User, provider: str) -> None:
    plan = _normalized_plan_key(getattr(user, "plan", None))
    allowed = _allowed_posting_providers_for_plan(plan)
    p = str(provider or "").strip().lower()

    if p in allowed:
        return

    if not allowed:
        raise HTTPException(
            status_code=403,
            detail="Free Trial cannot connect social channels. Upgrade to Starter or Creator.",
        )
    if plan == "starter":
        raise HTTPException(
            status_code=403,
            detail="Starter supports 2 social channels. Upgrade to Creator for full social access.",
        )
    raise HTTPException(status_code=403, detail=f"{_plan_label(plan)} plan cannot connect this channel.")


def _enforce_clip_platform_limit(
    db: Session,
    *,
    user: User,
    clip_id: int,
    provider: str,
) -> None:
    plan = _normalized_plan_key(getattr(user, "plan", None))
    allowed = _allowed_posting_providers_for_plan(plan)
    p = str(provider or "").strip().lower()

    if p not in allowed:
        if not allowed:
            raise HTTPException(
                status_code=403,
                detail="Free Trial cannot publish to social. Upgrade to Starter or Creator.",
            )
        if plan == "starter":
            raise HTTPException(
                status_code=403,
                detail="Starter supports 2 social channels. Upgrade to Creator for full social access.",
            )
        raise HTTPException(status_code=403, detail=f"{_plan_label(plan)} plan cannot publish to this channel.")

    existing_rows = (
        db.query(SocialPost)
        .filter(
            SocialPost.user_id == user.id,
            SocialPost.clip_id == clip_id,
            SocialPost.status.in_(["queued", "scheduled", "posting", "posted"]),
        )
        .all()
    )
    existing = {
        str(r.provider or "").strip().lower()
        for r in existing_rows
        if str(r.provider or "").strip()
    }

    if p in existing:
        return

    max_platforms = len(allowed)
    if len(existing) >= max_platforms:
        suffix = "" if max_platforms == 1 else "s"
        detail = f"{_plan_label(plan)} plan allows up to {max_platforms} platform{suffix} per clip."
        if max_platforms < len(PROVIDERS):
            detail += " Upgrade your plan to publish on more platforms."
        raise HTTPException(status_code=403, detail=detail)


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


def _as_bool(v: Any, default: bool) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    if isinstance(v, str):
        s = v.strip().lower()
        if s in {"1", "true", "yes", "on"}:
            return True
        if s in {"0", "false", "no", "off"}:
            return False
    return default


def _as_scope_set(raw_scopes: Any) -> set[str]:
    if not raw_scopes:
        return set()
    value: Any = raw_scopes
    if isinstance(raw_scopes, str):
        try:
            value = json.loads(raw_scopes)
        except Exception:
            value = raw_scopes
    if isinstance(value, list):
        return {str(s).strip() for s in value if str(s).strip()}
    if isinstance(value, str):
        parts = re.split(r"[,\s]+", value)
        return {p.strip() for p in parts if p.strip()}
    return set()


def _normalize_provider_post_options(provider: str, raw_options: Any) -> dict:
    opts = raw_options if isinstance(raw_options, dict) else {}
    p = str(provider or "").strip().lower()

    if p == "youtube":
        privacy = str(opts.get("privacy_status") or "public").strip().lower()
        if privacy not in YOUTUBE_PRIVACY_STATUSES:
            privacy = "public"
        return {"privacy_status": privacy}

    if p == "tiktok":
        publish_mode = str(opts.get("publish_mode") or "DIRECT_POST").strip().upper()
        if publish_mode not in TIKTOK_PUBLISH_MODES:
            publish_mode = "DIRECT_POST"

        privacy_level = str(opts.get("privacy_level") or "").strip().upper()
        if privacy_level not in TIKTOK_PRIVACY_LEVELS:
            privacy_level = ""

        # Keep interaction toggles OFF by default unless user explicitly enables them.
        allow_comments = _as_bool(opts.get("allow_comments"), False)
        allow_duet = _as_bool(opts.get("allow_duet"), False)
        allow_stitch = _as_bool(opts.get("allow_stitch"), False)
        branded_content = _as_bool(opts.get("branded_content"), False)
        brand_organic = _as_bool(opts.get("brand_organic"), False)
        is_aigc = _as_bool(opts.get("is_aigc"), False)
        confirm_music_usage = _as_bool(opts.get("confirm_music_usage"), False)
        confirm_branded_content = _as_bool(opts.get("confirm_branded_content"), False)

        return {
            "publish_mode": publish_mode,
            "privacy_level": privacy_level,
            "allow_comments": allow_comments,
            "allow_duet": allow_duet,
            "allow_stitch": allow_stitch,
            "branded_content": branded_content,
            "brand_organic": brand_organic,
            "is_aigc": is_aigc,
            "confirm_music_usage": confirm_music_usage,
            "confirm_branded_content": confirm_branded_content,
        }

    if p == "instagram":
        return {"share_to_feed": _as_bool(opts.get("share_to_feed"), True)}

    # Facebook currently exposes no extra publish controls in-app.
    return {}


def _friendly_publish_error(provider: str, raw_error: str) -> str:
    msg = str(raw_error or "").strip()
    low = msg.lower()
    p = (provider or "").strip().lower()

    if p == "tiktok":
        if "unaudited_client_can_only_post_to_private_accounts" in low:
            return (
                "TikTok app is in unaudited mode. It can only post to private accounts for approved testers. "
                "Add this account as a tester or complete TikTok app audit."
            )
        if "scope_not_authorized" in low or "scope" in low and "author" in low:
            return "TikTok permissions are missing. Reconnect TikTok in Studio and approve all requested scopes."

    if p == "facebook":
        if "no permission to publish the video" in low or "\"code\":100" in low:
            return (
                "Facebook publish permission is missing for this Page. Reconnect Facebook in Studio and approve "
                "Page publishing permissions, then retry."
            )
        if "facebook page access token missing" in low:
            return "Facebook Page token is missing. Reconnect Facebook and select a Page you manage."

    if p == "instagram":
        if "no permission to publish" in low or "\"code\":100" in low:
            return (
                "Instagram publish permission is missing. Reconnect Instagram/Facebook in Studio and approve "
                "Instagram publishing permissions."
            )
        if "instagram professional account linked" in low:
            return (
                "No Instagram Professional account linked to a Facebook Page. Link it in Meta Business Suite "
                "and reconnect Instagram."
            )

    if len(msg) > 260:
        return msg[:260]
    return msg or "Publishing failed"


def _oauth_error_detail(payload: Any, fallback: str = "") -> str:
    if not isinstance(payload, dict):
        return (fallback or "").strip()[:220]
    for key in ("error_description", "description", "message", "error"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()[:220]
        if isinstance(val, dict):
            nested = val.get("message") or val.get("description") or val.get("code")
            if isinstance(nested, str) and nested.strip():
                return nested.strip()[:220]
    err = payload.get("error")
    if isinstance(err, dict):
        code = err.get("code")
        msg = err.get("message")
        if code and msg:
            return f"{code}: {msg}"[:220]
    return (fallback or "").strip()[:220]


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
    use_config = (os.getenv("OAUTH_META_USE_CONFIG_ID") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if not use_config:
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
    token = jwt.encode(ctx, _social_ctx_secret_or_500(), algorithm="HS256")
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
        return jwt.decode(token, _social_ctx_secret_or_500(), algorithms=["HS256"])
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
        raise RuntimeError(
            "No Instagram Professional account linked to a Facebook Page. "
            "Link it in Meta Business Suite, then reconnect Instagram."
        )
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
    platform_options: Dict[str, Any] = Field(default_factory=dict)


class SocialPostResponse(BaseModel):
    id: int
    provider: str
    status: str
    scheduled_at: Optional[str]
    posted_at: Optional[str]
    last_error: Optional[str]
    platform_options: Dict[str, Any] = Field(default_factory=dict)


class SocialDisconnectResponse(BaseModel):
    status: str


class ProviderPublishOptionsResponse(BaseModel):
    provider: str
    account_name: Optional[str] = None
    last_caption: Optional[str] = None
    post_blocked: bool = False
    post_block_reason: Optional[str] = None
    options: Dict[str, Any] = Field(default_factory=dict)


def _serialize_social_post(post: SocialPost) -> dict:
    options = _safe_json_loads(getattr(post, "post_options_json", None))
    if not isinstance(options, dict):
        options = {}
    return {
        "id": post.id,
        "provider": post.provider,
        "status": post.status,
        "scheduled_at": post.scheduled_at.isoformat() if post.scheduled_at else None,
        "posted_at": post.posted_at.isoformat() if post.posted_at else None,
        "last_error": post.last_error,
        "platform_options": options,
    }


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
    _enforce_connect_provider_access(user=current_user, provider=provider)
    client_id = _client_id(provider)
    if not client_id:
        raise HTTPException(status_code=400, detail="OAuth client not configured")

    state = secrets.token_urlsafe(24)
    verifier = _code_verifier()
    challenge = _code_challenge(verifier)

    redirect_uri = str(request.url_for("social_connect_callback", provider=provider))

    meta_config_id = _meta_config_id(provider)
    use_explicit_scope = True
    if provider in {"facebook", "instagram"} and meta_config_id:
        # For Meta Login configurations (config_id), permissions are defined in
        # the Meta app config itself. Sending scope here can trigger
        # "Invalid Scopes" errors in the OAuth dialog.
        use_explicit_scope = False

    client_id_param = conf.get("client_id_param", "client_id")
    params = {
        "response_type": "code",
        client_id_param: client_id,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    if use_explicit_scope:
        scopes = _effective_connect_scopes(provider, conf.get("scopes", []))  # type: ignore[arg-type]
        scope_sep = "," if provider in {"facebook", "instagram", "tiktok"} else " "
        params["scope"] = scope_sep.join(scopes)
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
    _enforce_connect_provider_access(user=user, provider=provider)

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
    token_text = (token_resp.text or "").strip()
    try:
        token_json = token_resp.json()
    except Exception:
        token_json = {}
    token_body = token_json if isinstance(token_json, dict) else {}
    token_data_body = token_body.get("data")
    if not isinstance(token_data_body, dict):
        token_data_body = {}
    if token_resp.status_code >= 400:
        detail = _oauth_error_detail(token_body, token_text)
        raise HTTPException(status_code=400, detail=f"OAuth token exchange failed: {detail or 'unknown error'}")

    access_token = token_body.get("access_token") or token_data_body.get("access_token")
    refresh_token = token_body.get("refresh_token") or token_data_body.get("refresh_token")
    expires_in = token_body.get("expires_in") or token_data_body.get("expires_in")
    scopes = token_body.get("scope") or token_data_body.get("scope")

    if not access_token:
        detail = _oauth_error_detail(token_body, token_text)
        raise HTTPException(status_code=400, detail=f"OAuth token missing: {detail or 'no access_token in provider response'}")

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


@router.get("/providers/{provider}/publish-options", response_model=ProviderPublishOptionsResponse)
def get_provider_publish_options(
    provider: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = (provider or "").strip().lower()
    if p not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")

    if p == "youtube":
        return {
            "provider": p,
            "options": {
                "privacy_status": {
                    "value": "public",
                    "choices": ["public", "unlisted", "private"],
                }
            },
        }

    if p == "instagram":
        return {
            "provider": p,
            "options": {
                "share_to_feed": {"value": True},
            },
        }

    if p == "facebook":
        return {"provider": p, "options": {}}

    # TikTok: query creator capabilities for required posting UX controls.
    account = (
        db.query(SocialAccount)
        .filter(
            SocialAccount.user_id == current_user.id,
            SocialAccount.provider == "tiktok",
            SocialAccount.status == "connected",
        )
        .first()
    )
    if not account or not account.access_token:
        raise HTTPException(status_code=404, detail="Connect TikTok first")

    try:
        access_token = _refresh_access_token_if_needed(db, account)
        creator = _tiktok_query_creator_info(access_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=_friendly_publish_error("tiktok", str(e)))

    privacy_raw = creator.get("privacy_level_options")
    privacy_choices: List[str] = []
    if isinstance(privacy_raw, list):
        for item in privacy_raw:
            val = str(item or "").strip().upper()
            if val in TIKTOK_PRIVACY_LEVELS and val not in privacy_choices:
                privacy_choices.append(val)
    if not privacy_choices:
        privacy_choices = ["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]

    scope_set = _as_scope_set(account.scopes)
    has_publish_scope = "video.publish" in scope_set if scope_set else True
    publish_mode_choices = ["DIRECT_POST", "MEDIA_UPLOAD"] if has_publish_scope else ["MEDIA_UPLOAD"]
    prefill = _last_tiktok_post_prefill(db, user_id=current_user.id)
    publish_mode_prefill = str(prefill.get("publish_mode") or "").strip().upper()
    if publish_mode_prefill not in publish_mode_choices:
        publish_mode_prefill = publish_mode_choices[0]
    allow_comments_prefill = bool(prefill.get("allow_comments", False))
    allow_duet_prefill = bool(prefill.get("allow_duet", False))
    allow_stitch_prefill = bool(prefill.get("allow_stitch", False))
    branded_content_prefill = bool(prefill.get("branded_content", False))
    brand_organic_prefill = bool(prefill.get("brand_organic", False))
    is_aigc_prefill = bool(prefill.get("is_aigc", False))
    comment_disabled = bool(creator.get("comment_disabled", False))
    duet_disabled = bool(creator.get("duet_disabled", False))
    stitch_disabled = bool(creator.get("stitch_disabled", False))
    post_block_reason = _tiktok_post_block_reason(creator)
    post_blocked = bool(post_block_reason)

    return {
        "provider": p,
        "account_name": account.account_name,
        "last_caption": str(prefill.get("caption") or "").strip() or None,
        "post_blocked": post_blocked,
        "post_block_reason": post_block_reason or None,
        "options": {
            "publish_mode": {"value": publish_mode_prefill, "choices": publish_mode_choices},
            # Keep privacy unselected until the user explicitly chooses one.
            "privacy_level": {"value": "", "choices": privacy_choices, "required": True},
            # Keep toggles off by default. If TikTok marks one disabled, lock it in the UI.
            "allow_comments": {"value": False if comment_disabled else allow_comments_prefill, "locked": comment_disabled},
            "allow_duet": {"value": False if duet_disabled else allow_duet_prefill, "locked": duet_disabled},
            "allow_stitch": {"value": False if stitch_disabled else allow_stitch_prefill, "locked": stitch_disabled},
            "commercial_content_disclosure": {"value": bool(branded_content_prefill or brand_organic_prefill)},
            "branded_content": {"value": branded_content_prefill},
            "brand_organic": {"value": brand_organic_prefill},
            "is_aigc": {"value": is_aigc_prefill},
            "confirm_music_usage": {"value": False, "required": True},
            "confirm_branded_content": {"value": False, "required_if_branded": True},
            "max_video_post_duration_sec": int(creator.get("max_video_post_duration_sec") or 0),
        },
    }


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


def _refresh_access_token_if_needed(db: Session, account: SocialAccount) -> str:
    access_token = str(account.access_token or "").strip()
    if not access_token:
        raise RuntimeError("No connected account")

    if account.token_expires_at and account.token_expires_at < int(time.time()):
        refreshed: Optional[dict] = None
        if account.provider == "youtube" and account.refresh_token:
            refreshed = _refresh_google_token(account.provider, account.refresh_token)
        elif account.provider == "tiktok" and account.refresh_token:
            refreshed = _refresh_tiktok_token(account.provider, account.refresh_token)
        elif account.provider in {"facebook", "instagram"}:
            refreshed = _refresh_facebook_token(account.provider, access_token)

        if not refreshed or not refreshed.get("access_token"):
            raise RuntimeError("Access token expired")

        access_token = str(refreshed["access_token"])
        account.access_token = access_token
        if refreshed.get("refresh_token"):
            account.refresh_token = str(refreshed.get("refresh_token"))
        if refreshed.get("expires_in"):
            account.token_expires_at = int(time.time()) + int(refreshed["expires_in"])
        db.commit()

    return access_token


def _tiktok_query_creator_info(access_token: str) -> dict:
    resp = requests.post(
        "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json={},
        timeout=25,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"TikTok creator info query failed: {resp.text[:300]}")
    payload = resp.json() if resp.text else {}
    data = payload.get("data") if isinstance(payload, dict) else {}
    if not isinstance(data, dict):
        data = {}
    info = data.get("creator_info")
    if not isinstance(info, dict):
        info = {}
    return info


def _first_non_empty_text(*values: Any) -> str:
    for value in values:
        s = str(value or "").strip()
        if s:
            return s
    return ""


def _tiktok_post_block_reason(creator: Any) -> str:
    """
    Interpret TikTok creator_info capability flags.
    If TikTok indicates the creator cannot post right now, return a user-safe reason.
    """
    if not isinstance(creator, dict):
        return ""

    default_reason = "TikTok reports this account cannot post right now. Please try again later."
    reason = _first_non_empty_text(
        creator.get("post_disabled_reason"),
        creator.get("post_restriction_reason"),
        creator.get("cannot_post_reason"),
        creator.get("publish_disabled_reason"),
        creator.get("reason"),
        creator.get("message"),
    )

    false_means_blocked = (
        "can_post",
        "can_post_now",
        "can_publish",
        "can_publish_now",
        "can_post_video",
        "can_make_more_posts",
    )
    for key in false_means_blocked:
        if key in creator and not _as_bool(creator.get(key), True):
            return reason or default_reason

    true_means_blocked = (
        "post_disabled",
        "posting_disabled",
        "publish_disabled",
        "cannot_post",
        "post_restricted",
        "posting_restricted",
        "publish_restricted",
        "reached_post_limit",
        "reached_posting_limit",
        "reached_active_user_cap",
    )
    for key in true_means_blocked:
        if _as_bool(creator.get(key), False):
            return reason or default_reason

    post_state = _first_non_empty_text(creator.get("post_status"), creator.get("publish_status")).lower()
    if post_state in {"blocked", "disabled", "restricted", "cannot_post", "not_allowed", "rate_limited"}:
        return reason or default_reason

    return ""


def _last_tiktok_post_prefill(db: Session, *, user_id: int) -> dict:
    row = (
        db.query(SocialPost)
        .filter(SocialPost.user_id == user_id, SocialPost.provider == "tiktok")
        .order_by(SocialPost.id.desc())
        .first()
    )
    if not row:
        return {}

    out: Dict[str, Any] = {}
    opts = _normalize_provider_post_options("tiktok", _safe_json_loads(getattr(row, "post_options_json", None)))
    if isinstance(opts, dict):
        for key in (
            "publish_mode",
            "allow_comments",
            "allow_duet",
            "allow_stitch",
            "branded_content",
            "brand_organic",
            "is_aigc",
        ):
            if key in opts:
                out[key] = opts.get(key)

    caption = str(getattr(row, "caption", "") or "").strip()
    if caption:
        out["caption"] = caption[:2200]
    return out


def _tiktok_fetch_publish_status(access_token: str, publish_id: str) -> dict:
    pid = str(publish_id or "").strip()
    if not pid:
        raise RuntimeError("TikTok status check failed: publish id missing")

    resp = requests.post(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json={"publish_id": pid},
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"TikTok status check failed: {resp.text[:300]}")

    payload = resp.json() if resp.text else {}
    data = payload.get("data") if isinstance(payload, dict) else {}
    if not isinstance(data, dict):
        data = {}
    status_raw = str(
        data.get("publish_status")
        or data.get("status")
        or data.get("post_status")
        or ""
    ).strip().upper()
    fail_reason = str(
        data.get("fail_reason")
        or data.get("reason")
        or data.get("error_message")
        or ""
    ).strip()
    return {"status_raw": status_raw, "reason": fail_reason, "data": data}


def _classify_tiktok_publish_status(status_raw: Any) -> str:
    s = str(status_raw or "").strip().upper()
    if not s:
        return "processing"
    if any(token in s for token in ("PUBLISH_COMPLETE", "PUBLISHED", "SUCCESS", "POSTED", "SEND_TO_USER_INBOX")):
        return "posted"
    if any(token in s for token in ("FAIL", "FAILED", "REJECT", "DENY", "ERROR", "CANCEL")):
        return "failed"
    return "processing"


def _tiktok_wait_for_publish_status(access_token: str, publish_id: str) -> dict:
    max_polls = max(1, min(30, int((os.getenv("TIKTOK_STATUS_MAX_POLLS") or "6").strip() or "6")))
    wait_seconds = max(
        0.5,
        min(10.0, float((os.getenv("TIKTOK_STATUS_POLL_INTERVAL_SECONDS") or "2").strip() or "2")),
    )

    last = {"status_raw": "", "reason": "", "data": {}}
    for idx in range(max_polls):
        last = _tiktok_fetch_publish_status(access_token, publish_id)
        state = _classify_tiktok_publish_status(last.get("status_raw"))
        if state != "processing":
            return {"state": state, **last}
        if idx < max_polls - 1:
            time.sleep(wait_seconds)

    return {"state": "processing", **last}


def _youtube_upload_video(
    access_token: str,
    title: str,
    description: str,
    video_path: str,
    *,
    privacy_status: str = "public",
) -> str:
    privacy = str(privacy_status or "public").strip().lower()
    if privacy not in YOUTUBE_PRIVACY_STATUSES:
        privacy = "public"
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
            "status": {"privacyStatus": privacy},
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


def _facebook_upload_video(
    page_access_token: str,
    page_id: str,
    title: str,
    description: str,
    video_path: str,
    video_url: Optional[str] = None,
) -> str:
    endpoint = f"https://graph-video.facebook.com/v20.0/{page_id}/videos"
    base_data = {
        "title": title,
        "description": description,
        "published": "true",
        "access_token": page_access_token,
    }

    # Prefer direct upload from backend file. This avoids external URL fetch issues.
    with open(video_path, "rb") as src:
        resp = requests.post(
            endpoint,
            data=base_data,
            files={"source": ("clip.mp4", src, "video/mp4")},
            timeout=180,
        )
    if resp.status_code < 400:
        data = resp.json() if resp.text else {}
        return str(data.get("id") or "")

    source_err = (resp.text or "").strip()[:300]
    if video_url:
        url_resp = requests.post(
            endpoint,
            data={**base_data, "file_url": video_url},
            timeout=90,
        )
        if url_resp.status_code < 400:
            data = url_resp.json() if url_resp.text else {}
            return str(data.get("id") or "")
        url_err = (url_resp.text or "").strip()[:300]
        raise RuntimeError(f"Facebook upload failed: source={source_err} | file_url={url_err}")

    raise RuntimeError(f"Facebook upload failed: {source_err}")


def _instagram_publish_reel(
    page_access_token: str,
    ig_user_id: str,
    caption: str,
    video_url: str,
    *,
    share_to_feed: bool = True,
) -> str:
    create_resp = requests.post(
        f"https://graph.facebook.com/v20.0/{ig_user_id}/media",
        data={
            "media_type": "REELS",
            "video_url": video_url,
            "caption": caption[:2200],
            "share_to_feed": "true" if share_to_feed else "false",
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


def _tiktok_publish_video(
    access_token: str,
    title: str,
    description: str,
    video_path: str,
    *,
    options: Optional[Dict[str, Any]] = None,
) -> str:
    normalized = _normalize_provider_post_options("tiktok", options or {})
    publish_mode = str(normalized.get("publish_mode") or "DIRECT_POST").strip().upper()
    privacy = str(normalized.get("privacy_level") or "SELF_ONLY").strip().upper()
    allow_comments = bool(normalized.get("allow_comments", False))
    allow_duet = bool(normalized.get("allow_duet", False))
    allow_stitch = bool(normalized.get("allow_stitch", False))
    branded_content = bool(normalized.get("branded_content", False))
    brand_organic = bool(normalized.get("brand_organic", False))
    is_aigc = bool(normalized.get("is_aigc", False))

    text = (description or title or "New Orbito clip").strip()
    video_size = int(os.path.getsize(video_path))
    if video_size <= 0:
        raise RuntimeError("TikTok upload failed: empty video file")

    # TikTok chunk rules:
    # - <5MB must be one whole chunk (chunk_size == video_size)
    # - chunk_size for multi-chunk should stay within [5MB, 64MB]
    # - total_chunk_count for init must follow floor(video_size/chunk_size)
    #   and the final uploaded chunk carries any remainder bytes.
    min_chunk = 5 * 1024 * 1024
    max_chunk = 64 * 1024 * 1024
    default_chunk_size = 10 * 1024 * 1024

    if video_size < min_chunk:
        chunk_size = video_size
        total_chunk_count = 1
    elif video_size <= max_chunk:
        chunk_size = video_size
        total_chunk_count = 1
    else:
        configured_chunk = int(
            (os.getenv("TIKTOK_UPLOAD_CHUNK_SIZE") or str(default_chunk_size)).strip() or default_chunk_size
        )
        chunk_size = max(min_chunk, min(configured_chunk, max_chunk))
        total_chunk_count = max(1, int(video_size // chunk_size))
        if total_chunk_count > 1000:
            chunk_size = max(min_chunk, min(max_chunk, int(math.ceil(video_size / 1000.0))))
            total_chunk_count = max(1, int(video_size // chunk_size))
        if total_chunk_count > 1000:
            raise RuntimeError("TikTok upload failed: video exceeds 1000-chunk limit")

    source_info = {
        "source": "FILE_UPLOAD",
        "video_size": video_size,
        "chunk_size": chunk_size,
        "total_chunk_count": total_chunk_count,
    }
    if publish_mode == "MEDIA_UPLOAD":
        init_url = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/"
        payload: Dict[str, Any] = {"source_info": source_info}
    else:
        init_url = "https://open.tiktokapis.com/v2/post/publish/video/init/"
        post_info: Dict[str, Any] = {
            "title": text[:150],
            "privacy_level": privacy,
            "disable_duet": not allow_duet,
            "disable_comment": not allow_comments,
            "disable_stitch": not allow_stitch,
            "brand_content_toggle": branded_content,
            "brand_organic_toggle": brand_organic,
        }
        # TikTok supports explicit AI-generated content disclosure for direct posts.
        if is_aigc:
            post_info["is_aigc"] = True
        payload = {
            "post_info": post_info,
            "source_info": source_info,
        }

    init_resp = requests.post(
        init_url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json=payload,
        timeout=45,
    )
    if init_resp.status_code >= 400:
        raise RuntimeError(f"TikTok publish init failed: {init_resp.text[:300]}")
    data = init_resp.json() if init_resp.text else {}
    d = data.get("data") if isinstance(data, dict) else {}
    upload_url = str((d or {}).get("upload_url") or "").strip()
    if not upload_url:
        raise RuntimeError(f"TikTok publish init failed: upload_url missing ({str(data)[:220]})")

    with open(video_path, "rb") as src:
        for index in range(total_chunk_count):
            start = index * chunk_size
            if index == total_chunk_count - 1:
                # Final chunk includes all remaining bytes (may exceed chunk_size).
                expected_size = video_size - start
            else:
                expected_size = chunk_size
            end = start + expected_size - 1
            chunk = src.read(expected_size)
            if len(chunk) != expected_size:
                raise RuntimeError("TikTok upload failed: unexpected EOF while reading video")

            upload_resp = requests.put(
                upload_url,
                data=chunk,
                headers={
                    "Content-Type": "video/mp4",
                    "Content-Length": str(expected_size),
                    "Content-Range": f"bytes {start}-{end}/{video_size}",
                },
                timeout=180,
            )
            if upload_resp.status_code not in (200, 201, 204, 206):
                raise RuntimeError(f"TikTok upload failed: {upload_resp.text[:300]}")

    return str((d or {}).get("publish_id") or (d or {}).get("video_id") or "")


def _validate_tiktok_post_options(
    db: Session,
    *,
    user_id: int,
    clip_duration_seconds: float,
    options: dict,
) -> dict:
    account = (
        db.query(SocialAccount)
        .filter(
            SocialAccount.user_id == user_id,
            SocialAccount.provider == "tiktok",
            SocialAccount.status == "connected",
        )
        .first()
    )
    if not account or not account.access_token:
        raise HTTPException(status_code=400, detail="Connect TikTok first")

    publish_mode = str(options.get("publish_mode") or "DIRECT_POST").strip().upper()
    is_direct_post = publish_mode == "DIRECT_POST"

    scope_set = _as_scope_set(account.scopes)
    if is_direct_post and scope_set and "video.publish" not in scope_set:
        raise HTTPException(
            status_code=422,
            detail="TikTok account is missing video.publish scope. Reconnect TikTok and approve direct posting.",
        )

    try:
        access_token = _refresh_access_token_if_needed(db, account)
        creator = _tiktok_query_creator_info(access_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=_friendly_publish_error("tiktok", str(e)))

    blocked_reason = _tiktok_post_block_reason(creator)
    if blocked_reason:
        raise HTTPException(status_code=422, detail=blocked_reason)

    privacy_raw = creator.get("privacy_level_options")
    privacy_choices: List[str] = []
    if isinstance(privacy_raw, list):
        privacy_choices = [str(x or "").strip().upper() for x in privacy_raw if str(x or "").strip()]
    privacy_level = str(options.get("privacy_level") or "").strip().upper()
    if is_direct_post and not privacy_level:
        raise HTTPException(status_code=422, detail="Select TikTok privacy level before posting.")
    if privacy_choices and privacy_level and privacy_level not in set(privacy_choices):
        raise HTTPException(
            status_code=422,
            detail=f"TikTok privacy level must be one of: {', '.join(privacy_choices)}",
        )
    options["privacy_level"] = privacy_level

    if is_direct_post and privacy_level == "SELF_ONLY":
        # Private posts cannot use paid partnership and do not support interaction toggles.
        if bool(options.get("branded_content")):
            raise HTTPException(
                status_code=422,
                detail="TikTok Paid partnership disclosure is unavailable for private posts.",
            )
        options["allow_comments"] = False
        options["allow_duet"] = False
        options["allow_stitch"] = False

    if is_direct_post and not bool(options.get("confirm_music_usage")):
        raise HTTPException(
            status_code=422,
            detail="Confirm TikTok Music Usage terms before posting.",
        )
    needs_branded_confirm = bool(options.get("branded_content")) or bool(options.get("brand_organic"))
    if is_direct_post and needs_branded_confirm and not bool(options.get("confirm_branded_content")):
        raise HTTPException(
            status_code=422,
            detail="Confirm TikTok Branded Content disclosure before posting.",
        )

    max_duration = int(creator.get("max_video_post_duration_sec") or 0)
    if max_duration > 0 and float(clip_duration_seconds or 0.0) > float(max_duration):
        raise HTTPException(
            status_code=422,
            detail=(
                f"TikTok max post duration for this account is {max_duration}s. "
                "Trim clip duration or switch to another platform."
            ),
        )

    # Lock interaction toggles to creator capability values when TikTok indicates restrictions.
    if "comment_disabled" in creator:
        if bool(creator.get("comment_disabled", False)):
            options["allow_comments"] = False
        options["allow_comments_locked"] = bool(creator.get("comment_disabled", False))
    if "duet_disabled" in creator:
        if bool(creator.get("duet_disabled", False)):
            options["allow_duet"] = False
        options["allow_duet_locked"] = bool(creator.get("duet_disabled", False))
    if "stitch_disabled" in creator:
        if bool(creator.get("stitch_disabled", False)):
            options["allow_stitch"] = False
        options["allow_stitch_locked"] = bool(creator.get("stitch_disabled", False))
    return options


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

    _enforce_clip_platform_limit(
        db,
        user=current_user,
        clip_id=clip.id,
        provider=provider,
    )

    post_options = _normalize_provider_post_options(provider, req.platform_options)
    if provider == "tiktok":
        post_options = _validate_tiktok_post_options(
            db,
            user_id=current_user.id,
            clip_duration_seconds=float(clip.duration or 0.0),
            options=post_options,
        )

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
        post_options_json=_safe_json_dumps(post_options),
        status="scheduled" if when else "queued",
        scheduled_at=when,
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    # "Post now" requests are dispatched immediately so callers get final status.
    if not when:
        _dispatch_due_posts(db, limit=1, user_id=current_user.id, only_post_ids=[post.id])
        db.refresh(post)

    return _serialize_social_post(post)


@router.get("/posts", response_model=List[SocialPostResponse])
def list_posts(
    clip_id: Optional[int] = None,
    limit: int = 40,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(SocialPost).filter(SocialPost.user_id == current_user.id)
    if clip_id is not None:
        q = q.filter(SocialPost.clip_id == clip_id)

    rows = (
        q.order_by(SocialPost.id.desc())
        .limit(max(1, min(100, int(limit))))
        .all()
    )
    return [_serialize_social_post(r) for r in rows]


def _load_due_posts(
    db: Session,
    *,
    limit: int,
    user_id: Optional[int] = None,
    only_post_ids: Optional[List[int]] = None,
) -> List[SocialPost]:
    now = datetime.now(timezone.utc)
    q = db.query(SocialPost).filter(
        SocialPost.status.in_(["queued", "scheduled"]),
        (SocialPost.scheduled_at == None) | (SocialPost.scheduled_at <= now),
    )
    if user_id is not None:
        q = q.filter(SocialPost.user_id == user_id)
    if only_post_ids:
        q = q.filter(SocialPost.id.in_(only_post_ids))
    return (
        q.order_by(SocialPost.id.asc())
        .limit(max(1, min(100, int(limit))))
        .all()
    )


def _dispatch_posts(db: Session, posts: List[SocialPost]) -> List[dict]:
    if not posts:
        return []

    results: List[dict] = []
    storage = get_storage()

    for post in posts:
        tmp_path = None
        try:
            if post.provider not in _allowed_autopost_providers():
                raise RuntimeError("Provider pending approval")

            # Claim this post atomically to prevent double-processing across
            # concurrent dispatch calls (manual + background loop).
            claimed = (
                db.query(SocialPost)
                .filter(SocialPost.id == post.id, SocialPost.status.in_(["queued", "scheduled"]))
                .update({SocialPost.status: "posting"}, synchronize_session=False)
            )
            db.commit()
            if claimed == 0:
                db.refresh(post)
                results.append(_serialize_social_post(post))
                continue

            db.refresh(post)
            post.attempts = int(post.attempts or 0) + 1
            db.commit()

            account = (
                db.query(SocialAccount)
                .filter(SocialAccount.user_id == post.user_id, SocialAccount.provider == post.provider)
                .first()
            )
            # Instagram publishing uses Meta Graph permissions; a connected Facebook
            # account can be used as fallback token source.
            if (not account or not account.access_token) and post.provider == "instagram":
                account = (
                    db.query(SocialAccount)
                    .filter(SocialAccount.user_id == post.user_id, SocialAccount.provider == "facebook")
                    .first()
                )
            if not account or not account.access_token:
                raise RuntimeError("No connected account")

            access_token = _refresh_access_token_if_needed(db, account)

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
            post_options = _safe_json_loads(getattr(post, "post_options_json", None))

            if post.provider == "youtube":
                yt_opts = _normalize_provider_post_options("youtube", post_options)
                remote_id = _youtube_upload_video(
                    access_token,
                    title,
                    desc,
                    tmp_path,
                    privacy_status=str(yt_opts.get("privacy_status") or "public"),
                )
                post.remote_id = remote_id
            elif post.provider == "facebook":
                page = _meta_pick_page(access_token, preferred_page_id=account.account_id)
                page_id = str(page.get("id") or "")
                page_token = str(page.get("access_token") or "")
                if not page_id or not page_token:
                    raise RuntimeError("Facebook Page access token missing")
                clip_url = None
                try:
                    clip_url = _absolute_storage_url(storage, post.storage_key)
                except Exception:
                    clip_url = None
                remote_id = _facebook_upload_video(
                    page_token,
                    page_id,
                    title,
                    desc,
                    tmp_path,
                    clip_url,
                )
                post.remote_id = remote_id
            elif post.provider == "instagram":
                clip_url = _absolute_storage_url(storage, post.storage_key)
                page = _meta_pick_instagram(access_token, preferred_ig_id=account.account_id)
                ig = page.get("instagram_business_account") or {}
                ig_user_id = str(ig.get("id") or "").strip()
                page_token = str(page.get("access_token") or "").strip()
                if not ig_user_id:
                    raise RuntimeError("No Instagram Professional account linked to a Facebook Page")
                if not page_token:
                    raise RuntimeError("Facebook Page access token missing for Instagram publish")
                ig_opts = _normalize_provider_post_options("instagram", post_options)
                share_to_feed = bool(ig_opts.get("share_to_feed", True))
                remote_id = _instagram_publish_reel(
                    page_token,
                    ig_user_id,
                    desc,
                    clip_url,
                    share_to_feed=share_to_feed,
                )
                post.remote_id = remote_id
            elif post.provider == "tiktok":
                tk_opts = _normalize_provider_post_options("tiktok", post_options)
                remote_id = _tiktok_publish_video(access_token, title, desc, tmp_path, options=tk_opts)
                post.remote_id = remote_id
                if str(tk_opts.get("publish_mode") or "").upper() == "DIRECT_POST" and remote_id:
                    status_info = _tiktok_wait_for_publish_status(access_token, remote_id)
                    state = str(status_info.get("state") or "processing").lower()
                    if state == "failed":
                        reason = str(status_info.get("reason") or "").strip()
                        if not reason:
                            reason = f"TikTok publish failed ({status_info.get('status_raw') or 'failed'})."
                        raise RuntimeError(reason)
                    if state == "processing":
                        post.status = "posting"
                        post.posted_at = None
                        post.last_error = (
                            "TikTok is processing this post. This can take a few minutes. "
                            "Status will update automatically."
                        )
                        continue
            else:
                raise RuntimeError(f"Unsupported provider: {post.provider}")

            post.status = "posted"
            post.posted_at = datetime.now(timezone.utc)
            post.last_error = None
        except Exception as e:
            post.status = "failed"
            post.last_error = _friendly_publish_error(post.provider, str(e))[:1000]
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
            db.commit()
            results.append(_serialize_social_post(post))

    return results


def _sync_tiktok_post_statuses(
    db: Session,
    *,
    user_id: int,
    limit: int = 12,
) -> dict:
    rows = (
        db.query(SocialPost)
        .filter(
            SocialPost.user_id == user_id,
            SocialPost.provider == "tiktok",
            SocialPost.status == "posting",
            SocialPost.remote_id != None,
        )
        .order_by(SocialPost.id.desc())
        .limit(max(1, min(50, int(limit))))
        .all()
    )
    if not rows:
        return {"checked": 0, "updated": 0, "results": []}

    account = (
        db.query(SocialAccount)
        .filter(
            SocialAccount.user_id == user_id,
            SocialAccount.provider == "tiktok",
            SocialAccount.status == "connected",
        )
        .first()
    )
    if not account or not account.access_token:
        return {"checked": 0, "updated": 0, "results": []}

    try:
        access_token = _refresh_access_token_if_needed(db, account)
    except Exception:
        return {"checked": 0, "updated": 0, "results": []}

    changed: List[SocialPost] = []
    checked = 0
    for row in rows:
        publish_id = str(row.remote_id or "").strip()
        if not publish_id:
            continue
        checked += 1
        try:
            status_info = _tiktok_fetch_publish_status(access_token, publish_id)
            state = _classify_tiktok_publish_status(status_info.get("status_raw"))
            if state == "posted":
                row.status = "posted"
                row.posted_at = datetime.now(timezone.utc)
                row.last_error = None
                changed.append(row)
            elif state == "failed":
                reason = str(status_info.get("reason") or "").strip()
                row.status = "failed"
                row.last_error = reason or f"TikTok publish failed ({status_info.get('status_raw') or 'failed'})."
                changed.append(row)
            else:
                row.last_error = (
                    "TikTok is processing this post. This can take a few minutes. "
                    f"Last status: {status_info.get('status_raw') or 'PROCESSING'}"
                )
                changed.append(row)
        except Exception as e:
            row.last_error = _friendly_publish_error("tiktok", str(e))[:1000]
            changed.append(row)

    db.commit()
    return {"checked": checked, "updated": len(changed), "results": [_serialize_social_post(r) for r in rows]}


def _dispatch_due_posts(
    db: Session,
    *,
    limit: int,
    user_id: Optional[int] = None,
    only_post_ids: Optional[List[int]] = None,
) -> List[dict]:
    posts = _load_due_posts(db, limit=limit, user_id=user_id, only_post_ids=only_post_ids)
    return _dispatch_posts(db, posts)


def dispatch_due_posts_global(limit: int = 20) -> int:
    db = SessionLocal()
    try:
        results = _dispatch_due_posts(db, limit=max(1, min(100, int(limit))))
        return len(results)
    finally:
        db.close()


@router.post("/posts/dispatch")
def dispatch_posts(
    limit: int = 3,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = _dispatch_due_posts(
        db,
        limit=max(1, min(100, int(limit))),
        user_id=current_user.id,
    )
    return {"processed": len(results), "results": results}


@router.post("/posts/sync")
def sync_posts(
    limit: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _sync_tiktok_post_statuses(db, user_id=current_user.id, limit=limit)
