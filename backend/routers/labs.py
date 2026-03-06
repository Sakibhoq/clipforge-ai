from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import List
from urllib.parse import quote

import jwt
from fastapi import APIRouter, Depends
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
        "https://clipforge.us",
    )


def _labs_api_url() -> str:
    return _clean_url(
        os.getenv("LABS_API_URL") or "",
        "https://api.clipforge.us",
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


class LabsLaunchResponse(BaseModel):
    launch_url: str
    mode: str
    ttl_seconds: int
    expires_at_utc: str


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
    )


@router.get("/launch", response_model=LabsLaunchResponse)
def labs_launch(
    current_user: User = Depends(get_current_user),
):
    mode = _mode()
    frontend_url = _labs_frontend_url().rstrip("/")
    ttl_seconds = _bridge_ttl_seconds()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=ttl_seconds)

    token = _build_bridge_token(current_user)
    launch_url = (
        f"{frontend_url}/?source=orbitosite&origin=orbitosite&bridge_mode={mode}"
        f"&bridge_token={quote(token)}"
    )

    return LabsLaunchResponse(
        launch_url=launch_url,
        mode=mode,
        ttl_seconds=ttl_seconds,
        expires_at_utc=expires_at.isoformat(),
    )
