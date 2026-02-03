from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.database import get_db
from models.user import User
from models.automation import AutomationRule
from models.clip import Clip
from models.job import Job
from models.social_post import SocialPost
from routers.auth import get_current_user

router = APIRouter(prefix="/automations", tags=["automations"])


def _allowed_autopost_providers() -> set:
    raw = (os.getenv("AUTOPOST_PROVIDERS") or "youtube").strip()
    return {p.strip().lower() for p in raw.split(",") if p.strip()}


class AutomationRuleRequest(BaseModel):
    name: str = Field(..., min_length=2)
    trigger: str = Field(..., min_length=2)
    action: str = Field(..., min_length=2)
    enabled: bool = True
    config: Optional[Dict[str, Any]] = None


class AutomationRuleResponse(BaseModel):
    id: int
    name: str
    trigger: str
    action: str
    enabled: bool
    config: Optional[Dict[str, Any]]


class AutomationTriggerRequest(BaseModel):
    event: str
    job_id: int
    user_id: Optional[int] = None


def _safe_json_loads(s: Any) -> dict:
    if not s:
        return {}
    if isinstance(s, dict):
        return s
    try:
        return json.loads(str(s))
    except Exception:
        return {}


@router.get("/rules", response_model=List[AutomationRuleResponse])
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(AutomationRule)
        .filter(AutomationRule.user_id == current_user.id)
        .order_by(AutomationRule.id.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "trigger": r.trigger,
            "action": r.action,
            "enabled": bool(r.enabled),
            "config": _safe_json_loads(r.config_json),
        }
        for r in rows
    ]


@router.post("/rules", response_model=AutomationRuleResponse)
def create_rule(
    req: AutomationRuleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = AutomationRule(
        user_id=current_user.id,
        name=req.name.strip(),
        trigger=req.trigger.strip(),
        action=req.action.strip(),
        enabled=bool(req.enabled),
        config_json=json.dumps(req.config or {}),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {
        "id": rule.id,
        "name": rule.name,
        "trigger": rule.trigger,
        "action": rule.action,
        "enabled": bool(rule.enabled),
        "config": _safe_json_loads(rule.config_json),
    }


@router.post("/trigger")
def trigger_automations(
    payload: AutomationTriggerRequest,
    db: Session = Depends(get_db),
    x_orbito_automation_secret: Optional[str] = Header(None, alias="X-Orbito-Automation-Secret"),
):
    required_secret = (os.getenv("AUTOMATION_WEBHOOK_SECRET") or "").strip()
    if required_secret and x_orbito_automation_secret != required_secret:
        raise HTTPException(status_code=403, detail="Invalid automation secret")

    job = db.query(Job).filter(Job.id == payload.job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")

    user_id = payload.user_id or job.user_id
    rules = (
        db.query(AutomationRule)
        .filter(
            AutomationRule.user_id == user_id,
            AutomationRule.enabled == True,
            AutomationRule.trigger == payload.event,
        )
        .all()
    )
    if not rules:
        return {"triggered": 0}

    clips = db.query(Clip).filter(Clip.job_id == job.id).all()

    triggered = 0
    for rule in rules:
        cfg = _safe_json_loads(rule.config_json)
        if rule.action == "autopost.queue":
            provider = (cfg.get("provider") or "youtube").lower()
            if provider not in _allowed_autopost_providers():
                continue
            delay_min = int(cfg.get("schedule_delay_minutes") or 0)
            caption_tpl = cfg.get("caption_template") or "New Orbito clip"

            for c in clips:
                post = SocialPost(
                    user_id=user_id,
                    clip_id=c.id,
                    provider=provider,
                    storage_key=c.storage_key,
                    caption=caption_tpl,
                    status="scheduled" if delay_min > 0 else "queued",
                    scheduled_at=(
                        datetime.now(timezone.utc) + timedelta(minutes=delay_min)
                        if delay_min > 0
                        else None
                    ),
                )
                db.add(post)
            db.commit()
            triggered += 1
        else:
            # unknown action (ignored)
            continue

    return {"triggered": triggered}
