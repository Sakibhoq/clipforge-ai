from __future__ import annotations

import base64
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from typing import Any
from urllib.parse import quote

from dotenv import load_dotenv
import jwt
import requests
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

JOB_KIND_VIDEO = "generate"
JOB_KIND_IMAGE = "generate_image"
JOB_KIND_VOICEOVER = "generate_voiceover"
JOB_KIND_POST = "generate_post"
LOW_COST_STYLE_PRESETS = {"anime", "cartoon", "comic"}
GOOGLE_CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
_GOOGLE_TOKEN_CACHE: tuple[str, float] | None = None
_GOOGLE_PROJECT_CACHE: str | None = None
DEFAULT_TTS_VOICE = "en-US-Neural2-H"
FALLBACK_TTS_VOICE = "en-US-Neural2-I"
TTS_VOICE_FALLBACK_CHAIN = [
    "en-US-Neural2-H",
    "en-US-Neural2-I",
    "en-US-Studio-Q",
    "en-US-Studio-O",
    "en-US-Wavenet-A",
    "en-US-Wavenet-C",
    "en-US-Wavenet-E",
    "en-US-Neural2-A",
    "en-US-Neural2-J",
    "en-US-Standard-C",
    "en-US-Standard-D",
    "en-US-Standard-E",
    "en-US-Standard-F",
]


def _env(name: str, default: str = "") -> str:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v else default


def _env_int(name: str, default: int, *, min_value: int = 0, max_value: int = 3_600) -> int:
    raw = _env(name, "")
    if not raw:
        return default
    try:
        return max(min_value, min(max_value, int(raw)))
    except Exception:
        return default


def _env_float(name: str, default: float, *, min_value: float = -1_000.0, max_value: float = 1_000.0) -> float:
    raw = _env(name, "")
    if not raw:
        return default
    try:
        val = float(raw)
    except Exception:
        return default
    return max(min_value, min(max_value, val))


def _env_bool(name: str, default: bool = False) -> bool:
    raw = _env(name, "")
    if not raw:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _orbito_entitlements_enabled() -> bool:
    return _env_bool("LABS_USE_ORBITO_ENTITLEMENTS", False)


def _orbito_entitlements_strict() -> bool:
    return _env_bool("LABS_USE_ORBITO_ENTITLEMENTS_STRICT", False)


def _bridge_secret() -> str:
    return (
        _env("LABS_BRIDGE_SECRET", "")
        or _env("LABS_BRIDGE_TOKEN_SECRET", "")
        or _env("SECRET_KEY", "")
    ).strip()


def _orbi_api_base() -> str:
    return (
        _env("ORBITO_API_BASE", "")
        or _env("LABS_ORBITO_API_BASE", "")
    ).strip().rstrip("/")


def _entitlements_token(*, email: str, issuer: str) -> str:
    secret = _bridge_secret()
    if not secret:
        raise RuntimeError("Entitlements bridge secret is not configured")
    now = int(time.time())
    payload = {
        "iss": issuer,
        "aud": "orbi-api-labs-entitlements",
        "email": str(email or "").strip().lower(),
        "iat": now,
        "exp": now + 120,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def _orbito_adjust_credits(*, email: str, delta: int, reason: str, reference: str) -> int | None:
    if not _orbito_entitlements_enabled():
        return None

    base = _orbi_api_base()
    if not base:
        if _orbito_entitlements_strict():
            raise RuntimeError("ORBITO_API_BASE is not configured")
        return None

    payload = {
        "token": _entitlements_token(email=email, issuer="orbito-labs-worker"),
        "delta": int(delta),
        "reason": str(reason or "")[:64] or None,
        "reference": str(reference or "")[:120] or None,
    }

    try:
        resp = requests.post(f"{base}/labs/entitlements/adjust", json=payload, timeout=8)
    except requests.RequestException as exc:
        if _orbito_entitlements_strict():
            raise RuntimeError("Orbito entitlement bridge is unavailable") from exc
        return None

    if resp.status_code >= 400:
        detail = ""
        try:
            data = resp.json()
            if isinstance(data, dict):
                detail = str(data.get("detail") or "")
        except Exception:
            detail = (resp.text or "").strip()
        if _orbito_entitlements_strict():
            raise RuntimeError(f"Orbito entitlement adjust failed: {detail or resp.status_code}")
        return None

    try:
        data = resp.json()
    except Exception as exc:
        if _orbito_entitlements_strict():
            raise RuntimeError("Orbito entitlement response was invalid") from exc
        return None

    return int((data or {}).get("credits") or 0)


def _db_url() -> str:
    # Prefer labs-specific URL if provided so the labs worker never drifts to
    # Orbito's primary DB by accident.
    v = _env("LABS_DATABASE_URL", "") or _env("DATABASE_URL", "")
    if v:
        return v
    # Match backend default path when running with the compose /data volume.
    return "sqlite:////data/labs/app.db"


def _connect_engine():
    url = _db_url()
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        db_path = url.replace("sqlite:///", "", 1)
        if db_path and db_path != ":memory:":
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


def _storage_backend() -> str:
    return _env("STORAGE_BACKEND", "local").lower()


def _uses_object_storage_backend(backend: str | None) -> bool:
    return (backend or "").strip().lower() in {"s3", "gcs"}


def _local_storage_path() -> str:
    # Used when STORAGE_BACKEND=local. In docker compose we mount ./data -> /data.
    return os.path.abspath(_env("LOCAL_STORAGE_PATH", "/data/labs/storage"))


def _s3_client():
    import boto3
    from botocore.config import Config

    endpoint_url = _env("S3_ENDPOINT_URL", "") or None
    signature_version = _env("S3_SIGNATURE_VERSION", "s3v4")
    is_gcs_endpoint = "storage.googleapis.com" in (endpoint_url or "").lower()
    addressing_style = _env("S3_ADDRESSING_STYLE", "").lower().strip()
    if not addressing_style and endpoint_url and "storage.googleapis.com" in endpoint_url.lower():
        addressing_style = "path"

    config_kwargs: dict[str, Any] = {"signature_version": signature_version or "s3v4"}
    if addressing_style in {"path", "virtual"}:
        config_kwargs["s3"] = {"addressing_style": addressing_style}
    if is_gcs_endpoint:
        s3_cfg = dict(config_kwargs.get("s3") or {})
        s3_cfg["payload_signing_enabled"] = False
        config_kwargs["s3"] = s3_cfg
        config_kwargs["request_checksum_calculation"] = "when_required"
        config_kwargs["response_checksum_validation"] = "when_required"

    resolved_region = _env("AWS_REGION", "us-east-1")
    if is_gcs_endpoint and resolved_region.lower() in {"auto", "automatic"}:
        resolved_region = "us-east-1"

    try:
        cfg = Config(**config_kwargs)
    except TypeError:
        # Backward compatibility for older botocore builds that do not
        # support checksum config kwargs.
        config_kwargs.pop("request_checksum_calculation", None)
        config_kwargs.pop("response_checksum_validation", None)
        cfg = Config(**config_kwargs)

    return boto3.client(
        "s3",
        region_name=resolved_region,
        endpoint_url=endpoint_url,
        config=cfg,
    )


def _upload_file(path: str, key: str, *, content_type: str) -> None:
    backend = _storage_backend()
    if _uses_object_storage_backend(backend):
        bucket = _env("S3_BUCKET", "")
        if not bucket:
            raise RuntimeError("S3_BUCKET is required when STORAGE_BACKEND=s3/gcs")
        s3 = _s3_client()
        # GCS S3-compatibility is most reliable with a direct PutObject using
        # a fixed byte payload (non-chunked request body).
        with open(path, "rb") as f:
            payload = f.read()
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=payload,
            ContentLength=len(payload),
            ContentType=content_type,
        )
        return

    base = _local_storage_path()
    dest = os.path.join(base, key)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copyfile(path, dest)


def _delete_uploaded_key(key: str) -> None:
    safe_key = (key or "").strip()
    if not safe_key:
        return

    backend = _storage_backend()
    if _uses_object_storage_backend(backend):
        bucket = _env("S3_BUCKET", "")
        if not bucket:
            return
        try:
            s3 = _s3_client()
            s3.delete_object(Bucket=bucket, Key=safe_key)
        except Exception:
            pass
        return

    path = os.path.join(_local_storage_path(), safe_key)
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except Exception:
        pass


def _extension_for_content_type(content_type: str, default_ext: str) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    mapping = {
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
    }
    return mapping.get(ct, default_ext)


def _labs_generation_provider() -> str:
    return _env("LABS_GENERATION_PROVIDER", "stub").strip().lower()


def _runtime_env_name() -> str:
    return (
        _env("LABS_RUNTIME_ENV", "")
        or _env("APP_ENV", "")
        or _env("ENVIRONMENT", "")
        or _env("NODE_ENV", "")
    ).strip().lower()


def _provider_strict_mode() -> bool:
    return _env_bool("LABS_GENERATION_STRICT", False)


def _allow_demo_fallback() -> bool:
    """
    Demo fallback generates placeholder media when provider calls fail.
    Keep disabled by default for production so users only receive real AI output.
    """
    if not _env_bool("LABS_ALLOW_DEMO_FALLBACK", False):
        return False

    runtime = _runtime_env_name()
    if runtime in {"prod", "production", "live"}:
        return False

    # Safety default: when using real providers, only allow placeholder media
    # in explicit non-production runtime modes.
    if _labs_generation_provider() in {"google", "vertex"}:
        return runtime in {"local", "dev", "development", "test", "staging", "preview"}
    return True


def _allow_placeholder_fallback(kind: str) -> bool:
    """
    Fine-grained fallback toggles to avoid "fake success" assets.
    By default:
      - image fallback is allowed in dev
      - video/voice/post fallback is disabled
    """
    if not _allow_demo_fallback():
        return False
    k = (kind or "").strip().lower()
    if k == JOB_KIND_IMAGE:
        return _env_bool("LABS_ALLOW_IMAGE_PLACEHOLDER_FALLBACK", True)
    if k == JOB_KIND_VOICEOVER:
        return _env_bool("LABS_ALLOW_VOICE_PLACEHOLDER_FALLBACK", False)
    if k == JOB_KIND_POST:
        return _env_bool("LABS_ALLOW_POST_PLACEHOLDER_FALLBACK", False)
    return _env_bool("LABS_ALLOW_VIDEO_PLACEHOLDER_FALLBACK", False)


def _parse_supported_video_durations() -> list[int]:
    raw = _env("GOOGLE_VIDEO_SUPPORTED_DURATIONS", "5,6,7")
    durations: list[int] = []
    for token in raw.split(","):
        t = token.strip()
        if not t:
            continue
        try:
            value = int(t)
        except Exception:
            continue
        if 1 <= value <= 120 and value not in durations:
            durations.append(value)
    durations.sort()
    return durations or [6]


def _nearest_supported_duration(requested_seconds: int, supported_durations: list[int]) -> int:
    safe_supported = [int(v) for v in supported_durations if int(v) > 0]
    if not safe_supported:
        return max(1, int(requested_seconds or 6))
    requested = max(1, int(requested_seconds or 6))
    # Prefer exact or longer duration when available to avoid shaving requested time.
    candidates = [v for v in safe_supported if v >= requested]
    if candidates:
        return min(candidates)
    return min(safe_supported, key=lambda candidate: (abs(candidate - requested), candidate))


def _extract_supported_durations_from_error(exc: Exception | str | None) -> list[int]:
    msg = str(exc or "").strip()
    if not msg:
        return []
    lowered = msg.lower()
    if "supported duration" not in lowered and "unsupported output video duration" not in lowered:
        return []

    matches: list[str] = []
    bracket = re.search(r"supported duration(?:s)?\s*(?:are|is)?\s*\[([^\]]+)\]", msg, flags=re.IGNORECASE)
    if bracket and bracket.group(1):
        matches.append(bracket.group(1))

    if not matches:
        generic = re.findall(r"\[([0-9,\s]+)\]", msg)
        matches.extend(generic)

    values: list[int] = []
    for chunk in matches:
        for token in re.split(r"[^0-9]+", chunk):
            if not token:
                continue
            try:
                value = int(token)
            except Exception:
                continue
            if 1 <= value <= 120 and value not in values:
                values.append(value)
    values.sort()
    return values


def _provider_timeout_seconds() -> int:
    return _env_int("GOOGLE_API_TIMEOUT_SECONDS", 120, min_value=5, max_value=600)


def _media_cmd_timeout_seconds() -> int:
    return _env_int("WORKER_MEDIA_CMD_TIMEOUT_SECONDS", 300, min_value=30, max_value=3600)


def _run_media_cmd(cmd: list[str], *, timeout_seconds: int | None = None) -> subprocess.CompletedProcess:
    timeout = int(timeout_seconds or _media_cmd_timeout_seconds())
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Media command timed out after {timeout}s") from exc


def _model_prefers_google(model: str | None) -> bool:
    model_name = (model or "").strip().lower()
    if model_name:
        return model_name == "google"
    return _labs_generation_provider() == "google"


def _normalize_style_preset(style_preset: str | None) -> str:
    style = (style_preset or "").strip().lower()
    alias = {
        "photo-real": "real",
        "photoreal": "real",
        "social-native": "real",
        "cinematic": "real",
    }
    return alias.get(style, style or "real")


def _is_low_cost_style(style_preset: str | None) -> bool:
    # Hard low-cost mode: route every style to low-cost provider models unless explicitly disabled.
    if _env_bool("GOOGLE_FORCE_LOW_COST_MODELS", True):
        return True
    style = _normalize_style_preset(style_preset)
    if style not in LOW_COST_STYLE_PRESETS:
        return False
    return _env_bool("GOOGLE_USE_LOW_COST_MODELS_FOR_STYLIZED", True)


def _style_env_suffix(style_preset: str | None) -> str:
    return _normalize_style_preset(style_preset).replace("-", "_").upper()


def _normalize_video_speed(raw_speed: str | None) -> str:
    speed = (raw_speed or "relax").strip().lower()
    aliases = {
        "hd": "relax",
        "standard": "relax",
        "4k": "fast",
        "uhd": "fast",
        "premium": "fast",
    }
    speed = aliases.get(speed, speed)
    return "fast" if speed == "fast" else "relax"


def _resolve_google_image_model_id(style_preset: str | None, *, task: str = "image") -> str:
    task_key = (task or "image").strip().lower()
    style_suffix = _style_env_suffix(style_preset)
    default_model = _env("GOOGLE_IMAGE_MODEL_ID", "gemini-2.5-flash-image")
    if task_key == "post":
        default_model = _env("GOOGLE_POST_IMAGE_MODEL_ID", default_model)

    style_model = ""
    if task_key == "post":
        style_model = _env(f"GOOGLE_POST_IMAGE_MODEL_ID_{style_suffix}", "")
    if not style_model:
        style_model = _env(f"GOOGLE_IMAGE_MODEL_ID_{style_suffix}", "")
    if style_model:
        return style_model

    if not _is_low_cost_style(style_preset):
        return default_model
    low_cost_default = _env("GOOGLE_IMAGE_FAST_MODEL_ID", "gemini-2.5-flash-image")
    low_cost_model = _env("GOOGLE_IMAGE_LOW_COST_MODEL_ID", low_cost_default)
    if task_key == "post":
        low_cost_model = _env("GOOGLE_POST_IMAGE_LOW_COST_MODEL_ID", low_cost_model)
    return low_cost_model or default_model


def _resolve_google_video_model_id(style_preset: str | None, *, generation_speed: str | None = None) -> str:
    speed = _normalize_video_speed(generation_speed)
    style_suffix = _style_env_suffix(style_preset)
    if speed == "fast":
        premium_style_model = _env(f"GOOGLE_VIDEO_4K_MODEL_ID_{style_suffix}", "")
        if premium_style_model:
            return premium_style_model
        premium_model = _env("GOOGLE_VIDEO_4K_MODEL_ID", "veo-3.1-generate-001")
        return premium_model or "veo-3.1-generate-001"

    default_model = _env("GOOGLE_VIDEO_MODEL_ID", "veo-3.1-generate-001")
    style_model = _env(f"GOOGLE_VIDEO_MODEL_ID_{style_suffix}", "")
    if style_model:
        return style_model
    if not _is_low_cost_style(style_preset):
        return default_model
    low_cost_default = _env("GOOGLE_VIDEO_FAST_MODEL_ID", "veo-3.1-fast-generate-001")
    low_cost_model = _env("GOOGLE_VIDEO_LOW_COST_MODEL_ID", low_cost_default)
    return low_cost_model or default_model


def _is_google_gemini_image_model(model_id: str | None) -> bool:
    normalized = (model_id or "").strip().lower()
    return normalized.startswith("gemini-")


def _compose_gemini_image_prompt(prompt: str, negative_prompt: str) -> str:
    base = (prompt or "").strip()
    avoid = (negative_prompt or "").strip()
    if not avoid:
        return base
    return (
        f"{base}\n\n"
        "Avoid the following elements in the generated image:\n"
        f"{avoid[:1200]}"
    ).strip()


def _is_model_unavailable_error(exc: Exception | str | None) -> bool:
    msg = str(exc or "").strip().lower()
    if not msg:
        return False
    markers = (
        "not found",
        "unsupported",
        "invalid model",
        "invalid argument",
        "invalid_argument",
        "permission denied",
        "permission_denied",
        "does not have permission",
        "failed precondition",
        "failed_precondition",
        "model does not exist",
        "model not found",
        "publisher model",
    )
    return any(marker in msg for marker in markers)


def _is_vertex_service_agent_provisioning_error(exc: Exception | str | None) -> bool:
    msg = str(exc or "").strip().lower()
    if not msg:
        return False
    markers = (
        "service agents are being provisioned",
        "access-control#service-agents",
        "service agents are needed",
        "please try again in a few minutes",
    )
    return any(marker in msg for marker in markers)


def _is_vertex_cloud_storage_access_error(exc: Exception | str | None) -> bool:
    msg = str(exc or "").strip().lower()
    if not msg:
        return False
    markers = (
        "cloud storage file provided",
        "permission 'storage.",
        "storage.objects",
        "gcs",
    )
    return any(marker in msg for marker in markers)


def _is_seed_watermark_conflict_error(exc: Exception | str | None) -> bool:
    msg = str(exc or "").strip().lower()
    if not msg:
        return False
    if "seed is not supported when watermark is enabled" in msg:
        return True
    return "seed" in msg and "watermark" in msg and ("not supported" in msg or "unsupported" in msg)


def _resolve_provider_url(raw_url: str) -> str:
    url = (raw_url or "").strip()
    if not url:
        return ""
    api_key = _env("GOOGLE_API_KEY", "")
    if "{API_KEY}" in url:
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is required for provider URL with {API_KEY} placeholder")
        url = url.replace("{API_KEY}", api_key)
    elif api_key and _env_bool("GOOGLE_APPEND_API_KEY", False) and "key=" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}key={api_key}"
    return url


def _provider_headers() -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    bearer = _env("GOOGLE_API_BEARER_TOKEN", "")
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    x_api_key = _env("GOOGLE_X_API_KEY", "")
    if x_api_key:
        headers["x-api-key"] = x_api_key
    return headers


def _decode_base64_payload(value: str) -> bytes:
    raw = "".join((value or "").split())
    if not raw:
        raise RuntimeError("empty base64 payload")
    # Normalize padding for APIs that omit trailing '='.
    pad = (-len(raw)) % 4
    if pad:
        raw = raw + ("=" * pad)
    try:
        return base64.b64decode(raw, validate=False)
    except Exception:
        try:
            return base64.urlsafe_b64decode(raw)
        except Exception as exc:
            raise RuntimeError(f"invalid base64 payload: {type(exc).__name__}") from exc


def _http_post_json_custom(
    url: str,
    payload: dict[str, Any],
    *,
    headers: dict[str, str],
) -> tuple[int, str, dict[str, Any] | None, bytes]:
    try:
        import requests
    except Exception as exc:
        raise RuntimeError("requests package missing in worker image") from exc

    resp = requests.post(
        url,
        json=payload,
        headers=headers,
        timeout=_provider_timeout_seconds(),
    )
    content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
    raw_bytes = resp.content or b""
    data: dict[str, Any] | None = None
    try:
        data = resp.json()
    except Exception:
        data = None
    return resp.status_code, content_type, data, raw_bytes


def _google_project_id() -> str:
    global _GOOGLE_PROJECT_CACHE
    if _GOOGLE_PROJECT_CACHE:
        return _GOOGLE_PROJECT_CACHE

    env_project = _env("GOOGLE_VERTEX_PROJECT_ID", "")
    if env_project:
        _GOOGLE_PROJECT_CACHE = env_project
        return env_project

    # Common Google env aliases.
    env_project = _env("GOOGLE_CLOUD_PROJECT", "") or _env("GCP_PROJECT", "")
    if env_project:
        _GOOGLE_PROJECT_CACHE = env_project
        return env_project

    # Optional service-account JSON (raw or base64) can provide project_id.
    raw_sa = _env("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    raw_sa_b64 = _env("GOOGLE_SERVICE_ACCOUNT_JSON_B64", "")
    if raw_sa_b64 and not raw_sa:
        try:
            raw_sa = base64.b64decode(raw_sa_b64.encode("utf-8")).decode("utf-8")
        except Exception:
            raw_sa = ""
    if raw_sa:
        try:
            sa_info = json.loads(raw_sa)
            project = str((sa_info or {}).get("project_id") or "").strip()
            if project:
                _GOOGLE_PROJECT_CACHE = project
                return project
        except Exception:
            pass

    try:
        import requests
    except Exception as exc:
        raise RuntimeError("requests package missing in worker image") from exc
    md_url = "http://metadata.google.internal/computeMetadata/v1/project/project-id"
    resp = requests.get(md_url, headers={"Metadata-Flavor": "Google"}, timeout=2)
    if resp.status_code < 400 and (resp.text or "").strip():
        project = resp.text.strip()
        _GOOGLE_PROJECT_CACHE = project
        return project
    raise RuntimeError("GOOGLE_VERTEX_PROJECT_ID is required (or run worker on GCE with metadata access)")


def _google_access_token() -> str:
    global _GOOGLE_TOKEN_CACHE, _GOOGLE_PROJECT_CACHE

    raw = _env("GOOGLE_API_BEARER_TOKEN", "")
    if raw:
        token = raw.replace("Bearer ", "").strip()
        if token:
            return token

    # Reuse a warm token to avoid refreshing credentials on every request.
    now_ts = time.time()
    if _GOOGLE_TOKEN_CACHE:
        cached_token, cached_expiry = _GOOGLE_TOKEN_CACHE
        if cached_token and cached_expiry > (now_ts + 60):
            return cached_token

    scope = _env("GOOGLE_AUTH_SCOPE", GOOGLE_CLOUD_PLATFORM_SCOPE) or GOOGLE_CLOUD_PLATFORM_SCOPE
    auth_error: str | None = None

    # Preferred path: explicit Google auth credentials.
    try:
        from google.auth.transport.requests import Request as GoogleAuthRequest
        import google.auth
        from google.oauth2 import service_account

        creds = None

        raw_sa = _env("GOOGLE_SERVICE_ACCOUNT_JSON", "")
        raw_sa_b64 = _env("GOOGLE_SERVICE_ACCOUNT_JSON_B64", "")
        if raw_sa_b64 and not raw_sa:
            try:
                raw_sa = base64.b64decode(raw_sa_b64.encode("utf-8")).decode("utf-8")
            except Exception:
                raw_sa = ""

        if raw_sa:
            try:
                sa_info = json.loads(raw_sa)
                creds = service_account.Credentials.from_service_account_info(
                    sa_info,
                    scopes=[scope],
                )
                project = str((sa_info or {}).get("project_id") or "").strip()
                if project:
                    _GOOGLE_PROJECT_CACHE = project
            except Exception as exc:
                auth_error = f"service-account-json failed: {exc}"

        if creds is None:
            gac_path = _env("GOOGLE_APPLICATION_CREDENTIALS", "")
            if gac_path and os.path.exists(gac_path):
                try:
                    creds = service_account.Credentials.from_service_account_file(
                        gac_path,
                        scopes=[scope],
                    )
                    if getattr(creds, "project_id", None):
                        _GOOGLE_PROJECT_CACHE = str(creds.project_id)
                except Exception as exc:
                    auth_error = f"service-account-file failed: {exc}"

        if creds is None:
            try:
                creds, detected_project = google.auth.default(scopes=[scope])
                if detected_project:
                    _GOOGLE_PROJECT_CACHE = str(detected_project)
            except Exception as exc:
                auth_error = f"adc default failed: {exc}"
                creds = None

        if creds is not None:
            creds.refresh(GoogleAuthRequest())
            token = str(getattr(creds, "token", "") or "").strip()
            if token:
                expiry_dt = getattr(creds, "expiry", None)
                expiry_ts = (expiry_dt.timestamp() if expiry_dt else (now_ts + 300))
                _GOOGLE_TOKEN_CACHE = (token, float(expiry_ts))
                return token
    except Exception as exc:
        auth_error = f"google-auth unavailable/failed: {exc}"

    # Fallback: metadata server access token.
    try:
        import requests
    except Exception as exc:
        raise RuntimeError("requests package missing in worker image") from exc
    md_url = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
    resp = requests.get(
        md_url,
        headers={"Metadata-Flavor": "Google"},
        params={"scopes": scope},
        timeout=2,
    )
    if resp.status_code >= 400:
        # Retry metadata call without explicit scopes for environments that reject
        # the query parameter.
        resp = requests.get(md_url, headers={"Metadata-Flavor": "Google"}, timeout=2)
    if resp.status_code >= 400:
        detail = f"Failed to fetch Google access token from metadata server ({resp.status_code})"
        if auth_error:
            detail = f"{detail}; auth fallback error: {auth_error}"
        raise RuntimeError(detail)
    data = resp.json() if resp.content else {}
    token = str((data or {}).get("access_token") or "").strip()
    if not token:
        detail = "Google metadata token response missing access_token"
        if auth_error:
            detail = f"{detail}; auth fallback error: {auth_error}"
        raise RuntimeError(detail)
    expires_in = int((data or {}).get("expires_in") or 0)
    if expires_in > 0:
        _GOOGLE_TOKEN_CACHE = (token, now_ts + max(60, expires_in - 30))
    return token


def _google_auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_google_access_token()}",
        "Content-Type": "application/json; charset=utf-8",
    }


def _find_first_string_by_keys(data: Any, keys: set[str]) -> str | None:
    if isinstance(data, dict):
        for k, v in data.items():
            if k in keys and isinstance(v, str) and v.strip():
                return v.strip()
            nested = _find_first_string_by_keys(v, keys)
            if nested:
                return nested
    elif isinstance(data, list):
        for item in data:
            nested = _find_first_string_by_keys(item, keys)
            if nested:
                return nested
    return None


def _download_gcs_uri_bytes(gcs_uri: str, *, headers: dict[str, str]) -> bytes:
    if not gcs_uri.startswith("gs://"):
        raise RuntimeError(f"Invalid gcs uri: {gcs_uri}")
    path = gcs_uri[5:]
    if "/" not in path:
        raise RuntimeError(f"Invalid gcs uri object path: {gcs_uri}")
    bucket, object_name = path.split("/", 1)
    if not bucket or not object_name:
        raise RuntimeError(f"Invalid gcs uri object path: {gcs_uri}")

    try:
        import requests
    except Exception as exc:
        raise RuntimeError("requests package missing in worker image") from exc

    url = (
        f"https://storage.googleapis.com/storage/v1/b/{quote(bucket, safe='')}"
        f"/o/{quote(object_name, safe='')}?alt=media"
    )
    resp = requests.get(url, headers=headers, timeout=max(30, _provider_timeout_seconds()))
    if resp.status_code >= 400:
        raise RuntimeError(f"Failed to download generated GCS media ({resp.status_code})")
    data = resp.content or b""
    if not data:
        raise RuntimeError("Downloaded generated GCS media is empty")
    return data


def _run_google_vertex_video_generation(
    *,
    prompt: str,
    negative_prompt: str,
    aspect_ratio: str,
    duration_seconds: int,
    generation_speed: str | None = None,
    style_preset: str | None = None,
    seed: int | None = None,
    _allow_model_fallback: bool = True,
    _provision_retry_count: int = 0,
    _disable_storage_uri: bool = False,
    _duration_retry_count: int = 0,
    _forced_supported_durations: list[int] | None = None,
) -> tuple[bytes, str, float | None, str | None]:
    project_id = _google_project_id()
    location = _env("GOOGLE_VERTEX_LOCATION", "us-central1")
    default_model_id = _resolve_google_video_model_id("real", generation_speed=generation_speed)
    model_id = _resolve_google_video_model_id(style_preset, generation_speed=generation_speed)
    headers = _google_auth_headers()

    endpoint_base = (
        f"https://{location}-aiplatform.googleapis.com/v1/"
        f"projects/{project_id}/locations/{location}/publishers/google/models/{model_id}"
    )
    start_url = f"{endpoint_base}:predictLongRunning"
    fetch_url = f"{endpoint_base}:fetchPredictOperation"

    max_duration = _env_int("GOOGLE_VIDEO_MAX_DURATION_SECONDS", 7, min_value=1, max_value=120)
    source_durations = _forced_supported_durations or _parse_supported_video_durations()
    supported_durations = [d for d in source_durations if d <= max_duration]
    if not supported_durations:
        supported_durations = [max(1, max_duration)]
    requested_duration = int(duration_seconds or 6)
    safe_duration = _nearest_supported_duration(requested_duration, supported_durations)
    if safe_duration != requested_duration:
        print(
            f"[worker] normalized video duration requested={requested_duration}s "
            f"to supported={safe_duration}s supported={supported_durations}"
        )
    safe_ar = aspect_ratio if aspect_ratio in {"9:16", "16:9"} else "9:16"

    output_storage_uri = _env("GOOGLE_VIDEO_OUTPUT_GCS_URI", "").strip()
    if _disable_storage_uri:
        output_storage_uri = ""
    elif output_storage_uri and not output_storage_uri.startswith("gs://"):
        print(f"[worker] ignoring invalid GOOGLE_VIDEO_OUTPUT_GCS_URI={output_storage_uri!r}")
        output_storage_uri = ""

    params: dict[str, Any] = {
        "sampleCount": 1,
        "durationSeconds": safe_duration,
        "aspectRatio": safe_ar,
        "enhancePrompt": _env_bool("GOOGLE_VIDEO_ENHANCE_PROMPT", True),
    }
    if negative_prompt:
        params["negativePrompt"] = negative_prompt[:1200]
    if isinstance(seed, int) and seed > 0:
        params["seed"] = int(seed)
    if output_storage_uri:
        params["storageUri"] = output_storage_uri

    payload = {
        "instances": [{"prompt": (prompt or "").strip()[:1200]}],
        "parameters": params,
    }
    try:
        status, _, data, _ = _http_post_json_custom(start_url, payload, headers=headers)
        if status >= 400:
            detail = ""
            if isinstance(data, dict):
                err = data.get("error")
                if isinstance(err, dict):
                    detail = str(err.get("message") or "")
                elif err:
                    detail = str(err)
            raise RuntimeError(f"Vertex Veo start failed: {status} {detail}".strip())

        op_name = _find_first_string_by_keys(data, {"name"})
        if not op_name:
            raise RuntimeError("Vertex Veo start response missing operation name")

        timeout_seconds = _env_int("GOOGLE_VIDEO_TIMEOUT_SECONDS", 420, min_value=30, max_value=3600)
        poll_seconds = _env_int("GOOGLE_VIDEO_POLL_SECONDS", 8, min_value=2, max_value=60)
        deadline = time.time() + timeout_seconds
        final_payload: dict[str, Any] | None = None

        while time.time() < deadline:
            poll_status, _, poll_data, _ = _http_post_json_custom(
                fetch_url,
                {"operationName": op_name},
                headers=headers,
            )
            if poll_status >= 400:
                detail = ""
                if isinstance(poll_data, dict):
                    err = poll_data.get("error")
                    if isinstance(err, dict):
                        detail = str(err.get("message") or "")
                    elif err:
                        detail = str(err)
                raise RuntimeError(f"Vertex Veo poll failed: {poll_status} {detail}".strip())

            if isinstance(poll_data, dict) and poll_data.get("done") is True:
                final_payload = poll_data
                break
            time.sleep(poll_seconds)

        if not final_payload:
            raise RuntimeError("Vertex Veo operation timed out")

        op_error = (final_payload or {}).get("error")
        if isinstance(op_error, dict):
            msg = str(op_error.get("message") or "").strip()
            if msg:
                raise RuntimeError(f"Vertex Veo operation failed: {msg}")

        response_obj = (final_payload or {}).get("response") if isinstance(final_payload, dict) else None
        result_obj = response_obj if isinstance(response_obj, (dict, list)) else final_payload

        b64_val = _find_first_string_by_keys(result_obj, {"bytesBase64Encoded"})
        if b64_val:
            return _decode_base64_payload(b64_val), "video/mp4", float(safe_duration), None

        gcs_uri = _find_first_string_by_keys(result_obj, {"gcsUri"})
        if gcs_uri:
            media = _download_gcs_uri_bytes(gcs_uri, headers=headers)
            return media, "video/mp4", float(safe_duration), None

        raise RuntimeError("Vertex Veo operation completed without video payload")
    except Exception as exc:
        # One-time Vertex setup race: Google service agents can take a few minutes.
        if _is_vertex_service_agent_provisioning_error(exc):
            max_retries = _env_int("GOOGLE_VIDEO_PROVISIONING_RETRIES", 3, min_value=0, max_value=8)
            retry_seconds = _env_int("GOOGLE_VIDEO_PROVISIONING_RETRY_SECONDS", 45, min_value=5, max_value=600)
            if _provision_retry_count < max_retries:
                next_attempt = _provision_retry_count + 1
                print(
                    f"[worker] vertex service-agent provisioning in progress; retrying "
                    f"attempt={next_attempt}/{max_retries} after {retry_seconds}s"
                )
                time.sleep(retry_seconds)
                return _run_google_vertex_video_generation(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    aspect_ratio=aspect_ratio,
                    duration_seconds=duration_seconds,
                    generation_speed=generation_speed,
                    style_preset=style_preset,
                    seed=seed,
                    _allow_model_fallback=_allow_model_fallback,
                    _provision_retry_count=next_attempt,
                    _disable_storage_uri=_disable_storage_uri,
                    _duration_retry_count=_duration_retry_count,
                    _forced_supported_durations=_forced_supported_durations,
                )

        # If explicit GCS output path permissions are not ready, retry once without storageUri.
        if (
            output_storage_uri
            and not _disable_storage_uri
            and _is_vertex_cloud_storage_access_error(exc)
        ):
            print("[worker] vertex storageUri access issue; retrying once without storageUri")
            return _run_google_vertex_video_generation(
                prompt=prompt,
                negative_prompt=negative_prompt,
                aspect_ratio=aspect_ratio,
                duration_seconds=duration_seconds,
                generation_speed=generation_speed,
                style_preset=style_preset,
                seed=seed,
                _allow_model_fallback=_allow_model_fallback,
                _provision_retry_count=_provision_retry_count,
                _disable_storage_uri=True,
                _duration_retry_count=_duration_retry_count,
                _forced_supported_durations=_forced_supported_durations,
            )

        retry_supported_durations = _extract_supported_durations_from_error(exc)
        if _duration_retry_count < 1 and retry_supported_durations:
            allowed_retry_durations = [d for d in retry_supported_durations if d <= max_duration]
            if allowed_retry_durations:
                retry_duration = _nearest_supported_duration(int(duration_seconds or 6), allowed_retry_durations)
                print(
                    f"[worker] vertex duration constraint detected; retrying with duration={retry_duration}s "
                    f"supported={allowed_retry_durations}"
                )
                return _run_google_vertex_video_generation(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    aspect_ratio=aspect_ratio,
                    duration_seconds=duration_seconds,
                    generation_speed=generation_speed,
                    style_preset=style_preset,
                    seed=seed,
                    _allow_model_fallback=_allow_model_fallback,
                    _provision_retry_count=_provision_retry_count,
                    _disable_storage_uri=_disable_storage_uri,
                    _duration_retry_count=_duration_retry_count + 1,
                    _forced_supported_durations=allowed_retry_durations,
                )

        should_retry_default = (
            _allow_model_fallback
            and model_id != default_model_id
            and _is_model_unavailable_error(exc)
        )
        if should_retry_default:
            print(
                f"[worker] low-cost video model unavailable model_id={model_id}; "
                f"retrying with default model_id={default_model_id}"
            )
            return _run_google_vertex_video_generation(
                prompt=prompt,
                negative_prompt=negative_prompt,
                aspect_ratio=aspect_ratio,
                duration_seconds=duration_seconds,
                generation_speed=generation_speed,
                style_preset="real",
                seed=seed,
                _allow_model_fallback=False,
                _provision_retry_count=_provision_retry_count,
                _disable_storage_uri=_disable_storage_uri,
                _duration_retry_count=_duration_retry_count,
                _forced_supported_durations=_forced_supported_durations,
            )
        raise


def _run_google_vertex_image_generation(
    *,
    prompt: str,
    negative_prompt: str,
    aspect_ratio: str,
    style_preset: str | None = None,
    seed: int | None = None,
    task: str = "image",
    _allow_model_fallback: bool = True,
    _allow_seed_retry: bool = True,
) -> tuple[bytes, str, float | None, str | None]:
    project_id = _google_project_id()
    location = _env("GOOGLE_VERTEX_LOCATION", "us-central1")
    default_model_id = _resolve_google_image_model_id("real", task=task)
    model_id = _resolve_google_image_model_id(style_preset, task=task)
    headers = _google_auth_headers()

    safe_ar = aspect_ratio if aspect_ratio in {"9:16", "16:9", "1:1"} else "1:1"
    using_gemini_image_api = _is_google_gemini_image_model(model_id)
    if using_gemini_image_api:
        endpoint = (
            f"https://{location}-aiplatform.googleapis.com/v1/"
            f"projects/{project_id}/locations/{location}/publishers/google/models/{model_id}:generateContent"
        )
        payload: dict[str, Any] = {
            "contents": {
                "role": "USER",
                "parts": [
                    {
                        "text": _compose_gemini_image_prompt(
                            (prompt or "").strip()[:1200],
                            negative_prompt,
                        )
                    }
                ],
            },
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "imageConfig": {
                    "aspectRatio": safe_ar,
                },
            },
        }
    else:
        endpoint = (
            f"https://{location}-aiplatform.googleapis.com/v1/"
            f"projects/{project_id}/locations/{location}/publishers/google/models/{model_id}:predict"
        )
        payload = {
            "instances": [{"prompt": (prompt or "").strip()[:1200]}],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": safe_ar,
            },
        }
        if negative_prompt:
            payload["parameters"]["negativePrompt"] = negative_prompt[:1200]
        if isinstance(seed, int) and seed > 0:
            payload["parameters"]["seed"] = int(seed)

    try:
        status, content_type, data, raw_bytes = _http_post_json_custom(endpoint, payload, headers=headers)
        if status >= 400:
            detail = ""
            if isinstance(data, dict):
                err = data.get("error")
                if isinstance(err, dict):
                    detail = str(err.get("message") or "")
                elif err:
                    detail = str(err)
            provider_label = "Vertex Gemini Image" if using_gemini_image_api else "Vertex Imagen"
            raise RuntimeError(f"{provider_label} failed: {status} {detail}".strip())

        parsed = _extract_remote_result(data)
        media_bytes = parsed.get("bytes")
        media_url = parsed.get("url")
        media_type = (
            (parsed.get("content_type") if isinstance(parsed.get("content_type"), str) else None)
            or content_type
            or "image/png"
        )

        if not media_bytes and isinstance(media_url, str) and media_url.strip():
            media_bytes, downloaded_type = _http_get_bytes(media_url.strip())
            if downloaded_type:
                media_type = downloaded_type

        if not media_bytes and raw_bytes and not content_type.startswith("application/json"):
            media_bytes = raw_bytes

        if not media_bytes:
            raise RuntimeError("Vertex Imagen response missing image payload")

        return media_bytes, media_type, None, None
    except Exception as exc:
        should_retry_without_seed = (
            _allow_seed_retry
            and isinstance(seed, int)
            and seed > 0
            and _is_seed_watermark_conflict_error(exc)
        )
        if should_retry_without_seed:
            print(
                f"[worker] image seed+watermark conflict model_id={model_id}; "
                "retrying without seed"
            )
            return _run_google_vertex_image_generation(
                prompt=prompt,
                negative_prompt=negative_prompt,
                aspect_ratio=aspect_ratio,
                style_preset=style_preset,
                seed=None,
                task=task,
                _allow_model_fallback=_allow_model_fallback,
                _allow_seed_retry=False,
            )

        should_retry_default = (
            _allow_model_fallback
            and model_id != default_model_id
            and _is_model_unavailable_error(exc)
        )
        if should_retry_default:
            print(
                f"[worker] low-cost image model unavailable model_id={model_id}; "
                f"retrying with default model_id={default_model_id}"
            )
            return _run_google_vertex_image_generation(
                prompt=prompt,
                negative_prompt=negative_prompt,
                aspect_ratio=aspect_ratio,
                style_preset="real",
                seed=seed,
                task=task,
                _allow_model_fallback=False,
                _allow_seed_retry=_allow_seed_retry,
            )
        raise


def _http_post_json(url: str, payload: dict[str, Any]) -> tuple[int, str, dict[str, Any] | None, bytes]:
    try:
        import requests
    except Exception as exc:
        raise RuntimeError("requests package missing in worker image") from exc

    resp = requests.post(
        url,
        json=payload,
        headers=_provider_headers(),
        timeout=_provider_timeout_seconds(),
    )
    content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
    raw_bytes = resp.content or b""
    data: dict[str, Any] | None = None
    try:
        data = resp.json()
    except Exception:
        data = None
    return resp.status_code, content_type, data, raw_bytes


def _http_get_bytes(url: str) -> tuple[bytes, str]:
    try:
        import requests
    except Exception as exc:
        raise RuntimeError("requests package missing in worker image") from exc

    resp = requests.get(url, timeout=_provider_timeout_seconds())
    if int(resp.status_code) >= 400:
        raise RuntimeError(f"remote media download failed: {resp.status_code}")
    content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
    return resp.content or b"", content_type


def _extract_remote_result(data: dict[str, Any] | None) -> dict[str, Any]:
    """
    Supported response shapes:
      - {"data_base64":"...", "content_type":"video/mp4", "duration_seconds":6, "title":"..."}
      - {"url":"https://.../asset.mp4", ...}
      - {"predictions":[{"bytesBase64Encoded":"..."}], ...}
      - {"candidates":[{"content":{"parts":[{"inlineData":{"data":"...","mimeType":"image/png"}}]}}]}
    """
    result: dict[str, Any] = {
        "bytes": None,
        "url": None,
        "content_type": None,
        "duration_seconds": None,
        "title": None,
    }
    if not isinstance(data, dict):
        return result

    def _read_str(key: str) -> str | None:
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
        return None

    result["content_type"] = _read_str("content_type") or _read_str("mime_type") or _read_str("mimeType")
    result["title"] = _read_str("title") or _read_str("name")

    for key in ("duration_seconds", "duration", "seconds"):
        val = data.get(key)
        if isinstance(val, (int, float)):
            result["duration_seconds"] = float(val)
            break

    b64_val = (
        _read_str("data_base64")
        or _read_str("base64")
        or _read_str("audioContent")
        or _read_str("bytesBase64Encoded")
    )
    if b64_val:
        result["bytes"] = _decode_base64_payload(b64_val)
        return result

    predictions = data.get("predictions")
    if isinstance(predictions, list) and predictions:
        first = predictions[0] if isinstance(predictions[0], dict) else {}
        if isinstance(first, dict):
            b64_pred = first.get("bytesBase64Encoded")
            if isinstance(b64_pred, str) and b64_pred.strip():
                result["bytes"] = _decode_base64_payload(b64_pred.strip())
                result["content_type"] = (
                    result["content_type"]
                    or (first.get("mimeType") if isinstance(first.get("mimeType"), str) else None)
                )
                return result
            maybe_url = first.get("url") or first.get("uri")
            if isinstance(maybe_url, str) and maybe_url.strip():
                result["url"] = maybe_url.strip()
                return result

    candidates = data.get("candidates")
    if isinstance(candidates, list):
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            content = candidate.get("content")
            if not isinstance(content, dict):
                continue
            parts = content.get("parts")
            if not isinstance(parts, list):
                continue
            for part in parts:
                if not isinstance(part, dict):
                    continue
                inline_data = part.get("inlineData")
                if isinstance(inline_data, dict):
                    b64_inline = inline_data.get("data")
                    if isinstance(b64_inline, str) and b64_inline.strip():
                        result["bytes"] = _decode_base64_payload(b64_inline.strip())
                        result["content_type"] = (
                            result["content_type"]
                            or (inline_data.get("mimeType") if isinstance(inline_data.get("mimeType"), str) else None)
                        )
                        return result
                text_part = part.get("text")
                if result["title"] is None and isinstance(text_part, str) and text_part.strip():
                    result["title"] = text_part.strip()

    url_val = _read_str("url") or _read_str("uri") or _read_str("download_url") or _read_str("media_url")
    if url_val:
        result["url"] = url_val
        return result

    nested = data.get("result") or data.get("output") or data.get("data")
    if isinstance(nested, dict):
        nested_result = _extract_remote_result(nested)
        for k, v in nested_result.items():
            if v is not None:
                result[k] = v
    return result


def _clip_dimensions(aspect_ratio: str) -> tuple[int, int]:
    ar = (aspect_ratio or "").strip()
    if ar == "16:9":
        return 1920, 1080
    if ar == "1:1":
        return 1080, 1080
    return 1080, 1920  # default 9:16


def _brand_text_env(key: str, default: str = "Orbito") -> str:
    raw = (_env(key, default) or "").strip()
    if not raw:
        return default
    normalized = re.sub(r"\s+", " ", raw).strip().lower()
    if normalized in {"clipforge", "clipforge labs", "orbito labs"}:
        return default
    if normalized == "orbito":
        return "Orbito"
    return raw


def _compact_overlay_text(prompt: str, *, max_chars: int = 180) -> str:
    raw = (prompt or "").replace("\r", "").strip()
    if not raw:
        return "Generated media"
    if "Visual style:" in raw:
        raw = raw.split("Visual style:", 1)[0].strip()
    raw = re.sub(r"\s+", " ", raw).strip()
    m = re.search(r'(?:called|titled)\s+["“](.+?)["”]', raw, flags=re.IGNORECASE)
    if m and m.group(1).strip():
        raw = m.group(1).strip()
    if len(raw) > max_chars:
        raw = raw[: max_chars - 3].rstrip() + "..."
    return raw or "Generated media"


def _run_ffmpeg_text_video(*, prompt: str, duration: int, aspect_ratio: str, out_path: str) -> None:
    w, h = _clip_dimensions(aspect_ratio)
    safe_duration = max(2, min(int(duration or 6), 20))

    fd, txt_path = tempfile.mkstemp(prefix="cflabs-video-prompt-", suffix=".txt")
    os.close(fd)
    try:
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(_compact_overlay_text(prompt, max_chars=140))

        fontfile = _env(
            "WORKER_DRAWTEXT_FONTFILE",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        )
        brand = _brand_text_env("WORKER_BRAND_TEXT")

        vf = (
            f"scale={w}:{h},"
            "format=yuv420p,"
            f"drawtext=fontfile={fontfile}:textfile={txt_path}:reload=1:"
            "fontcolor=white:fontsize=48:line_spacing=10:"
            "x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=22,"
            f"drawtext=fontfile={fontfile}:text='{brand}':"
            "fontcolor=white@0.75:fontsize=24:"
            "x=(w-text_w)/2:y=h-72"
        )

        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=black:s={w}x{h}:d={safe_duration}",
            "-vf",
            vf,
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            out_path,
        ]
        proc = _run_media_cmd(cmd, timeout_seconds=max(60, _media_cmd_timeout_seconds()))
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg video failed").strip()[:500])
    finally:
        try:
            os.unlink(txt_path)
        except Exception:
            pass


def _run_ffmpeg_text_image(*, prompt: str, aspect_ratio: str, out_path: str) -> None:
    w, h = _clip_dimensions(aspect_ratio)
    fd, txt_path = tempfile.mkstemp(prefix="cflabs-image-prompt-", suffix=".txt")
    os.close(fd)
    try:
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(_compact_overlay_text(prompt, max_chars=120))

        fontfile = _env(
            "WORKER_DRAWTEXT_FONTFILE",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        )
        brand = _brand_text_env("WORKER_BRAND_TEXT")

        font_size = 38 if h >= 1600 else 34
        vf = (
            "format=rgb24,"
            f"drawtext=fontfile={fontfile}:textfile={txt_path}:reload=1:"
            f"fontcolor=white:fontsize={font_size}:line_spacing=8:"
            "x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.4:boxborderw=20,"
            f"drawtext=fontfile={fontfile}:text='{brand}':"
            "fontcolor=white@0.78:fontsize=26:x=(w-text_w)/2:y=h-84"
        )

        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=#0f172a:s={w}x{h}:d=1",
            "-frames:v",
            "1",
            "-vf",
            vf,
            out_path,
        ]
        proc = _run_media_cmd(cmd, timeout_seconds=max(60, _media_cmd_timeout_seconds()))
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg image failed").strip()[:500])
    finally:
        try:
            os.unlink(txt_path)
        except Exception:
            pass


def _post_scene_fallback_text(*, raw_visual_prompt: str, scene_index: int, scene_count: int) -> str:
    scene_beats = _extract_post_scene_beats(raw_visual_prompt)
    scene_text = _post_scene_beat_for_index(
        scene_beats=scene_beats,
        scene_index=scene_index,
        scene_count=scene_count,
    )
    prompt_value = " ".join((scene_text or "").split()).strip() or "Generated visual scene"
    if len(prompt_value) > 110:
        prompt_value = prompt_value[:107].rstrip() + "..."
    return f"Scene {scene_index + 1}/{scene_count}\n{prompt_value}"


def _strip_style_suffix(prompt: str) -> str:
    value = (prompt or "").strip()
    if "Visual style:" in value:
        value = value.split("Visual style:", 1)[0].strip()
    return value


def _normalize_post_line(line: str) -> str:
    value = (line or "").strip()
    if not value:
        return ""
    value = re.sub(r"^[\-\*\u2022\u25CF\s]+", "", value).strip()
    value = re.sub(r"^\(?\s*\d+\s*[\)\].:]\s*", "", value).strip()
    value = re.sub(
        r"^\s*\d{1,3}\s*(?:s|sec|secs|seconds)?\s*(?:-|–|to)\s*\d{1,3}\s*(?:s|sec|secs|seconds)?\s*[:\-–]?\s*",
        "",
        value,
        flags=re.IGNORECASE,
    ).strip()
    value = re.sub(
        r"^\s*\d{1,3}\s*(?:s|sec|secs|seconds)\s*[:\-–]\s*",
        "",
        value,
        flags=re.IGNORECASE,
    ).strip()
    value = re.sub(r"^(?:scene|shot)\s*\d+\s*[:\-–]\s*", "", value, flags=re.IGNORECASE).strip()
    value = re.sub(r"\s+", " ", value).strip(" -–:")
    return value


def _parse_post_prompt_metadata(raw_visual_prompt: str) -> dict[str, str]:
    out: dict[str, str] = {}
    allowed_keys = {
        "title",
        "concept",
        "aspect ratio",
        "duration",
        "visual style",
        "style",
        "character",
        "protagonist",
        "main character",
        "hero",
        "lead",
        "subject",
    }
    for raw_line in (raw_visual_prompt or "").replace("\r", "\n").split("\n"):
        line = raw_line.strip()
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key_norm = re.sub(r"\s+", " ", key).strip().lower()
        val_norm = re.sub(r"\s+", " ", value).strip()
        if not val_norm:
            continue
        if key_norm in allowed_keys:
            out[key_norm] = val_norm
    return out


def _is_post_metadata_line(line: str) -> bool:
    lower = (line or "").strip().lower()
    return lower.startswith(
        (
            "title:",
            "concept:",
            "aspect ratio:",
            "duration:",
            "visual style:",
            "style:",
            "character:",
            "protagonist:",
            "main character:",
            "hero:",
            "lead:",
            "subject:",
        )
    )


def _extract_post_scene_beats(raw_visual_prompt: str) -> list[str]:
    prompt = _strip_style_suffix(raw_visual_prompt)
    if not prompt:
        return []

    source_lines = [line.strip() for line in prompt.replace("\r", "\n").split("\n")]
    source_lines = [line for line in source_lines if line and not _is_post_metadata_line(line)]
    lines = [_normalize_post_line(line) for line in source_lines]
    line_beats = [line for line in lines if len(line) >= 8]
    if len(line_beats) >= 2:
        return line_beats

    text_value = re.sub(r"\s+", " ", " ".join(source_lines)).strip()
    if not text_value:
        return []

    sentence_candidates = [
        _normalize_post_line(chunk)
        for chunk in re.split(r"(?<=[.!?])\s+|;\s+", text_value)
    ]
    sentence_beats = [chunk for chunk in sentence_candidates if len(chunk) >= 12]
    if sentence_beats:
        return sentence_beats

    return [text_value]


def _compact_dialogue_script(dialogue_script: str | None, *, max_chars: int = 1200) -> str:
    raw = (dialogue_script or "").strip()
    if not raw:
        return ""
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw.replace("\r", "\n").split("\n")]
    lines = [line for line in lines if line]
    compact = "\n".join(lines)
    return compact[:max_chars].strip()


def _merge_narration_with_dialogue(narration: str, dialogue_script: str | None) -> str:
    narration_clean = (narration or "").strip()
    dialogue_clean = _compact_dialogue_script(dialogue_script, max_chars=2000)
    if not dialogue_clean:
        return narration_clean
    lip_sync_lock = (
        "Speech and lip-sync lock (critical):\n"
        "- Use the dialogue lines exactly, no added or missing words.\n"
        "- Keep speaker mouth visible and facing camera while speaking.\n"
        "- Align lip/jaw movement tightly to the spoken timing.\n"
        "- Keep expression and tone realistic for each line."
    )
    if narration_clean:
        return f"{narration_clean}\n\n{lip_sync_lock}\n\nDialogue:\n{dialogue_clean}".strip()
    return f"{lip_sync_lock}\n\nDialogue:\n{dialogue_clean}".strip()


def _post_scene_beat_for_index(*, scene_beats: list[str], scene_index: int, scene_count: int) -> str:
    if not scene_beats:
        return "Cinematic social-media frame with clear subject focus and strong composition."
    count = max(1, int(scene_count or 1))
    idx = max(0, min(count - 1, int(scene_index or 0)))
    beat_pos = int(math.floor((idx / float(count)) * len(scene_beats)))
    beat_pos = max(0, min(len(scene_beats) - 1, beat_pos))
    return scene_beats[beat_pos]


def _post_scene_has_dialogue(dialogue_script: str | None, raw_visual_prompt: str | None = None) -> bool:
    dialogue_hint = _compact_dialogue_script(dialogue_script, max_chars=900)
    if dialogue_hint:
        return True
    combined = f"{raw_visual_prompt or ''}".strip()
    if not combined:
        return False
    if re.search(r"[\"'“”‘’][^\"'“”‘’]{6,}[\"'“”‘’]", combined):
        return True
    lower = combined.lower()
    markers = (
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
        "talking",
        "talks to",
        "lip-sync",
        "lip sync",
    )
    return any(marker in lower for marker in markers)


def _post_scene_camera_motion(*, scene_index: int, scene_count: int, dialogue_mode: bool = False) -> str:
    ratio = float(scene_index + 1) / float(max(1, scene_count))
    if ratio <= 0.2:
        if dialogue_mode:
            return "tight close-up opener with subtle handheld energy and clear mouth visibility"
        return "wide establishing opener with clear environment context and subject readability"
    if ratio <= 0.45:
        if dialogue_mode:
            return "medium close-up reveal with controlled camera motion and speaking readability"
        return "smooth pull-back reveal with depth layering and full-body readability"
    if ratio <= 0.75:
        return "mid-shot tracking move tied to the action beat"
    if ratio <= 0.92:
        return "hero push-in for payoff emphasis"
    return "stable final hold for a clean end frame"


def _post_scene_intensity(*, scene_index: int, scene_count: int) -> str:
    ratio = float(scene_index + 1) / float(max(1, scene_count))
    if ratio <= 0.25:
        return "high hook energy"
    if ratio <= 0.65:
        return "rising tension"
    if ratio <= 0.9:
        return "peak payoff"
    return "confident resolution"


def _build_post_scene_prompt(
    *,
    raw_visual_prompt: str,
    style_preset: str,
    scene_beats: list[str],
    scene_index: int,
    scene_count: int,
    dialogue_script: str | None = None,
    character_profile: str | None = None,
    character_lock_id: str | None = None,
) -> str:
    metadata = _parse_post_prompt_metadata(raw_visual_prompt)
    story_title = metadata.get("title", "")
    story_concept = metadata.get("concept", "")
    story_visual_style = metadata.get("visual style", "") or metadata.get("style", "")
    profile = (
        (character_profile or "").strip()
        or metadata.get("main character", "")
        or metadata.get("protagonist", "")
        or metadata.get("character", "")
        or metadata.get("hero", "")
        or metadata.get("lead", "")
        or metadata.get("subject", "")
    )

    story_summary_source = story_concept or _strip_style_suffix(raw_visual_prompt)
    story_summary = _normalize_post_line(story_summary_source)
    if len(story_summary) > 260:
        story_summary = story_summary[:257].rstrip() + "..."

    scene_beat = _post_scene_beat_for_index(
        scene_beats=scene_beats,
        scene_index=scene_index,
        scene_count=scene_count,
    )
    style_hint = _style_hint(style_preset)
    dialogue_mode = _post_scene_has_dialogue(dialogue_script, raw_visual_prompt)

    pieces: list[str] = [
        f"Scene {scene_index + 1} of {scene_count} for a vertical short-form video frame.",
    ]
    if story_title:
        pieces.append(f"Story title: {story_title}.")
    if story_concept:
        pieces.append(f"Core story premise: {story_concept}.")
    if profile:
        pieces.append(f"Main character profile (must stay identical): {profile}.")
    if character_lock_id:
        pieces.append(f"Character lock id: {character_lock_id}.")
    pieces.append(f"Primary scene direction: {scene_beat}.")
    pieces.append(
        f"Camera direction: {_post_scene_camera_motion(scene_index=scene_index, scene_count=scene_count, dialogue_mode=dialogue_mode)}."
    )
    pieces.append(
        f"Pacing target: {_post_scene_intensity(scene_index=scene_index, scene_count=scene_count)}."
    )
    if story_summary and scene_beat.lower() not in story_summary.lower():
        pieces.append(f"Overall story context: {story_summary}.")
    if style_hint:
        pieces.append(f"Visual style: {style_hint}.")
    elif story_visual_style:
        pieces.append(f"Visual style: {story_visual_style}.")
    if scene_index == 0:
        pieces.append(
            "Define the protagonist look clearly in this first scene so the same person can be reused exactly."
        )
    else:
        pieces.append("Match the protagonist from Scene 1 exactly, with no character swap.")
    pieces.append(
        "Continuity lock (critical): keep one single protagonist across all scenes with the exact same face,"
        " hair color/style, age range, body type, outfit palette, and art style."
        " Keep the setting family consistent unless this beat explicitly changes location."
        " Do not switch character, gender, ethnicity, or era."
    )
    pieces.append(
        "Avoid unintended text artifacts, subtitles, logos, and watermarks unless the scene explicitly asks for visible text."
    )
    dialogue_hint = _compact_dialogue_script(dialogue_script, max_chars=420)
    if dialogue_hint:
        pieces.append(
            "Dialogue guidance (critical): speak these lines exactly and keep mouth/jaw movement tightly synced"
            " to each word while preserving the same protagonist identity."
        )
        pieces.append(f"Dialogue lines:\n{dialogue_hint}")
    else:
        pieces.append(
            "Shot policy: no talking-head close-up framing unless direct spoken dialogue is present."
            " Prioritize medium/wide cinematic framing with action and environmental context."
        )

    composed = " ".join(piece.strip() for piece in pieces if piece.strip())
    return composed[:1180].rstrip()


def _probe_audio_duration(path: str) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    proc = _run_media_cmd(cmd, timeout_seconds=max(30, _media_cmd_timeout_seconds()))
    if proc.returncode != 0:
        return 0.0
    raw = (proc.stdout or "").strip()
    try:
        return max(0.0, float(raw))
    except Exception:
        return 0.0


def _probe_media_duration(path: str) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    proc = _run_media_cmd(cmd, timeout_seconds=max(30, _media_cmd_timeout_seconds()))
    if proc.returncode != 0:
        return 0.0
    raw = (proc.stdout or "").strip()
    try:
        return max(0.0, float(raw))
    except Exception:
        return 0.0


def _ff_drawtext_escape(value: str) -> str:
    return (
        str(value or "")
        .replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
    )


def _ff_path_escape(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def _watermark_drawtext_filter(
    *,
    fontfile: str,
    text_escaped: str,
    font_size: int,
    box_border: int,
    x_expr: str,
    y_expr: str,
) -> str:
    # Premium watermark style with stronger readability on bright highlights.
    return (
        f"drawtext=fontfile={fontfile}:text='{text_escaped}':"
        f"fontcolor=white@0.98:fontsize={font_size}:"
        "borderw=1:bordercolor=black@0.62:"
        "shadowx=0:shadowy=1:shadowcolor=black@0.42:"
        f"box=1:boxcolor=black@0.36:boxborderw={box_border}:"
        f"x={x_expr}:y={y_expr}"
    )


def _watermark_fontfile(default_fontfile: str) -> str:
    candidates = [
        _env("WORKER_WATERMARK_FONTFILE", ""),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        default_fontfile,
    ]
    for candidate in candidates:
        path = (candidate or "").strip()
        if path and os.path.exists(path):
            return path
    return default_fontfile


def _watermark_text_position(
    *,
    margin: int,
    logo_width: int,
    text_offset: int,
    font_size: int,
    has_logo: bool,
) -> tuple[int, int]:
    if has_logo:
        x = margin + logo_width + max(10, text_offset)
        y = margin + max(2, int((logo_width - font_size) * 0.5))
        return x, y
    return margin, margin


def _watermark_logo_path() -> str:
    candidates = [
        _env("WORKER_WATERMARK_LOGO_PATH", ""),
        "/app/assets/clipforge-labs-mark.svg",
        "/app/assets/clipforge-labs-mark.png",
        "/app/assets/orbito-mark.png",
    ]
    for candidate in candidates:
        path = (candidate or "").strip()
        if path and os.path.exists(path):
            return path
    return ""


def _caption_force_style(preset: str | None, video_h: int) -> str:
    caption_scale = _env_float("WORKER_CAPTION_FONT_SCALE", 0.65, min_value=0.45, max_value=1.0)

    def _scaled_font(base: int, min_value: int) -> int:
        scaled = int(round(float(base) * caption_scale))
        return max(min_value, scaled)

    style = (preset or "").strip().lower()
    if style == "minimal":
        font_size = _scaled_font(min(26, max(18, int(video_h * 0.013))), 12)
        margin_v = max(46, int(video_h * 0.042))
        return (
            f"FontName=DejaVu Sans,Fontsize={font_size},Alignment=2,MarginV={margin_v},"
            "PrimaryColour=&H00F7F7F7,OutlineColour=&H00151515,BackColour=&H00000000,"
            "BorderStyle=1,Outline=1,Shadow=0,Bold=0,Italic=0,MarginL=38,MarginR=38,WrapStyle=2"
        )
    if style == "clean_bottom":
        font_size = _scaled_font(min(30, max(21, int(video_h * 0.016))), 14)
        margin_v = max(54, int(video_h * 0.050))
        return (
            f"FontName=DejaVu Sans,Fontsize={font_size},Alignment=2,MarginV={margin_v},"
            "PrimaryColour=&H00FFFFFF,OutlineColour=&H00242424,BackColour=&H66202020,"
            "BorderStyle=3,Outline=0,Shadow=0,Bold=1,MarginL=42,MarginR=42,WrapStyle=2"
        )
    # default: bold_center
    font_size = _scaled_font(min(34, max(24, int(video_h * 0.018))), 16)
    margin_v = max(80, int(video_h * 0.070))
    return (
        f"FontName=DejaVu Sans,Fontsize={font_size},Alignment=5,MarginV={margin_v},"
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BackColour=&H7A000000,"
        "BorderStyle=3,Outline=0,Shadow=0,Bold=1,MarginL=46,MarginR=46,WrapStyle=2"
    )


def _format_srt_ts(seconds: float) -> str:
    safe = max(0.0, float(seconds or 0.0))
    total_ms = int(round(safe * 1000.0))
    hh = total_ms // 3_600_000
    mm = (total_ms % 3_600_000) // 60_000
    ss = (total_ms % 60_000) // 1000
    ms = total_ms % 1000
    return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"


def _build_word_caption_events(script: str, duration_seconds: float) -> list[dict[str, float | str]]:
    tokens = [tok.strip() for tok in re.findall(r"\S+", script or "") if tok.strip()]
    if not tokens:
        return []
    safe_duration = max(0.6, float(duration_seconds or 0.0))
    slot = safe_duration / float(len(tokens))
    events: list[dict[str, float | str]] = []
    for idx, token in enumerate(tokens):
        start = round(float(idx) * slot, 3)
        end = round(float(idx + 1) * slot, 3)
        if idx == len(tokens) - 1:
            end = max(end, safe_duration)
        if end <= start:
            end = round(start + 0.08, 3)
        events.append({"word": token, "start": start, "end": end})
    return events


def _write_word_by_word_srt(events: list[dict[str, float | str]]) -> str:
    fd, path = tempfile.mkstemp(prefix="cflabs-word-captions-", suffix=".srt")
    os.close(fd)
    with open(path, "w", encoding="utf-8") as f:
        for idx, event in enumerate(events, start=1):
            word = str(event.get("word") or "").strip()
            if not word:
                continue
            start = float(event.get("start") or 0.0)
            end = float(event.get("end") or 0.0)
            if end <= start:
                end = start + 0.08
            f.write(f"{idx}\n")
            f.write(f"{_format_srt_ts(start)} --> {_format_srt_ts(end)}\n")
            f.write(f"{word}\n\n")
    return path


def _apply_video_overlays(
    *,
    src_path: str,
    out_path: str,
    watermark_enabled: bool,
    subtitles_path: str | None = None,
    caption_style_preset: str | None = None,
    aspect_ratio: str = "9:16",
    allow_logo: bool = True,
) -> None:
    logo_path = _watermark_logo_path() if (watermark_enabled and allow_logo) else ""
    watermark_text = _brand_text_env("WORKER_WATERMARK_TEXT")
    draw_font = _watermark_fontfile(_env("WORKER_DRAWTEXT_FONTFILE", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
    wm_margin = _env_int("WORKER_WATERMARK_MARGIN", 24, min_value=4, max_value=160)
    wm_logo_width = _env_int("WORKER_WATERMARK_LOGO_WIDTH", 96, min_value=40, max_value=512)
    wm_font_size = _env_int("WORKER_WATERMARK_FONT_SIZE", 34, min_value=16, max_value=128)
    wm_box_border = _env_int("WORKER_WATERMARK_BOX_BORDER", 8, min_value=2, max_value=30)
    wm_text_offset = _env_int("WORKER_WATERMARK_TEXT_OFFSET", 14, min_value=0, max_value=96)
    wm_text_x, wm_text_y = _watermark_text_position(
        margin=wm_margin,
        logo_width=wm_logo_width,
        text_offset=wm_text_offset,
        font_size=wm_font_size,
        has_logo=bool(logo_path),
    )
    label = "[0:v]"
    graph_parts: list[str] = []
    if subtitles_path:
        _, h = _clip_dimensions(aspect_ratio if aspect_ratio in {"9:16", "16:9", "1:1"} else "9:16")
        force_style = _caption_force_style(caption_style_preset, h).replace("'", "\\'")
        sub_path = _ff_path_escape(subtitles_path)
        graph_parts.append(f"[0:v]subtitles='{sub_path}':force_style='{force_style}'[vsub]")
        label = "[vsub]"
    if watermark_enabled and logo_path:
        logo_label = "[wm]"
        graph_parts.append(f"[1:v]scale={wm_logo_width}:-1{logo_label}")
        graph_parts.append(f"{label}{logo_label}overlay=x={wm_margin}:y={wm_margin}:format=auto[vw]")
        label = "[vw]"
    if watermark_enabled:
        text_escaped = _ff_drawtext_escape(watermark_text)
        graph_parts.append(
            f"{label}"
            f"{_watermark_drawtext_filter(fontfile=draw_font, text_escaped=text_escaped, font_size=wm_font_size, box_border=wm_box_border, x_expr=str(wm_text_x), y_expr=str(wm_text_y))}"
            "[vout]"
        )
        label = "[vout]"
    if not graph_parts:
        shutil.copyfile(src_path, out_path)
        return

    cmd: list[str] = ["ffmpeg", "-y", "-i", src_path]
    if watermark_enabled and logo_path:
        cmd.extend(["-i", logo_path])
    cmd.extend(
        [
            "-filter_complex",
            ";".join(graph_parts),
            "-map",
            label,
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            out_path,
        ]
    )
    proc = _run_media_cmd(cmd, timeout_seconds=max(120, _media_cmd_timeout_seconds()))
    if proc.returncode != 0:
        if logo_path and allow_logo:
            _apply_video_overlays(
                src_path=src_path,
                out_path=out_path,
                watermark_enabled=watermark_enabled,
                subtitles_path=subtitles_path,
                caption_style_preset=caption_style_preset,
                aspect_ratio=aspect_ratio,
                allow_logo=False,
            )
            return
        raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg overlay render failed").strip()[:500])


def _apply_image_watermark(*, image_path: str, watermark_enabled: bool) -> None:
    if not watermark_enabled:
        return
    fd, tmp_path = tempfile.mkstemp(prefix="cflabs-watermark-img-", suffix=".png")
    os.close(fd)
    logo_path = _watermark_logo_path()
    draw_font = _watermark_fontfile(_env("WORKER_DRAWTEXT_FONTFILE", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
    text_escaped = _ff_drawtext_escape(_brand_text_env("WORKER_WATERMARK_TEXT"))
    wm_margin = _env_int("WORKER_WATERMARK_MARGIN", 24, min_value=4, max_value=160)
    wm_logo_width = _env_int("WORKER_WATERMARK_LOGO_WIDTH", 96, min_value=40, max_value=512)
    wm_font_size = _env_int("WORKER_WATERMARK_FONT_SIZE", 34, min_value=16, max_value=128)
    wm_box_border = _env_int("WORKER_WATERMARK_BOX_BORDER", 8, min_value=2, max_value=30)
    wm_text_offset = _env_int("WORKER_WATERMARK_TEXT_OFFSET", 14, min_value=0, max_value=96)
    wm_text_x, wm_text_y = _watermark_text_position(
        margin=wm_margin,
        logo_width=wm_logo_width,
        text_offset=wm_text_offset,
        font_size=wm_font_size,
        has_logo=bool(logo_path),
    )
    draw_with_logo = _watermark_drawtext_filter(
        fontfile=draw_font,
        text_escaped=text_escaped,
        font_size=wm_font_size,
        box_border=wm_box_border,
        x_expr=str(wm_text_x),
        y_expr=str(wm_text_y),
    )
    draw_without_logo = _watermark_drawtext_filter(
        fontfile=draw_font,
        text_escaped=text_escaped,
        font_size=wm_font_size,
        box_border=wm_box_border,
        x_expr=str(wm_margin),
        y_expr=str(wm_margin),
    )
    try:
        if logo_path:
            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                image_path,
                "-i",
                logo_path,
                "-filter_complex",
                f"[1:v]scale={wm_logo_width}:-1[wm];[0:v][wm]overlay=x={wm_margin}:y={wm_margin}:format=auto[v1];"
                f"[v1]{draw_with_logo}[vout]",
                "-map",
                "[vout]",
                "-frames:v",
                "1",
                tmp_path,
            ]
        else:
            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                image_path,
                "-vf",
                draw_without_logo,
                "-frames:v",
                "1",
                tmp_path,
            ]
        proc = _run_media_cmd(cmd, timeout_seconds=max(90, _media_cmd_timeout_seconds()))
        if proc.returncode != 0 and logo_path:
            fallback_cmd = [
                "ffmpeg",
                "-y",
                "-i",
                image_path,
                "-vf",
                draw_without_logo,
                "-frames:v",
                "1",
                tmp_path,
            ]
            proc = _run_media_cmd(fallback_cmd, timeout_seconds=max(90, _media_cmd_timeout_seconds()))
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg image watermark failed").strip()[:500])
        shutil.move(tmp_path, image_path)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


def _render_image_slideshow_video(
    *,
    image_paths: list[str],
    audio_path: str,
    aspect_ratio: str,
    target_duration: float,
    out_path: str,
) -> float:
    if not image_paths:
        raise RuntimeError("No image frames were generated for slideshow render")

    safe_target = max(6.0, float(target_duration or 0.0))
    per_scene = max(1.2, safe_target / float(len(image_paths)))
    fade_in = 0.18
    fade_out = 0.24
    w, h = _clip_dimensions(aspect_ratio if aspect_ratio in {"9:16", "16:9", "1:1"} else "9:16")

    scene_paths: list[str] = []
    fd, list_path = tempfile.mkstemp(prefix="cflabs-post-concat-", suffix=".txt")
    os.close(fd)

    try:
        for idx, image_path in enumerate(image_paths):
            fd_scene, scene_path = tempfile.mkstemp(prefix=f"cflabs-post-scene-{idx}-", suffix=".mp4")
            os.close(fd_scene)
            scene_paths.append(scene_path)

            fade_out_start = max(0.0, per_scene - fade_out)
            vf = (
                f"scale={w}:{h}:force_original_aspect_ratio=increase,"
                f"crop={w}:{h},"
                f"fade=t=in:st=0:d={fade_in:.2f},"
                f"fade=t=out:st={fade_out_start:.2f}:d={fade_out:.2f},"
                "format=yuv420p"
            )

            cmd = [
                "ffmpeg",
                "-y",
                "-loop",
                "1",
                "-i",
                image_path,
                "-t",
                f"{per_scene:.3f}",
                "-vf",
                vf,
                "-r",
                "30",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                scene_path,
            ]
            proc = _run_media_cmd(cmd, timeout_seconds=max(90, _media_cmd_timeout_seconds()))
            if proc.returncode != 0:
                raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg scene render failed").strip()[:500])

        with open(list_path, "w", encoding="utf-8") as f:
            for scene_path in scene_paths:
                quoted = scene_path.replace("'", "'\\''")
                f.write(f"file '{quoted}'\n")

        concat_cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list_path,
            "-i",
            audio_path,
            "-map",
            "0:v:0",
            "-map",
            "1:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-pix_fmt",
            "yuv420p",
            "-shortest",
            "-movflags",
            "+faststart",
            out_path,
        ]
        proc = _run_media_cmd(concat_cmd, timeout_seconds=max(120, _media_cmd_timeout_seconds()))
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg concat render failed").strip()[:500])
    finally:
        for scene_path in scene_paths:
            try:
                os.unlink(scene_path)
            except Exception:
                pass
        try:
            os.unlink(list_path)
        except Exception:
            pass

    final_duration = _probe_audio_duration(audio_path)
    if final_duration <= 0:
        final_duration = safe_target
    return float(final_duration)


def _render_video_scene_montage(
    *,
    scene_video_paths: list[str],
    audio_path: str,
    aspect_ratio: str,
    target_duration: float,
    out_path: str,
) -> float:
    if not scene_video_paths:
        raise RuntimeError("No video scenes were generated for montage render")

    safe_target = max(6.0, float(target_duration or 0.0))
    w, h = _clip_dimensions(aspect_ratio if aspect_ratio in {"9:16", "16:9", "1:1"} else "9:16")

    normalized_paths: list[str] = []
    normalized_meta: list[tuple[str, float]] = []
    fd, list_path = tempfile.mkstemp(prefix="cflabs-post-video-concat-", suffix=".txt")
    os.close(fd)
    total_duration = 0.0

    try:
        for idx, scene_path in enumerate(scene_video_paths):
            fd_norm, norm_path = tempfile.mkstemp(prefix=f"cflabs-post-video-scene-{idx}-", suffix=".mp4")
            os.close(fd_norm)
            normalized_paths.append(norm_path)

            vf = (
                f"scale={w}:{h}:force_original_aspect_ratio=increase,"
                f"crop={w}:{h},"
                "fps=30,"
                "format=yuv420p"
            )
            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                scene_path,
                "-vf",
                vf,
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                norm_path,
            ]
            proc = _run_media_cmd(cmd, timeout_seconds=max(120, _media_cmd_timeout_seconds()))
            if proc.returncode != 0:
                raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg video scene normalize failed").strip()[:500])

            scene_dur = _probe_media_duration(norm_path)
            if scene_dur <= 0:
                scene_dur = max(1.0, safe_target / float(len(scene_video_paths)))
            normalized_meta.append((norm_path, scene_dur))
            total_duration += scene_dur

        if not normalized_meta:
            raise RuntimeError("No normalized scene videos available for montage render")

        playlist: list[tuple[str, float]] = list(normalized_meta)
        loop_idx = 0
        while total_duration < safe_target and normalized_meta:
            item = normalized_meta[loop_idx % len(normalized_meta)]
            playlist.append(item)
            total_duration += item[1]
            loop_idx += 1

        with open(list_path, "w", encoding="utf-8") as f:
            for scene_path, _ in playlist:
                quoted = scene_path.replace("'", "'\\''")
                f.write(f"file '{quoted}'\n")

        concat_cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list_path,
            "-i",
            audio_path,
            "-map",
            "0:v:0",
            "-map",
            "1:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-pix_fmt",
            "yuv420p",
            "-shortest",
            "-movflags",
            "+faststart",
            out_path,
        ]
        proc = _run_media_cmd(concat_cmd, timeout_seconds=max(180, _media_cmd_timeout_seconds()))
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg video concat render failed").strip()[:500])
    finally:
        for norm_path in normalized_paths:
            try:
                os.unlink(norm_path)
            except Exception:
                pass
        try:
            os.unlink(list_path)
        except Exception:
            pass

    final_duration = _probe_audio_duration(audio_path)
    if final_duration <= 0:
        final_duration = safe_target if total_duration <= 0 else min(total_duration, safe_target)
    return float(final_duration)


def _run_fallback_tone_voiceover(*, script: str, out_path: str) -> None:
    # Fallback when espeak is unavailable: duration scales with text length.
    duration = max(2, min(90, int(math.ceil(max(1, len(script or "")) / 13.0))))
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=220:duration={duration}",
        "-filter:a",
        "volume=0.18",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "160k",
        out_path,
    ]
    proc = _run_media_cmd(cmd, timeout_seconds=max(60, _media_cmd_timeout_seconds()))
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg tone voiceover failed").strip()[:500])


def _run_voiceover(*, script: str, voice_name: str, speed_wpm: int, out_path: str) -> None:
    safe_script = (script or "").strip()[:6000]
    if not safe_script:
        safe_script = "Untitled voiceover."

    espeak_bin = shutil.which("espeak-ng") or shutil.which("espeak")
    if not espeak_bin:
        _run_fallback_tone_voiceover(script=safe_script, out_path=out_path)
        return

    fd, wav_path = tempfile.mkstemp(prefix="cflabs-voice-", suffix=".wav")
    os.close(fd)
    try:
        raw_voice = (voice_name or "en-us").strip()[:64] or "en-us"
        # espeak does not support Google Neural2 voice ids, so normalize when needed.
        voice = "en-us" if "neural" in raw_voice.lower() else raw_voice
        speed = max(80, min(330, int(speed_wpm or 165)))
        tts = [
            espeak_bin,
            "-v",
            voice,
            "-s",
            str(speed),
            "-w",
            wav_path,
            safe_script,
        ]
        tts_proc = _run_media_cmd(tts, timeout_seconds=max(60, _media_cmd_timeout_seconds()))
        if tts_proc.returncode != 0:
            _run_fallback_tone_voiceover(script=safe_script, out_path=out_path)
            return

        enc = [
            "ffmpeg",
            "-y",
            "-i",
            wav_path,
            "-c:a",
            "libmp3lame",
            "-b:a",
            "160k",
            out_path,
        ]
        enc_proc = _run_media_cmd(enc, timeout_seconds=max(60, _media_cmd_timeout_seconds()))
        if enc_proc.returncode != 0:
            raise RuntimeError((enc_proc.stderr or enc_proc.stdout or "ffmpeg mp3 encode failed").strip()[:500])
    finally:
        try:
            os.unlink(wav_path)
        except Exception:
            pass


def _write_bytes(path: str, data: bytes) -> None:
    with open(path, "wb") as f:
        f.write(data)


def _file_has_data(path: str) -> bool:
    try:
        return os.path.getsize(path) > 0
    except Exception:
        return False


def _file_has_video_stream(path: str) -> bool:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    proc = _run_media_cmd(cmd, timeout_seconds=max(30, _media_cmd_timeout_seconds()))
    if proc.returncode != 0:
        return False
    return "video" in (proc.stdout or "").strip().lower()


def _blackdetect_duration_seconds(
    path: str,
    *,
    min_segment_seconds: float,
    pixel_threshold: float,
    picture_ratio_threshold: float,
) -> float:
    vf = (
        "blackdetect="
        f"d={max(0.01, float(min_segment_seconds)):.3f}:"
        f"pix_th={max(0.0, min(1.0, float(pixel_threshold))):.3f}:"
        f"pic_th={max(0.5, min(1.0, float(picture_ratio_threshold))):.3f}"
    )
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i",
        path,
        "-vf",
        vf,
        "-an",
        "-f",
        "null",
        "-",
    ]
    proc = _run_media_cmd(cmd, timeout_seconds=max(60, _media_cmd_timeout_seconds()))
    if proc.returncode != 0:
        return 0.0
    raw = f"{proc.stdout or ''}\n{proc.stderr or ''}"
    total = 0.0
    for match in re.finditer(r"black_duration:(\d+(?:\.\d+)?)", raw):
        try:
            total += max(0.0, float(match.group(1)))
        except Exception:
            continue
    return total


def _is_mostly_black_video(path: str, *, duration_seconds: float) -> bool:
    safe_duration = max(0.0, float(duration_seconds or 0.0))
    if safe_duration <= 0.0:
        return False
    min_segment_seconds = _env_float(
        "WORKER_BLACKDETECT_MIN_SEGMENT_SECONDS",
        0.18,
        min_value=0.05,
        max_value=2.0,
    )
    pixel_threshold = _env_float("WORKER_BLACKDETECT_PIXEL_THRESHOLD", 0.10, min_value=0.0, max_value=1.0)
    picture_ratio_threshold = _env_float("WORKER_BLACKDETECT_PICTURE_RATIO", 0.98, min_value=0.5, max_value=1.0)
    reject_ratio = _env_float("WORKER_REJECT_BLACK_VIDEO_RATIO", 0.97, min_value=0.5, max_value=1.0)
    black_duration = _blackdetect_duration_seconds(
        path,
        min_segment_seconds=min_segment_seconds,
        pixel_threshold=pixel_threshold,
        picture_ratio_threshold=picture_ratio_threshold,
    )
    if black_duration <= 0.0:
        return False
    black_ratio = min(1.0, black_duration / max(0.001, safe_duration))
    if black_ratio >= reject_ratio:
        print(
            f"[worker] rejecting mostly-black video file={os.path.basename(path)} "
            f"duration={safe_duration:.2f}s black={black_duration:.2f}s ratio={black_ratio:.3f}"
        )
        return True
    return False


def _valid_video_file(
    path: str,
    *,
    min_duration_seconds: float = 0.45,
    reject_mostly_black: bool = False,
) -> tuple[bool, float]:
    if not _file_has_data(path):
        return False, 0.0
    if not _file_has_video_stream(path):
        return False, 0.0
    duration = _probe_media_duration(path)
    if duration < float(min_duration_seconds):
        return False, duration
    if reject_mostly_black and _is_mostly_black_video(path, duration_seconds=duration):
        return False, duration
    return True, duration


def _trim_video_to_duration(*, src_path: str, out_path: str, duration_seconds: float) -> None:
    safe_duration = max(0.35, float(duration_seconds or 0.35))
    encode_cmd = [
        "ffmpeg",
        "-y",
        "-i",
        src_path,
        "-t",
        f"{safe_duration:.3f}",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        out_path,
    ]
    proc = _run_media_cmd(encode_cmd, timeout_seconds=max(120, _media_cmd_timeout_seconds()))
    if proc.returncode == 0:
        return

    # Fallback to stream copy trim if encode path fails in constrained runtimes.
    copy_cmd = [
        "ffmpeg",
        "-y",
        "-i",
        src_path,
        "-t",
        f"{safe_duration:.3f}",
        "-c",
        "copy",
        out_path,
    ]
    copy_proc = _run_media_cmd(copy_cmd, timeout_seconds=max(90, _media_cmd_timeout_seconds()))
    if copy_proc.returncode != 0:
        raise RuntimeError((copy_proc.stderr or copy_proc.stdout or "ffmpeg trim failed").strip()[:500])


def _pad_video_to_duration(*, src_path: str, out_path: str, target_seconds: float, current_seconds: float) -> None:
    safe_target = max(0.35, float(target_seconds or 0.35))
    safe_current = max(0.0, float(current_seconds or 0.0))
    pad_seconds = max(0.0, safe_target - safe_current)
    if pad_seconds <= 0.05:
        shutil.copyfile(src_path, out_path)
        return
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        src_path,
        "-vf",
        f"tpad=stop_mode=clone:stop_duration={pad_seconds:.3f}",
        "-t",
        f"{safe_target:.3f}",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        out_path,
    ]
    proc = _run_media_cmd(cmd, timeout_seconds=max(120, _media_cmd_timeout_seconds()))
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg pad failed").strip()[:500])


def _voice_language_code(voice_name: str) -> str:
    raw = (voice_name or "").replace("_", "-").strip()
    if not raw:
        return _env("GOOGLE_TTS_LANGUAGE_CODE", "en-US")
    parts = raw.split("-")
    if len(parts) >= 2 and parts[0] and parts[1]:
        return f"{parts[0].lower()}-{parts[1].upper()}"
    return _env("GOOGLE_TTS_LANGUAGE_CODE", "en-US")


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
    compact = re.sub(r"\s+", " ", (script or "").strip())
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
    style = _env("GOOGLE_TTS_STYLE", "narrative").strip().lower()
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
        return "<speak>Untitled voiceover.</speak>"

    pause_ms = _env_int("GOOGLE_TTS_SENTENCE_BREAK_MS", 220, min_value=80, max_value=800)
    phrase_pause_ms = _env_int("GOOGLE_TTS_PHRASE_BREAK_MS", 130, min_value=40, max_value=400)
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


def _google_tts_audio_config(speaking_rate: float) -> dict[str, Any]:
    pitch = _env_float("GOOGLE_TTS_PITCH", 0.4, min_value=-20.0, max_value=20.0)
    volume_gain_db = _env_float("GOOGLE_TTS_VOLUME_GAIN_DB", 2.0, min_value=-96.0, max_value=16.0)
    sample_rate_hz = _env_int("GOOGLE_TTS_SAMPLE_RATE_HZ", 48000, min_value=8000, max_value=48000)
    cfg: dict[str, Any] = {
        "audioEncoding": "MP3",
        "speakingRate": speaking_rate,
        "pitch": pitch,
        "volumeGainDb": volume_gain_db,
    }
    if sample_rate_hz > 0:
        cfg["sampleRateHertz"] = sample_rate_hz
    profile_ids = [
        p.strip()
        for p in _env("GOOGLE_TTS_EFFECT_PROFILE_ID", "headphone-class-device").split(",")
        if p.strip()
    ]
    if profile_ids:
        cfg["effectsProfileId"] = profile_ids
    return cfg


def _google_tts_payload(
    *,
    script: str,
    selected_voice_name: str,
    language_code: str,
    speaking_rate: float,
    use_ssml: bool,
) -> dict[str, Any]:
    input_payload: dict[str, str]
    if use_ssml:
        input_payload = {"ssml": _build_expressive_tts_ssml(script)}
    else:
        input_payload = {"text": (script or "").strip()[:6000] or "Untitled voiceover."}

    payload: dict[str, Any] = {
        "input": input_payload,
        "voice": {"languageCode": language_code},
        "audioConfig": _google_tts_audio_config(speaking_rate),
    }
    if selected_voice_name:
        payload["voice"]["name"] = selected_voice_name
    return payload


def _google_tts_voice_candidates(selected: str, fallback: str) -> list[str]:
    defaults = [
        _env("GOOGLE_TTS_DEFAULT_VOICE", DEFAULT_TTS_VOICE),
        _env("GOOGLE_TTS_FALLBACK_VOICE", FALLBACK_TTS_VOICE),
        *TTS_VOICE_FALLBACK_CHAIN,
    ]
    extra = [v.strip() for v in _env("GOOGLE_TTS_EXTRA_FALLBACK_VOICES", "").split(",") if v.strip()]
    ordered = [selected, fallback, *extra, *defaults]
    out: list[str] = []
    seen: set[str] = set()
    for voice in ordered:
        v = (voice or "").strip()
        key = v.lower()
        if not v or key in {"auto", "default", "en-us", "en_us"}:
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(v[:64])
    return out or [DEFAULT_TTS_VOICE]


def _extract_tts_error_detail(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    err = data.get("error")
    if isinstance(err, dict):
        return str(err.get("message") or "").strip()
    if err:
        return str(err).strip()
    return ""


def _polish_voiceover_audio(path: str) -> None:
    if not _env_bool("GOOGLE_TTS_POLISH_AUDIO", True):
        return
    fd, polished_path = tempfile.mkstemp(prefix="cflabs-tts-polish-", suffix=".mp3")
    os.close(fd)
    try:
        af_chain = _env(
            "GOOGLE_TTS_AUDIO_FILTER",
            (
                "highpass=f=60,"
                "lowpass=f=14000,"
                "acompressor=threshold=-18dB:ratio=2.0:attack=8:release=120:makeup=2.5,"
                "loudnorm=I=-16:TP=-1.5:LRA=11"
            ),
        )
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            path,
            "-af",
            af_chain,
            "-c:a",
            "libmp3lame",
            "-b:a",
            _env("GOOGLE_TTS_OUTPUT_BITRATE", "224k"),
            polished_path,
        ]
        proc = _run_media_cmd(cmd, timeout_seconds=max(90, _media_cmd_timeout_seconds()))
        if proc.returncode == 0 and _file_has_data(polished_path):
            shutil.move(polished_path, path)
    finally:
        if os.path.exists(polished_path):
            try:
                os.unlink(polished_path)
            except Exception:
                pass


def _run_google_tts_voiceover(*, script: str, voice_name: str, speed_wpm: int, out_path: str) -> None:
    raw_endpoint = _env("GOOGLE_TTS_API_URL", "https://texttospeech.googleapis.com/v1/text:synthesize?key={API_KEY}")

    safe_script = (script or "").strip()[:6000]
    if not safe_script:
        safe_script = "Untitled voiceover."

    default_voice_name = (_env("GOOGLE_TTS_DEFAULT_VOICE", DEFAULT_TTS_VOICE) or "").strip() or DEFAULT_TTS_VOICE
    fallback_voice_name = (_env("GOOGLE_TTS_FALLBACK_VOICE", default_voice_name) or "").strip() or default_voice_name
    explicit_voice = (voice_name or "").strip()
    selected_voice_name = (
        explicit_voice
        if explicit_voice and explicit_voice.lower() not in {"en-us", "en_us", "default", "auto"}
        else default_voice_name
    )

    speaking_rate = max(0.5, min(2.0, float(speed_wpm or 165) / 165.0))
    use_ssml = _env_bool("GOOGLE_TTS_USE_SSML", True)

    endpoint = raw_endpoint
    use_google_auth = False
    if "{API_KEY}" in endpoint:
        if _env("GOOGLE_API_KEY", ""):
            endpoint = _resolve_provider_url(endpoint)
        else:
            # Fallback to service-account token auth when no API key is configured.
            endpoint = endpoint.replace("?key={API_KEY}", "").replace("&key={API_KEY}", "").replace("key={API_KEY}", "")
            endpoint = endpoint.rstrip("?&")
            use_google_auth = True

    if not endpoint:
        endpoint = "https://texttospeech.googleapis.com/v1/text:synthesize"
        use_google_auth = True

    def call_tts(req_payload: dict[str, Any]) -> tuple[int, str, Any, bytes]:
        if use_google_auth:
            return _http_post_json_custom(
                endpoint,
                req_payload,
                headers=_google_auth_headers(),
            )
        return _http_post_json(endpoint, req_payload)

    last_error = "google tts failed"
    for candidate_voice in _google_tts_voice_candidates(selected_voice_name, fallback_voice_name):
        candidate_language = _voice_language_code(candidate_voice)
        payload = _google_tts_payload(
            script=safe_script,
            selected_voice_name=candidate_voice,
            language_code=candidate_language,
            speaking_rate=speaking_rate,
            use_ssml=use_ssml,
        )
        status, content_type, data, raw_bytes = call_tts(payload)
        if status >= 400 and use_ssml:
            plain_payload = _google_tts_payload(
                script=safe_script,
                selected_voice_name=candidate_voice,
                language_code=candidate_language,
                speaking_rate=speaking_rate,
                use_ssml=False,
            )
            status, content_type, data, raw_bytes = call_tts(plain_payload)

        if status >= 400:
            detail = _extract_tts_error_detail(data)
            last_error = f"google tts failed: {status} {detail}".strip()
            continue

        if isinstance(data, dict):
            audio_b64 = data.get("audioContent")
            if isinstance(audio_b64, str) and audio_b64.strip():
                _write_bytes(out_path, _decode_base64_payload(audio_b64.strip()))
                _polish_voiceover_audio(out_path)
                return

        # Some gateways may return direct MP3 bytes.
        if content_type.startswith("audio/") and raw_bytes:
            _write_bytes(out_path, raw_bytes)
            _polish_voiceover_audio(out_path)
            return

        last_error = "google tts response missing audio payload"

    raise RuntimeError(last_error)


def _render_dialogue_voiceover(*, script: str, voice_name: str, speed_wpm: int, out_path: str) -> None:
    """Render dialogue with two alternating voices when possible."""
    lines = [ln.strip() for ln in (script or "").replace("\r", "\n").split("\n") if ln.strip()]
    if len(lines) < 2:
        _run_google_tts_voiceover(script=script, voice_name=voice_name, speed_wpm=speed_wpm, out_path=out_path)
        return

    primary = (voice_name or DEFAULT_TTS_VOICE).strip() or DEFAULT_TTS_VOICE
    fallback = (_env("GOOGLE_TTS_FALLBACK_VOICE", DEFAULT_TTS_VOICE) or DEFAULT_TTS_VOICE).strip() or DEFAULT_TTS_VOICE
    secondary = fallback if fallback != primary else FALLBACK_TTS_VOICE

    segment_paths: list[str] = []
    list_path = ""
    try:
        for idx, line in enumerate(lines):
            fd_seg, seg_path = tempfile.mkstemp(prefix=f"cflabs-dialogue-{idx}-", suffix=".mp3")
            os.close(fd_seg)
            segment_paths.append(seg_path)
            speaker_voice = primary if idx % 2 == 0 else secondary
            _run_google_tts_voiceover(script=line, voice_name=speaker_voice, speed_wpm=speed_wpm, out_path=seg_path)

        fd_list, list_path = tempfile.mkstemp(prefix="cflabs-dialogue-list-", suffix=".txt")
        os.close(fd_list)
        with open(list_path, "w", encoding="utf-8") as f:
            for seg in segment_paths:
                quoted = seg.replace("'", "'\\''")
                f.write(f"file '{quoted}'\n")

        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list_path,
            "-c",
            "copy",
            out_path,
        ]
        proc = _run_media_cmd(cmd, timeout_seconds=max(120, _media_cmd_timeout_seconds()))
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg dialogue concat failed").strip()[:500])
    finally:
        if list_path:
            try:
                os.unlink(list_path)
            except Exception:
                pass
        for seg in segment_paths:
            try:
                os.unlink(seg)
            except Exception:
                pass


def _call_google_generation_endpoint(
    *,
    endpoint_env: str,
    payload: dict[str, Any],
) -> tuple[bytes, str, float | None, str | None]:
    endpoint = _resolve_provider_url(_env(endpoint_env, ""))
    if not endpoint:
        raise RuntimeError(f"{endpoint_env} is not configured")

    status, content_type, data, raw_bytes = _http_post_json(endpoint, payload)
    if status >= 400:
        detail = ""
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict):
                detail = str(err.get("message") or "")
            elif err:
                detail = str(err)
        raise RuntimeError(f"{endpoint_env} request failed: {status} {detail}".strip())

    parsed = _extract_remote_result(data)
    media_bytes = parsed.get("bytes")
    media_url = parsed.get("url")
    media_type = (
        (parsed.get("content_type") if isinstance(parsed.get("content_type"), str) else None)
        or content_type
        or "application/octet-stream"
    )

    if not media_bytes and isinstance(media_url, str) and media_url.strip():
        media_bytes, downloaded_type = _http_get_bytes(media_url.strip())
        if downloaded_type:
            media_type = downloaded_type

    if not media_bytes and raw_bytes and not content_type.startswith("application/json"):
        media_bytes = raw_bytes

    if not media_bytes:
        raise RuntimeError(f"{endpoint_env} response missing media payload")

    duration = parsed.get("duration_seconds")
    final_duration = float(duration) if isinstance(duration, (int, float)) else None
    title = parsed.get("title") if isinstance(parsed.get("title"), str) else None
    return media_bytes, media_type, final_duration, title


def _claim_next_generate_job(db) -> dict | None:
    """
    Claim exactly one queued generation job and immediately mark it running.
    Rules:
      - FIFO by job id
      - at most one running generation job per user account at any time
      - safe for multiple workers racing on the same queue
    """
    for _ in range(12):
        candidate = db.execute(
            text(
                """
                SELECT j.id
                FROM jobs j
                JOIN uploads u ON u.id = j.upload_id
                WHERE j.kind IN ('generate', 'generate_image', 'generate_voiceover', 'generate_post')
                  AND j.status = 'queued'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM jobs jr
                    JOIN uploads ur ON ur.id = jr.upload_id
                    WHERE ur.user_id = u.user_id
                      AND jr.kind IN ('generate', 'generate_image', 'generate_voiceover', 'generate_post')
                      AND jr.status = 'running'
                  )
                ORDER BY j.id ASC
                LIMIT 1
                """
            )
        ).scalar()
        if not candidate:
            return None

        updated = db.execute(
            text(
                """
                UPDATE jobs
                SET status = 'running',
                    error = NULL
                WHERE id = :id
                  AND status = 'queued'
                """
            ),
            {"id": int(candidate)},
        )
        if int(getattr(updated, "rowcount", 0) or 0) != 1:
            # Another worker claimed it first; retry quickly.
            continue

        row = db.execute(
            text(
                """
                SELECT
                  id,
                  upload_id,
                  COALESCE(kind, 'generate') AS kind,
                  COALESCE(prompt, '') AS prompt,
                  COALESCE(negative_prompt, '') AS negative_prompt,
                  COALESCE(model, '') AS model,
                  COALESCE(duration_seconds, 6) AS duration_seconds,
                  COALESCE(aspect_ratio, '9:16') AS aspect_ratio,
                  COALESCE(captions_enabled, 0) AS captions_enabled,
                  COALESCE(watermark_enabled, 1) AS watermark_enabled,
                  COALESCE(caption_style_json, '{}') AS settings_json
                FROM jobs
                WHERE id = :id
                LIMIT 1
                """
            ),
            {"id": int(candidate)},
        ).mappings().first()
        return dict(row) if row else None

    return None


def _mark_job_status(
    db,
    job_id: int,
    status: str,
    error: str | None = None,
    *,
    only_if_current: str | None = None,
) -> int:
    sql = "UPDATE jobs SET status = :s, error = :e WHERE id = :id"
    params: dict[str, Any] = {
        "s": status,
        "e": error,
        "id": int(job_id),
    }
    if only_if_current:
        sql += " AND status = :cur"
        params["cur"] = str(only_if_current)
    updated = db.execute(text(sql), params)
    return int(getattr(updated, "rowcount", 0) or 0)


def _job_status(db, job_id: int) -> str:
    row = db.execute(
        text("SELECT COALESCE(status, '') AS status FROM jobs WHERE id = :id LIMIT 1"),
        {"id": int(job_id)},
    ).mappings().first()
    return str((row or {}).get("status") or "").strip().lower()


def _job_is_canceled(db, job_id: int) -> bool:
    return _job_status(db, job_id) == "canceled"


def _refund_reserved_credits(db, job_id: int) -> int:
    row = db.execute(
        text(
            """
            SELECT
              COALESCE(j.credits_reserved, 0) AS reserved,
              COALESCE(j.credits_refunded, 0) AS refunded,
              COALESCE(u.user_id, 0) AS user_id,
              COALESCE(us.email, '') AS user_email
            FROM jobs j
            JOIN uploads u ON u.id = j.upload_id
            LEFT JOIN users us ON us.id = u.user_id
            WHERE j.id = :id
            LIMIT 1
            """
        ),
        {"id": int(job_id)},
    ).mappings().first()

    if not row:
        return 0

    reserved = int(row.get("reserved") or 0)
    if reserved <= 0:
        return 0
    if bool(row.get("refunded")):
        return 0

    user_id = int(row.get("user_id") or 0)
    if user_id <= 0:
        return 0
    user_email = str(row.get("user_email") or "").strip().lower()

    remote_credits = None
    if user_email and _orbito_entitlements_enabled():
        try:
            remote_credits = _orbito_adjust_credits(
                email=user_email,
                delta=reserved,
                reason="job_failed_refund",
                reference=f"labs:job:{int(job_id)}:failed_refund",
            )
        except Exception as exc:
            # Keep worker stable: if remote refund fails, fall back to local refund.
            print(f"[worker] remote entitlement refund failed for job_id={job_id}: {exc}")
            remote_credits = None

    if remote_credits is None:
        db.execute(
            text("UPDATE users SET credits = COALESCE(credits, 0) + :r WHERE id = :uid"),
            {"r": reserved, "uid": user_id},
        )
    else:
        db.execute(
            text("UPDATE users SET credits = :credits WHERE id = :uid"),
            {"credits": int(remote_credits), "uid": user_id},
        )
    db.execute(
        text("UPDATE jobs SET credits_refunded = 1 WHERE id = :id"),
        {"id": int(job_id)},
    )
    return reserved


def _insert_clip(
    db,
    *,
    upload_id: int,
    job_id: int,
    storage_key: str,
    duration_seconds: float,
    title: str | None,
    start_time: float = 0.0,
    hook: str | None = None,
) -> None:
    safe_start = max(0.0, float(start_time or 0.0))
    safe_duration = max(0.0, float(duration_seconds or 0.0))
    safe_end = safe_start + safe_duration
    db.execute(
        text(
            """
            INSERT INTO clips (upload_id, job_id, storage_key, start_time, end_time, duration, title, hook)
            VALUES (:upload_id, :job_id, :storage_key, :start_time, :end_time, :duration, :title, :hook)
            """
        ),
        {
            "upload_id": int(upload_id),
            "job_id": int(job_id),
            "storage_key": str(storage_key),
            "start_time": safe_start,
            "end_time": safe_end,
            "duration": safe_duration,
            "title": (title or None),
            "hook": (hook or None),
        },
    )


def _delete_job_clips(db, job_id: int) -> int:
    deleted = db.execute(
        text("DELETE FROM clips WHERE job_id = :id"),
        {"id": int(job_id)},
    )
    return int(getattr(deleted, "rowcount", 0) or 0)


def _cleanup_result_storage(result: dict[str, Any]) -> None:
    keys: list[str] = []
    primary_key = str(result.get("storage_key") or "").strip()
    if primary_key:
        keys.append(primary_key)
    extras = result.get("extra_clips")
    if isinstance(extras, list):
        for extra in extras:
            if not isinstance(extra, dict):
                continue
            k = str(extra.get("storage_key") or "").strip()
            if k:
                keys.append(k)
    for key in dict.fromkeys(keys):
        _delete_uploaded_key(key)


def _title_from_prompt(prompt: str) -> str | None:
    raw = (prompt or "").strip()
    if not raw:
        return None

    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    candidate = ""

    for line in lines[:6]:
        m = re.match(r"^title\s*[:\-]\s*(.+)$", line, flags=re.IGNORECASE)
        if m and m.group(1).strip():
            candidate = m.group(1).strip()
            break

    if not candidate:
        candidate = lines[0] if lines else raw

    candidate = candidate.replace("\r", " ").replace("\n", " ").strip()
    if "Visual style:" in candidate:
        candidate = candidate.split("Visual style:", 1)[0].strip()
    candidate = re.sub(r"\s+", " ", candidate).strip(" -–:")
    if not candidate:
        return None
    if len(candidate) > 64:
        candidate = candidate[:61].rstrip() + "..."
    return candidate


def _style_title_token(style_preset: str | None) -> str:
    token = (style_preset or "").strip().lower()
    style_map = {
        "real": "Real",
        "photo-real": "Real",
        "social-native": "Social",
        "cinematic": "Cinematic",
        "cartoon": "Cartoon",
        "anime": "Anime",
        "comic": "Comic",
        "illustration": "Illustration",
    }
    return style_map.get(token, "Original")


def _aspect_title_token(aspect_ratio: str | None) -> str:
    ar = (aspect_ratio or "").strip()
    if ar == "16:9":
        return "Landscape"
    if ar == "1:1":
        return "Square"
    return "Vertical"


def _generated_asset_title(
    *,
    kind: str,
    job_id: int,
    style_preset: str | None = None,
    aspect_ratio: str | None = None,
) -> str:
    kind_token = (kind or JOB_KIND_VIDEO).strip().lower()
    if kind_token == JOB_KIND_VOICEOVER:
        return f"Voiceover #{int(job_id)}"

    style_token = _style_title_token(style_preset)
    aspect_token = _aspect_title_token(aspect_ratio)

    if kind_token == JOB_KIND_IMAGE:
        return f"{style_token} {aspect_token} Image #{int(job_id)}"
    if kind_token == JOB_KIND_POST:
        return f"{style_token} {aspect_token} AI Post #{int(job_id)}"
    return f"{style_token} {aspect_token} Clip #{int(job_id)}"


def _parse_settings(raw: str) -> dict:
    text_value = (raw or "").strip()
    if not text_value:
        return {}
    try:
        data = json.loads(text_value)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _normalize_seed(raw: Any) -> int | None:
    try:
        value = int(raw)
    except Exception:
        return None
    if value < 0:
        return None
    return value % 2_147_483_647


def _stable_seed_from_text(text: str, *, salt: str = "") -> int:
    payload = f"{salt}|{text}".encode("utf-8", errors="ignore")
    digest = hashlib.sha256(payload).hexdigest()
    value = int(digest[:12], 16) % 2_147_483_647
    return value if value > 0 else 1


def _merge_job_settings(db, *, job_id: int, patch: dict[str, Any]) -> None:
    if not patch:
        return
    row = db.execute(
        text("SELECT COALESCE(caption_style_json, '{}') AS settings_json FROM jobs WHERE id = :id LIMIT 1"),
        {"id": int(job_id)},
    ).mappings().first()
    existing = _parse_settings(str((row or {}).get("settings_json") or "{}"))
    merged = {**existing, **patch}
    db.execute(
        text("UPDATE jobs SET caption_style_json = :settings_json WHERE id = :id"),
        {"id": int(job_id), "settings_json": json.dumps(merged)},
    )


def _is_provider_capacity_error(exc: Exception | str | None) -> bool:
    msg = str(exc or "").strip().lower()
    if not msg:
        return False
    markers = (
        "provider capacity",
        "queue is at provider capacity",
        "quota exceeded",
        "resourceexhausted",
        "429",
        "too many requests",
        "rate limit",
        "insufficient quota",
        "exceeded for",
    )
    return any(marker in msg for marker in markers)


def _style_hint(style_preset: str | None) -> str:
    style = (style_preset or "").strip().lower()
    hints = {
        "real": "photorealistic, natural lighting, realistic textures",
        "social-native": "platform-native social content, strong hook framing, high clarity",
        "photo-real": "photorealistic, natural lighting, realistic textures",
        "cinematic": "cinematic composition, filmic contrast, polished color grade",
        "cartoon": "cartoon illustration style, stylized outlines, vibrant shading",
        "anime": "anime aesthetic, expressive line art, cel-shaded look",
        "comic": "comic-book style, bold ink outlines, halftone shading, dynamic framing",
        "illustration": "editorial illustration style, clean shapes, soft gradients",
    }
    return hints.get(style, "")


def _style_quality_directive(style_preset: str | None) -> str:
    style = (style_preset or "").strip().lower()
    base = (
        "Quality lock: keep one consistent main character identity across frames; clean anatomy and hands; "
        "stable face geometry; sharp subject focus; no unintended text, logos, watermarks, or subtitle artifacts. "
        "Do not render readable in-scene typography, app UI labels, or branded logos inside the generated pixels."
    )
    if style == "anime":
        return f"{base} Preserve anime line quality and avoid flicker between frames."
    if style == "cartoon":
        return f"{base} Preserve clean outlines and stable color palette across shots."
    if style == "comic":
        return f"{base} Preserve inked contour consistency and controlled contrast."
    return f"{base} Preserve realistic skin texture, lighting continuity, and natural motion."


def _compose_negative_prompt(user_negative: str, style_preset: str | None) -> str:
    style = (style_preset or "").strip().lower()
    defaults = [
        "blurry",
        "low detail",
        "artifact",
        "jpeg noise",
        "duplicate people",
        "deformed face",
        "bad anatomy",
        "extra fingers",
        "text overlay",
        "subtitle text",
        "logo watermark",
        "readable text",
        "gibberish text",
        "misspelled words",
        "random letters",
        "warped typography",
        "broken ui text",
        "fake app interface text",
        "frame glitch",
        "flicker",
    ]
    if style == "anime":
        defaults.extend(["off-model character", "line wobble", "muddy shading"])
    elif style == "cartoon":
        defaults.extend(["dirty outlines", "inconsistent proportions", "muddy colors"])
    elif style == "comic":
        defaults.extend(["washed contrast", "broken ink lines", "halftone moire"])
    else:
        defaults.extend(["uncanny face", "plastic skin", "over-smoothed texture"])

    existing_tokens = [t.strip() for t in re.split(r"[,\n;]+", (user_negative or "").strip()) if t.strip()]
    seen = {t.lower() for t in existing_tokens}
    merged = list(existing_tokens)
    for token in defaults:
        low = token.lower()
        if low in seen:
            continue
        seen.add(low)
        merged.append(token)
    value = ", ".join(merged).strip(" ,")
    return value[:1200].strip()


def _apply_style_preset(prompt: str, style_preset: str | None) -> str:
    base = (prompt or "").strip()
    if not base:
        return base
    hint = _style_hint(style_preset)
    quality = _style_quality_directive(style_preset)
    parts = [base]
    if hint and hint.lower() not in base.lower():
        parts.append(f"Visual style: {hint}.")
    if "quality lock:" not in base.lower():
        parts.append(quality)
    composed = " ".join(p.strip() for p in parts if p and p.strip())
    return composed[:1180].rstrip()


def _video_mode_prep_delay_seconds(speed: str) -> int:
    # Relax mode intentionally runs on a slower lane to keep cost-efficiency.
    if (speed or "").strip().lower() == "fast":
        return _env_int("WORKER_FAST_PREP_DELAY_SECONDS", 0, min_value=0, max_value=120)
    return _env_int("WORKER_RELAX_PREP_DELAY_SECONDS", 4, min_value=0, max_value=120)


def _process_job(job: dict) -> dict[str, Any]:
    """
    Returns:
      {
        storage_key: str,
        content_type: str,
        duration_seconds: float,
        title: str | None,
        extra_clips: list[dict],
        settings_patch: dict | None,
      }
    """
    job_id = int(job["id"])
    kind = str(job.get("kind") or JOB_KIND_VIDEO).strip().lower()
    prompt = str(job.get("prompt") or "").strip()
    aspect_ratio = str(job.get("aspect_ratio") or "9:16").strip()
    duration = int(job.get("duration_seconds") or 6)
    negative_prompt = str(job.get("negative_prompt") or "").strip()
    model = str(job.get("model") or "").strip()
    settings = _parse_settings(str(job.get("settings_json") or "{}"))
    style_preset = str(settings.get("style_preset") or "").strip().lower()
    negative_prompt = _compose_negative_prompt(negative_prompt, style_preset)
    job_seed = _normalize_seed(settings.get("seed"))
    watermark_enabled = bool(settings.get("watermark_enabled", bool(job.get("watermark_enabled", True))))
    captions_enabled = bool(settings.get("captions_enabled", bool(job.get("captions_enabled", False))))
    caption_style_raw = str(settings.get("caption_style_preset") or "").strip().lower()
    if caption_style_raw in {"none", "off", "disabled"}:
        captions_enabled = False
    styled_prompt = _apply_style_preset(prompt, style_preset)
    dialogue_script = _compact_dialogue_script(str(settings.get("dialogue_script") or "").strip(), max_chars=5000)
    styled_prompt_with_dialogue = _merge_narration_with_dialogue(styled_prompt, dialogue_script)
    use_google_provider = _model_prefers_google(model)
    strict_provider = _provider_strict_mode()
    allow_image_fallback = _allow_placeholder_fallback(JOB_KIND_IMAGE)
    allow_voice_fallback = _allow_placeholder_fallback(JOB_KIND_VOICEOVER)
    allow_post_fallback = _allow_placeholder_fallback(JOB_KIND_POST)
    allow_video_fallback = _allow_placeholder_fallback(JOB_KIND_VIDEO)

    # Prevent silent "fake success" outputs (black/text placeholders) for real
    # provider jobs. If provider generation fails, fail the job explicitly.
    if use_google_provider:
        allow_image_fallback = False
        allow_voice_fallback = False
        allow_post_fallback = False
        allow_video_fallback = False

    if kind == JOB_KIND_IMAGE:
        fd, out_path = tempfile.mkstemp(prefix=f"cflabs-image-{job_id}-", suffix=".png")
        os.close(fd)
        try:
            content_type = "image/png"
            provider_title: str | None = None
            provider_capacity_error = False
            image_model_id = _resolve_google_image_model_id(style_preset, task="image")

            if use_google_provider:
                try:
                    if _env("GOOGLE_IMAGE_API_URL", ""):
                        media_bytes, remote_type, _, remote_title = _call_google_generation_endpoint(
                            endpoint_env="GOOGLE_IMAGE_API_URL",
                            payload={
                                "prompt": styled_prompt,
                                "negative_prompt": negative_prompt or None,
                                "aspect_ratio": aspect_ratio,
                                "model": model or "google",
                                "provider_model_id": image_model_id,
                                "seed": job_seed,
                                "settings": settings,
                                "kind": JOB_KIND_IMAGE,
                            },
                        )
                    else:
                        media_bytes, remote_type, _, remote_title = _run_google_vertex_image_generation(
                            prompt=styled_prompt,
                            negative_prompt=negative_prompt,
                            aspect_ratio=aspect_ratio,
                            style_preset=style_preset,
                            seed=job_seed,
                            task="image",
                        )
                    _write_bytes(out_path, media_bytes)
                    if (remote_type or "").startswith("image/"):
                        content_type = remote_type
                    provider_title = remote_title
                except Exception as exc:
                    provider_capacity_error = _is_provider_capacity_error(exc)
                    if strict_provider or not allow_image_fallback:
                        raise RuntimeError(f"Google image generation failed: {exc}") from exc
                    print(f"[worker] image provider fallback job_id={job_id} err={type(exc).__name__}: {exc}")

            if not _file_has_data(out_path):
                if use_google_provider and not allow_image_fallback:
                    raise RuntimeError("Google image generation returned no media payload")
                _run_ffmpeg_text_image(prompt=styled_prompt or "Generated image", aspect_ratio=aspect_ratio, out_path=out_path)

            _apply_image_watermark(image_path=out_path, watermark_enabled=watermark_enabled)
            if watermark_enabled:
                content_type = "image/png"

            ext = _extension_for_content_type(content_type, ".png")
            key = f"assets/images/{job_id}-{uuid.uuid4().hex}{ext}"
            _upload_file(out_path, key, content_type=content_type)
            return {
                "storage_key": key,
                "content_type": content_type,
                "duration_seconds": 0.0,
                "title": _generated_asset_title(
                    kind=JOB_KIND_IMAGE,
                    job_id=job_id,
                    style_preset=style_preset,
                    aspect_ratio=aspect_ratio,
                ),
                "extra_clips": [],
                "settings_patch": None,
            }
        finally:
            try:
                os.unlink(out_path)
            except Exception:
                pass

    if kind == JOB_KIND_VOICEOVER:
        fd, out_path = tempfile.mkstemp(prefix=f"cflabs-voice-{job_id}-", suffix=".mp3")
        os.close(fd)
        try:
            voice_name = str(settings.get("voice_name") or DEFAULT_TTS_VOICE)
            speed = int(settings.get("speed_wpm") or 165)
            provider_capacity_error = False

            if use_google_provider:
                try:
                    _run_google_tts_voiceover(
                        script=prompt or "Untitled voiceover",
                        voice_name=voice_name,
                        speed_wpm=speed,
                        out_path=out_path,
                    )
                except Exception as exc:
                    provider_capacity_error = _is_provider_capacity_error(exc)
                    if strict_provider or not allow_voice_fallback:
                        raise RuntimeError(f"Google voiceover generation failed: {exc}") from exc
                    print(f"[worker] voiceover provider fallback job_id={job_id} err={type(exc).__name__}: {exc}")

            if not _file_has_data(out_path):
                if use_google_provider and not allow_voice_fallback:
                    raise RuntimeError("Google voiceover generation returned no audio payload")
                _run_voiceover(script=prompt or "Untitled voiceover", voice_name=voice_name, speed_wpm=speed, out_path=out_path)

            dur = _probe_audio_duration(out_path)
            content_type = "audio/mpeg"
            ext = _extension_for_content_type(content_type, ".mp3")
            key = f"assets/voiceovers/{job_id}-{uuid.uuid4().hex}{ext}"
            _upload_file(out_path, key, content_type=content_type)
            final_duration = dur if dur > 0 else max(2.0, min(90.0, len(prompt) / 12.0))
            return {
                "storage_key": key,
                "content_type": content_type,
                "duration_seconds": float(final_duration),
                "title": _generated_asset_title(
                    kind=JOB_KIND_VOICEOVER,
                    job_id=job_id,
                    style_preset=style_preset,
                    aspect_ratio=aspect_ratio,
                ),
                "extra_clips": [],
                "settings_patch": None,
            }
        finally:
            try:
                os.unlink(out_path)
            except Exception:
                pass

    if kind == JOB_KIND_POST:
        fd_video, out_path = tempfile.mkstemp(prefix=f"cflabs-post-{job_id}-", suffix=".mp4")
        fd_audio, audio_path = tempfile.mkstemp(prefix=f"cflabs-post-voice-{job_id}-", suffix=".mp3")
        os.close(fd_video)
        os.close(fd_audio)
        image_paths: list[str] = []
        scene_video_paths: list[str] = []
        try:
            raw_visual_prompt = str(settings.get("visual_prompt") or prompt or "Generated visual story").strip()
            visual_prompt = _apply_style_preset(raw_visual_prompt, style_preset)
            scene_beats = _extract_post_scene_beats(raw_visual_prompt)
            post_image_model_id = _resolve_google_image_model_id(style_preset, task="post")
            raw_dialogue_script = _compact_dialogue_script(str(settings.get("dialogue_script") or dialogue_script), max_chars=5000)
            voice_script = str(settings.get("voice_script") or prompt or "Untitled voiceover").strip()
            voice_script = _merge_narration_with_dialogue(voice_script, raw_dialogue_script)
            post_seed = _normalize_seed(settings.get("seed"))
            if post_seed is None:
                post_seed = _stable_seed_from_text(
                    f"{raw_visual_prompt}\n{raw_dialogue_script}\n{voice_script}",
                    salt=f"post:{job_id}",
                )
            character_lock_id = f"CHAR-{post_seed}"
            post_meta = _parse_post_prompt_metadata(raw_visual_prompt)
            character_profile = (
                post_meta.get("main character", "")
                or post_meta.get("protagonist", "")
                or post_meta.get("character", "")
                or post_meta.get("hero", "")
                or post_meta.get("lead", "")
                or post_meta.get("subject", "")
            )
            if not character_profile:
                character_profile = "single recurring protagonist, keep same face, hair, age range, and wardrobe palette"
            voice_name = str(settings.get("voice_name") or DEFAULT_TTS_VOICE).strip() or DEFAULT_TTS_VOICE
            speed = int(settings.get("speed_wpm") or 165)
            provider_capacity_error_voice = False
            post_voice_capacity_retries = _env_int(
                "LABS_POST_VOICE_CAPACITY_RETRIES",
                2,
                min_value=0,
                max_value=8,
            )
            post_voice_capacity_backoff_seconds = _env_int(
                "LABS_POST_VOICE_CAPACITY_BACKOFF_SECONDS",
                6,
                min_value=1,
                max_value=120,
            )
            post_scene_capacity_retries = _env_int(
                "LABS_POST_SCENE_CAPACITY_RETRIES",
                2,
                min_value=0,
                max_value=8,
            )
            post_scene_capacity_backoff_seconds = _env_int(
                "LABS_POST_SCENE_CAPACITY_BACKOFF_SECONDS",
                6,
                min_value=1,
                max_value=120,
            )
            post_attempt_cooldown_seconds = _env_int(
                "LABS_POST_ATTEMPT_COOLDOWN_SECONDS",
                8,
                min_value=0,
                max_value=180,
            )

            image_count_raw = settings.get("image_count")
            try:
                image_count = int(image_count_raw)
            except Exception:
                image_count = _env_int("LABS_POST_DEFAULT_IMAGE_COUNT", 6, min_value=6, max_value=10)
            image_count = max(6, min(10, image_count))
            retry_image_counts: list[int] = [image_count]
            for candidate in (8, 6):
                if candidate < image_count and candidate not in retry_image_counts:
                    retry_image_counts.append(candidate)
            allow_placeholder_post_output = _env("LABS_ALLOW_PLACEHOLDER_POST_OUTPUT", "0").strip().lower() in {
                "1",
                "true",
                "yes",
                "on",
            }
            allow_scene_reuse_on_capacity = _env("LABS_POST_USE_SCENE_REUSE_ON_CAPACITY", "1").strip().lower() in {
                "1",
                "true",
                "yes",
                "on",
            }
            used_placeholder_visuals = False

            if use_google_provider:
                for voice_try in range(post_voice_capacity_retries + 1):
                    try:
                        _run_google_tts_voiceover(
                            script=voice_script or "Untitled voiceover",
                            voice_name=voice_name,
                            speed_wpm=speed,
                            out_path=audio_path,
                        )
                        provider_capacity_error_voice = False
                        break
                    except Exception as exc:
                        provider_capacity_error_voice = _is_provider_capacity_error(exc)
                        if provider_capacity_error_voice:
                            last_voice_try = voice_try >= post_voice_capacity_retries
                            if not last_voice_try:
                                wait_seconds = post_voice_capacity_backoff_seconds * (voice_try + 1)
                                print(
                                    f"[worker] post voice capacity retry job_id={job_id} "
                                    f"attempt={voice_try + 1}/{post_voice_capacity_retries + 1} "
                                    f"sleep={wait_seconds}s err={type(exc).__name__}: {exc}"
                                )
                                time.sleep(wait_seconds)
                                continue
                        if strict_provider or not allow_post_fallback:
                            raise RuntimeError(f"Google post voiceover generation failed: {exc}") from exc
                        print(f"[worker] post voiceover fallback job_id={job_id} err={type(exc).__name__}: {exc}")
                        break

            if not _file_has_data(audio_path):
                if use_google_provider and not allow_post_fallback:
                    raise RuntimeError("Google post voiceover generation returned no audio payload")
                _run_voiceover(
                    script=voice_script or "Untitled voiceover",
                    voice_name=voice_name,
                    speed_wpm=speed,
                    out_path=audio_path,
                )

            target_duration = max(30.0, float(duration or 60))
            audio_duration = _probe_audio_duration(audio_path)
            if audio_duration <= 0:
                _run_fallback_tone_voiceover(
                    script=(voice_script or prompt or "Generated AI post voiceover."),
                    out_path=audio_path,
                )
                audio_duration = _probe_audio_duration(audio_path)
            if audio_duration <= 0:
                raise RuntimeError("Generated AI post voiceover is empty")
            if audio_duration > target_duration:
                target_duration = audio_duration

            # AI Post is image-scene mode for all styles.
            use_video_scene_mode = False

            if use_video_scene_mode:
                def _clear_scene_video_paths() -> None:
                    while scene_video_paths:
                        old_path = scene_video_paths.pop()
                        try:
                            os.unlink(old_path)
                        except Exception:
                            pass

                retry_scene_counts: list[int] = list(retry_image_counts)
                for attempt_idx, attempt_scene_count in enumerate(retry_scene_counts):
                    capacity_hit = False
                    _clear_scene_video_paths()
                    scene_video_duration = max(5, min(7, int(round(float(target_duration) / float(max(1, attempt_scene_count))))))

                    for idx in range(attempt_scene_count):
                        fd_scene, scene_path = tempfile.mkstemp(prefix=f"cflabs-post-video-{job_id}-{idx}-", suffix=".mp4")
                        os.close(fd_scene)
                        scene_video_paths.append(scene_path)

                        scene_prompt = _build_post_scene_prompt(
                            raw_visual_prompt=raw_visual_prompt,
                            style_preset=style_preset,
                            scene_beats=scene_beats,
                            scene_index=idx,
                            scene_count=attempt_scene_count,
                            dialogue_script=raw_dialogue_script,
                            character_profile=character_profile,
                            character_lock_id=character_lock_id,
                        )

                        if use_google_provider:
                            for scene_try in range(post_scene_capacity_retries + 1):
                                try:
                                    if _env("GOOGLE_VIDEO_API_URL", ""):
                                        media_bytes, _, _, _ = _call_google_generation_endpoint(
                                            endpoint_env="GOOGLE_VIDEO_API_URL",
                                            payload={
                                                "prompt": scene_prompt,
                                                "negative_prompt": negative_prompt or None,
                                                "aspect_ratio": aspect_ratio,
                                                "duration_seconds": scene_video_duration,
                                                "generation_speed": "relax",
                                                "model": model or "google",
                                                "provider_model_id": _resolve_google_video_model_id(
                                                    style_preset,
                                                    generation_speed="relax",
                                                ),
                                                "seed": post_seed,
                                                "settings": {
                                                    **settings,
                                                    "scene_index": idx + 1,
                                                    "scene_count": attempt_scene_count,
                                                    "scene_duration_seconds": scene_video_duration,
                                                    "mode": "post_video",
                                                    "seed": post_seed,
                                                    "character_lock_id": character_lock_id,
                                                },
                                                "kind": JOB_KIND_POST,
                                            },
                                        )
                                    else:
                                        media_bytes, _, _, _ = _run_google_vertex_video_generation(
                                            prompt=scene_prompt,
                                            negative_prompt=negative_prompt,
                                            aspect_ratio=aspect_ratio,
                                            duration_seconds=scene_video_duration,
                                            generation_speed="relax",
                                            style_preset=style_preset,
                                            seed=post_seed,
                                        )
                                    _write_bytes(scene_path, media_bytes)
                                    break
                                except Exception as exc:
                                    if _is_provider_capacity_error(exc):
                                        last_scene_try = scene_try >= post_scene_capacity_retries
                                        if not last_scene_try:
                                            wait_seconds = post_scene_capacity_backoff_seconds * (scene_try + 1)
                                            print(
                                                f"[worker] post video capacity retry job_id={job_id} "
                                                f"scene={idx + 1}/{attempt_scene_count} "
                                                f"attempt={scene_try + 1}/{post_scene_capacity_retries + 1} "
                                                f"sleep={wait_seconds}s err={type(exc).__name__}: {exc}"
                                            )
                                            time.sleep(wait_seconds)
                                            continue
                                        capacity_hit = True
                                        print(
                                            f"[worker] post video capacity job_id={job_id} scene={idx + 1}/{attempt_scene_count} "
                                            f"retry_count={attempt_scene_count} err={type(exc).__name__}: {exc}"
                                        )
                                        break
                                    if strict_provider or not allow_post_fallback:
                                        raise RuntimeError(f"Google post video generation failed: {exc}") from exc
                                    print(
                                        f"[worker] post video fallback job_id={job_id} scene={idx + 1}/{attempt_scene_count} "
                                        f"err={type(exc).__name__}: {exc}"
                                    )
                                    break

                        if capacity_hit:
                            break

                        if not _file_has_data(scene_path):
                            if use_google_provider and not allow_post_fallback:
                                raise RuntimeError("Google post video generation returned no media payload")
                            used_placeholder_visuals = True
                            _run_ffmpeg_text_video(
                                prompt=_post_scene_fallback_text(
                                    raw_visual_prompt=visual_prompt,
                                    scene_index=idx,
                                    scene_count=attempt_scene_count,
                                ),
                                duration=scene_video_duration,
                                aspect_ratio=aspect_ratio,
                                out_path=scene_path,
                            )

                    if capacity_hit:
                        if allow_scene_reuse_on_capacity:
                            valid_scene_paths = [p for p in scene_video_paths if _file_has_data(p)]
                            if valid_scene_paths:
                                for existing in list(scene_video_paths):
                                    if existing in valid_scene_paths:
                                        continue
                                    try:
                                        os.unlink(existing)
                                    except Exception:
                                        pass
                                scene_video_paths = list(valid_scene_paths)

                                missing_count = max(0, attempt_scene_count - len(scene_video_paths))
                                for fill_idx in range(missing_count):
                                    fd_scene, dup_scene_path = tempfile.mkstemp(
                                        prefix=f"cflabs-post-video-reuse-{job_id}-{fill_idx}-",
                                        suffix=".mp4",
                                    )
                                    os.close(fd_scene)
                                    src_path = valid_scene_paths[fill_idx % len(valid_scene_paths)]
                                    shutil.copyfile(src_path, dup_scene_path)
                                    scene_video_paths.append(dup_scene_path)

                                print(
                                    f"[worker] post video capacity recovery job_id={job_id} "
                                    f"scene_count={attempt_scene_count} reused_scenes={missing_count}"
                                )
                                capacity_hit = False

                    if capacity_hit:
                        last_attempt = attempt_idx >= (len(retry_scene_counts) - 1)
                        if last_attempt:
                            if not strict_provider and allow_post_fallback:
                                print(
                                    f"[worker] post video final capacity fallback job_id={job_id} "
                                    f"retry_count={attempt_scene_count} using local placeholder scenes"
                                )
                                _clear_scene_video_paths()
                                for idx in range(attempt_scene_count):
                                    fd_scene, scene_path = tempfile.mkstemp(
                                        prefix=f"cflabs-post-video-fallback-{job_id}-{idx}-",
                                        suffix=".mp4",
                                    )
                                    os.close(fd_scene)
                                    scene_video_paths.append(scene_path)
                                    _run_ffmpeg_text_video(
                                        prompt=_post_scene_fallback_text(
                                            raw_visual_prompt=visual_prompt,
                                            scene_index=idx,
                                            scene_count=attempt_scene_count,
                                        ),
                                        duration=scene_video_duration,
                                        aspect_ratio=aspect_ratio,
                                        out_path=scene_path,
                                    )
                                used_placeholder_visuals = True
                                break
                            raise RuntimeError("Generation queue is at provider capacity. Retry in a few minutes.")
                        if post_attempt_cooldown_seconds > 0:
                            print(
                                f"[worker] post video retry ladder cooldown job_id={job_id} "
                                f"next_count={retry_scene_counts[min(attempt_idx + 1, len(retry_scene_counts) - 1)]} "
                                f"sleep={post_attempt_cooldown_seconds}s"
                            )
                            time.sleep(post_attempt_cooldown_seconds)
                        continue
                    break

                if not scene_video_paths:
                    raise RuntimeError("Post generation failed before video scene rendering completed.")
                if used_placeholder_visuals and not allow_placeholder_post_output:
                    raise RuntimeError(
                        "Generation queue is at provider capacity. Retry in a few minutes for full visual output."
                    )

                final_duration = _render_video_scene_montage(
                    scene_video_paths=scene_video_paths,
                    audio_path=audio_path,
                    aspect_ratio=aspect_ratio,
                    target_duration=target_duration,
                    out_path=out_path,
                )
                base_title = _generated_asset_title(
                    kind=JOB_KIND_POST,
                    job_id=job_id,
                    style_preset=style_preset,
                    aspect_ratio=aspect_ratio,
                )
                caption_style_preset = str(settings.get("caption_style_preset") or "bold_center").strip().lower()
                word_caption_events: list[dict[str, float | str]] = []
                if captions_enabled:
                    word_caption_events = _build_word_caption_events(
                        voice_script,
                        final_duration if final_duration > 0 else target_duration,
                    )

                subtitles_path: str | None = None
                if captions_enabled and word_caption_events:
                    subtitles_path = _write_word_by_word_srt(word_caption_events)

                fd_overlay, overlay_path = tempfile.mkstemp(prefix=f"cflabs-post-overlay-{job_id}-", suffix=".mp4")
                os.close(fd_overlay)
                try:
                    _apply_video_overlays(
                        src_path=out_path,
                        out_path=overlay_path,
                        watermark_enabled=watermark_enabled,
                        subtitles_path=subtitles_path,
                        caption_style_preset=caption_style_preset,
                        aspect_ratio=aspect_ratio,
                    )
                    shutil.move(overlay_path, out_path)
                finally:
                    if os.path.exists(overlay_path):
                        try:
                            os.unlink(overlay_path)
                        except Exception:
                            pass
                    if subtitles_path:
                        try:
                            os.unlink(subtitles_path)
                        except Exception:
                            pass

                final_ok, probed_final_duration = _valid_video_file(out_path)
                if not final_ok:
                    raise RuntimeError("Generated post output is invalid or unreadable (video stream missing).")
                final_duration = probed_final_duration if probed_final_duration > 0 else final_duration

                key = f"clips/generated-posts/{job_id}-{uuid.uuid4().hex}.mp4"
                _upload_file(out_path, key, content_type="video/mp4")

                extra_clips: list[dict[str, Any]] = []
                voice_key = f"assets/post-voiceovers/{job_id}-{uuid.uuid4().hex}.mp3"
                _upload_file(audio_path, voice_key, content_type="audio/mpeg")

                scene_keys: list[str] = []
                scene_count = max(1, len(scene_video_paths))
                for idx, scene_path in enumerate(scene_video_paths):
                    upload_scene_path = scene_path
                    scene_tmp_copy = ""
                    if watermark_enabled:
                        fd_scene_copy, scene_tmp_copy = tempfile.mkstemp(
                            prefix=f"cflabs-post-scene-wm-{job_id}-{idx}-",
                            suffix=".mp4",
                        )
                        os.close(fd_scene_copy)
                        _apply_video_overlays(
                            src_path=scene_path,
                            out_path=scene_tmp_copy,
                            watermark_enabled=True,
                            subtitles_path=None,
                            caption_style_preset=None,
                            aspect_ratio=aspect_ratio,
                        )
                        upload_scene_path = scene_tmp_copy
                    scene_key = f"assets/post-scenes-video/{job_id}-{idx + 1:02d}-{uuid.uuid4().hex}.mp4"
                    _upload_file(upload_scene_path, scene_key, content_type="video/mp4")
                    scene_keys.append(scene_key)
                    if scene_tmp_copy:
                        try:
                            os.unlink(scene_tmp_copy)
                        except Exception:
                            pass

                settings_patch: dict[str, Any] = {
                    "generated_scene_count": int(scene_count),
                    "generated_scene_storage_keys": scene_keys,
                    "generated_scene_media_type": "video",
                    "generated_voiceover_key": voice_key,
                    "generated_word_captions": word_caption_events,
                }
                return {
                    "storage_key": key,
                    "content_type": "video/mp4",
                    "duration_seconds": float(final_duration),
                    "title": base_title,
                    "extra_clips": extra_clips,
                    "settings_patch": settings_patch,
                }

            def _clear_image_paths() -> None:
                while image_paths:
                    old_path = image_paths.pop()
                    try:
                        os.unlink(old_path)
                    except Exception:
                        pass

            for attempt_idx, attempt_image_count in enumerate(retry_image_counts):
                capacity_hit = False
                _clear_image_paths()

                for idx in range(attempt_image_count):
                    fd_img, img_path = tempfile.mkstemp(prefix=f"cflabs-post-img-{job_id}-{idx}-", suffix=".png")
                    os.close(fd_img)
                    image_paths.append(img_path)

                    scene_prompt = _build_post_scene_prompt(
                        raw_visual_prompt=raw_visual_prompt,
                        style_preset=style_preset,
                        scene_beats=scene_beats,
                        scene_index=idx,
                        scene_count=attempt_image_count,
                        dialogue_script=raw_dialogue_script,
                        character_profile=character_profile,
                        character_lock_id=character_lock_id,
                    )

                    if use_google_provider:
                        for scene_try in range(post_scene_capacity_retries + 1):
                            try:
                                if _env("GOOGLE_IMAGE_API_URL", ""):
                                    media_bytes, _, _, _ = _call_google_generation_endpoint(
                                        endpoint_env="GOOGLE_IMAGE_API_URL",
                                        payload={
                                            "prompt": scene_prompt,
                                            "negative_prompt": negative_prompt or None,
                                            "aspect_ratio": aspect_ratio,
                                            "model": model or "google",
                                            "provider_model_id": post_image_model_id,
                                            "seed": post_seed,
                                            "settings": {
                                                **settings,
                                                "scene_index": idx + 1,
                                                "scene_count": attempt_image_count,
                                                "mode": "post",
                                                "seed": post_seed,
                                                "character_lock_id": character_lock_id,
                                            },
                                            "kind": JOB_KIND_POST,
                                        },
                                    )
                                else:
                                    media_bytes, _, _, _ = _run_google_vertex_image_generation(
                                        prompt=scene_prompt,
                                        negative_prompt=negative_prompt,
                                        aspect_ratio=aspect_ratio,
                                        style_preset=style_preset,
                                        seed=post_seed,
                                        task="post",
                                    )
                                _write_bytes(img_path, media_bytes)
                                break
                            except Exception as exc:
                                if _is_provider_capacity_error(exc):
                                    last_scene_try = scene_try >= post_scene_capacity_retries
                                    if not last_scene_try:
                                        wait_seconds = post_scene_capacity_backoff_seconds * (scene_try + 1)
                                        print(
                                            f"[worker] post image capacity retry job_id={job_id} "
                                            f"scene={idx + 1}/{attempt_image_count} "
                                            f"attempt={scene_try + 1}/{post_scene_capacity_retries + 1} "
                                            f"sleep={wait_seconds}s err={type(exc).__name__}: {exc}"
                                        )
                                        time.sleep(wait_seconds)
                                        continue
                                    capacity_hit = True
                                    print(
                                        f"[worker] post image capacity job_id={job_id} scene={idx + 1}/{attempt_image_count} "
                                        f"retry_count={attempt_image_count} err={type(exc).__name__}: {exc}"
                                    )
                                    break
                                if strict_provider or not allow_post_fallback:
                                    raise RuntimeError(f"Google post image generation failed: {exc}") from exc
                                print(
                                    f"[worker] post image fallback job_id={job_id} scene={idx + 1}/{attempt_image_count} "
                                    f"err={type(exc).__name__}: {exc}"
                                )
                                break

                    if capacity_hit:
                        break

                    if not _file_has_data(img_path):
                        if use_google_provider and not allow_post_fallback:
                            raise RuntimeError("Google post image generation returned no media payload")
                        used_placeholder_visuals = True
                        _run_ffmpeg_text_image(
                            prompt=_post_scene_fallback_text(
                                raw_visual_prompt=visual_prompt,
                                scene_index=idx,
                                scene_count=attempt_image_count,
                            ),
                            aspect_ratio=aspect_ratio,
                            out_path=img_path,
                        )

                if capacity_hit:
                    if allow_scene_reuse_on_capacity:
                        valid_image_paths = [p for p in image_paths if _file_has_data(p)]
                        if valid_image_paths:
                            for existing in list(image_paths):
                                if existing in valid_image_paths:
                                    continue
                                try:
                                    os.unlink(existing)
                                except Exception:
                                    pass
                            image_paths = list(valid_image_paths)

                            missing_count = max(0, attempt_image_count - len(image_paths))
                            for fill_idx in range(missing_count):
                                fd_img, img_path = tempfile.mkstemp(
                                    prefix=f"cflabs-post-img-reuse-{job_id}-{fill_idx}-",
                                    suffix=".png",
                                )
                                os.close(fd_img)
                                src_path = valid_image_paths[fill_idx % len(valid_image_paths)]
                                shutil.copyfile(src_path, img_path)
                                image_paths.append(img_path)

                            print(
                                f"[worker] post image capacity recovery job_id={job_id} "
                                f"scene_count={attempt_image_count} reused_frames={missing_count}"
                            )
                            capacity_hit = False

                if capacity_hit:
                    last_attempt = attempt_idx >= (len(retry_image_counts) - 1)
                    if last_attempt:
                        if not strict_provider and allow_post_fallback:
                            print(
                                f"[worker] post image final capacity fallback job_id={job_id} "
                                f"retry_count={attempt_image_count} using local placeholder scenes"
                            )
                            _clear_image_paths()
                            for idx in range(attempt_image_count):
                                fd_img, img_path = tempfile.mkstemp(
                                    prefix=f"cflabs-post-img-fallback-{job_id}-{idx}-",
                                    suffix=".png",
                                )
                                os.close(fd_img)
                                image_paths.append(img_path)
                                _run_ffmpeg_text_image(
                                    prompt=_post_scene_fallback_text(
                                        raw_visual_prompt=visual_prompt,
                                        scene_index=idx,
                                        scene_count=attempt_image_count,
                                    ),
                                    aspect_ratio=aspect_ratio,
                                    out_path=img_path,
                                )
                            used_placeholder_visuals = True
                            break
                        raise RuntimeError("Generation queue is at provider capacity. Retry in a few minutes.")
                    if post_attempt_cooldown_seconds > 0:
                        print(
                            f"[worker] post retry ladder cooldown job_id={job_id} "
                            f"next_count={retry_image_counts[min(attempt_idx + 1, len(retry_image_counts) - 1)]} "
                            f"sleep={post_attempt_cooldown_seconds}s"
                        )
                        time.sleep(post_attempt_cooldown_seconds)
                    continue
                break

            if not image_paths:
                raise RuntimeError("Post generation failed before image rendering completed.")
            if used_placeholder_visuals and not allow_placeholder_post_output:
                raise RuntimeError(
                    "Generation queue is at provider capacity. Retry in a few minutes for full visual output."
                )

            final_duration = _render_image_slideshow_video(
                image_paths=image_paths,
                audio_path=audio_path,
                aspect_ratio=aspect_ratio,
                target_duration=target_duration,
                out_path=out_path,
            )
            base_title = _generated_asset_title(
                kind=JOB_KIND_POST,
                job_id=job_id,
                style_preset=style_preset,
                aspect_ratio=aspect_ratio,
            )
            caption_style_preset = str(settings.get("caption_style_preset") or "bold_center").strip().lower()
            word_caption_events: list[dict[str, float | str]] = []
            if captions_enabled:
                word_caption_events = _build_word_caption_events(
                    voice_script,
                    final_duration if final_duration > 0 else target_duration,
                )

            subtitles_path: str | None = None
            if captions_enabled and word_caption_events:
                subtitles_path = _write_word_by_word_srt(word_caption_events)

            fd_overlay, overlay_path = tempfile.mkstemp(prefix=f"cflabs-post-overlay-{job_id}-", suffix=".mp4")
            os.close(fd_overlay)
            try:
                _apply_video_overlays(
                    src_path=out_path,
                    out_path=overlay_path,
                    watermark_enabled=watermark_enabled,
                    subtitles_path=subtitles_path,
                    caption_style_preset=caption_style_preset,
                    aspect_ratio=aspect_ratio,
                )
                shutil.move(overlay_path, out_path)
            finally:
                if os.path.exists(overlay_path):
                    try:
                        os.unlink(overlay_path)
                    except Exception:
                        pass
                if subtitles_path:
                    try:
                        os.unlink(subtitles_path)
                    except Exception:
                        pass

            final_ok, probed_final_duration = _valid_video_file(out_path)
            if not final_ok:
                raise RuntimeError("Generated post output is invalid or unreadable (video stream missing).")
            final_duration = probed_final_duration if probed_final_duration > 0 else final_duration

            key = f"clips/generated-posts/{job_id}-{uuid.uuid4().hex}.mp4"
            _upload_file(out_path, key, content_type="video/mp4")

            extra_clips: list[dict[str, Any]] = []
            voice_key = f"assets/post-voiceovers/{job_id}-{uuid.uuid4().hex}.mp3"
            _upload_file(audio_path, voice_key, content_type="audio/mpeg")

            scene_keys: list[str] = []
            scene_count = max(1, len(image_paths))
            for idx, scene_path in enumerate(image_paths):
                upload_scene_path = scene_path
                scene_tmp_copy = ""
                if watermark_enabled:
                    fd_scene_copy, scene_tmp_copy = tempfile.mkstemp(
                        prefix=f"cflabs-post-scene-wm-{job_id}-{idx}-",
                        suffix=".png",
                    )
                    os.close(fd_scene_copy)
                    shutil.copyfile(scene_path, scene_tmp_copy)
                    _apply_image_watermark(image_path=scene_tmp_copy, watermark_enabled=True)
                    upload_scene_path = scene_tmp_copy
                scene_key = f"assets/post-scenes/{job_id}-{idx + 1:02d}-{uuid.uuid4().hex}.png"
                _upload_file(upload_scene_path, scene_key, content_type="image/png")
                scene_keys.append(scene_key)
                if scene_tmp_copy:
                    try:
                        os.unlink(scene_tmp_copy)
                    except Exception:
                        pass

            settings_patch: dict[str, Any] = {
                "generated_scene_count": int(scene_count),
                "generated_scene_storage_keys": scene_keys,
                "generated_voiceover_key": voice_key,
                "generated_word_captions": word_caption_events,
            }
            return {
                "storage_key": key,
                "content_type": "video/mp4",
                "duration_seconds": float(final_duration),
                "title": base_title,
                "extra_clips": extra_clips,
                "settings_patch": settings_patch,
            }
        finally:
            try:
                os.unlink(out_path)
            except Exception:
                pass
            try:
                os.unlink(audio_path)
            except Exception:
                pass
            for img_path in image_paths:
                try:
                    os.unlink(img_path)
                except Exception:
                    pass
            for scene_path in scene_video_paths:
                try:
                    os.unlink(scene_path)
                except Exception:
                    pass

    # Default video generation
    fd, out_path = tempfile.mkstemp(prefix=f"cflabs-video-{job_id}-", suffix=".mp4")
    os.close(fd)
    try:
        generation_speed = str(settings.get("generation_speed") or "relax").strip().lower()
        voice_name = str(settings.get("voice_name") or "").strip()
        voice_mode = str(settings.get("voice_mode") or "").strip().lower()
        voice_enabled = bool(voice_name)
        content_type = "video/mp4"
        provider_duration: float | None = None
        provider_title: str | None = None
        provider_generated = False
        used_fallback_renderer = False

        if use_google_provider:
            try:
                video_model_id = _resolve_google_video_model_id(style_preset, generation_speed=generation_speed)
                if _env("GOOGLE_VIDEO_API_URL", ""):
                    media_bytes, remote_type, remote_duration, remote_title = _call_google_generation_endpoint(
                        endpoint_env="GOOGLE_VIDEO_API_URL",
                        payload={
                            "prompt": styled_prompt_with_dialogue,
                            "negative_prompt": negative_prompt or None,
                            "aspect_ratio": aspect_ratio,
                            "duration_seconds": duration,
                            "generation_speed": generation_speed,
                            "model": model or "google",
                            "provider_model_id": video_model_id,
                            "seed": job_seed,
                            "settings": settings,
                            "kind": JOB_KIND_VIDEO,
                        },
                    )
                else:
                    media_bytes, remote_type, remote_duration, remote_title = _run_google_vertex_video_generation(
                        prompt=styled_prompt_with_dialogue,
                        negative_prompt=negative_prompt,
                        aspect_ratio=aspect_ratio,
                        duration_seconds=duration,
                        generation_speed=generation_speed,
                        style_preset=style_preset,
                        seed=job_seed,
                    )
                _write_bytes(out_path, media_bytes)
                provider_generated = True
                if (remote_type or "").startswith("video/"):
                    content_type = remote_type
                if isinstance(remote_duration, (int, float)) and float(remote_duration) > 0:
                    provider_duration = float(remote_duration)
                provider_title = remote_title
            except Exception as exc:
                if strict_provider or not allow_video_fallback:
                    raise RuntimeError(f"Google video generation failed: {exc}") from exc
                print(f"[worker] video provider fallback job_id={job_id} err={type(exc).__name__}: {exc}")

        valid_video, detected_duration = _valid_video_file(out_path, reject_mostly_black=provider_generated)
        if not valid_video:
            if provider_generated and (strict_provider or not allow_video_fallback):
                raise RuntimeError("Google video generation produced an invalid video payload")
            prep_delay = _video_mode_prep_delay_seconds(generation_speed)
            if prep_delay > 0:
                time.sleep(prep_delay)
            _run_ffmpeg_text_video(
                prompt=styled_prompt_with_dialogue or "Untitled",
                duration=duration,
                aspect_ratio=aspect_ratio,
                out_path=out_path,
            )
            used_fallback_renderer = True
            valid_video, detected_duration = _valid_video_file(out_path)
            if not valid_video:
                raise RuntimeError("Fallback video renderer produced an invalid output")

        requested_duration = max(0.35, float(duration or 0.35))
        if provider_generated and detected_duration > (requested_duration + 0.35):
            fd_trim, trim_path = tempfile.mkstemp(prefix=f"cflabs-video-trim-{job_id}-", suffix=".mp4")
            os.close(fd_trim)
            try:
                _trim_video_to_duration(
                    src_path=out_path,
                    out_path=trim_path,
                    duration_seconds=requested_duration,
                )
                shutil.move(trim_path, out_path)
            finally:
                if os.path.exists(trim_path):
                    try:
                        os.unlink(trim_path)
                    except Exception:
                        pass
            valid_video, detected_duration = _valid_video_file(
                out_path,
                reject_mostly_black=provider_generated,
            )
            if not valid_video:
                raise RuntimeError("Trimmed provider video is unreadable")

        if detected_duration > 0 and detected_duration + 0.35 < requested_duration:
            fd_pad, pad_path = tempfile.mkstemp(prefix=f"cflabs-video-pad-{job_id}-", suffix=".mp4")
            os.close(fd_pad)
            try:
                _pad_video_to_duration(
                    src_path=out_path,
                    out_path=pad_path,
                    target_seconds=requested_duration,
                    current_seconds=detected_duration,
                )
                shutil.move(pad_path, out_path)
            finally:
                if os.path.exists(pad_path):
                    try:
                        os.unlink(pad_path)
                    except Exception:
                        pass
            valid_video, detected_duration = _valid_video_file(
                out_path,
                reject_mostly_black=provider_generated,
            )
            if not valid_video:
                raise RuntimeError("Padded provider video is unreadable")

        if watermark_enabled:
            fd_overlay, overlay_path = tempfile.mkstemp(prefix=f"cflabs-video-overlay-{job_id}-", suffix=".mp4")
            os.close(fd_overlay)
            try:
                _apply_video_overlays(
                    src_path=out_path,
                    out_path=overlay_path,
                    watermark_enabled=True,
                    subtitles_path=None,
                    caption_style_preset=None,
                    aspect_ratio=aspect_ratio,
                )
                shutil.move(overlay_path, out_path)
            finally:
                if os.path.exists(overlay_path):
                    try:
                        os.unlink(overlay_path)
                    except Exception:
                        pass

        if voice_enabled:
            fd_voice, voice_path = tempfile.mkstemp(prefix=f"cflabs-video-voice-{job_id}-", suffix=".mp3")
            os.close(fd_voice)
            try:
                if voice_mode == "dialogue":
                    _render_dialogue_voiceover(
                        script=dialogue_script or prompt or "Untitled voiceover",
                        voice_name=voice_name,
                        speed_wpm=POST_BASE_VOICE_WPM,
                        out_path=voice_path,
                    )
                else:
                    _run_google_tts_voiceover(
                        script=prompt or "Untitled voiceover",
                        voice_name=voice_name,
                        speed_wpm=POST_BASE_VOICE_WPM,
                        out_path=voice_path,
                    )

                fd_mix, mix_path = tempfile.mkstemp(prefix=f"cflabs-video-mix-{job_id}-", suffix=".mp4")
                os.close(fd_mix)
                try:
                    mix_cmd = [
                        "ffmpeg",
                        "-y",
                        "-i",
                        out_path,
                        "-i",
                        voice_path,
                        "-map",
                        "0:v:0",
                        "-map",
                        "1:a:0",
                        "-c:v",
                        "copy",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "160k",
                        "-shortest",
                        "-movflags",
                        "+faststart",
                        mix_path,
                    ]
                    mix_proc = _run_media_cmd(mix_cmd, timeout_seconds=max(120, _media_cmd_timeout_seconds()))
                    if mix_proc.returncode != 0:
                        raise RuntimeError((mix_proc.stderr or mix_proc.stdout or "ffmpeg voice mux failed").strip()[:500])
                    shutil.move(mix_path, out_path)
                finally:
                    if os.path.exists(mix_path):
                        try:
                            os.unlink(mix_path)
                        except Exception:
                            pass
            finally:
                try:
                    os.unlink(voice_path)
                except Exception:
                    pass

        valid_video, detected_duration = _valid_video_file(
            out_path,
            reject_mostly_black=provider_generated and not used_fallback_renderer,
        )
        if not valid_video:
            raise RuntimeError("Video post-processing produced an unreadable output")

        ext = _extension_for_content_type(content_type, ".mp4")
        key = f"clips/generated/{job_id}-{uuid.uuid4().hex}{ext}"
        _upload_file(out_path, key, content_type=content_type)
        final_duration = (
            detected_duration
            if detected_duration > 0
            else provider_duration
            if provider_duration and provider_duration > 0
            else float(max(2, duration))
        )
        return {
            "storage_key": key,
            "content_type": content_type,
            "duration_seconds": float(final_duration),
            "title": _generated_asset_title(
                kind=JOB_KIND_VIDEO,
                job_id=job_id,
                style_preset=style_preset,
                aspect_ratio=aspect_ratio,
            ),
            "extra_clips": [],
            "settings_patch": None,
        }
    finally:
        try:
            os.unlink(out_path)
        except Exception:
            pass


def main() -> None:
    load_dotenv()

    poll = max(2, int(_env("WORKER_POLL_SECONDS", "5")))
    engine = _connect_engine()
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    print(f"[worker] orbito-labs generation worker starting (db={_db_url()})")

    while True:
        try:
            with Session() as db:
                job = _claim_next_generate_job(db)
                if not job:
                    db.commit()
                    time.sleep(poll)
                    continue
                db.commit()

                job_id = int(job["id"])
                upload_id = int(job["upload_id"])
                kind = str(job.get("kind") or JOB_KIND_VIDEO)

                try:
                    if _job_is_canceled(db, job_id):
                        db.commit()
                        print(f"[worker] canceled before processing kind={kind} job_id={job_id}")
                        continue

                    result = _process_job(job)
                    key = str(result.get("storage_key") or "")
                    content_type = str(result.get("content_type") or "application/octet-stream")
                    duration_seconds = float(result.get("duration_seconds") or 0.0)
                    title = result.get("title")
                    extra_clips = result.get("extra_clips") if isinstance(result.get("extra_clips"), list) else []
                    settings_patch = result.get("settings_patch") if isinstance(result.get("settings_patch"), dict) else None

                    if not key:
                        raise RuntimeError("Generation returned no storage key")

                    if _job_is_canceled(db, job_id):
                        _cleanup_result_storage(result)
                        db.commit()
                        print(f"[worker] canceled after render; skipped publish kind={kind} job_id={job_id}")
                        continue

                    _insert_clip(
                        db,
                        upload_id=upload_id,
                        job_id=job_id,
                        storage_key=key,
                        duration_seconds=duration_seconds,
                        title=str(title) if isinstance(title, str) else None,
                    )
                    for extra in extra_clips:
                        if not isinstance(extra, dict):
                            continue
                        extra_key = str(extra.get("storage_key") or "").strip()
                        if not extra_key:
                            continue
                        _insert_clip(
                            db,
                            upload_id=upload_id,
                            job_id=job_id,
                            storage_key=extra_key,
                            duration_seconds=float(extra.get("duration_seconds") or 0.0),
                            start_time=float(extra.get("start_time") or 0.0),
                            title=str(extra.get("title") or "").strip() or None,
                            hook=str(extra.get("hook") or "").strip() or None,
                        )
                    if settings_patch:
                        _merge_job_settings(db, job_id=job_id, patch=settings_patch)

                    if _job_is_canceled(db, job_id):
                        removed = _delete_job_clips(db, job_id)
                        db.commit()
                        print(
                            f"[worker] canceled during finalize; removed_clips={removed} "
                            f"kind={kind} job_id={job_id}"
                        )
                        continue

                    updated = _mark_job_status(
                        db,
                        job_id,
                        "done",
                        None,
                        only_if_current="running",
                    )
                    if updated != 1:
                        removed = _delete_job_clips(db, job_id)
                        db.commit()
                        print(
                            f"[worker] finalize skipped (status changed); removed_clips={removed} "
                            f"kind={kind} job_id={job_id}"
                        )
                        continue

                    db.commit()
                    print(f"[worker] generated asset kind={kind} job_id={job_id} key={key} content_type={content_type}")
                except Exception as exc:
                    if _job_is_canceled(db, job_id):
                        try:
                            removed = _delete_job_clips(db, job_id)
                            db.commit()
                        except Exception:
                            db.rollback()
                            removed = 0
                        print(
                            f"[worker] canceled during processing; removed_clips={removed} "
                            f"kind={kind} job_id={job_id} err={type(exc).__name__}: {exc}"
                        )
                        continue

                    refunded = 0
                    try:
                        refunded = _refund_reserved_credits(db, job_id)
                        _mark_job_status(
                            db,
                            job_id,
                            "failed",
                            str(exc)[:500],
                            only_if_current="running",
                        )
                        db.commit()
                    except Exception:
                        db.rollback()
                    if refunded:
                        print(f"[worker] refunded {refunded} credits for failed job_id={job_id}")
                    print(f"[worker] job failed kind={kind} job_id={job_id} err={type(exc).__name__}: {exc}")
        except SQLAlchemyError as exc:
            print(f"[worker] database unavailable, retrying in {poll}s: {type(exc).__name__}: {exc}")
            time.sleep(poll)


if __name__ == "__main__":
    main()
