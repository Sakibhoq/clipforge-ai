from __future__ import annotations

import base64
import json
import math
import os
import re
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
LOW_COST_STYLE_PRESETS = {"anime", "cartoon", "comic"}

ALLOWED_ASPECT_RATIOS = {"9:16", "16:9", "1:1"}
ALLOWED_DURATIONS = {4, 6, 8, 10, 12}
POST_ALLOWED_DURATIONS = {60, 90, 120}
POST_DEFAULT_DURATION_SECONDS = 60
POST_DEFAULT_IMAGE_COUNT = 10
POST_BASE_VOICE_WPM = 165
POST_MAX_AUTO_VOICE_WPM = 210

PLAN_MAX_VIDEO_DURATION_SECONDS_HD = {
    "free": 4,
    "starter": 6,
    "creator": 8,
    "studio": 8,
}

PLAN_MAX_VIDEO_DURATION_SECONDS_EXTENDED = {
    "free": 4,
    "starter": 8,
    "creator": 12,
    "studio": 12,
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

PROMPT_HELPER_STOP_WORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "if",
    "then",
    "when",
    "while",
    "for",
    "from",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "with",
    "without",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "this",
    "that",
    "these",
    "those",
    "my",
    "your",
    "our",
    "their",
    "about",
    "just",
    "really",
    "very",
    "more",
    "less",
}


def _env_int(name: str, default: int, *, min_value: int = 1, max_value: int = 1_000_000) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return max(min_value, min(max_value, int(raw)))
    except Exception:
        return default


def _env_float(name: str, default: float, *, min_value: float = 0.0, max_value: float = 1_000_000.0) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        parsed = float(raw)
    except Exception:
        return default
    return max(min_value, min(max_value, parsed))


def _plan_key(raw_plan: str | None) -> str:
    p = (raw_plan or "free").strip().lower()
    return p if p in PLAN_MAX_VIDEO_DURATION_SECONDS_HD else "free"


def _video_speed_key(raw_speed: str | None) -> str:
    speed = (raw_speed or "relax").strip().lower()
    aliases = {
        "hd": "relax",
        "standard": "relax",
        "4k": "fast",
        "uhd": "fast",
        "premium": "fast",
    }
    speed = aliases.get(speed, speed)
    return speed if speed in VIDEO_GENERATION_SPEEDS else "relax"


def _normalize_style_preset(style_preset: str | None) -> str:
    style = (style_preset or "").strip().lower()
    aliases = {
        "photo-real": "real",
        "photoreal": "real",
        "social-native": "real",
        "cinematic": "real",
    }
    return aliases.get(style, style or "real")


def _is_low_cost_style(style_preset: str | None) -> bool:
    return _normalize_style_preset(style_preset) in LOW_COST_STYLE_PRESETS


def _credits_from_usd(usd_value: float) -> int:
    credit_usd = _env_float("LABS_CREDIT_USD_VALUE", 0.10, min_value=0.01, max_value=10.0)
    return max(1, int(math.ceil(float(max(0.0, usd_value)) / float(credit_usd))))


def _video_credits_per_second(speed: str, style_preset: str | None) -> int:
    low_cost = _is_low_cost_style(style_preset)
    base_usd = _env_float(
        "LABS_VIDEO_LOW_COST_USD_PER_SECOND" if low_cost else "LABS_VIDEO_REAL_USD_PER_SECOND",
        0.10 if low_cost else 0.50,
        min_value=0.01,
        max_value=10.0,
    )
    markup = _env_float(
        "LABS_VIDEO_4K_MARKUP" if speed == "fast" else "LABS_VIDEO_HD_MARKUP",
        3.0 if speed == "fast" else 2.7,
        min_value=1.0,
        max_value=20.0,
    )
    default_credits = _credits_from_usd(base_usd * markup)
    if low_cost and speed == "fast":
        env_name = "LABS_VIDEO_LOW_COST_4K_CREDITS_PER_SECOND"
    elif low_cost:
        env_name = "LABS_VIDEO_LOW_COST_HD_CREDITS_PER_SECOND"
    elif speed == "fast":
        env_name = "LABS_VIDEO_REAL_4K_CREDITS_PER_SECOND"
    else:
        env_name = "LABS_VIDEO_REAL_HD_CREDITS_PER_SECOND"
    return _env_int(env_name, default_credits, min_value=1, max_value=10_000)


def _video_credits_needed(duration_seconds: int, speed: str, style_preset: str | None) -> int:
    credits_per_second = _video_credits_per_second(speed, style_preset)
    return max(1, int(duration_seconds or 0)) * credits_per_second


def _image_credits_needed(style_preset: str | None) -> int:
    low_cost = _is_low_cost_style(style_preset)
    base_usd = _env_float(
        "LABS_IMAGE_LOW_COST_USD_PER_IMAGE" if low_cost else "LABS_IMAGE_REAL_USD_PER_IMAGE",
        0.02 if low_cost else 0.04,
        min_value=0.001,
        max_value=10.0,
    )
    markup = _env_float("LABS_IMAGE_MARKUP", 6.0, min_value=1.0, max_value=25.0)
    default_credits = _credits_from_usd(base_usd * markup)
    env_name = "LABS_IMAGE_LOW_COST_CREDITS" if low_cost else "LABS_IMAGE_REAL_CREDITS"
    return _env_int(env_name, default_credits, min_value=1, max_value=500)


def _voiceover_credits_needed(script: str) -> int:
    words_per_credit = _env_int("LABS_VOICE_WORDS_PER_CREDIT", 300, min_value=20, max_value=5000)
    min_credits = _env_int("LABS_VOICE_MIN_CREDITS", 1, min_value=1, max_value=200)
    words = _script_word_count(script)
    usage_credits = int(math.ceil(float(words) / float(words_per_credit))) if words > 0 else 0
    return max(min_credits, usage_credits)


def _script_word_count(script: str) -> int:
    return len([word for word in (script or "").split() if word.strip()])


def _clean_spaces(value: str) -> str:
    return " ".join((value or "").strip().split())


def _idea_keywords(idea: str, limit: int = 5) -> list[str]:
    tokens = [t.strip("'") for t in re.findall(r"[A-Za-z0-9']+", (idea or "").lower())]
    out: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        if len(token) < 3:
            continue
        if token in PROMPT_HELPER_STOP_WORDS:
            continue
        if token in seen:
            continue
        seen.add(token)
        out.append(token)
        if len(out) >= limit:
            break
    if out:
        return out
    fallback = [t for t in tokens if t][:limit]
    return fallback or ["focus", "progress", "clarity"]


def _idea_title(idea: str) -> str:
    clean = _clean_spaces(idea)
    if not clean:
        return "Untitled Concept"
    words = clean.split()
    title_words = words[:6]
    titled = " ".join([w[:1].upper() + w[1:] if w else "" for w in title_words]).strip()
    return titled or "Untitled Concept"


def _style_label(style_preset: str | None) -> str:
    style = _normalize_style_preset(style_preset)
    if style == "anime":
        return "anime, expressive linework, cel-shaded lighting, dynamic framing"
    if style == "cartoon":
        return "cartoon, clean outlines, bold colors, playful motion"
    if style == "comic":
        return "comic-book, inked contours, halftone texture, dramatic contrast"
    return "photorealistic, natural lighting, cinematic detail"


def _scene_ranges(duration_seconds: int, scene_count: int) -> list[tuple[int, int]]:
    safe_duration = max(30, min(180, int(duration_seconds or 60)))
    safe_count = max(6, min(14, int(scene_count or 8)))
    step = float(safe_duration) / float(safe_count)
    out: list[tuple[int, int]] = []
    for idx in range(safe_count):
        start = int(round(idx * step))
        end = int(round((idx + 1) * step))
        if idx == safe_count - 1:
            end = safe_duration
        if end <= start:
            end = start + 1
        out.append((start, end))
    return out


def _build_visual_prompt_pack(*, idea: str, style_preset: str | None, aspect_ratio: str, duration_seconds: int) -> str:
    keywords = _idea_keywords(idea, limit=5)
    title = _idea_title(idea)
    style_text = _style_label(style_preset)
    scene_count = 8 if duration_seconds <= 60 else (10 if duration_seconds <= 90 else 12)
    ranges = _scene_ranges(duration_seconds, scene_count)

    scene_templates = [
        "Hook shot introducing {k1} with strong motion and clear subject.",
        "Context shot with {k2}, environment detail, and smooth camera move.",
        "Close-up showing tactile action around {k3}.",
        "Medium shot highlighting progression, confidence, and momentum.",
        "Montage beat with faster cuts, clean transitions, and depth.",
        "Reaction beat showing a visible shift in emotion and control.",
        "Result shot proving progress with practical detail in frame.",
        "Final frame with bold text overlay and clear takeaway.",
        "Optional extension beat with extra texture and visual variety.",
        "Optional extension beat with a stronger payoff shot.",
        "Optional extension beat with secondary angle and rhythm.",
        "Outro shot to hold brand-safe framing before end.",
    ]

    k1 = keywords[0] if len(keywords) > 0 else "focus"
    k2 = keywords[1] if len(keywords) > 1 else k1
    k3 = keywords[2] if len(keywords) > 2 else k2
    lines = [
        f"Title: {title}",
        f"Concept: {idea}",
        f"Aspect ratio: {aspect_ratio}",
        f"Duration: {duration_seconds}s",
        f"Visual style: {style_text}",
        "",
    ]
    for idx, (start, end) in enumerate(ranges):
        template = scene_templates[idx] if idx < len(scene_templates) else scene_templates[-1]
        beat = template.format(k1=k1, k2=k2, k3=k3)
        lines.append(f"{start}-{end}s: {beat}")
    return "\n".join(lines).strip()


def _build_voice_script_pack(*, idea: str, style_preset: str | None, duration_seconds: int) -> str:
    keywords = _idea_keywords(idea, limit=5)
    k1 = keywords[0] if len(keywords) > 0 else "focus"
    k2 = keywords[1] if len(keywords) > 1 else "clarity"
    k3 = keywords[2] if len(keywords) > 2 else "momentum"
    style_name = _normalize_style_preset(style_preset).capitalize()
    target_words = max(95, min(260, int(round(float(duration_seconds) * 2.2))))

    sentences = [
        f"Here is the reset you need when {k1} feels messy and your attention keeps drifting.",
        f"Start by removing one distraction, then give your next task a single clear objective.",
        f"Use a short timer, lock in on the first step, and let your actions create momentum.",
        f"While you work, keep your breathing steady and your posture grounded so your mind stays calm.",
        f"Track visible wins, even tiny ones, because progress compounds faster than motivation alone.",
        f"When you hit resistance, pause, reset, and return with intention instead of rushing.",
        f"This is your {style_name.lower()} story of {k2}, {k3}, and practical consistency.",
        "Finish strong with one simple promise to yourself: do the next right step before switching.",
    ]

    if duration_seconds >= 90:
        sentences.extend(
            [
                f"Layer your routine: capture ideas quickly, prioritize clearly, then execute one block at a time.",
                "The goal is not perfect energy; the goal is repeatable progress you can trust every day.",
            ]
        )
    if duration_seconds >= 120:
        sentences.extend(
            [
                "As your system gets cleaner, your output gets sharper, faster, and easier to sustain.",
                "Small systems create big results, and today is where that change starts.",
            ]
        )

    words = " ".join(sentences).split()
    if len(words) > target_words:
        words = words[:target_words]
        if words and not words[-1].endswith((".", "!", "?")):
            words[-1] = f"{words[-1].rstrip(',;:')}."
    elif len(words) < target_words:
        fill = " Keep it simple, stay present, and stack one clean win at a time."
        while len(words) < target_words:
            words.extend(fill.strip().split())
        words = words[:target_words]
        if words and not words[-1].endswith((".", "!", "?")):
            words[-1] = f"{words[-1].rstrip(',;:')}."

    return " ".join(words).strip()


def _post_credits_needed(image_count: int, voice_script: str, style_preset: str | None) -> int:
    safe_images = max(1, int(image_count or POST_DEFAULT_IMAGE_COUNT))
    image_credits = safe_images * _image_credits_needed(style_preset)
    voice_credits = _voiceover_credits_needed(voice_script)
    return image_credits + voice_credits


def _video_max_duration_seconds(plan: str, *, generation_speed: str, style_preset: str | None) -> int:
    extended = _is_low_cost_style(style_preset) or generation_speed == "fast"
    table = PLAN_MAX_VIDEO_DURATION_SECONDS_EXTENDED if extended else PLAN_MAX_VIDEO_DURATION_SECONDS_HD
    return int(table.get(plan, 4))


def _voice_language_code(voice_name: str) -> str:
    raw = (voice_name or "").replace("_", "-").strip()
    if not raw:
        return (os.getenv("GOOGLE_TTS_LANGUAGE_CODE") or "en-US").strip() or "en-US"
    parts = raw.split("-")
    if len(parts) >= 2 and parts[0] and parts[1]:
        return f"{parts[0].lower()}-{parts[1].upper()}"
    return (os.getenv("GOOGLE_TTS_LANGUAGE_CODE") or "en-US").strip() or "en-US"


def _xml_escape(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _split_tts_sentences(script: str) -> list[str]:
    compact = " ".join((script or "").split()).strip()
    if not compact:
        return []
    chunks = [chunk.strip() for chunk in re.split(r"(?<=[.!?])\s+|;\s+", compact) if chunk.strip()]
    if len(chunks) <= 1:
        chunks = [chunk.strip() for chunk in re.split(r",\s+", compact) if chunk.strip()]
    if len(chunks) <= 1:
        words = compact.split()
        step = 14
        chunks = [" ".join(words[i : i + step]).strip() for i in range(0, len(words), step)]
    return [chunk for chunk in chunks if chunk]


def _build_expressive_tts_ssml(script: str) -> str:
    sentences = _split_tts_sentences(script)
    if not sentences:
        return "<speak>This is a quick voice preview.</speak>"

    pause_ms_raw = (os.getenv("GOOGLE_TTS_SENTENCE_BREAK_MS") or "").strip()
    phrase_pause_ms_raw = (os.getenv("GOOGLE_TTS_PHRASE_BREAK_MS") or "").strip()
    try:
        pause_ms = max(80, min(800, int(pause_ms_raw or "220")))
    except Exception:
        pause_ms = 220
    try:
        phrase_pause_ms = max(40, min(400, int(phrase_pause_ms_raw or "130")))
    except Exception:
        phrase_pause_ms = 130

    parts: list[str] = ["<speak>"]
    for idx, sentence in enumerate(sentences):
        escaped = _xml_escape(sentence)
        if idx == 0:
            parts.append(f"<emphasis level='moderate'>{escaped}</emphasis>")
        else:
            parts.append(escaped)
        if idx < len(sentences) - 1:
            parts.append(f"<break time='{pause_ms}ms'/>")
        elif sentence and not sentence.endswith((".", "!", "?")):
            parts.append(f"<break time='{phrase_pause_ms}ms'/>")
    parts.append("</speak>")
    return "".join(parts)


def _tts_audio_config(speaking_rate: float) -> dict[str, float | str]:
    pitch_raw = (os.getenv("GOOGLE_TTS_PITCH") or "").strip()
    volume_raw = (os.getenv("GOOGLE_TTS_VOLUME_GAIN_DB") or "").strip()
    try:
        pitch = max(-20.0, min(20.0, float(pitch_raw or "1.6")))
    except Exception:
        pitch = 1.6
    try:
        volume = max(-96.0, min(16.0, float(volume_raw or "1.5")))
    except Exception:
        volume = 1.5
    return {
        "audioEncoding": "MP3",
        "speakingRate": speaking_rate,
        "pitch": pitch,
        "volumeGainDb": volume,
    }


def _preview_tts_payload(*, text: str, selected_voice: str, speaking_rate: float, use_ssml: bool) -> dict:
    input_payload = (
        {"ssml": _build_expressive_tts_ssml(text)}
        if use_ssml
        else {"text": (text or "").strip()[:240] or "This is a quick voice preview."}
    )
    return {
        "input": input_payload,
        "voice": {
            "languageCode": _voice_language_code(selected_voice),
            "name": selected_voice,
        },
        "audioConfig": _tts_audio_config(speaking_rate),
    }


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
    safe_text = (text or "").strip()[:240] or "This is a quick voice preview."
    use_ssml = (os.getenv("GOOGLE_TTS_USE_SSML") or "1").strip().lower() in {"1", "true", "yes", "on"}
    payload = _preview_tts_payload(
        text=safe_text,
        selected_voice=selected_voice,
        speaking_rate=speaking_rate,
        use_ssml=use_ssml,
    )

    try:
        resp = requests.post(endpoint, json=payload, timeout=20)
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Voice preview provider request failed.")

    if resp.status_code >= 400 and use_ssml:
        fallback_payload = _preview_tts_payload(
            text=safe_text,
            selected_voice=selected_voice,
            speaking_rate=speaking_rate,
            use_ssml=False,
        )
        try:
            resp = requests.post(endpoint, json=fallback_payload, timeout=20)
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
    captions_enabled: bool = False,
    watermark_enabled: bool = True,
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

            # Free Trial always enforces watermark on generated outputs.
            effective_watermark_enabled = bool(watermark_enabled)
            if plan == "free":
                effective_watermark_enabled = True
            effective_settings = dict(settings_payload or {})
            effective_settings["watermark_enabled"] = effective_watermark_enabled

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
                captions_enabled=bool(captions_enabled),
                watermark_enabled=effective_watermark_enabled,
                caption_style_json=json.dumps(effective_settings),
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
    duration_seconds: int = Field(default=6, ge=4, le=12)
    generation_speed: str = Field(default="relax", max_length=16)
    model: str | None = Field(default="google", max_length=64)
    style_preset: str | None = Field(default="social-native", max_length=64)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    input_image_key: str | None = Field(default=None, max_length=512)
    watermark_enabled: bool = Field(default=True)


class GenerateImageRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1200)
    aspect_ratio: str = "1:1"
    model: str | None = Field(default="google", max_length=64)
    style_preset: str | None = Field(default="photo-real", max_length=64)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    watermark_enabled: bool = Field(default=True)


class GenerateVoiceoverRequest(BaseModel):
    script: str = Field(min_length=3, max_length=6000)
    model: str | None = Field(default="google", max_length=64)
    voice_name: str | None = Field(default="en-US-Neural2-F", max_length=64)
    speed_wpm: int = Field(default=POST_BASE_VOICE_WPM, ge=80, le=330)


class GeneratePostRequest(BaseModel):
    visual_prompt: str = Field(min_length=3, max_length=1200)
    voice_script: str = Field(min_length=30, max_length=12000)
    aspect_ratio: str = "9:16"
    duration_seconds: int = Field(default=POST_DEFAULT_DURATION_SECONDS, ge=60, le=120)
    image_count: int | None = Field(default=POST_DEFAULT_IMAGE_COUNT, ge=6, le=10)
    model: str | None = Field(default="google", max_length=64)
    voice_name: str | None = Field(default="en-US-Neural2-F", max_length=64)
    speed_wpm: int | None = Field(default=None, ge=80, le=330)
    style_preset: str | None = Field(default="social-native", max_length=64)
    caption_style_preset: str | None = Field(default="bold_center", max_length=64)
    captions_enabled: bool = Field(default=True)
    watermark_enabled: bool = Field(default=True)


class GenerateResponse(BaseModel):
    upload_id: int
    job_id: int
    kind: str
    credits_reserved: int
    duration_seconds: int | None = None
    text_length: int | None = None
    generation_speed: str | None = None


class PromptHelperRequest(BaseModel):
    idea: str = Field(min_length=3, max_length=600)
    style_preset: str | None = Field(default="real", max_length=64)
    aspect_ratio: str = Field(default="9:16", max_length=16)
    duration_seconds: int = Field(default=POST_DEFAULT_DURATION_SECONDS, ge=60, le=120)


class PromptHelperResponse(BaseModel):
    title: str
    visual_prompt: str
    voice_script: str
    aspect_ratio: str
    duration_seconds: int
    style_preset: str


class VoicePreviewRequest(BaseModel):
    voice_name: str | None = Field(default="en-US-Neural2-F", max_length=64)
    speed_wpm: int = Field(default=POST_BASE_VOICE_WPM, ge=80, le=330)
    text: str | None = Field(default=None, max_length=240)


class VoicePreviewResponse(BaseModel):
    voice_name: str
    content_type: str
    audio_base64: str


@router.post("/prompt-helper", response_model=PromptHelperResponse)
def prompt_helper(
    payload: PromptHelperRequest,
    current_user: User = Depends(get_current_user),
):
    # Auth guard to avoid anonymous abuse.
    _ = current_user.id

    idea = _clean_spaces(payload.idea)
    if len(idea) < 3:
        raise HTTPException(status_code=400, detail="Idea is required")

    style = _normalize_style_preset(payload.style_preset)
    if style not in {"real", "anime", "cartoon", "comic"}:
        style = "real"

    aspect = (payload.aspect_ratio or "9:16").strip()
    if aspect not in ALLOWED_ASPECT_RATIOS:
        aspect = "9:16"

    duration_seconds = int(payload.duration_seconds or POST_DEFAULT_DURATION_SECONDS)
    if duration_seconds not in POST_ALLOWED_DURATIONS:
        duration_seconds = POST_DEFAULT_DURATION_SECONDS

    visual_prompt = _build_visual_prompt_pack(
        idea=idea,
        style_preset=style,
        aspect_ratio=aspect,
        duration_seconds=duration_seconds,
    )
    voice_script = _build_voice_script_pack(
        idea=idea,
        style_preset=style,
        duration_seconds=duration_seconds,
    )
    return PromptHelperResponse(
        title=_idea_title(idea),
        visual_prompt=visual_prompt,
        voice_script=voice_script,
        aspect_ratio=aspect,
        duration_seconds=duration_seconds,
        style_preset=style,
    )


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
        speed_wpm=int(payload.speed_wpm or POST_BASE_VOICE_WPM),
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
        raise HTTPException(status_code=422, detail="Duration must be one of: 4, 6, 8, 10, 12 seconds")

    generation_speed = _video_speed_key(payload.generation_speed)
    model = _check_model_supported(payload.model)
    input_image_key = _assert_user_owned_key(current_user.id, payload.input_image_key)
    style_preset = (payload.style_preset or "social-native")
    credits_needed = _video_credits_needed(duration_seconds, generation_speed, style_preset)

    def _plan_guard(plan: str) -> None:
        plan_max_duration = _video_max_duration_seconds(
            plan,
            generation_speed=generation_speed,
            style_preset=style_preset,
        )
        if duration_seconds > plan_max_duration:
            raise HTTPException(
                status_code=403,
                detail=f"{plan.capitalize()} plan supports up to {plan_max_duration}s per generation",
            )
        allowed_speeds = PLAN_ALLOWED_VIDEO_SPEEDS.get(plan, {"relax"})
        if generation_speed not in allowed_speeds:
            detail = f"{plan.capitalize()} plan includes HD mode only."
            if "fast" in PLAN_ALLOWED_VIDEO_SPEEDS.get("creator", set()):
                detail += " Upgrade to Creator to use 4K mode."
            raise HTTPException(status_code=403, detail=detail)

    settings_payload = {
        "mode": "video",
        "generation_speed": generation_speed,
        "style_preset": style_preset,
        "seed": payload.seed,
        "input_image_key": input_image_key,
        "watermark_enabled": bool(payload.watermark_enabled),
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
        watermark_enabled=bool(payload.watermark_enabled),
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
    style_preset = (payload.style_preset or "photo-real")
    credits_needed = _image_credits_needed(style_preset)
    settings_payload = {
        "mode": "image",
        "style_preset": style_preset,
        "seed": payload.seed,
        "watermark_enabled": bool(payload.watermark_enabled),
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
        watermark_enabled=bool(payload.watermark_enabled),
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
    safe_speed = max(80, min(330, int(payload.speed_wpm or POST_BASE_VOICE_WPM)))
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

    duration_seconds = int(payload.duration_seconds or POST_DEFAULT_DURATION_SECONDS)
    if duration_seconds not in POST_ALLOWED_DURATIONS:
        raise HTTPException(status_code=422, detail="AI Post duration must be 60, 90, or 120 seconds")

    image_count = max(6, min(10, int(payload.image_count or POST_DEFAULT_IMAGE_COUNT)))
    model = _check_model_supported(payload.model)
    style_preset = (payload.style_preset or "social-native")
    if duration_seconds > 60 and not _is_low_cost_style(style_preset):
        raise HTTPException(
            status_code=422,
            detail="Extended AI Post duration is available for anime, cartoon, and comic styles.",
        )
    text_length = len(voice_script)
    words = _script_word_count(voice_script)
    if payload.speed_wpm is None:
        # Keep true 1x pacing by default; only speed up when script would exceed 60s.
        target_wpm = POST_BASE_VOICE_WPM
        estimated_seconds_at_base = (float(words) / float(POST_BASE_VOICE_WPM)) * 60.0 if words > 0 else 0.0
        if estimated_seconds_at_base > float(duration_seconds):
            required_wpm = int(math.ceil(float(words) * 60.0 / float(duration_seconds)))
            target_wpm = max(POST_BASE_VOICE_WPM, min(POST_MAX_AUTO_VOICE_WPM, required_wpm))
        safe_speed = target_wpm
    else:
        safe_speed = max(80, min(330, int(payload.speed_wpm)))
    safe_voice = (payload.voice_name or "en-US-Neural2-F").strip()[:64] or "en-US-Neural2-F"
    credits_needed = _post_credits_needed(image_count, voice_script, style_preset)

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
        "style_preset": style_preset,
        "caption_style_preset": (payload.caption_style_preset or "bold_center"),
        "captions_enabled": bool(payload.captions_enabled),
        "watermark_enabled": bool(payload.watermark_enabled),
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
        captions_enabled=bool(payload.captions_enabled),
        watermark_enabled=bool(payload.watermark_enabled),
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
