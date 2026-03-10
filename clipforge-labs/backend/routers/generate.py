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

ALLOWED_ASPECT_RATIOS = {"9:16", "16:9", "1:1"}
ALLOWED_DURATIONS = {5, 6, 7}
POST_ALLOWED_DURATIONS = {60, 90, 120}
POST_DEFAULT_DURATION_SECONDS = 60
POST_DEFAULT_IMAGE_COUNT = 8
POST_BASE_VOICE_WPM = 165
POST_MAX_AUTO_VOICE_WPM = 210
DEFAULT_TTS_VOICE = "en-US-Studio-Q"
FALLBACK_TTS_VOICE = "en-US-Neural2-A"
TTS_VOICE_FALLBACK_CHAIN = [
    "en-US-Studio-Q",
    "en-US-Studio-O",
    "en-US-Neural2-A",
    "en-US-Neural2-H",
    "en-US-Neural2-I",
    "en-US-Neural2-J",
    "en-US-Wavenet-A",
    "en-US-Wavenet-C",
    "en-US-Wavenet-E",
    "en-US-Standard-C",
    "en-US-Standard-D",
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


def _clean_dialogue_script(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw.replace("\r", "\n").split("\n")]
    lines = [line for line in lines if line]
    compact = "\n".join(lines)
    return compact[:5000].strip()


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


def _build_visual_prompt_pack(*, idea: str, style_preset: str | None, aspect_ratio: str, duration_seconds: int) -> str:
    concept = _core_idea_phrase(idea) or _clean_spaces(idea)
    subject, trait = _extract_subject_and_trait(concept)
    trait_display = _trait_display(trait)
    title = _idea_title(concept, style_preset)
    style_text = _style_label(style_preset)
    style = _normalize_style_preset(style_preset)
    scene_count = 8 if duration_seconds <= 60 else (10 if duration_seconds <= 90 else 12)
    ranges = _scene_ranges(duration_seconds, scene_count)

    if style == "anime":
        scene_templates = [
            "Hook: dynamic close-up of {subject}, wind and motion lines framing the face.",
            "World setup: establish a high-stakes setting with layered depth and dramatic perspective.",
            "Inciting conflict: a visible threat enters frame and pressure spikes instantly.",
            "Power reveal: {subject} counters with {trait}; bright aura and shockwave reaction.",
            "Escalation: rapid action montage, clean cuts, and camera pushes on impact moments.",
            "Control beat: tempo slows; {subject} stays calm while the world reacts.",
            "Payoff: threat is neutralized with a decisive, cinematic finishing moment.",
            "Final frame: bold title card and confident pose to close the story arc.",
            "Extension beat: aftermath shot with subtle particles and emotional reset.",
            "Extension beat: secondary angle that reinforces scale and dominance.",
            "Extension beat: team or crowd reaction to the outcome.",
            "Outro: hold a clean branded frame for one final second.",
        ]
    elif style == "cartoon":
        scene_templates = [
            "Hook: bright, expressive intro shot of {subject} with strong silhouette.",
            "Setup: playful environment reveal with readable props and color contrast.",
            "Conflict: challenge appears fast and creates immediate visual tension.",
            "Reveal: {subject} uses {trait} in a bold, stylized action beat.",
            "Escalation: rhythmic montage with snappy transitions and squash-and-stretch motion.",
            "Reaction: comedic pause, then a confident reset before the final push.",
            "Payoff: challenge solved in one clear, satisfying visual move.",
            "Final frame: upbeat end card with strong composition and takeaway text.",
            "Extension beat: add a reaction gag or secondary character response.",
            "Extension beat: polished hold shot with subtle camera drift.",
            "Extension beat: reinforce the core message with icon-driven visuals.",
            "Outro: finish with clean framing ready for captions.",
        ]
    elif style == "comic":
        scene_templates = [
            "Hook: high-contrast opener with inked outlines and dramatic negative space.",
            "Setup: panel-like world reveal with foreground, midground, and background layers.",
            "Conflict: threat enters like a splash panel and sets the stakes.",
            "Reveal: {subject} unleashes {trait} with punchy impact framing.",
            "Escalation: rapid panel montage, angled composition, and halftone texture cues.",
            "Reaction: tight facial close-up to emphasize emotional control.",
            "Payoff: final strike lands in a hero-frame composition.",
            "Final frame: clean title overlay, iconic pose, and story resolution.",
            "Extension beat: aftermath panel with environmental detail.",
            "Extension beat: secondary angle for scale and continuity.",
            "Extension beat: visual callback to the opening hook.",
            "Outro: linger on a polished final panel for platform-safe posting.",
        ]
    else:
        scene_templates = [
            "Hook: cinematic opener on {subject} with clear intent and motion.",
            "Setup: environment establishing shot with practical detail and depth.",
            "Conflict: pressure rises as a clear obstacle enters the scene.",
            "Reveal: {subject} leverages {trait} to shift momentum.",
            "Escalation: focused montage with motivated camera movement and continuity.",
            "Reaction: brief emotional beat to humanize the turning point.",
            "Payoff: obstacle is resolved in a grounded, believable action.",
            "Final frame: clean close with bold text and memorable composition.",
            "Extension beat: aftermath detail that reinforces progress.",
            "Extension beat: secondary angle to improve visual variety.",
            "Extension beat: quick callback to the opening hook.",
            "Outro: hold a stable ending frame for captions and branding.",
        ]

    lines = [
        f"Title: {title}",
        f"Concept: {concept}",
        f"Aspect ratio: {aspect_ratio}",
        f"Duration: {duration_seconds}s",
        f"Visual style: {style_text}",
        "",
    ]
    for idx, (start, end) in enumerate(ranges):
        template = scene_templates[idx] if idx < len(scene_templates) else scene_templates[-1]
        beat = template.format(subject=subject, trait=trait_display)
        lines.append(f"{start}-{end}s: {beat}")
    return "\n".join(lines).strip()


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

    if style == "anime":
        sentences = [
            f"In a world that ranks everyone by strength, {subject_narration} gets a second life.",
            "At first, nobody sees the danger coming, and the city moves like nothing changed.",
            f"Then the first attack hits, and {subject_narration} answers with {trait_display}.",
            "One move turns panic into silence, and every eye locks on the new reality.",
            "The threat escalates, faster and louder, but the hero stays calm and precise.",
            "Every clash reveals more control, more confidence, and zero hesitation.",
            "By the final beat, the strongest enemy is already out of options.",
            "This is not luck or hype. This is preparation meeting power at the perfect moment.",
            "When the dust settles, one truth remains: calm focus wins, even under impossible pressure.",
        ]
    elif style == "cartoon":
        sentences = [
            f"Meet {subject_narration}, dropped into a chaotic world and expected to fail instantly.",
            f"Instead, the first challenge gets flipped with {trait_display} and perfect timing.",
            "The pace jumps fast, with big reactions, tight turns, and playful confidence.",
            "Every beat raises the stakes, but the hero keeps solving problems one step at a time.",
            "What starts as noise becomes a clean pattern, and momentum starts compounding.",
            "By the final stretch, the crowd that doubted is now fully on board.",
            "The ending lands with clarity: simple choices, steady execution, strong results.",
            "Keep moving, keep adapting, and finish what you start.",
        ]
    elif style == "comic":
        sentences = [
            f"The frame opens on {subject_narration}, underestimated and outnumbered.",
            "Pressure builds fast, shadows stretch, and the threat fills the panel.",
            f"Then the pivot hits: {trait_display}, executed with absolute control.",
            "Impact after impact, the momentum shifts and never swings back.",
            "Close-ups show calm focus while the world around the hero breaks formation.",
            "The final exchange lands like a headline moment, clean and undeniable.",
            "When the scene resolves, the message is clear: discipline creates power.",
            "One minute, one arc, one result that speaks for itself.",
        ]
    else:
        sentences = [
            f"This one-minute story follows {subject_narration} as pressure rises fast.",
            "The opening looks unstable, but the intent is clear from the first decision.",
            f"When conflict arrives, {subject_narration} responds with {trait_display} and steady execution.",
            "Each sequence tightens the focus, removes noise, and builds real momentum.",
            "The midpoint turns hard, then the strategy locks in and the pace improves.",
            "By the final section, progress is visible, measurable, and impossible to ignore.",
            "The close is simple: clear priorities, clean action, and a strong finish.",
            "Do the next right step, then repeat until the result is undeniable.",
        ]

    if duration_seconds >= 90:
        sentences.extend(
            [
                "The extended arc adds one more test, then a sharper response under pressure.",
                "Consistency wins because the process stays clear even when stakes rise.",
            ]
        )
    if duration_seconds >= 120:
        sentences.extend(
            [
                "Every extra beat reinforces the same rule: precision scales better than chaos.",
                "End with intent, reset fast, and carry that momentum into the next run.",
            ]
        )

    final_sentences = list(sentences)
    upper_target = target_words + 8
    while _word_count(" ".join(final_sentences)) > upper_target and len(final_sentences) > 1:
        final_sentences.pop()

    words_now = _word_count(" ".join(final_sentences))
    lower_target = max(90, target_words - 4)
    if words_now < lower_target:
        fillers = [
            "Keep the tempo steady and commit to each move before switching.",
            "Small disciplined steps create bigger outcomes than random bursts.",
            "Hold focus, finish strong, and let your actions speak clearly.",
            "Build pressure with intention, then release with total control.",
            "A strong finish comes from rhythm, clarity, and repeated precision.",
        ]
        idx = 0
        while _word_count(" ".join(final_sentences)) < lower_target:
            final_sentences.append(fillers[idx % len(fillers)])
            idx += 1

    script = " ".join(final_sentences).strip()
    if script and script[-1] not in ".!?":
        script = f"{script}."
    return script


def _post_credits_needed(
    image_count: int,
    voice_script: str,
    style_preset: str | None,
    duration_seconds: int = POST_DEFAULT_DURATION_SECONDS,
) -> int:
    voice_credits = _voiceover_credits_needed(voice_script)
    if _is_low_cost_style(style_preset):
        safe_duration = max(60, min(120, int(duration_seconds or POST_DEFAULT_DURATION_SECONDS)))
        default_video_credits_per_second = _video_credits_per_second("relax", style_preset)
        post_video_credits_per_second = _env_int(
            "LABS_POST_LOW_COST_VIDEO_CREDITS_PER_SECOND",
            default_video_credits_per_second,
            min_value=1,
            max_value=10_000,
        )
        return (safe_duration * post_video_credits_per_second) + voice_credits

    safe_images = max(1, int(image_count or POST_DEFAULT_IMAGE_COUNT))
    image_credits = safe_images * _image_credits_needed(style_preset)
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


def _tts_style_profile(script: str) -> dict[str, float]:
    style = (os.getenv("GOOGLE_TTS_STYLE") or "narrative").strip().lower()
    profiles: dict[str, dict[str, float]] = {
        "narrative": {"rate": -3.0, "pitch": 0.3, "volume": 2.0},
        "conversational": {"rate": 0.0, "pitch": 0.6, "volume": 2.2},
        "energetic": {"rate": 4.0, "pitch": 1.2, "volume": 2.4},
        "cinematic": {"rate": -5.0, "pitch": 0.1, "volume": 2.3},
    }
    base = dict(profiles.get(style, profiles["narrative"]))
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
    sample_rate_hz = _env_int("GOOGLE_TTS_SAMPLE_RATE_HZ", 24000, min_value=8000, max_value=48000)
    cfg: dict[str, float | str | int | list[str]] = {
        "audioEncoding": "MP3",
        "speakingRate": speaking_rate,
        "pitch": pitch,
        "volumeGainDb": volume,
    }
    if sample_rate_hz > 0:
        cfg["sampleRateHertz"] = sample_rate_hz
    profile_ids = [p.strip() for p in (os.getenv("GOOGLE_TTS_EFFECT_PROFILE_ID") or "").split(",") if p.strip()]
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
    prompt: str = Field(min_length=3, max_length=1200)
    negative_prompt: str | None = Field(default=None, max_length=1200)
    aspect_ratio: str = "9:16"
    duration_seconds: int = Field(default=6, ge=5, le=7)
    generation_speed: str = Field(default="relax", max_length=16)
    model: str | None = Field(default="google", max_length=64)
    style_preset: str | None = Field(default="social-native", max_length=64)
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    input_image_key: str | None = Field(default=None, max_length=512)
    watermark_enabled: bool = Field(default=True)
    dialogue_script: str | None = Field(default=None, max_length=5000)


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
    voice_name: str | None = Field(default=DEFAULT_TTS_VOICE, max_length=64)
    speed_wpm: int = Field(default=POST_BASE_VOICE_WPM, ge=80, le=330)


class GeneratePostRequest(BaseModel):
    visual_prompt: str = Field(min_length=3, max_length=1200)
    voice_script: str = Field(min_length=30, max_length=12000)
    dialogue_script: str | None = Field(default=None, max_length=5000)
    aspect_ratio: str = "9:16"
    duration_seconds: int = Field(default=POST_DEFAULT_DURATION_SECONDS, ge=60, le=120)
    image_count: int | None = Field(default=POST_DEFAULT_IMAGE_COUNT, ge=6, le=10)
    model: str | None = Field(default="google", max_length=64)
    voice_name: str | None = Field(default=DEFAULT_TTS_VOICE, max_length=64)
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
        title=_idea_title(idea, style),
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
        "dialogue_script": dialogue_script,
        "watermark_enabled": bool(payload.watermark_enabled),
    }

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
    credits_needed = _voiceover_credits_needed(script)
    text_length = len(script)
    safe_speed = max(80, min(330, int(payload.speed_wpm or POST_BASE_VOICE_WPM)))
    safe_voice = (payload.voice_name or DEFAULT_TTS_VOICE).strip()[:64] or DEFAULT_TTS_VOICE

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
    dialogue_script = _clean_dialogue_script(payload.dialogue_script)
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
    credits_needed = _post_credits_needed(image_count, voice_script, style_preset, duration_seconds)

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
        "caption_style_preset": (
            "none"
            if not bool(payload.captions_enabled)
            else (payload.caption_style_preset or "bold_center")
        ),
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
