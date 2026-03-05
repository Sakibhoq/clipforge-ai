from __future__ import annotations

import base64
import json
import math
import os
import uuid
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import requests
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
JOB_KIND_POST = "generate_post"
GENERATION_JOB_KINDS = (JOB_KIND_VIDEO, JOB_KIND_IMAGE, JOB_KIND_VOICEOVER, JOB_KIND_POST)
VIDEO_GENERATION_SPEEDS = {"relax", "fast"}

ALLOWED_ASPECT_RATIOS = {"9:16", "16:9", "1:1"}
ALLOWED_DURATIONS = {4, 6, 8}
POST_DEFAULT_DURATION_SECONDS = 60
POST_DEFAULT_IMAGE_COUNT = 10

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

PLAN_MAX_POST_DURATION_SECONDS = {
    "free": 60,
    "starter": 120,
    "creator": 120,
    "studio": 120,
}

PLAN_MAX_POST_IMAGES = {
    "free": 12,
    "starter": 24,
    "creator": 36,
    "studio": 48,
}

PLAN_MAX_POST_SCRIPT_CHARS = {
    "free": 1500,
    "starter": 5000,
    "creator": 12000,
    "studio": 12000,
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
    # Product economics:
    # - Video only: about $1.00 / second
    # - Premium lane (video + audio workflow): about $1.20 / second
    # Credits are treated as $0.10-equivalent units.
    baseline = _env_int("LABS_CREDITS_PER_SECOND", 10, min_value=1, max_value=10_000)
    if speed == "fast":
        fast_default = max(12, int(math.ceil(float(baseline) * 1.2)))
        return _env_int(
            "LABS_FAST_CREDITS_PER_SECOND",
            fast_default,
            min_value=1,
            max_value=10_000,
        )
    return _env_int("LABS_RELAX_CREDITS_PER_SECOND", baseline, min_value=1, max_value=10_000)


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


def _post_credits_needed(duration_seconds: int) -> int:
    per_minute = _env_int("LABS_POST_CREDITS_PER_MINUTE", 15, min_value=1, max_value=10_000)
    minutes = max(1, int(math.ceil(float(max(1, int(duration_seconds or 0))) / 60.0)))
    return minutes * per_minute


def _voice_language_code(voice_name: str) -> str:
    raw = (voice_name or "").replace("_", "-").strip()
    if not raw:
        return (os.getenv("GOOGLE_TTS_LANGUAGE_CODE") or "en-US").strip() or "en-US"
    parts = raw.split("-")
    if len(parts) >= 2 and parts[0] and parts[1]:
        return f"{parts[0].lower()}-{parts[1].upper()}"
    return (os.getenv("GOOGLE_TTS_LANGUAGE_CODE") or "en-US").strip() or "en-US"


def _resolve_google_tts_endpoint() -> str:
    raw = (
        os.getenv("GOOGLE_TTS_API_URL")
        or "https://texttospeech.googleapis.com/v1/text:synthesize?key={API_KEY}"
    ).strip()

    if "{API_KEY}" in raw:
        key = (os.getenv("GOOGLE_API_KEY") or "").strip()
        if not key:
            raise HTTPException(
                status_code=503,
                detail="Voice preview unavailable: GOOGLE_API_KEY is not configured.",
            )
        return raw.replace("{API_KEY}", key)

    if not raw:
        raise HTTPException(status_code=503, detail="Voice preview unavailable.")
    return raw


def _synthesize_voice_preview(*, voice_name: str, speed_wpm: int, text: str) -> tuple[str, bytes]:
    endpoint = _resolve_google_tts_endpoint()
    safe_speed = max(80, min(330, int(speed_wpm or 165)))
    speaking_rate = max(0.5, min(2.0, float(safe_speed) / 165.0))

    default_voice_name = (os.getenv("GOOGLE_TTS_DEFAULT_VOICE") or "en-US-Neural2-F").strip() or "en-US-Neural2-F"
    selected_voice = (voice_name or "").strip()[:64] or default_voice_name
    if selected_voice.lower() in {"auto", "default", "en-us", "en_us"}:
        selected_voice = default_voice_name

    payload = {
        "input": {"text": (text or "").strip()[:240] or "This is a quick voice preview."},
        "voice": {
            "languageCode": _voice_language_code(selected_voice),
            "name": selected_voice,
        },
        "audioConfig": {
            "audioEncoding": "MP3",
            "speakingRate": speaking_rate,
        },
    }

    try:
        resp = requests.post(endpoint, json=payload, timeout=20)
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Voice preview provider request failed.")

    content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()

    if resp.status_code >= 400:
        detail = ""
        try:
            data = resp.json()
            err = data.get("error") if isinstance(data, dict) else None
            if isinstance(err, dict):
                detail = str(err.get("message") or "")
            elif err:
                detail = str(err)
        except Exception:
            detail = resp.text[:200]
        raise HTTPException(status_code=502, detail=f"Voice preview failed ({resp.status_code}). {detail}".strip())

    if content_type.startswith("audio/") and resp.content:
        return content_type, resp.content

    try:
        data = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Voice preview response could not be parsed.")

    audio_b64 = data.get("audioContent") if isinstance(data, dict) else None
    if not isinstance(audio_b64, str) or not audio_b64.strip():
        raise HTTPException(status_code=502, detail="Voice preview response had no audio content.")

    try:
        audio_bytes = base64.b64decode(audio_b64.strip())
    except Exception:
        raise HTTPException(status_code=502, detail="Voice preview payload was invalid.")

    return "audio/mpeg", audio_bytes


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
    voice_name: str | None = Field(default="en-US-Neural2-F", max_length=64)
    speed_wpm: int = Field(default=165, ge=80, le=330)


class GeneratePostRequest(BaseModel):
    visual_prompt: str = Field(min_length=3, max_length=1200)
    voice_script: str = Field(min_length=30, max_length=12000)
    aspect_ratio: str = "9:16"
    duration_seconds: int = Field(default=POST_DEFAULT_DURATION_SECONDS, ge=60, le=60)
    image_count: int | None = Field(default=POST_DEFAULT_IMAGE_COUNT, ge=6, le=10)
    model: str | None = Field(default="google", max_length=64)
    voice_name: str | None = Field(default="en-US-Neural2-F", max_length=64)
    speed_wpm: int | None = Field(default=None, ge=80, le=330)
    style_preset: str | None = Field(default="social-native", max_length=64)
    caption_style_preset: str | None = Field(default="bold_center", max_length=64)


class GenerateResponse(BaseModel):
    upload_id: int
    job_id: int
    kind: str
    credits_reserved: int
    duration_seconds: int | None = None
    text_length: int | None = None
    generation_speed: str | None = None


class VoicePreviewRequest(BaseModel):
    voice_name: str | None = Field(default="en-US-Neural2-F", max_length=64)
    speed_wpm: int = Field(default=165, ge=80, le=330)
    text: str | None = Field(default=None, max_length=240)


class VoicePreviewResponse(BaseModel):
    voice_name: str
    content_type: str
    audio_base64: str


@router.post("/voice-preview", response_model=VoicePreviewResponse)
def voice_preview(
    payload: VoicePreviewRequest,
    current_user: User = Depends(get_current_user),
):
    # Auth is required to avoid anonymous abuse of the preview endpoint.
    _ = current_user.id

    selected_voice = (payload.voice_name or "en-US-Neural2-F").strip()[:64] or "en-US-Neural2-F"
    sample_text = (payload.text or "").strip()[:240] or "This is a quick voice preview for your next post."
    content_type, audio_bytes = _synthesize_voice_preview(
        voice_name=selected_voice,
        speed_wpm=int(payload.speed_wpm or 165),
        text=sample_text,
    )
    return VoicePreviewResponse(
        voice_name=selected_voice,
        content_type=content_type,
        audio_base64=base64.b64encode(audio_bytes).decode("ascii"),
    )


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
    safe_speed = max(80, min(330, int(payload.speed_wpm or 165)))
    safe_voice = (payload.voice_name or "en-US-Neural2-F").strip()[:64] or "en-US-Neural2-F"

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


@router.post("/generate/post", response_model=GenerateResponse)
def create_post_generation(
    payload: GeneratePostRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    visual_prompt = (payload.visual_prompt or "").strip()
    if not visual_prompt:
        raise HTTPException(status_code=400, detail="visual_prompt is required")

    voice_script = (payload.voice_script or "").strip()
    if not voice_script:
        raise HTTPException(status_code=400, detail="voice_script is required")

    ar = (payload.aspect_ratio or "").strip()
    if ar not in ALLOWED_ASPECT_RATIOS:
        raise HTTPException(status_code=400, detail="Unsupported aspect ratio")

    duration_seconds = POST_DEFAULT_DURATION_SECONDS
    if int(payload.duration_seconds or POST_DEFAULT_DURATION_SECONDS) != POST_DEFAULT_DURATION_SECONDS:
        raise HTTPException(status_code=422, detail="AI Post duration is fixed at 60 seconds")

    image_count = max(6, min(10, int(payload.image_count or POST_DEFAULT_IMAGE_COUNT)))
    model = _check_model_supported(payload.model)
    text_length = len(voice_script)
    if payload.speed_wpm is None:
        # Auto pace to keep script delivery natural for 60-second posts.
        words = max(1, len([w for w in voice_script.split() if w.strip()]))
        target_wpm = int(round((words / (duration_seconds / 60.0)) * 1.08))
        safe_speed = max(130, min(210, target_wpm))
    else:
        safe_speed = max(80, min(330, int(payload.speed_wpm)))
    safe_voice = (payload.voice_name or "en-US-Neural2-F").strip()[:64] or "en-US-Neural2-F"
    credits_needed = _post_credits_needed(duration_seconds)

    def _plan_guard(plan: str) -> None:
        plan_max_duration = int(PLAN_MAX_POST_DURATION_SECONDS.get(plan, 60))
        if duration_seconds > plan_max_duration:
            raise HTTPException(
                status_code=403,
                detail=f"{plan.capitalize()} plan supports up to {plan_max_duration}s AI post generation",
            )

        plan_max_images = int(PLAN_MAX_POST_IMAGES.get(plan, 12))
        if image_count > plan_max_images:
            raise HTTPException(
                status_code=403,
                detail=f"{plan.capitalize()} plan supports up to {plan_max_images} images per AI post",
            )

        max_chars = int(PLAN_MAX_POST_SCRIPT_CHARS.get(plan, 1500))
        if text_length > max_chars:
            raise HTTPException(
                status_code=403,
                detail=f"{plan.capitalize()} plan supports up to {max_chars} post script characters",
            )

    settings_payload = {
        "mode": "post",
        "visual_prompt": visual_prompt,
        "voice_script": voice_script,
        "image_count": image_count,
        "voice_name": safe_voice,
        "speed_wpm": safe_speed,
        "style_preset": (payload.style_preset or "social-native"),
        "caption_style_preset": (payload.caption_style_preset or "bold_center"),
    }

    upload, job = _create_generation_job(
        db=db,
        current_user=current_user,
        kind=JOB_KIND_POST,
        prompt=visual_prompt,
        credits_needed=credits_needed,
        original_filename="generated-post.mp4",
        aspect_ratio=ar,
        duration_seconds=duration_seconds,
        model=model,
        negative_prompt=None,
        settings_payload=settings_payload,
        plan_guard=_plan_guard,
    )

    return GenerateResponse(
        upload_id=int(upload.id),
        job_id=int(job.id),
        kind="post",
        credits_reserved=int(credits_needed),
        duration_seconds=int(duration_seconds),
        text_length=text_length,
    )
