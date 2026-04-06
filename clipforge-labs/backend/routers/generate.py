from __future__ import annotations

import base64
import json
import math
import os
import re
import time
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
from routers.auth import (
    adjust_orbito_entitlements,
    get_current_user,
    orbito_entitlements_enabled,
)

router = APIRouter(prefix="/labs", tags=["labs"])

JOB_KIND_VIDEO = "generate"
JOB_KIND_IMAGE = "generate_image"
JOB_KIND_VOICEOVER = "generate_voiceover"
JOB_KIND_POST = "generate_post"
GENERATION_JOB_KINDS = (JOB_KIND_VIDEO, JOB_KIND_IMAGE, JOB_KIND_VOICEOVER, JOB_KIND_POST)
VIDEO_GENERATION_SPEEDS = {"relax", "fast"}
LOW_COST_STYLE_PRESETS = {"anime", "cartoon", "comic"}
ALLOWED_POST_VISUAL_MODES = {"image", "video"}

ALLOWED_ASPECT_RATIOS = {"9:16", "16:9", "1:1"}
ALLOWED_DURATIONS = {5, 6, 7}
POST_ALLOWED_DURATIONS = {60, 90, 120}
POST_DEFAULT_DURATION_SECONDS = 60
POST_DEFAULT_IMAGE_COUNT = 6
PROMPT_MAX_CHARS = 3000
POST_BASE_VOICE_WPM = 165
POST_MAX_AUTO_VOICE_WPM = 210
# Default generator captions are tuned for short 1-3 word beats that sit
# around the optical center instead of stretching across the whole frame.
GENERATED_CAPTION_FONT_SCALE = 0.32
GENERATED_CAPTION_Y = 0.60
GENERATED_CAPTION_MAX_WORDS = 3
GENERATED_CAPTION_MAX_CHARS = 14
GENERATED_CAPTION_LINE_CHARS = 10
DEFAULT_TTS_VOICE = "en-US-Neural2-H"
FALLBACK_TTS_VOICE = "en-US-Neural2-I"
TTS_VOICE_FALLBACK_CHAIN = [
    "en-US-Neural2-H",
    "en-US-Neural2-I",
    "en-US-Wavenet-A",
    "en-US-Wavenet-C",
    "en-US-Wavenet-E",
    "en-US-Studio-O",
    "en-US-Studio-Q",
    "en-US-Standard-C",
    "en-US-Standard-D",
    "en-US-Standard-E",
    "en-US-Standard-F",
    "en-US-Neural2-A",
    "en-US-Neural2-J",
]
GOOGLE_CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
_GOOGLE_TOKEN_CACHE: tuple[str, float] | None = None

PLAN_MAX_VIDEO_DURATION_SECONDS_HD = {
    "free": 5,
    "starter": 6,
    "creator": 7,
    "studio": 7,
}

PLAN_MAX_VIDEO_DURATION_SECONDS_EXTENDED = {
    "free": 5,
    "starter": 7,
    "creator": 7,
    "studio": 7,
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
    "want",
    "need",
    "make",
    "create",
    "generate",
    "write",
    "small",
    "short",
    "minute",
    "minutes",
    "second",
    "seconds",
    "story",
    "clip",
    "video",
    "main",
    "character",
}

PROMPT_HELPER_STYLE_HINTS: dict[str, tuple[str, ...]] = {
    "anime": ("anime", "manga", "isekai", "shonen", "shoujo", "otaku", "reincarnat"),
    "cartoon": ("cartoon", "toon", "pixar", "disney", "stylized 2d", "kids show"),
    "comic": ("comic", "comic-book", "graphic novel", "panel", "inked", "superhero"),
    "real": ("realistic", "photoreal", "photorealistic", "live action", "cinematic"),
}

PROMPT_HELPER_TITLE_MAP = {
    "main": "hero",
    "character": "hero",
    "mc": "hero",
    "protagonist": "hero",
    "op": "overpowered",
}

PROMPT_HELPER_TITLE_STOP_WORDS = PROMPT_HELPER_STOP_WORDS | {
    "just",
    "tell",
    "thinking",
    "about",
    "small",
    "quick",
    "simple",
}

PROMPT_HELPER_VISUAL_MAX_CHARS = 1180


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


def _env_bool(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _plan_key(raw_plan: str | None) -> str:
    p = (raw_plan or "free").strip().lower()
    token = re.sub(r"[^a-z0-9]+", "_", p).strip("_")
    if token in PLAN_MAX_VIDEO_DURATION_SECONDS_HD:
        return token

    aliases = {
        "free_trial": "free",
        "trial": "free",
        "trialing": "free",
        "starter_monthly": "starter",
        "starter_yearly": "starter",
        "labs_starter": "creator",
        "labs_spark": "creator",
        "creator_plus": "creator",
        "creator_monthly": "creator",
        "creator_yearly": "creator",
        "labs_creator": "creator",
        "labs_velocity": "creator",
        "pro": "creator",
        "pro_plus": "creator",
        "studio_monthly": "studio",
        "studio_yearly": "studio",
    }
    if token in aliases:
        return aliases[token]

    if token.startswith("starter") or "starter" in token:
        return "starter"
    if "spark" in token:
        return "creator"
    if token.startswith("creator") or token.startswith("pro") or "creator" in token or "velocity" in token:
        return "creator"
    if token.startswith("studio") or "studio" in token:
        return "studio"
    return "free"


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
    # Keep billing aligned with worker model routing when low-cost mode is forced globally.
    if _env_bool("GOOGLE_FORCE_LOW_COST_MODELS", True):
        return True
    return _normalize_style_preset(style_preset) in LOW_COST_STYLE_PRESETS


def _credit_usd_value() -> float:
    return _env_float("LABS_CREDIT_USD_VALUE", 0.10, min_value=0.01, max_value=10.0)


def _credits_from_usd(usd_value: float) -> int:
    credit_usd = _credit_usd_value()
    return max(1, int(math.ceil(float(max(0.0, usd_value)) / float(credit_usd))))


def _video_provider_cost_usd_per_second(speed: str, style_preset: str | None) -> float:
    low_cost = _is_low_cost_style(style_preset)
    if speed == "fast":
        return _env_float("GOOGLE_VIDEO_PREMIUM_USD_PER_SECOND", 0.20, min_value=0.01, max_value=10.0)
    env_name = "GOOGLE_VIDEO_LOW_COST_USD_PER_SECOND" if low_cost else "GOOGLE_VIDEO_STANDARD_USD_PER_SECOND"
    default_value = 0.10 if low_cost else 0.20
    return _env_float(env_name, default_value, min_value=0.01, max_value=10.0)


def _image_provider_cost_usd(style_preset: str | None) -> float:
    low_cost = _is_low_cost_style(style_preset)
    env_name = "GOOGLE_IMAGE_LOW_COST_USD_PER_IMAGE" if low_cost else "GOOGLE_IMAGE_STANDARD_USD_PER_IMAGE"
    return _env_float(env_name, 0.04, min_value=0.001, max_value=10.0)


def _voice_rate_usd_per_char(voice_name: str | None) -> float:
    voice_token = str(voice_name or DEFAULT_TTS_VOICE).strip().lower()
    if "studio" in voice_token:
        return _env_float("GOOGLE_TTS_STUDIO_USD_PER_CHAR", 160.0 / 1_000_000.0, min_value=0.0, max_value=1.0)
    if "standard" in voice_token:
        return _env_float("GOOGLE_TTS_STANDARD_USD_PER_CHAR", 4.0 / 1_000_000.0, min_value=0.0, max_value=1.0)
    return _env_float("GOOGLE_TTS_PREMIUM_USD_PER_CHAR", 16.0 / 1_000_000.0, min_value=0.0, max_value=1.0)


def _voice_provider_cost_usd(script: str, voice_name: str | None) -> float:
    char_count = len((script or "").strip())
    if char_count <= 0:
        return 0.0
    return float(char_count) * _voice_rate_usd_per_char(voice_name)


def _video_credits_per_second(speed: str, style_preset: str | None) -> int:
    low_cost = _is_low_cost_style(style_preset)
    # Premium mode should always use premium routing/pricing, not low-cost style pricing.
    if speed == "fast":
        low_cost = False
    if speed == "fast":
        env_name = "LABS_VIDEO_PREMIUM_CREDITS_PER_SECOND"
        # Premium mode is tuned for roughly ~1.00-1.50 USD gross profit on 5-7 second runs.
        return _env_int(env_name, 4, min_value=1, max_value=10_000)
    elif low_cost:
        env_name = "LABS_VIDEO_LOW_COST_HD_CREDITS_PER_SECOND"
        default_credits = 3
    else:
        env_name = "LABS_VIDEO_REAL_HD_CREDITS_PER_SECOND"
        default_credits = 4

    hd_credits = _env_int(env_name, default_credits, min_value=1, max_value=10_000)
    fast_credits = _env_int("LABS_VIDEO_PREMIUM_CREDITS_PER_SECOND", 4, min_value=1, max_value=10_000)
    # Keep pricing hierarchy sane: HD must never cost more than premium mode.
    if hd_credits >= fast_credits:
        return max(1, fast_credits - 1)
    return hd_credits


def _video_credits_needed(duration_seconds: int, speed: str, style_preset: str | None) -> int:
    credits_per_second = _video_credits_per_second(speed, style_preset)
    return max(1, int(duration_seconds or 0)) * credits_per_second


def _image_credits_needed(style_preset: str | None) -> int:
    low_cost = _is_low_cost_style(style_preset)
    target_profit = _env_float("LABS_IMAGE_TARGET_PROFIT_USD", 0.40, min_value=0.0, max_value=20.0)
    default_credits = _credits_from_usd(_image_provider_cost_usd(style_preset) + target_profit)
    env_name = "LABS_IMAGE_LOW_COST_CREDITS" if low_cost else "LABS_IMAGE_STANDARD_CREDITS"
    return _env_int(env_name, default_credits, min_value=1, max_value=500)


def _voiceover_base_credits_needed(script: str) -> int:
    words_per_credit = _env_int("LABS_VOICE_WORDS_PER_CREDIT", 300, min_value=20, max_value=5000)
    min_credits = _env_int("LABS_VOICE_MIN_CREDITS", 1, min_value=1, max_value=200)
    words = _script_word_count(script)
    usage_credits = int(math.ceil(float(words) / float(words_per_credit))) if words > 0 else 0
    return max(min_credits, usage_credits)


def _voiceover_credits_needed(script: str, voice_name: str | None = None) -> int:
    base_credits = _voiceover_base_credits_needed(script)
    credit_value = _credit_usd_value()
    base_revenue = float(base_credits) * credit_value
    target_margin = _env_float("LABS_VOICE_TARGET_MARGIN_USD", 0.05, min_value=0.0, max_value=20.0)
    target_revenue = _voice_provider_cost_usd(script, voice_name) + target_margin
    if target_revenue <= base_revenue:
        return base_credits
    extra_credits = int(math.ceil(float(target_revenue - base_revenue) / credit_value))
    return max(base_credits, base_credits + max(1, extra_credits))


def _default_post_scene_count(duration_seconds: int) -> int:
    safe_duration = max(60, min(120, int(duration_seconds or POST_DEFAULT_DURATION_SECONDS)))
    if safe_duration >= 120:
        return 10
    if safe_duration >= 90:
        return 8
    return POST_DEFAULT_IMAGE_COUNT


def _script_word_count(script: str) -> int:
    return len([word for word in (script or "").split() if word.strip()])


def _clean_spaces(value: str) -> str:
    return " ".join((value or "").strip().split())


def _clean_dialogue_script(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw.replace("\r", "\n").split("\n")]
    lines = [line for line in lines if line]
    compact = "\n".join(lines)
    return compact[:5000].strip()


def _idea_implies_dialogue(idea: str | None) -> bool:
    text = (idea or "").strip()
    if not text:
        return False
    lower = text.lower()
    if re.search(r"[\"'“”‘’][^\"'“”‘’]{6,}[\"'“”‘’]", text):
        return True
    dialogue_markers = (
        "dialogue",
        "conversation",
        "interview",
        "monologue",
        "phone call",
        "debate",
        "argument",
        "says",
        "said",
        "asks",
        "replies",
        "whispers",
        "speaks",
        "talking",
        "talks to",
        "lip-sync",
        "lip sync",
    )
    return any(marker in lower for marker in dialogue_markers)


def _compose_prompt_with_dialogue(prompt: str, dialogue_script: str | None) -> str:
    clean_prompt = _clean_spaces(prompt)
    dialogue = _clean_dialogue_script(dialogue_script)
    if not dialogue:
        return clean_prompt
    return (
        f"{clean_prompt}\n\n"
        "Character dialogue and speaking cues:\n"
        f"{dialogue}\n\n"
        "Speech and lip-sync lock (critical):\n"
        "- Speak the dialogue lines exactly as written, same order, no extra narration.\n"
        "- Keep the active speaker's mouth clearly visible while speaking.\n"
        "- Match mouth and jaw motion to each spoken word with tight timing.\n"
        "- Preserve natural emotion, breathing, and realistic conversational pacing."
    ).strip()


def _truncate_words(value: str, max_words: int) -> str:
    words = [w for w in (value or "").strip().split() if w]
    if not words:
        return ""
    return " ".join(words[:max_words])


def _word_count(value: str) -> int:
    return len([w for w in (value or "").split() if w.strip()])


def _strip_prompt_lead_in(idea: str) -> str:
    text = _clean_spaces(idea)
    if not text:
        return ""

    patterns = [
        r"^(?:i|we)\s+(?:want|need|would\s+like|wanna|am\s+looking\s+for)\s+",
        r"^(?:can\s+you|please)\s+",
        r"^(?:make|create|generate|write)\s+",
        r"^(?:me\s+)?(?:a|an)\s+",
    ]
    out = text
    for pattern in patterns:
        out = re.sub(pattern, "", out, flags=re.IGNORECASE).strip(" ,.-:")

    out = re.sub(r"\b(?:one|1)\s*minute\b", "", out, flags=re.IGNORECASE)
    out = re.sub(r"\b(?:sixty|60)\s*seconds?\b", "", out, flags=re.IGNORECASE)
    out = re.sub(r"\b(?:small|short|quick)\s+\b", "", out, flags=re.IGNORECASE)
    out = re.sub(r"\b(?:story|clip|video)\s+about\b", "", out, flags=re.IGNORECASE)
    out = re.sub(r"\babout\b", "", out, count=1, flags=re.IGNORECASE)
    out = _clean_spaces(out.strip(" ,.-:"))
    return out or text


def _infer_style_from_idea(idea: str) -> str | None:
    lower = (idea or "").strip().lower()
    if not lower:
        return None

    best_style: str | None = None
    best_index: int | None = None
    for style, hints in PROMPT_HELPER_STYLE_HINTS.items():
        for hint in hints:
            idx = lower.find(hint)
            if idx < 0:
                continue
            if best_index is None or idx < best_index:
                best_index = idx
                best_style = style
    return best_style


def _select_prompt_helper_style(requested_style: str | None, idea: str) -> str:
    style = _normalize_style_preset(requested_style)
    if style not in {"real", "anime", "cartoon", "comic"}:
        style = "real"

    inferred = _infer_style_from_idea(idea)
    if inferred and style == "real":
        return inferred
    return style


def _core_idea_phrase(idea: str) -> str:
    base = _strip_prompt_lead_in(idea)
    if not base:
        return ""
    without_style = re.sub(
        r"\b(?:anime|cartoon|comic|manga|photorealistic|photoreal|realistic|live\s*action)\b",
        "",
        base,
        flags=re.IGNORECASE,
    )
    without_style = re.sub(r"\bmain\s+character\b", "hero", without_style, flags=re.IGNORECASE)
    without_style = _clean_spaces(without_style.strip(" ,.-:"))
    return without_style or base


def _extract_subject_and_trait(idea: str) -> tuple[str, str]:
    concept = _core_idea_phrase(idea)
    if not concept:
        return ("protagonist", "a hidden edge")

    subject = concept
    trait = ""

    who_match = re.search(r"(.+?)\s+(?:who|that)\s+(?:is|has|can|with)\s+(.+)$", concept, flags=re.IGNORECASE)
    if who_match:
        subject = who_match.group(1).strip(" ,.-:")
        trait = who_match.group(2).strip(" ,.-:")
    else:
        with_match = re.search(r"(.+?)\s+with\s+(.+)$", concept, flags=re.IGNORECASE)
        if with_match:
            subject = with_match.group(1).strip(" ,.-:")
            trait = with_match.group(2).strip(" ,.-:")

    subject = re.sub(r"^(?:a|an|the)\s+", "", subject, flags=re.IGNORECASE)
    subject = re.sub(r"\bmain\s+character\b", "hero", subject, flags=re.IGNORECASE)
    subject = _truncate_words(_clean_spaces(subject), 6) or "protagonist"
    trait = _truncate_words(_clean_spaces(trait), 7) or "a hidden edge"
    return (subject, trait)


def _trait_display(trait: str) -> str:
    clean = _clean_spaces(trait).lower()
    if not clean:
        return "a hidden edge"
    if clean in {"op", "overpowered", "over power", "over-power"}:
        return "overwhelming power"
    if clean.startswith(("a ", "an ", "the ")):
        return clean
    return clean


def _subject_narration(subject: str) -> str:
    clean = _clean_spaces(subject)
    if not clean:
        return "the hero"
    lower = clean.lower()
    if lower.startswith(("a ", "an ", "the ")):
        return lower
    return f"the {lower}"


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


def _idea_title(idea: str, style_preset: str | None = None) -> str:
    concept = _core_idea_phrase(idea)
    if not concept:
        return "Untitled Concept"

    lowered = concept.lower()
    if ("reincarnat" in lowered or "reborn" in lowered) and ("overpowered" in lowered or "op" in lowered):
        return "Reborn Overpowered Hero"

    subject, trait = _extract_subject_and_trait(concept)
    tokens: list[str] = []
    for token in _idea_keywords(f"{subject} {trait}", limit=8):
        mapped = PROMPT_HELPER_TITLE_MAP.get(token, token)
        if mapped in PROMPT_HELPER_TITLE_STOP_WORDS:
            continue
        if mapped not in tokens:
            tokens.append(mapped)

    if not tokens:
        tokens = _idea_keywords(concept, limit=4)

    words = [w.title() for w in tokens[:5] if w]
    if not words:
        return "Untitled Concept"
    title = " ".join(words)
    style = _normalize_style_preset(style_preset)
    if style in {"anime", "cartoon", "comic"} and len(words) <= 2:
        return f"{style.title()} {title}"
    return title


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


def _camera_directive_for_scene(*, style: str, scene_index: int, scene_count: int, dialogue_mode: bool = False) -> str:
    ratio = float(scene_index + 1) / float(max(1, scene_count))
    if ratio <= 0.18:
        if dialogue_mode:
            base = "tight close-up, strong eye contact, subtle handheld energy"
        else:
            base = "wide establishing shot with clear environment context and subject readability"
    elif ratio <= 0.4:
        if dialogue_mode:
            base = "medium close-up reveal, smooth dolly, clear mouth readability for speech beats"
        else:
            base = "smooth pull-back reveal with layered depth and full-body readability"
    elif ratio <= 0.65:
        base = "mid shot with lateral tracking, motivated movement tied to action"
    elif ratio <= 0.88:
        base = "hero push-in, stable horizon, controlled motion for payoff"
    else:
        base = "locked final frame, premium hold for 0.8s to 1.2s"

    if style == "anime":
        return f"{base}, dynamic low-angle perspective, kinetic anime framing"
    if style == "cartoon":
        return f"{base}, playful timing, readable silhouettes, clean shape language"
    if style == "comic":
        return f"{base}, dramatic panel-style framing, hard contrast, graphic composition"
    return f"{base}, cinematic composition, natural lens behavior"


def _lighting_directive_for_style(style: str) -> str:
    if style == "anime":
        return "high-contrast key light, cel-shaded highlights, controlled bloom"
    if style == "cartoon":
        return "bright key + soft fill, saturated color separation, clean edges"
    if style == "comic":
        return "hard key light, deep shadows, punchy contrast with halftone mood"
    return "cinematic motivated lighting, clean skin tone rendering, premium contrast"


def _character_anchor(subject: str, trait: str) -> str:
    subject_clean = _clean_spaces(subject).lower() or "protagonist"
    trait_clean = _trait_display(trait)
    return (
        f"{subject_clean} with {trait_clean}; keep identical face structure, hairstyle, outfit palette, "
        "age range, and body build across every scene."
    )


def _build_visual_prompt_pack(*, idea: str, style_preset: str | None, aspect_ratio: str, duration_seconds: int) -> str:
    concept = _core_idea_phrase(idea) or _clean_spaces(idea)
    subject, trait = _extract_subject_and_trait(concept)
    trait_display = _trait_display(trait)
    title = _idea_title(concept, style_preset)
    style_text = _style_label(style_preset)
    style = _normalize_style_preset(style_preset)
    scene_count_target = 8 if duration_seconds <= 60 else (10 if duration_seconds <= 90 else 12)
    lighting = _lighting_directive_for_style(style)
    character_anchor = _character_anchor(subject, trait_display)
    dialogue_mode = _idea_implies_dialogue(concept)

    if style == "anime":
        scene_templates = [
            "Hook: intense eye-level intro of {subject}; instant tension in the first second.",
            "World setup: reveal the arena and stakes with layered depth and environmental motion.",
            "Inciting conflict: clear threat enters frame and pressure spikes immediately.",
            "Power reveal: {subject} counters with {trait}; impact energy and visible momentum shift.",
            "Escalation: fast but readable action chain with continuity-safe transitions.",
            "Control beat: brief calm reset to amplify the next impact.",
            "Payoff: decisive finishing move with hero clarity and strong silhouette.",
            "Final frame: confident hold pose, clean composition, scroll-stopping close.",
        ]
    elif style == "cartoon":
        scene_templates = [
            "Hook: expressive opener of {subject} with bright contrast and clean silhouette.",
            "Setup: playful world reveal with readable props and color separation.",
            "Conflict: challenge appears fast and creates immediate visual stakes.",
            "Reveal: {subject} uses {trait} in a bold stylized action beat.",
            "Escalation: rhythmic progression with snappy transitions and clear motion arcs.",
            "Reaction: comedic or emotional pause that resets pacing.",
            "Payoff: challenge solved in one satisfying visual move.",
            "Final frame: polished hero hold with clean spacing for platform-safe framing.",
        ]
    elif style == "comic":
        scene_templates = [
            "Hook: high-contrast opener with graphic negative space and bold subject lock.",
            "Setup: panel-like environment reveal with foreground/midground/background depth.",
            "Conflict: threat enters like a splash panel and sets clear stakes.",
            "Reveal: {subject} unleashes {trait} in a punchy impact composition.",
            "Escalation: rapid sequence with strong directional flow and readability.",
            "Reaction: tight emotional beat that heightens narrative control.",
            "Payoff: final strike lands in iconic hero framing.",
            "Final frame: cinematic hold panel with premium finish and strong closure.",
        ]
    else:
        scene_templates = [
            "Hook: cinematic opener on {subject} with clear intent and immediate movement.",
            "Setup: grounded environment reveal with practical detail and depth.",
            "Conflict: pressure rises as a visible obstacle enters the scene.",
            "Reveal: {subject} uses {trait} to shift momentum.",
            "Escalation: focused sequence with motivated camera movement and clean continuity.",
            "Reaction: short human beat to build emotional connection.",
            "Payoff: obstacle resolves with believable action and visual clarity.",
            "Final frame: premium hero hold, clean composition, strong finish.",
        ]

    def build_for_scene_count(scene_count: int) -> str:
        ranges = _scene_ranges(duration_seconds, scene_count)
        lines = [
            f"Title: {title}",
            f"Concept: {concept}",
            f"Character: {character_anchor}",
            f"Aspect ratio: {aspect_ratio}",
            f"Duration: {duration_seconds}s",
            f"Visual style: {style_text}",
            "",
        ]
        for idx, (start, end) in enumerate(ranges):
            template = scene_templates[idx] if idx < len(scene_templates) else scene_templates[-1]
            beat = template.format(subject=subject, trait=trait_display)
            camera = _camera_directive_for_scene(
                style=style,
                scene_index=idx,
                scene_count=scene_count,
                dialogue_mode=dialogue_mode,
            )
            lines.append(
                f"{start}-{end}s: {beat} Camera: {camera}. Lighting: {lighting}. "
                "Continuity lock: same protagonist identity, same wardrobe palette, same environment family, "
                "one main hero per shot, stable anatomy, and clean readable framing."
            )
        return "\n".join(lines).strip()

    best = build_for_scene_count(scene_count_target)
    if len(best) <= PROMPT_HELPER_VISUAL_MAX_CHARS:
        return best

    for scene_count in range(scene_count_target - 1, 5, -1):
        candidate = build_for_scene_count(scene_count)
        if len(candidate) <= PROMPT_HELPER_VISUAL_MAX_CHARS:
            return candidate
        best = candidate

    return best[: PROMPT_HELPER_VISUAL_MAX_CHARS - 3].rstrip() + "..."


def _build_voice_script_pack(*, idea: str, style_preset: str | None, duration_seconds: int) -> str:
    concept = _core_idea_phrase(idea) or _clean_spaces(idea)
    subject, trait = _extract_subject_and_trait(concept)
    subject_narration = _subject_narration(subject)
    trait_display = _trait_display(trait)
    style = _normalize_style_preset(style_preset)
    safe_duration = max(60, min(120, int(duration_seconds or POST_DEFAULT_DURATION_SECONDS)))
    target_wpm = _env_int(
        "LABS_PROMPT_HELPER_TARGET_WPM",
        150,
        min_value=130,
        max_value=230,
    )
    pause_buffer = _env_float(
        "LABS_PROMPT_HELPER_PAUSE_BUFFER",
        1.06,
        min_value=1.0,
        max_value=1.25,
    )
    target_words = max(
        130,
        min(
            420,
            int(round((float(safe_duration) / 60.0) * float(target_wpm) * float(pause_buffer))),
        ),
    )

    def _genre_token() -> str:
        low = (concept or "").lower()
        if any(k in low for k in ("thriller", "crime", "killer", "detective", "mystery", "conspiracy", "betray")):
            return "thriller"
        if any(k in low for k in ("history", "historical", "ancient", "legend", "war", "desert")):
            return "historical"
        if any(k in low for k in ("horror", "haunted", "ghost", "dark")):
            return "horror"
        return "adventure"

    def _narration_subject() -> str:
        lowered = _clean_spaces(subject).lower()
        generic_tokens = {"story", "clip", "video", "concept", "idea", "character", "hero"}
        if not lowered or lowered in generic_tokens or len(lowered.split()) <= 1 and lowered in {"story", "concept"}:
            if style == "anime":
                return "the hunter"
            if style == "cartoon":
                return "the underdog hero"
            if style == "comic":
                return "the detective"
            if _genre_token() == "thriller":
                return "the lead investigator"
            return "the protagonist"
        return _subject_narration(subject)

    def _pick(options: list[str], seed: int, offset: int) -> str:
        if not options:
            return ""
        return options[(seed + offset) % len(options)]

    genre = _genre_token()
    narrator_subject = _narration_subject()
    seed = sum(ord(ch) for ch in (concept or narrator_subject)) % 997
    concept_hint = _truncate_words(_clean_spaces(concept), 8)

    if style == "anime":
        openings = [
            f"Sirens cut through the night as {narrator_subject} steps into a city that already feels cursed.",
            f"The gate opens above the skyline, and {narrator_subject} is the only one still moving forward.",
        ]
        rises = [
            f"The first wave hits hard, but {narrator_subject} answers with {trait_display} and razor focus.",
            "Every clash comes faster, louder, and closer, until the street turns into a battlefield.",
            "Fear spreads through the crowd, then flips into silence the moment the momentum changes.",
            "Even allies who doubted start following, because the plan is finally visible.",
        ]
        climax = [
            "At the peak, the strongest threat tries to break the line in one final rush.",
            "The counter lands in a single precise sequence, clean enough to change the entire fight.",
        ]
        close = [
            "When dawn finally breaks, the city is still standing and the legend is just beginning.",
            "The final look is calm, steady, and dangerous: power with discipline, not chaos.",
        ]
        expansion_pool = [
            "The heartbeat stays high, but the camera keeps every move readable and deliberate.",
            "A brief quiet beat lets the emotion breathe before the next impact detonates.",
            "By the end, every earlier detail pays off in a way that feels earned, not random.",
        ]
        base_sentences = [
            _pick(openings, seed, 0),
            _pick(rises, seed, 1),
            _pick(rises, seed, 2),
            _pick(rises, seed, 3),
            _pick(climax, seed, 4),
            _pick(climax, seed, 5),
            _pick(close, seed, 6),
        ]
    elif style == "cartoon":
        base_sentences = [
            f"{narrator_subject.capitalize()} starts the day with a simple goal and immediately gets thrown into chaos.",
            f"One bad turn leads to another, but {narrator_subject} keeps adapting with {trait_display}.",
            "The world is colorful and playful, but the stakes are real and the clock is not slowing down.",
            "Each new obstacle looks impossible for exactly one second, then gets solved with smart timing.",
            "The midpoint stings, the comeback feels earned, and the momentum turns hard in the hero's favor.",
            "By the final beat, the crowd is laughing, cheering, and fully invested in the finish.",
            "The ending lands warm and satisfying: courage, heart, and one clean last move.",
        ]
        expansion_pool = [
            "Small choices matter, and every callback from earlier scenes gets paid off.",
            "The humor never kills the tension; it makes the turnaround hit even harder.",
            "Underneath the fun, the story stays human: fear, recovery, and confidence rebuilt in public.",
        ]
    elif style == "comic":
        base_sentences = [
            f"Rain hits the pavement as {narrator_subject} stares at a case no one else wants to touch.",
            "A witness disappears, the timeline cracks, and every clue points in a different direction.",
            f"Then {narrator_subject} spots the hidden pattern and moves with {trait_display}.",
            "Panels tighten around every choice, and each reveal raises the cost of being wrong.",
            "When the pressure peaks, the truth surfaces in one brutal, undeniable moment.",
            "The final confrontation is short, sharp, and personal, exactly how this story needs to end.",
            "Last frame: justice with a scar, victory with a price, and silence after the storm.",
        ]
        expansion_pool = [
            "No monologue wastes time; every line either exposes motive or changes the next move.",
            "The city feels alive, dangerous, and close enough to breathe against your neck.",
            "By the end, the hero wins the case but loses the illusion that truth is clean.",
        ]
    else:
        if genre == "thriller":
            base_sentences = [
                f"At 2:13 a.m., {narrator_subject} gets a message that should not exist: \"I'm already inside.\"",
                "By the time the call ends, one witness is gone and the backup line is dead.",
                f"{narrator_subject.capitalize()} follows a trail of small lies that suddenly connect into one terrifying plan.",
                "Every room feels watched, every ally feels uncertain, and every second starts to matter.",
                f"When the trap finally closes, {narrator_subject} survives by leaning into {trait_display}, not panic.",
                "The twist is personal, the choice is ugly, and the wrong move costs a life.",
                "In the final stretch, truth wins by inches, not miracles, and the escape barely holds.",
                f"Last shot: {narrator_subject} breathing hard in the quiet, knowing this story is not really over.",
            ]
            expansion_pool = [
                "A familiar face turns, then hesitates, and that half-second changes the whole outcome.",
                "The score drops to almost nothing before the next reveal lands like a punch to the chest.",
                "What makes it hit is not spectacle; it's the fear of choosing wrong with no time left.",
            ]
        elif genre == "historical":
            base_sentences = [
                f"{narrator_subject.capitalize()} begins with dust in the wind and a promise carved into memory.",
                "The past is not distant here; it speaks through ruins, scars, and names people still whisper.",
                f"When conflict rises, {narrator_subject} answers with {trait_display} and hard-earned patience.",
                "Each chapter reveals sacrifice, strategy, and the weight of decisions that outlive a lifetime.",
                "The midpoint brings loss, but not surrender, and the mission tightens with new urgency.",
                "By the close, the lesson feels intimate: history is built by people who kept going while afraid.",
                "Final beat: a quiet horizon, a steady breath, and a legacy carried forward.",
            ]
            expansion_pool = [
                "The narration stays grounded in human cost, not empty hero worship.",
                "Every detail points back to one theme: endurance with purpose.",
                "The final line lands softly but lingers, like a story you keep replaying after it ends.",
            ]
        else:
            base_sentences = [
                f"{narrator_subject.capitalize()} starts with a clear goal, then everything begins to go wrong at once.",
                f"Instead of freezing, {narrator_subject} reacts with {trait_display} and steady decision-making.",
                "The pace builds naturally: problem, consequence, adjustment, then a smarter next move.",
                "You can feel the emotion in the pauses, not just in the action beats.",
                "By the midpoint, the stakes are personal and the outcome finally feels uncertain.",
                "The comeback is earned through discipline, not luck, and that makes the turn believable.",
                "The final section resolves with clarity: one strong choice, one clean finish, no wasted motion.",
            ]
            expansion_pool = [
                "Every beat pushes the character forward while revealing something vulnerable and true.",
                "Momentum stays high, but the story leaves enough breathing room for emotion to register.",
                "The last line sounds human, confident, and grounded in what we just watched.",
            ]

    if concept_hint:
        base_sentences.insert(
            1,
            f"The mission sounds simple on paper, but \"{concept_hint}\" becomes far more dangerous in real time.",
        )

    if duration_seconds >= 90:
        base_sentences.extend(
            [
                "The longer cut adds one more reversal, and the character has to choose under real pressure.",
                "That extra decision gives the ending weight and makes the payoff feel earned.",
            ]
        )
    if duration_seconds >= 120:
        base_sentences.extend(
            [
                "The final act slows just enough to let the emotion land before the last push.",
                "When the ending arrives, it feels inevitable in hindsight and shocking in the moment.",
            ]
        )

    seen: set[str] = set()
    final_sentences: list[str] = []
    for sentence in base_sentences:
        s = _clean_spaces(sentence).strip()
        if not s:
            continue
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        final_sentences.append(s if s.endswith((".", "!", "?")) else f"{s}.")

    upper_target = target_words + 8
    while _word_count(" ".join(final_sentences)) > upper_target and len(final_sentences) > 1:
        final_sentences.pop()

    words_now = _word_count(" ".join(final_sentences))
    lower_target = max(90, target_words - 4)
    if words_now < lower_target:
        idx = 0
        fallback_pool = list(expansion_pool)
        while _word_count(" ".join(final_sentences)) < lower_target:
            if idx < len(fallback_pool):
                sentence = fallback_pool[idx]
            else:
                sentence = (
                    f"The tension keeps climbing, but {narrator_subject} stays deliberate, human, and fully present."
                    if (idx % 2 == 0)
                    else "Every beat pays off because the choices feel emotional, specific, and real."
                )
            idx += 1
            s = _clean_spaces(sentence).strip()
            if not s:
                continue
            key = s.lower()
            if key in seen:
                continue
            seen.add(key)
            final_sentences.append(s if s.endswith((".", "!", "?")) else f"{s}.")

    script = " ".join(final_sentences).strip()
    if script and script[-1] not in ".!?":
        script = f"{script}."
    return script


def _build_prompt_helper_analysis(*, idea: str, style_preset: str | None, duration_seconds: int) -> dict[str, object]:
    concept = _core_idea_phrase(idea) or _clean_spaces(idea)
    subject, trait = _extract_subject_and_trait(concept)
    trait_display = _trait_display(trait)
    style = _normalize_style_preset(style_preset)
    dialogue_mode = _idea_implies_dialogue(concept)
    scene_count = 8 if duration_seconds <= 60 else (10 if duration_seconds <= 90 else 12)
    ranges = _scene_ranges(duration_seconds, scene_count)
    camera_plan = [
        f"{start}-{end}s: {_camera_directive_for_scene(style=style, scene_index=idx, scene_count=scene_count, dialogue_mode=dialogue_mode)}"
        for idx, (start, end) in enumerate(ranges[: min(8, len(ranges))])
    ]
    return {
        "continuity_anchor": _character_anchor(subject, trait_display),
        "hook_focus": f"Open on {subject} quickly and reveal {trait_display} within the first 3 seconds.",
        "quality_guardrails": [
            "Keep one protagonist identity across all scenes with the same face, hair, and wardrobe.",
            "Keep one clear main subject per shot; background extras stay secondary and unobtrusive.",
            "Avoid morphing anatomy, erratic body motion, sliding feet, and unstable framing.",
            "Avoid random text, logos, subtitle artifacts, and watermark artifacts.",
            "Maintain consistent lighting direction and environment family.",
            "Use clean subject framing so captions and platform UI remain readable.",
        ],
        "camera_plan": camera_plan,
    }


def _storyboard_labels(scene_count: int) -> list[str]:
    safe_count = max(1, int(scene_count or 1))
    if safe_count <= 4:
        return ["Hook", "Setup", "Turn", "Payoff"][:safe_count]
    if safe_count == 5:
        return ["Hook", "Setup", "Pressure", "Turn", "Payoff"]
    return ["Hook", "Setup", "Pressure", "Escalation", "Turn", "Payoff"][:safe_count]


def _build_prompt_helper_storyboard(
    *,
    idea: str,
    style_preset: str | None,
    duration_seconds: int,
) -> list[dict[str, str]]:
    # Storyboard beats are lightweight review cards shown before a paid generation starts.
    concept = _core_idea_phrase(idea) or _clean_spaces(idea)
    subject, trait = _extract_subject_and_trait(concept)
    trait_display = _trait_display(trait)
    style = _normalize_style_preset(style_preset)
    dialogue_mode = _idea_implies_dialogue(concept)
    scene_count = 4 if duration_seconds <= 60 else (5 if duration_seconds <= 90 else 6)
    labels = _storyboard_labels(scene_count)
    beats: list[dict[str, str]] = []

    for idx, (start, end) in enumerate(_scene_ranges(duration_seconds, scene_count)):
        label = labels[idx] if idx < len(labels) else f"Beat {idx + 1}"
        camera = _camera_directive_for_scene(
            style=style,
            scene_index=idx,
            scene_count=scene_count,
            dialogue_mode=dialogue_mode,
        )
        if idx == 0:
            visual_beat = f"Introduce {subject} immediately with premium readability and visible stakes."
            voice_beat = f"Open fast, name the tension, and hint that {trait_display} changes everything."
        elif idx == scene_count - 1:
            visual_beat = f"Land the final image on {subject} with a polished hero hold and clean closure."
            voice_beat = "Resolve the promise, then end on a line that feels finished instead of abrupt."
        elif idx >= scene_count - 2:
            visual_beat = f"Show {subject} turning momentum with {trait_display} in a clear payoff beat."
            voice_beat = "Deliver the emotional turn and make the payoff feel earned."
        elif idx == 1:
            visual_beat = "Clarify the world, tone, and obstacle so the viewer instantly understands the setup."
            voice_beat = "Add context without slowing the pace or over-explaining."
        else:
            visual_beat = f"Raise pressure around {subject} while keeping the same identity, wardrobe palette, and environment family."
            voice_beat = "Escalate the conflict with one specific detail that makes the next beat feel bigger."
        beats.append(
            {
                "label": label,
                "time_range": f"{start}-{end}s",
                "visual_beat": visual_beat,
                "voice_beat": voice_beat,
                "camera": camera,
            }
        )
    return beats


def _post_credits_needed(
    image_count: int,
    voice_script: str,
    style_preset: str | None,
    duration_seconds: int = POST_DEFAULT_DURATION_SECONDS,
    visual_mode: str = "image",
    voice_name: str | None = None,
) -> int:
    safe_images = max(1, int(image_count or _default_post_scene_count(duration_seconds)))
    safe_mode = (visual_mode or "image").strip().lower()
    voice_cost = _voice_provider_cost_usd(voice_script, voice_name)
    if safe_mode == "video":
        # AI video posts are billed against the actual montage workload: multiple short Veo scene renders plus voice.
        scene_duration = max(5, min(7, int(round(float(duration_seconds) / float(max(1, safe_images))))))
        scene_seconds = float(safe_images * scene_duration)
        target_profit = _env_float("LABS_POST_VIDEO_TARGET_PROFIT_USD", 3.50, min_value=0.0, max_value=50.0)
        provider_cost = scene_seconds * _video_provider_cost_usd_per_second("relax", style_preset) + voice_cost
        return _credits_from_usd(provider_cost + target_profit)
    target_profit = _env_float("LABS_POST_IMAGE_TARGET_PROFIT_USD", 1.45, min_value=0.0, max_value=50.0)
    provider_cost = (float(safe_images) * _image_provider_cost_usd(style_preset)) + voice_cost
    return _credits_from_usd(provider_cost + target_profit)


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


def _tts_style_profile(script: str) -> dict[str, float]:
    style = (os.getenv("GOOGLE_TTS_STYLE") or "conversational").strip().lower()
    profiles: dict[str, dict[str, float]] = {
        "narrative": {"rate": -3.0, "pitch": 0.3, "volume": 2.0},
        "conversational": {"rate": 0.0, "pitch": 0.6, "volume": 2.2},
        "energetic": {"rate": 4.0, "pitch": 1.2, "volume": 2.4},
        "cinematic": {"rate": -5.0, "pitch": 0.1, "volume": 2.3},
    }
    base = dict(profiles.get(style, profiles["conversational"]))
    low = (script or "").lower()
    if any(k in low for k in ("urgent", "hurry", "breaking", "now")):
        base["rate"] += 2.0
        base["pitch"] += 0.6
    if any(k in low for k in ("calm", "gentle", "soft", "quiet", "peaceful")):
        base["rate"] -= 1.5
        base["pitch"] -= 0.3
    return base


def _tts_sentence_prosody(
    sentence: str,
    *,
    idx: int,
    total: int,
    base_rate: float,
    base_pitch: float,
    base_volume: float,
) -> tuple[float, float, float, str]:
    low = (sentence or "").lower()
    rate = float(base_rate)
    pitch = float(base_pitch)
    volume = float(base_volume)
    emphasis = "none"

    if sentence.endswith("?"):
        rate -= 1.0
        pitch += 0.7
        emphasis = "moderate"
    elif "!" in sentence:
        rate += 3.0
        pitch += 1.4
        volume += 0.4
        emphasis = "strong"
    elif any(k in low for k in ("wow", "amazing", "incredible", "epic", "legendary")):
        rate += 2.0
        pitch += 1.0
        emphasis = "strong"
    elif any(k in low for k in ("sad", "loss", "grief", "fear", "tension", "serious")):
        rate -= 2.0
        pitch -= 0.5
        emphasis = "reduced"

    if idx == 0:
        rate -= 1.0
        emphasis = "moderate" if emphasis == "none" else emphasis
    if idx == max(0, total - 1):
        rate -= 1.0

    return (
        max(-20.0, min(20.0, rate)),
        max(-10.0, min(10.0, pitch)),
        max(-10.0, min(6.0, volume)),
        emphasis,
    )


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

    profile = _tts_style_profile(script)
    base_rate = float(profile.get("rate", -3.0))
    base_pitch = float(profile.get("pitch", 0.3))
    base_volume = float(profile.get("volume", 2.0))

    parts: list[str] = ["<speak>"]
    for idx, sentence in enumerate(sentences):
        escaped = _xml_escape(sentence)
        rate, pitch, volume, emphasis = _tts_sentence_prosody(
            sentence,
            idx=idx,
            total=len(sentences),
            base_rate=base_rate,
            base_pitch=base_pitch,
            base_volume=base_volume,
        )
        prosody_open = f"<prosody rate='{rate:+.1f}%' pitch='{pitch:+.1f}st' volume='{volume:+.1f}dB'>"
        if emphasis in {"reduced", "moderate", "strong"}:
            parts.append(f"{prosody_open}<emphasis level='{emphasis}'>{escaped}</emphasis></prosody>")
        else:
            parts.append(f"{prosody_open}{escaped}</prosody>")
        if idx < len(sentences) - 1:
            pause_for_sentence = pause_ms
            if sentence.endswith("?"):
                pause_for_sentence = max(80, int(round(pause_ms * 0.85)))
            elif "!" in sentence:
                pause_for_sentence = max(80, int(round(pause_ms * 0.75)))
            parts.append(f"<break time='{pause_for_sentence}ms'/>")
        elif sentence and not sentence.endswith((".", "!", "?")):
            parts.append(f"<break time='{phrase_pause_ms}ms'/>")
    parts.append("</speak>")
    return "".join(parts)


def _tts_audio_config(speaking_rate: float) -> dict[str, float | str]:
    pitch = _env_float("GOOGLE_TTS_PITCH", 0.4, min_value=-20.0, max_value=20.0)
    volume = _env_float("GOOGLE_TTS_VOLUME_GAIN_DB", 2.0, min_value=-96.0, max_value=16.0)
    sample_rate_hz = _env_int("GOOGLE_TTS_SAMPLE_RATE_HZ", 48000, min_value=8000, max_value=48000)
    cfg: dict[str, float | str | int | list[str]] = {
        "audioEncoding": "MP3",
        "speakingRate": speaking_rate,
        "pitch": pitch,
        "volumeGainDb": volume,
    }
    if sample_rate_hz > 0:
        cfg["sampleRateHertz"] = sample_rate_hz
    profile_ids = [
        p.strip()
        for p in (os.getenv("GOOGLE_TTS_EFFECT_PROFILE_ID") or "headphone-class-device").split(",")
        if p.strip()
    ]
    if profile_ids:
        cfg["effectsProfileId"] = profile_ids
    return cfg


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


def _resolve_google_tts_endpoint() -> tuple[str, bool]:
    raw = (
        os.getenv("GOOGLE_TTS_API_URL")
        or "https://texttospeech.googleapis.com/v1/text:synthesize?key={API_KEY}"
    ).strip()
    use_google_auth = False

    if "{API_KEY}" in raw:
        key = (os.getenv("GOOGLE_API_KEY") or "").strip()
        if key:
            return raw.replace("{API_KEY}", key), False
        # Fall back to service-account/ADC auth when API key is missing.
        raw = raw.replace("?key={API_KEY}", "").replace("&key={API_KEY}", "").replace("key={API_KEY}", "")
        raw = raw.rstrip("?&")
        use_google_auth = True

    if not raw:
        raw = "https://texttospeech.googleapis.com/v1/text:synthesize"
        use_google_auth = True
    return raw, use_google_auth


def _google_access_token() -> str:
    global _GOOGLE_TOKEN_CACHE

    raw = (os.getenv("GOOGLE_API_BEARER_TOKEN") or "").strip()
    if raw:
        token = raw.replace("Bearer ", "").strip()
        if token:
            return token

    now_ts = time.time()
    if _GOOGLE_TOKEN_CACHE:
        cached_token, cached_expiry = _GOOGLE_TOKEN_CACHE
        if cached_token and cached_expiry > (now_ts + 60):
            return cached_token

    scope = (os.getenv("GOOGLE_AUTH_SCOPE") or GOOGLE_CLOUD_PLATFORM_SCOPE).strip() or GOOGLE_CLOUD_PLATFORM_SCOPE
    auth_error: str | None = None

    # Preferred path: ADC / service account creds via google-auth package.
    try:
        from google.auth.transport.requests import Request as GoogleAuthRequest
        import google.auth
        from google.oauth2 import service_account

        creds = None
        raw_sa = (os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON") or "").strip()
        raw_sa_b64 = (os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON_B64") or "").strip()
        if raw_sa_b64 and not raw_sa:
            try:
                raw_sa = base64.b64decode(raw_sa_b64.encode("utf-8")).decode("utf-8")
            except Exception:
                raw_sa = ""

        if raw_sa:
            try:
                sa_info = json.loads(raw_sa)
                creds = service_account.Credentials.from_service_account_info(sa_info, scopes=[scope])
            except Exception as exc:
                auth_error = f"service-account-json failed: {exc}"

        if creds is None:
            gac_path = (os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or "").strip()
            if gac_path and os.path.exists(gac_path):
                try:
                    creds = service_account.Credentials.from_service_account_file(gac_path, scopes=[scope])
                except Exception as exc:
                    auth_error = f"service-account-file failed: {exc}"

        if creds is None:
            try:
                creds, _ = google.auth.default(scopes=[scope])
            except Exception as exc:
                auth_error = f"adc default failed: {exc}"
                creds = None

        if creds is not None:
            creds.refresh(GoogleAuthRequest())
            token = str(getattr(creds, "token", "") or "").strip()
            if token:
                expiry_dt = getattr(creds, "expiry", None)
                expiry_ts = float(expiry_dt.timestamp()) if expiry_dt else (now_ts + 300)
                _GOOGLE_TOKEN_CACHE = (token, expiry_ts)
                return token
    except Exception as exc:
        auth_error = f"google-auth unavailable/failed: {exc}"

    # Last resort: GCE metadata token.
    md_url = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
    try:
        resp = requests.get(md_url, headers={"Metadata-Flavor": "Google"}, params={"scopes": scope}, timeout=2)
        if resp.status_code >= 400:
            resp = requests.get(md_url, headers={"Metadata-Flavor": "Google"}, timeout=2)
        if resp.status_code < 400:
            data = resp.json() if resp.content else {}
            token = str((data or {}).get("access_token") or "").strip()
            if token:
                expires_in = int((data or {}).get("expires_in") or 0)
                if expires_in > 0:
                    _GOOGLE_TOKEN_CACHE = (token, now_ts + max(60, expires_in - 30))
                return token
    except requests.RequestException:
        pass

    detail = (
        "Voice preview unavailable: configure GOOGLE_API_KEY or Google credentials "
        "(GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_SERVICE_ACCOUNT_JSON)."
    )
    if auth_error:
        detail = f"{detail} ({auth_error})"
    raise HTTPException(status_code=503, detail=detail)


def _google_auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_google_access_token()}",
        "Content-Type": "application/json; charset=utf-8",
    }


def _preview_voice_candidates(selected: str, fallback: str) -> list[str]:
    extra = [v.strip() for v in (os.getenv("GOOGLE_TTS_EXTRA_FALLBACK_VOICES") or "").split(",") if v.strip()]
    defaults = [
        os.getenv("GOOGLE_TTS_DEFAULT_VOICE") or DEFAULT_TTS_VOICE,
        os.getenv("GOOGLE_TTS_FALLBACK_VOICE") or FALLBACK_TTS_VOICE,
        *TTS_VOICE_FALLBACK_CHAIN,
    ]
    ordered = [selected, fallback, *extra, *defaults]
    out: list[str] = []
    seen: set[str] = set()
    for voice in ordered:
        v = (voice or "").strip()[:64]
        key = v.lower()
        if not v or key in {"auto", "default", "en-us", "en_us"}:
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(v)
    return out or [DEFAULT_TTS_VOICE]


def _preview_error_detail(resp: requests.Response) -> str:
    try:
        data = resp.json()
        err = data.get("error") if isinstance(data, dict) else None
        if isinstance(err, dict):
            return str(err.get("message") or "").strip()
        if err:
            return str(err).strip()
    except Exception:
        pass
    return (resp.text or "")[:200]


def _synthesize_voice_preview(*, voice_name: str, speed_wpm: int, text: str) -> tuple[str, bytes]:
    endpoint, use_google_auth = _resolve_google_tts_endpoint()
    request_headers = _google_auth_headers() if use_google_auth else None
    safe_speed = max(80, min(330, int(speed_wpm or 165)))
    speaking_rate = max(0.5, min(2.0, float(safe_speed) / 165.0))

    default_voice_name = (os.getenv("GOOGLE_TTS_DEFAULT_VOICE") or DEFAULT_TTS_VOICE).strip() or DEFAULT_TTS_VOICE
    selected_voice = (voice_name or "").strip()[:64] or default_voice_name
    if selected_voice.lower() in {"auto", "default", "en-us", "en_us"}:
        selected_voice = default_voice_name
    fallback_voice = (os.getenv("GOOGLE_TTS_FALLBACK_VOICE") or default_voice_name).strip()[:64] or default_voice_name
    safe_text = (text or "").strip()[:240] or "This is a quick voice preview."
    use_ssml = (os.getenv("GOOGLE_TTS_USE_SSML") or "1").strip().lower() in {"1", "true", "yes", "on"}
    last_status = 502
    last_detail = "Voice preview provider request failed."

    for candidate_voice in _preview_voice_candidates(selected_voice, fallback_voice):
        payload = _preview_tts_payload(
            text=safe_text,
            selected_voice=candidate_voice,
            speaking_rate=speaking_rate,
            use_ssml=use_ssml,
        )
        try:
            resp = requests.post(endpoint, json=payload, headers=request_headers, timeout=20)
        except requests.RequestException:
            last_status = 502
            last_detail = "Voice preview provider request failed."
            continue

        if resp.status_code >= 400 and use_ssml:
            fallback_payload = _preview_tts_payload(
                text=safe_text,
                selected_voice=candidate_voice,
                speaking_rate=speaking_rate,
                use_ssml=False,
            )
            try:
                resp = requests.post(endpoint, json=fallback_payload, headers=request_headers, timeout=20)
            except requests.RequestException:
                last_status = 502
                last_detail = "Voice preview provider request failed."
                continue

        content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
        if resp.status_code >= 400:
            last_status = int(resp.status_code)
            last_detail = _preview_error_detail(resp)
            continue

        if content_type.startswith("audio/") and resp.content:
            return content_type, resp.content

        try:
            data = resp.json()
        except Exception:
            last_status = 502
            last_detail = "Voice preview response could not be parsed."
            continue

        audio_b64 = data.get("audioContent") if isinstance(data, dict) else None
        if not isinstance(audio_b64, str) or not audio_b64.strip():
            last_status = 502
            last_detail = "Voice preview response had no audio content."
            continue

        try:
            audio_bytes = base64.b64decode(audio_b64.strip())
        except Exception:
            last_status = 502
            last_detail = "Voice preview payload was invalid."
            continue

        return "audio/mpeg", audio_bytes

    raise HTTPException(status_code=502, detail=f"Voice preview failed ({last_status}). {last_detail}".strip())


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


def _parse_settings_payload(raw: object) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        value = raw.strip()
        if not value:
            return {}
        try:
            data = json.loads(value)
        except Exception:
            return {}
        return data if isinstance(data, dict) else {}
    return {}


def _stable_seed(text: str) -> int:
    value = (text or "").strip()
    if not value:
        return 1
    seed = 0
    for ch in value:
        seed = (seed * 31 + ord(ch)) % 2_147_483_647
    return int(seed or 1)


def _resolve_reference_job_context(
    *,
    db: Session,
    current_user: User,
    job_id: int,
    allowed_kinds: set[str],
    missing_detail: str,
    fallback_style: str | None = None,
) -> dict[str, object]:
    # Reuse only completed visual generations so continuity/reference picks are stable and user-owned.
    job = (
        db.query(Job)
        .join(Upload, Job.upload_id == Upload.id)
        .filter(Job.id == job_id, Upload.user_id == current_user.id)
        .first()
    )
    if (
        not job
        or str(getattr(job, "kind", "") or "") not in allowed_kinds
        or str(getattr(job, "status", "") or "").lower() != "done"
    ):
        raise HTTPException(status_code=404, detail=missing_detail)

    settings = _parse_settings_payload(getattr(job, "caption_style_json", None))
    prompt_source = str(settings.get("visual_prompt") or getattr(job, "prompt", "") or "").strip()
    style_preset = str(settings.get("style_preset") or fallback_style or "").strip()
    continuity_anchor = str(settings.get("continuity_anchor") or "").strip()
    if not continuity_anchor:
        subject, trait = _extract_subject_and_trait(_core_idea_phrase(prompt_source) or prompt_source)
        continuity_anchor = _character_anchor(subject, _trait_display(trait))

    seed_value = settings.get("seed")
    if isinstance(seed_value, int) and seed_value > 0:
        seed = int(seed_value)
    else:
        seed = _stable_seed(prompt_source or continuity_anchor)

    return {
        "job_id": int(job.id),
        "job_kind": str(getattr(job, "kind", "") or ""),
        "prompt": prompt_source,
        "style_preset": style_preset,
        "continuity_anchor": continuity_anchor,
        "seed": seed,
    }


def _merge_continuation_prompt(base_prompt: str, continuity_anchor: str | None) -> str:
    anchor_text = (continuity_anchor or "").strip()
    prefix = "Continuation clip. Keep the same main character identity, wardrobe palette, and visual style."
    if anchor_text:
        prefix = f"{prefix} Character anchor: {anchor_text}"
    merged = f"{prefix}\n\n{base_prompt}".strip()
    if len(merged) <= PROMPT_MAX_CHARS:
        return merged
    trimmed_anchor = anchor_text[:240].rstrip() if anchor_text else ""
    if trimmed_anchor:
        prefix = (
            "Continuation clip. Keep the same main character identity, wardrobe palette, and visual style. "
            f"Character anchor: {trimmed_anchor}"
        )
    merged = f"{prefix}\n\n{base_prompt}".strip()
    if len(merged) <= PROMPT_MAX_CHARS:
        return merged
    return merged[:PROMPT_MAX_CHARS].rstrip()


def _merge_reference_prompt(
    base_prompt: str,
    reference_prompt: str | None,
    continuity_anchor: str | None,
) -> str:
    # This is safe prompt-level continuity, not true model-side image conditioning.
    reference_text = _clean_spaces(reference_prompt or "")
    anchor_text = _clean_spaces(continuity_anchor or "")
    prefix = (
        "Reference look only. Keep the same premium visual identity, face structure, wardrobe palette, "
        "lighting mood, and environment family from the reference generation while creating a fresh beat."
    )
    if anchor_text:
        prefix = f"{prefix} Character anchor: {anchor_text}"
    if reference_text:
        prefix = f"{prefix} Reference cues: {reference_text[:320].rstrip()}"
    merged = f"{prefix}\n\n{base_prompt}".strip()
    if len(merged) <= PROMPT_MAX_CHARS:
        return merged
    if reference_text:
        prefix = prefix.replace(reference_text[:320].rstrip(), reference_text[:180].rstrip())
        merged = f"{prefix}\n\n{base_prompt}".strip()
        if len(merged) <= PROMPT_MAX_CHARS:
            return merged
    return merged[:PROMPT_MAX_CHARS].rstrip()


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
    remote_adjust_applied = False
    remote_adjust_email = ""
    remote_adjust_reference = ""
    remote_adjust_amount = 0

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

            need_credits = int(credits_needed or 0)

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

            if orbito_entitlements_enabled():
                remote_adjust_email = str(user_row.email)
                remote_adjust_amount = need_credits
                remote_adjust_reference = f"labs:job:{int(job.id)}:reserve"
                updated_credits = adjust_orbito_entitlements(
                    email=remote_adjust_email,
                    delta=-need_credits,
                    reason=f"{kind}_reserve",
                    reference=remote_adjust_reference,
                    strict=True,
                )
                if updated_credits is None:
                    raise HTTPException(status_code=503, detail="Entitlements bridge adjustment returned no balance")
                user_row.credits = int(updated_credits)
                remote_adjust_applied = True
            else:
                have_credits = int(user_row.credits or 0)
                if have_credits < need_credits:
                    raise HTTPException(
                        status_code=402,
                        detail=f"Insufficient credits (need {need_credits}, have {have_credits})",
                    )
                user_row.credits = have_credits - need_credits
    except HTTPException:
        if remote_adjust_applied and remote_adjust_email and remote_adjust_amount > 0:
            try:
                adjust_orbito_entitlements(
                    email=remote_adjust_email,
                    delta=remote_adjust_amount,
                    reason=f"{kind}_reserve_rollback",
                    reference=f"{remote_adjust_reference}:rollback",
                    strict=False,
                )
            except Exception:
                pass
        raise
    except Exception:
        if remote_adjust_applied and remote_adjust_email and remote_adjust_amount > 0:
            try:
                adjust_orbito_entitlements(
                    email=remote_adjust_email,
                    delta=remote_adjust_amount,
                    reason=f"{kind}_reserve_rollback",
                    reference=f"{remote_adjust_reference}:rollback",
                    strict=False,
                )
            except Exception:
                pass
        raise HTTPException(status_code=500, detail="Failed to start generation")

    if not upload or not job:
        raise HTTPException(status_code=500, detail="Failed to start generation")
    return upload, job


class GenerateVideoRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=PROMPT_MAX_CHARS)
    negative_prompt: str | None = Field(default=None, max_length=PROMPT_MAX_CHARS)
    aspect_ratio: str = "9:16"
    duration_seconds: int = Field(default=6, ge=5, le=7)
    generation_speed: str = Field(default="relax", max_length=16)
    model: str | None = Field(default="google", max_length=64)
    style_preset: str | None = Field(default="social-native", max_length=64)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    input_image_key: str | None = Field(default=None, max_length=512)
    watermark_enabled: bool = Field(default=True)
    dialogue_script: str | None = Field(default=None, max_length=5000)
    voice_name: str | None = Field(default=None, max_length=64)
    voice_mode: str | None = Field(default=None, max_length=16)
    continuation_job_id: int | None = Field(default=None, ge=1)
    reference_job_id: int | None = Field(default=None, ge=1)


class GenerateImageRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=PROMPT_MAX_CHARS)
    aspect_ratio: str = "1:1"
    model: str | None = Field(default="google", max_length=64)
    style_preset: str | None = Field(default="photo-real", max_length=64)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    watermark_enabled: bool = Field(default=True)


class GenerateVoiceoverRequest(BaseModel):
    script: str = Field(min_length=3, max_length=6000)
    model: str | None = Field(default="google", max_length=64)
    voice_name: str | None = Field(default=DEFAULT_TTS_VOICE, max_length=64)
    speed_wpm: int = Field(default=POST_BASE_VOICE_WPM, ge=80, le=330)


class GeneratePostRequest(BaseModel):
    visual_prompt: str = Field(min_length=3, max_length=PROMPT_MAX_CHARS)
    voice_script: str = Field(min_length=30, max_length=12000)
    dialogue_script: str | None = Field(default=None, max_length=5000)
    aspect_ratio: str = "9:16"
    duration_seconds: int = Field(default=POST_DEFAULT_DURATION_SECONDS, ge=60, le=120)
    image_count: int | None = Field(default=POST_DEFAULT_IMAGE_COUNT, ge=6, le=10)
    post_visual_mode: str = Field(default="image", max_length=16)
    model: str | None = Field(default="google", max_length=64)
    voice_name: str | None = Field(default=DEFAULT_TTS_VOICE, max_length=64)
    speed_wpm: int | None = Field(default=None, ge=80, le=330)
    style_preset: str | None = Field(default="social-native", max_length=64)
    caption_style_preset: str | None = Field(default="orbito", max_length=64)
    captions_enabled: bool = Field(default=True)
    watermark_enabled: bool = Field(default=True)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    continuation_job_id: int | None = Field(default=None, ge=1)
    reference_job_id: int | None = Field(default=None, ge=1)


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
    continuation_job_id: int | None = Field(default=None, ge=1)
    reference_job_id: int | None = Field(default=None, ge=1)


class PromptHelperStoryboardBeat(BaseModel):
    label: str
    time_range: str
    visual_beat: str
    voice_beat: str
    camera: str


class PromptHelperResponse(BaseModel):
    title: str
    visual_prompt: str
    voice_script: str
    aspect_ratio: str
    duration_seconds: int
    style_preset: str
    analysis: dict[str, object] | None = None
    storyboard: list[PromptHelperStoryboardBeat] | None = None


class VoicePreviewRequest(BaseModel):
    voice_name: str | None = Field(default=DEFAULT_TTS_VOICE, max_length=64)
    speed_wpm: int = Field(default=POST_BASE_VOICE_WPM, ge=80, le=330)
    text: str | None = Field(default=None, max_length=240)


class VoicePreviewResponse(BaseModel):
    voice_name: str
    content_type: str
    audio_base64: str


@router.post("/prompt-helper", response_model=PromptHelperResponse)
def prompt_helper(
    payload: PromptHelperRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Auth guard to avoid anonymous abuse.
    _ = current_user.id

    idea = _clean_spaces(payload.idea)
    if len(idea) < 3:
        raise HTTPException(status_code=400, detail="Idea is required")

    style = _select_prompt_helper_style(payload.style_preset, idea)

    aspect = (payload.aspect_ratio or "9:16").strip()
    if aspect not in ALLOWED_ASPECT_RATIOS:
        aspect = "9:16"

    duration_seconds = int(payload.duration_seconds or POST_DEFAULT_DURATION_SECONDS)
    if duration_seconds not in POST_ALLOWED_DURATIONS:
        duration_seconds = POST_DEFAULT_DURATION_SECONDS

    continuation_job_id = int(payload.continuation_job_id) if payload.continuation_job_id else None
    reference_job_id = int(payload.reference_job_id) if payload.reference_job_id else None
    continuity_anchor: str | None = None
    reference_context: dict[str, object] | None = None
    if continuation_job_id:
        # Continuation means "same story, same identity", so only prior post jobs are valid here.
        reference_context = _resolve_reference_job_context(
            db=db,
            current_user=current_user,
            job_id=continuation_job_id,
            allowed_kinds={JOB_KIND_POST},
            missing_detail="Continuation job not found",
            fallback_style=style,
        )
        if str(reference_context.get("style_preset") or "").strip():
            style = str(reference_context.get("style_preset") or "").strip()
        continuity_anchor = str(reference_context.get("continuity_anchor") or "").strip() or None
    elif reference_job_id:
        # Reference mode is broader: borrow the look from any finished visual generation without forcing story continuation.
        reference_context = _resolve_reference_job_context(
            db=db,
            current_user=current_user,
            job_id=reference_job_id,
            allowed_kinds={JOB_KIND_VIDEO, JOB_KIND_POST, JOB_KIND_IMAGE},
            missing_detail="Reference generation not found",
            fallback_style=style,
        )
        if str(reference_context.get("style_preset") or "").strip():
            style = str(reference_context.get("style_preset") or "").strip()
        continuity_anchor = str(reference_context.get("continuity_anchor") or "").strip() or None

    visual_prompt = _build_visual_prompt_pack(
        idea=idea,
        style_preset=style,
        aspect_ratio=aspect,
        duration_seconds=duration_seconds,
    )
    # Apply continuity/reference instructions after the base pack is written so the helper stays readable first.
    if continuation_job_id:
        visual_prompt = _merge_continuation_prompt(visual_prompt, continuity_anchor)
    elif reference_context:
        visual_prompt = _merge_reference_prompt(
            visual_prompt,
            str(reference_context.get("prompt") or ""),
            continuity_anchor,
        )
    voice_script = _build_voice_script_pack(
        idea=idea,
        style_preset=style,
        duration_seconds=duration_seconds,
    )
    analysis = _build_prompt_helper_analysis(
        idea=idea,
        style_preset=style,
        duration_seconds=duration_seconds,
    )
    if continuity_anchor:
        analysis = dict(analysis or {})
        analysis["continuity_anchor"] = continuity_anchor
    storyboard = _build_prompt_helper_storyboard(
        idea=idea,
        style_preset=style,
        duration_seconds=duration_seconds,
    )
    return PromptHelperResponse(
        title=_idea_title(idea, style),
        visual_prompt=visual_prompt,
        voice_script=voice_script,
        aspect_ratio=aspect,
        duration_seconds=duration_seconds,
        style_preset=style,
        analysis=analysis,
        storyboard=storyboard,
    )


@router.post("/voice-preview", response_model=VoicePreviewResponse)
def voice_preview(
    payload: VoicePreviewRequest,
    current_user: User = Depends(get_current_user),
):
    # Auth is required to avoid anonymous abuse of the preview endpoint.
    _ = current_user.id

    selected_voice = (payload.voice_name or DEFAULT_TTS_VOICE).strip()[:64] or DEFAULT_TTS_VOICE
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


@router.post("/generate/voice-preview", response_model=VoicePreviewResponse)
def voice_preview_generate_alias(
    payload: VoicePreviewRequest,
    current_user: User = Depends(get_current_user),
):
    return voice_preview(payload, current_user)


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
        raise HTTPException(status_code=422, detail="Duration must be one of: 5, 6, 7 seconds")

    generation_speed = _video_speed_key(payload.generation_speed)
    model = _check_model_supported(payload.model)
    input_image_key = _assert_user_owned_key(current_user.id, payload.input_image_key)
    style_preset = (payload.style_preset or "social-native")
    dialogue_script = _clean_dialogue_script(payload.dialogue_script)
    composed_prompt = _compose_prompt_with_dialogue(prompt, dialogue_script)
    voice_name = (payload.voice_name or "").strip()[:64]
    voice_mode = (payload.voice_mode or "").strip().lower()
    if voice_mode not in {"narration", "dialogue", ""}:
        voice_mode = ""
    continuation_job_id = int(payload.continuation_job_id) if payload.continuation_job_id else None
    reference_job_id = int(payload.reference_job_id) if payload.reference_job_id else None
    continuity_seed: int | None = payload.seed
    continuity_anchor: str | None = None
    reference_context: dict[str, object] | None = None
    if continuation_job_id:
        # Video continuation keeps the same character/world and reuses the prior seed when possible.
        reference_context = _resolve_reference_job_context(
            db=db,
            current_user=current_user,
            job_id=continuation_job_id,
            allowed_kinds={JOB_KIND_VIDEO},
            missing_detail="Continuation job not found",
            fallback_style=style_preset,
        )
        prev_prompt = str(reference_context.get("prompt") or "").strip()
        prev_style = str(reference_context.get("style_preset") or style_preset or "").strip()
        continuity_anchor = str(reference_context.get("continuity_anchor") or "").strip() or None
        if continuity_seed is None:
            continuity_seed = int(reference_context.get("seed") or 0) or _stable_seed(prev_prompt or composed_prompt)
        if prev_style:
            style_preset = prev_style
        composed_prompt = _merge_continuation_prompt(composed_prompt, continuity_anchor)
    elif reference_job_id:
        # Reference video generation borrows the prior look and anchor but still makes a fresh scene.
        reference_context = _resolve_reference_job_context(
            db=db,
            current_user=current_user,
            job_id=reference_job_id,
            allowed_kinds={JOB_KIND_VIDEO, JOB_KIND_POST, JOB_KIND_IMAGE},
            missing_detail="Reference generation not found",
            fallback_style=style_preset,
        )
        ref_style = str(reference_context.get("style_preset") or style_preset or "").strip()
        if ref_style:
            style_preset = ref_style
        continuity_anchor = str(reference_context.get("continuity_anchor") or "").strip() or None
        if continuity_seed is None:
            continuity_seed = int(reference_context.get("seed") or 0) or _stable_seed(composed_prompt)
        composed_prompt = _merge_reference_prompt(
            composed_prompt,
            str(reference_context.get("prompt") or ""),
            continuity_anchor,
        )
    voice_script = dialogue_script if voice_mode == "dialogue" and dialogue_script else prompt
    voice_credits = _voiceover_credits_needed(voice_script, voice_name) if voice_name else 0
    credits_needed = _video_credits_needed(duration_seconds, generation_speed, style_preset) + voice_credits

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
                detail += " Upgrade to Creator to use Premium mode."
            raise HTTPException(status_code=403, detail=detail)

    settings_payload = {
        "mode": "video",
        "generation_speed": generation_speed,
        "style_preset": style_preset,
        "seed": continuity_seed,
        "generated_caption_font_scale": GENERATED_CAPTION_FONT_SCALE,
        "generated_caption_y": GENERATED_CAPTION_Y,
        "generated_caption_max_words": GENERATED_CAPTION_MAX_WORDS,
        "generated_caption_max_chars": GENERATED_CAPTION_MAX_CHARS,
        "generated_caption_line_chars": GENERATED_CAPTION_LINE_CHARS,
        "input_image_key": input_image_key,
        "dialogue_script": dialogue_script,
        "voice_name": voice_name or None,
        "voice_mode": voice_mode or None,
        "watermark_enabled": bool(payload.watermark_enabled),
    }
    if continuation_job_id:
        settings_payload["continuation_job_id"] = continuation_job_id
    if reference_job_id and not continuation_job_id:
        settings_payload["reference_job_id"] = reference_job_id
        if reference_context and str(reference_context.get("job_kind") or "").strip():
            settings_payload["reference_job_kind"] = str(reference_context.get("job_kind") or "").strip()
    if continuity_anchor:
        settings_payload["continuity_anchor"] = continuity_anchor

    upload, job = _create_generation_job(
        db=db,
        current_user=current_user,
        kind=JOB_KIND_VIDEO,
        prompt=composed_prompt,
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
    text_length = len(script)
    safe_speed = max(80, min(330, int(payload.speed_wpm or POST_BASE_VOICE_WPM)))
    safe_voice = (payload.voice_name or DEFAULT_TTS_VOICE).strip()[:64] or DEFAULT_TTS_VOICE
    credits_needed = _voiceover_credits_needed(script, safe_voice)

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

    post_visual_mode = (payload.post_visual_mode or "image").strip().lower()
    if post_visual_mode not in ALLOWED_POST_VISUAL_MODES:
        raise HTTPException(status_code=422, detail="AI Post mode must be image or video")

    default_scene_count = _default_post_scene_count(duration_seconds)
    image_count = max(6, min(10, int(payload.image_count or default_scene_count)))
    model = _check_model_supported(payload.model)
    style_preset = (payload.style_preset or "social-native")
    dialogue_script = _clean_dialogue_script(payload.dialogue_script)
    continuation_job_id = int(payload.continuation_job_id) if payload.continuation_job_id else None
    reference_job_id = int(payload.reference_job_id) if payload.reference_job_id else None
    continuity_seed: int | None = payload.seed
    continuity_anchor: str | None = None
    reference_context: dict[str, object] | None = None
    if continuation_job_id:
        # Post continuation stays strict so the new chapter keeps the same recurring subject and style.
        reference_context = _resolve_reference_job_context(
            db=db,
            current_user=current_user,
            job_id=continuation_job_id,
            allowed_kinds={JOB_KIND_POST},
            missing_detail="Continuation job not found",
            fallback_style=style_preset,
        )
        prev_prompt = str(reference_context.get("prompt") or "").strip()
        ref_style = str(reference_context.get("style_preset") or style_preset or "").strip()
        continuity_anchor = str(reference_context.get("continuity_anchor") or "").strip() or None
        if continuity_seed is None:
            continuity_seed = int(reference_context.get("seed") or 0) or _stable_seed(prev_prompt or visual_prompt)
        if ref_style:
            style_preset = ref_style
        visual_prompt = _merge_continuation_prompt(visual_prompt, continuity_anchor)
    elif reference_job_id:
        # Reference post generation is looser: match polish/identity cues without inheriting the whole prior storyline.
        reference_context = _resolve_reference_job_context(
            db=db,
            current_user=current_user,
            job_id=reference_job_id,
            allowed_kinds={JOB_KIND_VIDEO, JOB_KIND_POST, JOB_KIND_IMAGE},
            missing_detail="Reference generation not found",
            fallback_style=style_preset,
        )
        ref_style = str(reference_context.get("style_preset") or style_preset or "").strip()
        if ref_style:
            style_preset = ref_style
        continuity_anchor = str(reference_context.get("continuity_anchor") or "").strip() or None
        if continuity_seed is None:
            continuity_seed = int(reference_context.get("seed") or 0) or _stable_seed(visual_prompt)
        visual_prompt = _merge_reference_prompt(
            visual_prompt,
            str(reference_context.get("prompt") or ""),
            continuity_anchor,
        )
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
    safe_voice = (payload.voice_name or DEFAULT_TTS_VOICE).strip()[:64] or DEFAULT_TTS_VOICE
    credits_needed = _post_credits_needed(
        image_count,
        voice_script,
        style_preset,
        duration_seconds,
        post_visual_mode,
        safe_voice,
    )

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
        "dialogue_script": dialogue_script,
        "image_count": image_count,
        "voice_name": safe_voice,
        "speed_wpm": safe_speed,
        "style_preset": style_preset,
        "post_visual_mode": post_visual_mode,
        "seed": continuity_seed,
        "generated_caption_font_scale": GENERATED_CAPTION_FONT_SCALE,
        "generated_caption_y": GENERATED_CAPTION_Y,
        "generated_caption_max_words": GENERATED_CAPTION_MAX_WORDS,
        "generated_caption_max_chars": GENERATED_CAPTION_MAX_CHARS,
        "generated_caption_line_chars": GENERATED_CAPTION_LINE_CHARS,
        "caption_style_preset": (
            "none"
            if not bool(payload.captions_enabled)
            else (payload.caption_style_preset or "orbito")
        ),
        "captions_enabled": bool(payload.captions_enabled),
        "watermark_enabled": bool(payload.watermark_enabled),
    }
    if continuation_job_id:
        settings_payload["continuation_job_id"] = continuation_job_id
    if reference_job_id and not continuation_job_id:
        settings_payload["reference_job_id"] = reference_job_id
        if reference_context and str(reference_context.get("job_kind") or "").strip():
            settings_payload["reference_job_kind"] = str(reference_context.get("job_kind") or "").strip()
    if continuity_anchor:
        settings_payload["continuity_anchor"] = continuity_anchor

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
