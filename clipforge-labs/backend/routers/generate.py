from __future__ import annotations

import math
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.database import get_db
from models.job import Job
from models.upload import Upload
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/labs", tags=["labs"])

ALLOWED_ASPECT_RATIOS = {"9:16", "16:9", "1:1"}

def _credits_needed(duration_seconds: int) -> int:
    # Keep usage consistent with uploads: 2 credits per started minute.
    mins = max(1, int(math.ceil(float(duration_seconds or 0) / 60)))
    return mins * 2


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1200)
    negative_prompt: str | None = Field(default=None, max_length=1200)
    aspect_ratio: str = "9:16"
    duration_seconds: int = Field(default=6, ge=2, le=20)
    model: str | None = Field(default="google", max_length=64)


class GenerateResponse(BaseModel):
    upload_id: int
    job_id: int


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

            job = Job(
                upload_id=upload.id,
                kind="generate",
                status="queued",
                aspect_ratio=ar,
                captions_enabled=False,
                watermark_enabled=True,
                prompt=prompt,
                negative_prompt=(payload.negative_prompt or None),
                model=(payload.model or "google"),
                duration_seconds=duration_seconds,
            )
            job.credits_reserved = int(credits_needed)
            db.add(job)
            db.flush()

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to start generation")

    return GenerateResponse(upload_id=int(upload.id), job_id=int(job.id))
