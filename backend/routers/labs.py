from __future__ import annotations

import os
from typing import List

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


@router.get("/health", response_model=LabsHealthResponse)
def labs_health():
    return LabsHealthResponse(
        status="ok",
        phase=_phase(),
        mode=_mode(),
    )


@router.get("/status", response_model=LabsStatusResponse)
def labs_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    frontend_url = _clean_url(
        os.getenv("LABS_FRONTEND_URL") or "",
        "https://clipforge.us",
    )
    api_url = _clean_url(
        os.getenv("LABS_API_URL") or "",
        "https://api.clipforge.us",
    )

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
        labs_frontend_url=frontend_url,
        labs_api_url=api_url,
        unified_auth=True,
        unified_connections=(os.getenv("LABS_SHARE_USE_ORBITO_CONNECTIONS") or "1").strip().lower()
        in {"1", "true", "yes", "on"},
        connected_providers=providers,
        connected_accounts=len(providers),
        user_plan=str(getattr(current_user, "plan", "free")),
        user_credits=int(getattr(current_user, "credits", 0) or 0),
    )
