from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, List, Literal
from urllib.parse import quote

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.database import get_db
from models.social_account import SocialAccount
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/labs", tags=["labs"])


def _clean_url(raw: str, fallback: str) -> str:
    value = (raw or "").strip()
    if not value:
        return fallback
    if "://" not in value and value.count(".") >= 1:
        return f"https://{value}"
    return value


def _phase() -> str:
    value = (os.getenv("LABS_PHASE") or "foundation").strip().lower()
    return value or "foundation"


def _mode() -> str:
    value = (os.getenv("LABS_MODE") or "external_bridge").strip().lower()
    return value or "external_bridge"


def _labs_frontend_url() -> str:
    return _clean_url(
        os.getenv("LABS_FRONTEND_URL") or "",
        "https://app.orbito.cc/app/labs",
    )


def _labs_api_url() -> str:
    return _clean_url(
        os.getenv("LABS_API_URL") or "",
        "https://api.orbito.cc",
    )


def _bridge_secret() -> str:
    return (
        os.getenv("LABS_BRIDGE_SECRET")
        or os.getenv("LABS_BRIDGE_TOKEN_SECRET")
        or os.getenv("SECRET_KEY")
        or ""
    )


def _bridge_ttl_seconds() -> int:
    raw = os.getenv("LABS_BRIDGE_TOKEN_TTL_SECONDS") or "300"
    try:
        value = int(raw.strip())
    except Exception:
        value = 300
    return max(120, min(3600, value))


def _labs_plan_lock_enabled() -> bool:
    raw = (os.getenv("LABS_ENFORCE_PLAN_LOCK") or "0").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _canonical_plan_token(raw_plan: str | None) -> str:
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in str(raw_plan or "").strip()).strip("_")


def _has_labs_plan_access(raw_plan: str | None) -> bool:
    token = _canonical_plan_token(raw_plan)
    if not token:
        return False
    if token in {"labs_starter", "labs_spark", "labs_creator", "labs_velocity"}:
        return True
    return "labs" in token or "spark" in token or "velocity" in token


def _has_effective_labs_access(raw_plan: str | None) -> bool:
    if not _labs_plan_lock_enabled():
        return True
    return _has_labs_plan_access(raw_plan)


def _labs_next_target(target: str) -> str:
    t = str(target or "app").strip().lower()
    if t == "generate":
        return "/app/generate"
    if t == "clips":
        # Open Labs clips page in generated-only mode so this route only surfaces AI output.
        return "/app/clips?generated=1"
    return "/app"


class LabsHealthResponse(BaseModel):
    status: str
    phase: str
    mode: str


class LabsStatusResponse(BaseModel):
    phase: str
    mode: str
    labs_frontend_url: str
    labs_api_url: str
    unified_auth: bool
    unified_connections: bool
    connected_providers: List[str]
    connected_accounts: int
    user_plan: str
    user_credits: int
    labs_access: bool


class LabsLaunchResponse(BaseModel):
    launch_url: str
    mode: str
    ttl_seconds: int
    expires_at_utc: str
    target: str


class LabsEntitlementsSnapshotRequest(BaseModel):
    token: str


class LabsEntitlementsAdjustRequest(BaseModel):
    token: str
    delta: int
    reason: str | None = None
    reference: str | None = None


class LabsEntitlementsResponse(BaseModel):
    ok: bool
    email: str
    plan: str
    credits: int


@router.get("/health", response_model=LabsHealthResponse)
def labs_health():
    return LabsHealthResponse(
        status="ok",
        phase=_phase(),
        mode=_mode(),
    )


def _build_bridge_token(user: User) -> str:
    secret = _bridge_secret()
    ttl_seconds = _bridge_ttl_seconds()
    now = datetime.now(timezone.utc)
    exp = now + timedelta(seconds=ttl_seconds)

    payload = {
        "iss": "orbi-api",
        "aud": "orbito-labs",
        "sub": str(user.id),
        "email": user.email,
        "plan": str(getattr(user, "plan", "free")),
        "credits": int(getattr(user, "credits", 0) or 0),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def _decode_entitlements_token(token: str) -> dict[str, Any]:
    secret = _bridge_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="Labs entitlement bridge is not configured")

    allowed_issuers = {
        "orbito-labs-api",
        "orbito-labs-worker",
    }
    extra_issuers = (os.getenv("LABS_ENTITLEMENTS_ALLOWED_ISSUERS") or "").strip()
    if extra_issuers:
        for issuer in extra_issuers.split(","):
            v = issuer.strip()
            if v:
                allowed_issuers.add(v)

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="orbi-api-labs-entitlements",
            options={"require": ["exp", "iat", "iss", "aud", "email"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Entitlement token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid entitlement token")

    issuer = str(payload.get("iss") or "").strip()
    if issuer not in allowed_issuers:
        raise HTTPException(status_code=401, detail="Unauthorized entitlement issuer")
    return payload


def _user_by_entitlements_token(db: Session, token: str) -> User:
    payload = _decode_entitlements_token(token)
    email = str(payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Entitlement token missing email")

    user = db.query(User).filter(User.email == email).with_for_update().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found for entitlements bridge")
    if not getattr(user, "is_active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    return user


@router.get("/status", response_model=LabsStatusResponse)
def labs_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(SocialAccount.provider)
        .filter(SocialAccount.user_id == current_user.id)
        .filter(SocialAccount.status == "connected")
        .distinct()
        .all()
    )
    providers = sorted([str(r[0]) for r in rows if r and r[0]])

    return LabsStatusResponse(
        phase=_phase(),
        mode=_mode(),
        labs_frontend_url=_labs_frontend_url(),
        labs_api_url=_labs_api_url(),
        unified_auth=True,
        unified_connections=(os.getenv("LABS_SHARE_USE_ORBITO_CONNECTIONS") or "1").strip().lower()
        in {"1", "true", "yes", "on"},
        connected_providers=providers,
        connected_accounts=len(providers),
        user_plan=str(getattr(current_user, "plan", "free")),
        user_credits=int(getattr(current_user, "credits", 0) or 0),
        labs_access=_has_effective_labs_access(getattr(current_user, "plan", "free")),
    )


@router.get("/launch", response_model=LabsLaunchResponse)
def labs_launch(
    target: Literal["app", "generate", "clips"] = Query(default="app"),
    current_user: User = Depends(get_current_user),
):
    mode = _mode()
    frontend_url = _labs_frontend_url().rstrip("/")
    ttl_seconds = _bridge_ttl_seconds()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=ttl_seconds)

    if target in {"generate", "clips"} and not _has_effective_labs_access(getattr(current_user, "plan", "free")):
        raise HTTPException(
            status_code=402,
            detail="Labs plan required. Purchase a Labs plan to unlock Generator and AI Clips.",
        )

    token = _build_bridge_token(current_user)
    # Keep next target base-path agnostic; Labs frontend applies its own base path.
    next_target = _labs_next_target(target)
    launch_url = (
        f"{frontend_url}/login?next={quote(next_target, safe='')}"
        f"&source=orbitosite&origin=orbitosite&bridge_mode={mode}"
        f"&bridge_token={quote(token)}"
    )

    return LabsLaunchResponse(
        launch_url=launch_url,
        mode=mode,
        ttl_seconds=ttl_seconds,
        expires_at_utc=expires_at.isoformat(),
        target=target,
    )


@router.post("/entitlements/snapshot", response_model=LabsEntitlementsResponse)
def labs_entitlements_snapshot(
    payload: LabsEntitlementsSnapshotRequest,
    db: Session = Depends(get_db),
):
    user = _user_by_entitlements_token(db, payload.token)
    return LabsEntitlementsResponse(
        ok=True,
        email=str(user.email),
        plan=str(getattr(user, "plan", "free") or "free"),
        credits=int(getattr(user, "credits", 0) or 0),
    )


@router.post("/entitlements/adjust", response_model=LabsEntitlementsResponse)
def labs_entitlements_adjust(
    payload: LabsEntitlementsAdjustRequest,
    db: Session = Depends(get_db),
):
    user = _user_by_entitlements_token(db, payload.token)

    delta = int(payload.delta or 0)
    if delta == 0:
        return LabsEntitlementsResponse(
            ok=True,
            email=str(user.email),
            plan=str(getattr(user, "plan", "free") or "free"),
            credits=int(getattr(user, "credits", 0) or 0),
        )

    before = int(getattr(user, "credits", 0) or 0)
    after = before + delta
    if after < 0:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits (need {abs(delta)}, have {before})",
        )

    user.credits = after
    db.commit()

    return LabsEntitlementsResponse(
        ok=True,
        email=str(user.email),
        plan=str(getattr(user, "plan", "free") or "free"),
        credits=int(user.credits or 0),
    )
