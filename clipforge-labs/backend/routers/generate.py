from __future__ import annotations

import json
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.database import get_db
from models.job import Job
from models.upload import Upload
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/labs", tags=["labs"])

ALLOWED_ASPECT_RATIOS = {"9:16", "16:9", "1:1"}
ALLOWED_DURATIONS = {4, 6, 8}

PLAN_MAX_DURATION_SECONDS = {
    "free": 4,
    "starter": 6,
    "creator": 8,
    "studio": 8,
}

PLAN_MAX_PENDING_GENERATE_JOBS = {
    "free": 1,
    "starter": 2,
    "creator": 4,
    "studio": 8,
}


def _plan_key(raw_plan: str | None) -> str:
    p = (raw_plan or "free").strip().lower()
    return p if p in PLAN_MAX_DURATION_SECONDS else "free"


def _credits_per_second() -> int:
    raw = (os.getenv("LABS_CREDITS_PER_SECOND") or "1").strip()
    try:
        return max(1, int(raw))
    except Exception:
        return 1


def _credits_needed(duration_seconds: int) -> int:
    # Launch economics: 1 credit = 1 second by default (overridable via env).
    return max(1, int(duration_seconds or 0)) * _credits_per_second()


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1200)
    negative_prompt: str | None = Field(default=None, max_length=1200)
    aspect_ratio: str = "9:16"
    duration_seconds: int = Field(default=6, ge=4, le=8)
    model: str | None = Field(default="google", max_length=64)
    style_preset: str | None = Field(default="social-native", max_length=64)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    input_image_key: str | None = Field(default=None, max_length=512)


class GenerateResponse(BaseModel):
    upload_id: int
    job_id: int
    credits_reserved: int
    duration_seconds: int


@router.post("/generate", response_model=GenerateResponse)
def create_generation(
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prompt = (payload.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    ar = (payload.aspect_ratio or "").strip()
    if ar not in ALLOWED_ASPECT_RATIOS:
        raise HTTPException(status_code=400, detail="Unsupported aspect ratio")

    duration_seconds = int(payload.duration_seconds or 6)
    if duration_seconds not in ALLOWED_DURATIONS:
        raise HTTPException(status_code=422, detail="Duration must be one of: 4, 6, 8 seconds")

    model = (payload.model or "google").strip().lower()
    if model not in {"google"}:
        raise HTTPException(status_code=400, detail="Unsupported model")

    input_image_key = (payload.input_image_key or "").strip() or None
    if input_image_key and not input_image_key.startswith(f"users/{current_user.id}/"):
        raise HTTPException(status_code=403, detail="input_image_key must belong to the current user")

    credits_needed = _credits_needed(duration_seconds)

    upload = None
    job = None

    # We reuse the existing Upload/Job/Clip tables so social posting + clip playback work unchanged.
    meta_key = f"generations/meta/{uuid.uuid4().hex}.json"

    try:
        with db.begin():
            # Lock the user row while reserving credits.
            user_row = (
                db.query(User)
                .filter(User.id == current_user.id)
                .with_for_update()
                .first()
            )
            if not user_row:
                raise HTTPException(status_code=401, detail="Not authenticated")

            plan = _plan_key(getattr(user_row, "plan", None))
            plan_max_duration = int(PLAN_MAX_DURATION_SECONDS.get(plan, 4))
            if duration_seconds > plan_max_duration:
                raise HTTPException(
                    status_code=403,
                    detail=f"{plan.capitalize()} plan supports up to {plan_max_duration}s per generation",
                )

            pending_jobs = (
                db.query(func.count(Job.id))
                .join(Upload, Job.upload_id == Upload.id)
                .filter(
                    Upload.user_id == user_row.id,
                    Job.kind == "generate",
                    Job.status.in_(["queued", "running"]),
                )
                .scalar()
                or 0
            )
            max_pending = int(PLAN_MAX_PENDING_GENERATE_JOBS.get(plan, 1))
            if int(pending_jobs) >= max_pending:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"You already have {int(pending_jobs)} active generation job(s). "
                        f"{plan.capitalize()} plan allows up to {max_pending}."
                    ),
                )

            if int(user_row.credits or 0) < int(credits_needed or 0):
                raise HTTPException(
                    status_code=402,
                    detail=f"Insufficient credits (need {int(credits_needed)}, have {int(user_row.credits or 0)})",
                )

            user_row.credits = int(user_row.credits or 0) - int(credits_needed)

            upload = Upload(
                user_id=user_row.id,
                original_filename="generated.mp4",
                storage_key=meta_key,
                source_type="generated",
                source_url=None,
                source_id=None,
                # NOTE: transcript is reused here as a simple storage field for the prompt metadata.
                transcript=prompt,
            )
            db.add(upload)
            db.flush()

            settings_payload = {
                "style_preset": (payload.style_preset or "social-native"),
                "seed": payload.seed,
                "input_image_key": input_image_key,
            }

            job = Job(
                upload_id=upload.id,
                kind="generate",
                status="queued",
                aspect_ratio=ar,
                captions_enabled=False,
                watermark_enabled=True,
                caption_style_json=json.dumps(settings_payload),
                prompt=prompt,
                negative_prompt=(payload.negative_prompt or None),
                model=model,
                duration_seconds=duration_seconds,
            )
            job.credits_reserved = int(credits_needed)
            db.add(job)
            db.flush()

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to start generation")

    return GenerateResponse(
        upload_id=int(upload.id),
        job_id=int(job.id),
        credits_reserved=int(credits_needed),
        duration_seconds=int(duration_seconds),
    )
