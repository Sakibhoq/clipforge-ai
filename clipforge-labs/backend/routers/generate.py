from __future__ import annotations

import json
import math
import os
import uuid
from typing import Callable

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

JOB_KIND_VIDEO = "generate"
JOB_KIND_IMAGE = "generate_image"
JOB_KIND_VOICEOVER = "generate_voiceover"
GENERATION_JOB_KINDS = (JOB_KIND_VIDEO, JOB_KIND_IMAGE, JOB_KIND_VOICEOVER)
VIDEO_GENERATION_SPEEDS = {"relax", "fast"}

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

PLAN_MAX_VOICE_CHARS = {
    "free": 300,
    "starter": 1200,
    "creator": 3000,
    "studio": 6000,
}

PLAN_ALLOWED_VIDEO_SPEEDS = {
    "free": {"relax"},
    "starter": {"relax"},
    "creator": {"relax", "fast"},
    "studio": {"relax", "fast"},
}


def _env_int(name: str, default: int, *, min_value: int = 1, max_value: int = 1_000_000) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return max(min_value, min(max_value, int(raw)))
    except Exception:
        return default


def _plan_key(raw_plan: str | None) -> str:
    p = (raw_plan or "free").strip().lower()
    return p if p in PLAN_MAX_DURATION_SECONDS else "free"


def _video_speed_key(raw_speed: str | None) -> str:
    speed = (raw_speed or "relax").strip().lower()
    return speed if speed in VIDEO_GENERATION_SPEEDS else "relax"


def _video_credits_per_second(speed: str) -> int:
    baseline = _env_int("LABS_CREDITS_PER_SECOND", 1, min_value=1, max_value=100)
    if speed == "fast":
        return _env_int(
            "LABS_FAST_CREDITS_PER_SECOND",
            max(2, baseline * 2),
            min_value=1,
            max_value=100,
        )
    return _env_int("LABS_RELAX_CREDITS_PER_SECOND", baseline, min_value=1, max_value=100)


def _video_credits_needed(duration_seconds: int, speed: str) -> int:
    credits_per_second = _video_credits_per_second(speed)
    return max(1, int(duration_seconds or 0)) * credits_per_second


def _image_credits_needed() -> int:
    return _env_int("LABS_IMAGE_CREDITS", 4, min_value=1, max_value=200)


def _voiceover_credits_needed(script: str) -> int:
    chars_per_credit = _env_int("LABS_VOICE_CHARS_PER_CREDIT", 250, min_value=25, max_value=5000)
    min_credits = _env_int("LABS_VOICE_MIN_CREDITS", 1, min_value=1, max_value=200)
    length = max(0, len((script or "").strip()))
    usage_credits = int(math.ceil(float(length) / float(chars_per_credit))) if length > 0 else 0
    return max(min_credits, usage_credits)


def _check_model_supported(model: str | None) -> str:
    m = (model or "google").strip().lower()
    if m not in {"google"}:
        raise HTTPException(status_code=400, detail="Unsupported model")
    return m


def _assert_user_owned_key(user_id: int, key: str | None) -> str | None:
    value = (key or "").strip() or None
    if value and not value.startswith(f"users/{int(user_id)}/"):
        raise HTTPException(status_code=403, detail="input_image_key must belong to the current user")
    return value


def _create_generation_job(
    *,
    db: Session,
    current_user: User,
    kind: str,
    prompt: str,
    credits_needed: int,
    original_filename: str,
    aspect_ratio: str | None,
    duration_seconds: int | None,
    model: str,
    negative_prompt: str | None,
    settings_payload: dict,
    plan_guard: Callable[[str], None] | None = None,
) -> tuple[Upload, Job]:
    upload = None
    job = None

    meta_key = f"generations/meta/{uuid.uuid4().hex}.json"

    try:
        with db.begin():
            user_row = (
                db.query(User)
                .filter(User.id == current_user.id)
                .with_for_update()
                .first()
            )
            if not user_row:
                raise HTTPException(status_code=401, detail="Not authenticated")

            plan = _plan_key(getattr(user_row, "plan", None))
            if plan_guard:
                plan_guard(plan)

            pending_jobs = (
                db.query(func.count(Job.id))
                .join(Upload, Job.upload_id == Upload.id)
                .filter(
                    Upload.user_id == user_row.id,
                    Job.kind.in_(GENERATION_JOB_KINDS),
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

            have_credits = int(user_row.credits or 0)
            need_credits = int(credits_needed or 0)
            if have_credits < need_credits:
                raise HTTPException(
                    status_code=402,
                    detail=f"Insufficient credits (need {need_credits}, have {have_credits})",
                )

            user_row.credits = have_credits - need_credits

            upload = Upload(
                user_id=user_row.id,
                original_filename=original_filename,
                storage_key=meta_key,
                source_type="generated",
                source_url=None,
                source_id=None,
                transcript=prompt,
            )
            db.add(upload)
            db.flush()

            job = Job(
                upload_id=upload.id,
                kind=kind,
                status="queued",
                aspect_ratio=(aspect_ratio or "1:1"),
                captions_enabled=False,
                watermark_enabled=True,
                caption_style_json=json.dumps(settings_payload or {}),
                prompt=prompt,
                negative_prompt=(negative_prompt or None),
                model=model,
                duration_seconds=duration_seconds,
            )
            job.credits_reserved = need_credits
            db.add(job)
            db.flush()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to start generation")

    if not upload or not job:
        raise HTTPException(status_code=500, detail="Failed to start generation")
    return upload, job


class GenerateVideoRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1200)
    negative_prompt: str | None = Field(default=None, max_length=1200)
    aspect_ratio: str = "9:16"
    duration_seconds: int = Field(default=6, ge=4, le=8)
    generation_speed: str = Field(default="relax", max_length=16)
    model: str | None = Field(default="google", max_length=64)
    style_preset: str | None = Field(default="social-native", max_length=64)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    input_image_key: str | None = Field(default=None, max_length=512)


class GenerateImageRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1200)
    aspect_ratio: str = "1:1"
    model: str | None = Field(default="google", max_length=64)
    style_preset: str | None = Field(default="photo-real", max_length=64)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)


class GenerateVoiceoverRequest(BaseModel):
    script: str = Field(min_length=3, max_length=6000)
    model: str | None = Field(default="google", max_length=64)
    voice_name: str | None = Field(default="en-us", max_length=64)
    speed_wpm: int = Field(default=165, ge=80, le=260)


class GenerateResponse(BaseModel):
    upload_id: int
    job_id: int
    kind: str
    credits_reserved: int
    duration_seconds: int | None = None
    text_length: int | None = None
    generation_speed: str | None = None


@router.post("/generate", response_model=GenerateResponse)
def create_video_generation(
    payload: GenerateVideoRequest,
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

    generation_speed = _video_speed_key(payload.generation_speed)
    model = _check_model_supported(payload.model)
    input_image_key = _assert_user_owned_key(current_user.id, payload.input_image_key)
    credits_needed = _video_credits_needed(duration_seconds, generation_speed)

    def _plan_guard(plan: str) -> None:
        plan_max_duration = int(PLAN_MAX_DURATION_SECONDS.get(plan, 4))
        if duration_seconds > plan_max_duration:
            raise HTTPException(
                status_code=403,
                detail=f"{plan.capitalize()} plan supports up to {plan_max_duration}s per generation",
            )
        allowed_speeds = PLAN_ALLOWED_VIDEO_SPEEDS.get(plan, {"relax"})
        if generation_speed not in allowed_speeds:
            detail = f"{plan.capitalize()} plan includes Relax mode only."
            if "fast" in PLAN_ALLOWED_VIDEO_SPEEDS.get("creator", set()):
                detail += " Upgrade to Creator to use Fast mode."
            raise HTTPException(status_code=403, detail=detail)

    settings_payload = {
        "mode": "video",
        "generation_speed": generation_speed,
        "style_preset": (payload.style_preset or "social-native"),
        "seed": payload.seed,
        "input_image_key": input_image_key,
    }

    upload, job = _create_generation_job(
        db=db,
        current_user=current_user,
        kind=JOB_KIND_VIDEO,
        prompt=prompt,
        credits_needed=credits_needed,
        original_filename="generated.mp4",
        aspect_ratio=ar,
        duration_seconds=duration_seconds,
        model=model,
        negative_prompt=(payload.negative_prompt or None),
        settings_payload=settings_payload,
        plan_guard=_plan_guard,
    )

    return GenerateResponse(
        upload_id=int(upload.id),
        job_id=int(job.id),
        kind="video",
        credits_reserved=int(credits_needed),
        duration_seconds=int(duration_seconds),
        generation_speed=generation_speed,
    )


@router.post("/generate/image", response_model=GenerateResponse)
def create_image_generation(
    payload: GenerateImageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prompt = (payload.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    ar = (payload.aspect_ratio or "").strip()
    if ar not in ALLOWED_ASPECT_RATIOS:
        raise HTTPException(status_code=400, detail="Unsupported aspect ratio")

    model = _check_model_supported(payload.model)
    credits_needed = _image_credits_needed()
    settings_payload = {
        "mode": "image",
        "style_preset": (payload.style_preset or "photo-real"),
        "seed": payload.seed,
    }

    upload, job = _create_generation_job(
        db=db,
        current_user=current_user,
        kind=JOB_KIND_IMAGE,
        prompt=prompt,
        credits_needed=credits_needed,
        original_filename="generated.png",
        aspect_ratio=ar,
        duration_seconds=0,
        model=model,
        negative_prompt=None,
        settings_payload=settings_payload,
    )

    return GenerateResponse(
        upload_id=int(upload.id),
        job_id=int(job.id),
        kind="image",
        credits_reserved=int(credits_needed),
        duration_seconds=0,
    )


@router.post("/generate/voiceover", response_model=GenerateResponse)
def create_voiceover_generation(
    payload: GenerateVoiceoverRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    script = (payload.script or "").strip()
    if not script:
        raise HTTPException(status_code=400, detail="Script is required")

    model = _check_model_supported(payload.model)
    credits_needed = _voiceover_credits_needed(script)
    text_length = len(script)
    safe_speed = max(80, min(260, int(payload.speed_wpm or 165)))
    safe_voice = (payload.voice_name or "en-us").strip()[:64] or "en-us"

    def _plan_guard(plan: str) -> None:
        max_chars = int(PLAN_MAX_VOICE_CHARS.get(plan, 300))
        if text_length > max_chars:
            raise HTTPException(
                status_code=403,
                detail=f"{plan.capitalize()} plan supports up to {max_chars} voiceover characters",
            )

    settings_payload = {
        "mode": "voiceover",
        "voice_name": safe_voice,
        "speed_wpm": safe_speed,
    }

    upload, job = _create_generation_job(
        db=db,
        current_user=current_user,
        kind=JOB_KIND_VOICEOVER,
        prompt=script,
        credits_needed=credits_needed,
        original_filename="voiceover.mp3",
        aspect_ratio="1:1",
        duration_seconds=None,
        model=model,
        negative_prompt=None,
        settings_payload=settings_payload,
        plan_guard=_plan_guard,
    )

    return GenerateResponse(
        upload_id=int(upload.id),
        job_id=int(job.id),
        kind="voiceover",
        credits_reserved=int(credits_needed),
        text_length=text_length,
    )
