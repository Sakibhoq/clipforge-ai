from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Generator, List

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.database import SessionLocal
from core.config import settings
from models.user import User
from routers.auth import COOKIE_NAME, get_current_user

router = APIRouter(prefix="/settings", tags=["settings"])


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class SettingsPreferencesResponse(BaseModel):
    email_reports: bool
    product_tips: bool
    auto_play_previews: bool
    receipts_enabled: bool
    processing_alerts_enabled: bool


class SettingsPreferencesUpdateRequest(BaseModel):
    email_reports: bool
    product_tips: bool
    auto_play_previews: bool
    receipts_enabled: bool
    processing_alerts_enabled: bool


class SessionItem(BaseModel):
    id: str
    current: bool
    device: str
    created_at: str | None = None
    expires_at: str | None = None
    ip: str | None = None


class SessionsResponse(BaseModel):
    sessions: List[SessionItem]


def _to_bool(value: object, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return bool(value)


def _to_iso_utc(epoch: object) -> str | None:
    try:
        ts = int(epoch)  # type: ignore[arg-type]
    except Exception:
        return None
    if ts <= 0:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


@router.get("/preferences", response_model=SettingsPreferencesResponse)
def get_preferences(current_user: User = Depends(get_current_user)):
    return SettingsPreferencesResponse(
        email_reports=_to_bool(getattr(current_user, "pref_email_reports", True), True),
        product_tips=_to_bool(getattr(current_user, "pref_product_tips", False), False),
        auto_play_previews=_to_bool(getattr(current_user, "pref_autoplay_previews", True), True),
        receipts_enabled=_to_bool(getattr(current_user, "notif_receipts", True), True),
        processing_alerts_enabled=_to_bool(getattr(current_user, "notif_processing_alerts", False), False),
    )


@router.put("/preferences", response_model=SettingsPreferencesResponse)
def update_preferences(
    payload: SettingsPreferencesUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user.pref_email_reports = bool(payload.email_reports)
    user.pref_product_tips = bool(payload.product_tips)
    user.pref_autoplay_previews = bool(payload.auto_play_previews)
    user.notif_receipts = bool(payload.receipts_enabled)
    user.notif_processing_alerts = bool(payload.processing_alerts_enabled)
    db.commit()

    return SettingsPreferencesResponse(
        email_reports=user.pref_email_reports,
        product_tips=user.pref_product_tips,
        auto_play_previews=user.pref_autoplay_previews,
        receipts_enabled=user.notif_receipts,
        processing_alerts_enabled=user.notif_processing_alerts,
    )


@router.get("/sessions", response_model=SessionsResponse)
def list_sessions(request: Request, current_user: User = Depends(get_current_user)):
    token = request.cookies.get(COOKIE_NAME) or ""
    payload = {}
    if token:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        except Exception:
            payload = {}

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()[:12] if token else "current"
    xf = (request.headers.get("x-forwarded-for") or "").strip()
    ip = xf.split(",")[0].strip() if xf else (request.client.host if request.client else None)
    user_agent = (request.headers.get("user-agent") or "").strip()
    device = user_agent[:140] if user_agent else "Current device"

    current = SessionItem(
        id=token_hash,
        current=True,
        device=device,
        created_at=_to_iso_utc(payload.get("iat")),
        expires_at=_to_iso_utc(payload.get("exp")),
        ip=ip,
    )
    return SessionsResponse(sessions=[current])

