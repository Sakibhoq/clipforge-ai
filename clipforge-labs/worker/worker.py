from __future__ import annotations

import base64
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
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

JOB_KIND_VIDEO = "generate"
JOB_KIND_IMAGE = "generate_image"
JOB_KIND_VOICEOVER = "generate_voiceover"
JOB_KIND_POST = "generate_post"
LOW_COST_STYLE_PRESETS = {"anime", "cartoon", "comic"}


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


def _db_url() -> str:
    v = _env("DATABASE_URL", "")
    if v:
        return v
    # Match backend default path when running with the compose /data volume.
    return "sqlite:////data/app.db"


def _connect_engine():
    url = _db_url()
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


def _storage_backend() -> str:
    return _env("STORAGE_BACKEND", "local").lower()


def _uses_object_storage_backend(backend: str | None) -> bool:
    return (backend or "").strip().lower() in {"s3", "gcs"}


def _local_storage_path() -> str:
    # Used when STORAGE_BACKEND=local. In docker compose we mount ./data -> /data.
    return os.path.abspath(_env("LOCAL_STORAGE_PATH", "/data/storage"))


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


def _provider_strict_mode() -> bool:
    return _env_bool("LABS_GENERATION_STRICT", False)


def _allow_demo_fallback() -> bool:
    """
    Demo fallback generates placeholder media when provider calls fail.
    Keep disabled by default for production so users only receive real AI output.
    """
    return _env_bool("LABS_ALLOW_DEMO_FALLBACK", False)


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
    style = _normalize_style_preset(style_preset)
    if style not in LOW_COST_STYLE_PRESETS:
        return False
    return _env_bool("GOOGLE_USE_LOW_COST_MODELS_FOR_STYLIZED", True)


def _style_env_suffix(style_preset: str | None) -> str:
    return _normalize_style_preset(style_preset).replace("-", "_").upper()


def _resolve_google_image_model_id(style_preset: str | None, *, task: str = "image") -> str:
    task_key = (task or "image").strip().lower()
    style_suffix = _style_env_suffix(style_preset)
    default_model = _env("GOOGLE_IMAGE_MODEL_ID", "imagen-3.0-generate-002")
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
    low_cost_default = _env("GOOGLE_IMAGE_FAST_MODEL_ID", "imagen-4.0-fast-generate-001")
    low_cost_model = _env("GOOGLE_IMAGE_LOW_COST_MODEL_ID", low_cost_default)
    if task_key == "post":
        low_cost_model = _env("GOOGLE_POST_IMAGE_LOW_COST_MODEL_ID", low_cost_model)
    return low_cost_model or default_model


def _resolve_google_video_model_id(style_preset: str | None) -> str:
    style_suffix = _style_env_suffix(style_preset)
    default_model = _env("GOOGLE_VIDEO_MODEL_ID", "veo-2.0-generate-001")
    style_model = _env(f"GOOGLE_VIDEO_MODEL_ID_{style_suffix}", "")
    if style_model:
        return style_model
    if not _is_low_cost_style(style_preset):
        return default_model
    low_cost_default = _env("GOOGLE_VIDEO_FAST_MODEL_ID", "veo-3.1-fast-generate-001")
    low_cost_model = _env("GOOGLE_VIDEO_LOW_COST_MODEL_ID", low_cost_default)
    return low_cost_model or default_model


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
    env_project = _env("GOOGLE_VERTEX_PROJECT_ID", "")
    if env_project:
        return env_project
    try:
        import requests
    except Exception as exc:
        raise RuntimeError("requests package missing in worker image") from exc
    md_url = "http://metadata.google.internal/computeMetadata/v1/project/project-id"
    resp = requests.get(md_url, headers={"Metadata-Flavor": "Google"}, timeout=2)
    if resp.status_code < 400 and (resp.text or "").strip():
        return resp.text.strip()
    raise RuntimeError("GOOGLE_VERTEX_PROJECT_ID is required (or run worker on GCE with metadata access)")


def _google_access_token() -> str:
    raw = _env("GOOGLE_API_BEARER_TOKEN", "")
    if raw:
        token = raw.replace("Bearer ", "").strip()
        if token:
            return token
    try:
        import requests
    except Exception as exc:
        raise RuntimeError("requests package missing in worker image") from exc
    md_url = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
    resp = requests.get(md_url, headers={"Metadata-Flavor": "Google"}, timeout=2)
    if resp.status_code >= 400:
        raise RuntimeError("Failed to fetch Google access token from metadata server")
    data = resp.json() if resp.content else {}
    token = str((data or {}).get("access_token") or "").strip()
    if not token:
        raise RuntimeError("Google metadata token response missing access_token")
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
    style_preset: str | None = None,
    _allow_model_fallback: bool = True,
) -> tuple[bytes, str, float | None, str | None]:
    project_id = _google_project_id()
    location = _env("GOOGLE_VERTEX_LOCATION", "us-central1")
    default_model_id = _resolve_google_video_model_id("real")
    model_id = _resolve_google_video_model_id(style_preset)
    headers = _google_auth_headers()

    endpoint_base = (
        f"https://{location}-aiplatform.googleapis.com/v1/"
        f"projects/{project_id}/locations/{location}/publishers/google/models/{model_id}"
    )
    start_url = f"{endpoint_base}:predictLongRunning"
    fetch_url = f"{endpoint_base}:fetchPredictOperation"

    max_duration = _env_int("GOOGLE_VIDEO_MAX_DURATION_SECONDS", 12, min_value=4, max_value=120)
    safe_duration = max(4, min(int(duration_seconds or 6), max_duration))
    safe_ar = aspect_ratio if aspect_ratio in {"9:16", "16:9"} else "9:16"

    output_storage_uri = _env("GOOGLE_VIDEO_OUTPUT_GCS_URI", "")
    if not output_storage_uri:
        bucket = _env("S3_BUCKET", "")
        if bucket:
            output_storage_uri = f"gs://{bucket}/generated/"

    params: dict[str, Any] = {
        "sampleCount": 1,
        "durationSeconds": safe_duration,
        "aspectRatio": safe_ar,
        "enhancePrompt": _env_bool("GOOGLE_VIDEO_ENHANCE_PROMPT", True),
    }
    if negative_prompt:
        params["negativePrompt"] = negative_prompt[:1200]
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
            return _decode_base64_payload(b64_val), "video/mp4", float(safe_duration), _title_from_prompt(prompt)

        gcs_uri = _find_first_string_by_keys(result_obj, {"gcsUri"})
        if gcs_uri:
            media = _download_gcs_uri_bytes(gcs_uri, headers=headers)
            return media, "video/mp4", float(safe_duration), _title_from_prompt(prompt)

        raise RuntimeError("Vertex Veo operation completed without video payload")
    except Exception as exc:
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
                style_preset="real",
                _allow_model_fallback=False,
            )
        raise


def _run_google_vertex_image_generation(
    *,
    prompt: str,
    negative_prompt: str,
    aspect_ratio: str,
    style_preset: str | None = None,
    task: str = "image",
    _allow_model_fallback: bool = True,
) -> tuple[bytes, str, float | None, str | None]:
    project_id = _google_project_id()
    location = _env("GOOGLE_VERTEX_LOCATION", "us-central1")
    default_model_id = _resolve_google_image_model_id("real", task=task)
    model_id = _resolve_google_image_model_id(style_preset, task=task)
    headers = _google_auth_headers()

    endpoint = (
        f"https://{location}-aiplatform.googleapis.com/v1/"
        f"projects/{project_id}/locations/{location}/publishers/google/models/{model_id}:predict"
    )

    safe_ar = aspect_ratio if aspect_ratio in {"9:16", "16:9", "1:1"} else "1:1"
    payload: dict[str, Any] = {
        "instances": [{"prompt": (prompt or "").strip()[:1200]}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": safe_ar,
        },
    }
    if negative_prompt:
        payload["parameters"]["negativePrompt"] = negative_prompt[:1200]

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
            raise RuntimeError(f"Vertex Imagen failed: {status} {detail}".strip())

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

        return media_bytes, media_type, None, _title_from_prompt(prompt)
    except Exception as exc:
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
                task=task,
                _allow_model_fallback=False,
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
        brand = _env("WORKER_BRAND_TEXT", "Clipforge Labs")

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
        brand = _env("WORKER_BRAND_TEXT", "Clipforge Labs")

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


def _extract_post_scene_beats(raw_visual_prompt: str) -> list[str]:
    prompt = _strip_style_suffix(raw_visual_prompt)
    if not prompt:
        return []

    lines = [_normalize_post_line(line) for line in prompt.replace("\r", "\n").split("\n")]
    line_beats = [line for line in lines if len(line) >= 8]
    if len(line_beats) >= 2:
        return line_beats

    text_value = re.sub(r"\s+", " ", prompt).strip()
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


def _post_scene_beat_for_index(*, scene_beats: list[str], scene_index: int, scene_count: int) -> str:
    if not scene_beats:
        return "Cinematic social-media frame with clear subject focus and strong composition."
    count = max(1, int(scene_count or 1))
    idx = max(0, min(count - 1, int(scene_index or 0)))
    beat_pos = int(math.floor((idx / float(count)) * len(scene_beats)))
    beat_pos = max(0, min(len(scene_beats) - 1, beat_pos))
    return scene_beats[beat_pos]


def _build_post_scene_prompt(
    *,
    raw_visual_prompt: str,
    style_preset: str,
    scene_beats: list[str],
    scene_index: int,
    scene_count: int,
) -> str:
    story_summary = _normalize_post_line(_strip_style_suffix(raw_visual_prompt))
    if len(story_summary) > 260:
        story_summary = story_summary[:257].rstrip() + "..."

    scene_beat = _post_scene_beat_for_index(
        scene_beats=scene_beats,
        scene_index=scene_index,
        scene_count=scene_count,
    )
    style_hint = _style_hint(style_preset)

    pieces: list[str] = [
        f"Scene {scene_index + 1} of {scene_count} for a vertical short-form video frame.",
        f"Primary scene direction: {scene_beat}.",
    ]
    if story_summary and scene_beat.lower() not in story_summary.lower():
        pieces.append(f"Overall story context: {story_summary}.")
    if style_hint:
        pieces.append(f"Visual style: {style_hint}.")
    pieces.append(
        "Keep the same subject identity and environment continuity as neighboring scenes,"
        " with clean framing and natural detail. Avoid unintended text artifacts, subtitles, logos, and watermarks"
        " unless the scene explicitly asks for visible text."
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
    style = (preset or "").strip().lower()
    if style == "minimal":
        font_size = max(32, int(video_h * 0.035))
        margin_v = max(90, int(video_h * 0.12))
        return (
            f"FontName=DejaVu Sans,Fontsize={font_size},Alignment=2,MarginV={margin_v},"
            "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H5A000000,"
            "BorderStyle=3,Outline=1,Shadow=0,MarginL=36,MarginR=36"
        )
    if style == "clean_bottom":
        font_size = max(38, int(video_h * 0.041))
        margin_v = max(74, int(video_h * 0.09))
        return (
            f"FontName=DejaVu Sans,Fontsize={font_size},Alignment=2,MarginV={margin_v},"
            "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H66000000,"
            "BorderStyle=3,Outline=1.5,Shadow=0,MarginL=42,MarginR=42"
        )
    # default: bold_center
    font_size = max(42, int(video_h * 0.048))
    margin_v = max(122, int(video_h * 0.15))
    return (
        f"FontName=DejaVu Sans,Fontsize={font_size},Alignment=2,MarginV={margin_v},"
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H78000000,"
        "BorderStyle=3,Outline=2,Shadow=0,MarginL=44,MarginR=44"
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
    watermark_text = _env("WORKER_WATERMARK_TEXT", "Clipforge Labs").strip() or "Clipforge Labs"
    draw_font = _env("WORKER_DRAWTEXT_FONTFILE", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    _, h = _clip_dimensions(aspect_ratio if aspect_ratio in {"9:16", "16:9", "1:1"} else "9:16")
    label = "[0:v]"
    graph_parts: list[str] = []
    if subtitles_path:
        force_style = _caption_force_style(caption_style_preset, h).replace("'", "\\'")
        sub_path = _ff_path_escape(subtitles_path)
        graph_parts.append(f"[0:v]subtitles='{sub_path}':force_style='{force_style}'[vsub]")
        label = "[vsub]"
    if watermark_enabled and logo_path:
        logo_label = "[wm]"
        graph_parts.append(f"[1:v]scale=84:-1{logo_label}")
        graph_parts.append(f"{label}{logo_label}overlay=x=24:y=24:format=auto[vw]")
        label = "[vw]"
    if watermark_enabled:
        text_escaped = _ff_drawtext_escape(watermark_text)
        graph_parts.append(
            f"{label}drawtext=fontfile={draw_font}:text='{text_escaped}':"
            "fontcolor=white@0.86:fontsize=24:box=1:boxcolor=black@0.38:boxborderw=8:"
            "x=24:y=24+88[vout]"
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
    draw_font = _env("WORKER_DRAWTEXT_FONTFILE", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    text_escaped = _ff_drawtext_escape(_env("WORKER_WATERMARK_TEXT", "Clipforge Labs").strip() or "Clipforge Labs")
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
                "[1:v]scale=84:-1[wm];[0:v][wm]overlay=x=24:y=24:format=auto[v1];"
                f"[v1]drawtext=fontfile={draw_font}:text='{text_escaped}':"
                "fontcolor=white@0.86:fontsize=24:box=1:boxcolor=black@0.38:boxborderw=8:"
                "x=24:y=24+88[vout]",
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
                f"drawtext=fontfile={draw_font}:text='{text_escaped}':"
                "fontcolor=white@0.86:fontsize=24:box=1:boxcolor=black@0.38:boxborderw=8:"
                "x=24:y=24",
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
                f"drawtext=fontfile={draw_font}:text='{text_escaped}':"
                "fontcolor=white@0.86:fontsize=24:box=1:boxcolor=black@0.38:boxborderw=8:"
                "x=24:y=24",
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


def _build_expressive_tts_ssml(script: str) -> str:
    sentences = _split_tts_sentences(script)
    if not sentences:
        return "<speak>Untitled voiceover.</speak>"

    pause_ms = _env_int("GOOGLE_TTS_SENTENCE_BREAK_MS", 220, min_value=80, max_value=800)
    phrase_pause_ms = _env_int("GOOGLE_TTS_PHRASE_BREAK_MS", 130, min_value=40, max_value=400)
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


def _google_tts_audio_config(speaking_rate: float) -> dict[str, Any]:
    pitch = _env_float("GOOGLE_TTS_PITCH", 1.6, min_value=-20.0, max_value=20.0)
    volume_gain_db = _env_float("GOOGLE_TTS_VOLUME_GAIN_DB", 1.5, min_value=-96.0, max_value=16.0)
    return {
        "audioEncoding": "MP3",
        "speakingRate": speaking_rate,
        "pitch": pitch,
        "volumeGainDb": volume_gain_db,
    }


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


def _run_google_tts_voiceover(*, script: str, voice_name: str, speed_wpm: int, out_path: str) -> None:
    raw_endpoint = _env("GOOGLE_TTS_API_URL", "https://texttospeech.googleapis.com/v1/text:synthesize?key={API_KEY}")

    safe_script = (script or "").strip()[:6000]
    if not safe_script:
        safe_script = "Untitled voiceover."

    default_voice_name = (_env("GOOGLE_TTS_DEFAULT_VOICE", "en-US-Neural2-F") or "").strip() or "en-US-Neural2-F"
    fallback_voice_name = (_env("GOOGLE_TTS_FALLBACK_VOICE", default_voice_name) or "").strip() or default_voice_name
    explicit_voice = (voice_name or "").strip()
    selected_voice_name = (
        explicit_voice
        if explicit_voice and explicit_voice.lower() not in {"en-us", "en_us", "default", "auto"}
        else default_voice_name
    )

    language_code = _voice_language_code(selected_voice_name)
    speaking_rate = max(0.5, min(2.0, float(speed_wpm or 165) / 165.0))
    use_ssml = _env_bool("GOOGLE_TTS_USE_SSML", True)

    payload = _google_tts_payload(
        script=safe_script,
        selected_voice_name=selected_voice_name,
        language_code=language_code,
        speaking_rate=speaking_rate,
        use_ssml=use_ssml,
    )

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

    status, content_type, data, raw_bytes = call_tts(payload)
    if status >= 400 and use_ssml:
        plain_payload = _google_tts_payload(
            script=safe_script,
            selected_voice_name=selected_voice_name,
            language_code=language_code,
            speaking_rate=speaking_rate,
            use_ssml=False,
        )
        status, content_type, data, raw_bytes = call_tts(plain_payload)
    if status >= 400 and selected_voice_name != fallback_voice_name:
        retry_language = _voice_language_code(fallback_voice_name)
        retry_payload = _google_tts_payload(
            script=safe_script,
            selected_voice_name=fallback_voice_name,
            language_code=retry_language,
            speaking_rate=speaking_rate,
            use_ssml=use_ssml,
        )
        status, content_type, data, raw_bytes = call_tts(retry_payload)
        if status >= 400 and use_ssml:
            retry_plain_payload = _google_tts_payload(
                script=safe_script,
                selected_voice_name=fallback_voice_name,
                language_code=retry_language,
                speaking_rate=speaking_rate,
                use_ssml=False,
            )
            status, content_type, data, raw_bytes = call_tts(retry_plain_payload)

    if status >= 400:
        detail = ""
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict):
                detail = str(err.get("message") or "")
            elif err:
                detail = str(err)
        raise RuntimeError(f"google tts failed: {status} {detail}".strip())

    if isinstance(data, dict):
        audio_b64 = data.get("audioContent")
        if isinstance(audio_b64, str) and audio_b64.strip():
            _write_bytes(out_path, _decode_base64_payload(audio_b64.strip()))
            return

    # Some gateways may return direct MP3 bytes.
    if content_type.startswith("audio/") and raw_bytes:
        _write_bytes(out_path, raw_bytes)
        return

    raise RuntimeError("google tts response missing audio payload")


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


def _next_generate_job(db) -> dict | None:
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
            WHERE kind IN ('generate', 'generate_image', 'generate_voiceover', 'generate_post')
              AND status = 'queued'
            ORDER BY id ASC
            LIMIT 1
            """
        )
    ).mappings().first()
    return dict(row) if row else None


def _mark_job_status(db, job_id: int, status: str, error: str | None = None) -> None:
    db.execute(
        text("UPDATE jobs SET status = :s, error = :e WHERE id = :id"),
        {"s": status, "e": error, "id": int(job_id)},
    )


def _refund_reserved_credits(db, job_id: int) -> int:
    row = db.execute(
        text(
            """
            SELECT
              COALESCE(j.credits_reserved, 0) AS reserved,
              COALESCE(j.credits_refunded, 0) AS refunded,
              COALESCE(u.user_id, 0) AS user_id
            FROM jobs j
            JOIN uploads u ON u.id = j.upload_id
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

    db.execute(
        text("UPDATE users SET credits = COALESCE(credits, 0) + :r WHERE id = :uid"),
        {"r": reserved, "uid": user_id},
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


def _parse_settings(raw: str) -> dict:
    text_value = (raw or "").strip()
    if not text_value:
        return {}
    try:
        data = json.loads(text_value)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


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


def _apply_style_preset(prompt: str, style_preset: str | None) -> str:
    base = (prompt or "").strip()
    if not base:
        return base
    hint = _style_hint(style_preset)
    if not hint:
        return base
    if hint.lower() in base.lower():
        return base
    return f"{base}. Visual style: {hint}."


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
    watermark_enabled = bool(settings.get("watermark_enabled", bool(job.get("watermark_enabled", True))))
    captions_enabled = bool(settings.get("captions_enabled", bool(job.get("captions_enabled", False))))
    styled_prompt = _apply_style_preset(prompt, style_preset)
    use_google_provider = _model_prefers_google(model)
    strict_provider = _provider_strict_mode()
    allow_demo_fallback = _allow_demo_fallback()

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
                            task="image",
                        )
                    _write_bytes(out_path, media_bytes)
                    if (remote_type or "").startswith("image/"):
                        content_type = remote_type
                    provider_title = remote_title
                except Exception as exc:
                    provider_capacity_error = _is_provider_capacity_error(exc)
                    if strict_provider or (not allow_demo_fallback and not provider_capacity_error):
                        raise RuntimeError(f"Google image generation failed: {exc}") from exc
                    print(f"[worker] image provider fallback job_id={job_id} err={type(exc).__name__}: {exc}")

            if not _file_has_data(out_path):
                if use_google_provider and not allow_demo_fallback and not provider_capacity_error:
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
                "title": provider_title or _title_from_prompt(styled_prompt) or f"Image {job_id}",
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
            voice_name = str(settings.get("voice_name") or "en-US-Neural2-F")
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
                    if strict_provider or (not allow_demo_fallback and not provider_capacity_error):
                        raise RuntimeError(f"Google voiceover generation failed: {exc}") from exc
                    print(f"[worker] voiceover provider fallback job_id={job_id} err={type(exc).__name__}: {exc}")

            if not _file_has_data(out_path):
                if use_google_provider and not allow_demo_fallback and not provider_capacity_error:
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
                "title": _title_from_prompt(prompt) or f"Voiceover {job_id}",
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
            voice_script = str(settings.get("voice_script") or prompt or "Untitled voiceover").strip()
            voice_name = str(settings.get("voice_name") or "en-US-Neural2-F").strip() or "en-US-Neural2-F"
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
                image_count = 10
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
                        if strict_provider or (not allow_demo_fallback and not provider_capacity_error_voice):
                            raise RuntimeError(f"Google post voiceover generation failed: {exc}") from exc
                        print(f"[worker] post voiceover fallback job_id={job_id} err={type(exc).__name__}: {exc}")
                        break

            if not _file_has_data(audio_path):
                if use_google_provider and not allow_demo_fallback and not provider_capacity_error_voice:
                    raise RuntimeError("Google post voiceover generation returned no audio payload")
                _run_voiceover(
                    script=voice_script or "Untitled voiceover",
                    voice_name=voice_name,
                    speed_wpm=speed,
                    out_path=audio_path,
                )

            target_duration = max(30.0, float(duration or 60))
            audio_duration = _probe_audio_duration(audio_path)
            if audio_duration > target_duration:
                target_duration = audio_duration

            use_video_scene_mode = _is_low_cost_style(style_preset)

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
                    scene_video_duration = max(4, min(12, int(round(float(target_duration) / float(max(1, attempt_scene_count))))))

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
                                                "provider_model_id": _resolve_google_video_model_id(style_preset),
                                                "settings": {
                                                    **settings,
                                                    "scene_index": idx + 1,
                                                    "scene_count": attempt_scene_count,
                                                    "scene_duration_seconds": scene_video_duration,
                                                    "mode": "post_video",
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
                                            style_preset=style_preset,
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
                                    if strict_provider or not allow_demo_fallback:
                                        raise RuntimeError(f"Google post video generation failed: {exc}") from exc
                                    print(
                                        f"[worker] post video fallback job_id={job_id} scene={idx + 1}/{attempt_scene_count} "
                                        f"err={type(exc).__name__}: {exc}"
                                    )
                                    break

                        if capacity_hit:
                            break

                        if not _file_has_data(scene_path):
                            if use_google_provider and not allow_demo_fallback:
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
                            if not strict_provider and allow_demo_fallback:
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
                base_title = _title_from_prompt(raw_visual_prompt) or f"AI Post {job_id}"
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

                key = f"clips/generated-posts/{job_id}-{uuid.uuid4().hex}.mp4"
                _upload_file(out_path, key, content_type="video/mp4")

                extra_clips: list[dict[str, Any]] = []
                voice_key = f"assets/post-voiceovers/{job_id}-{uuid.uuid4().hex}.mp3"
                _upload_file(audio_path, voice_key, content_type="audio/mpeg")
                voice_duration = _probe_audio_duration(audio_path) or final_duration or target_duration
                extra_clips.append(
                    {
                        "storage_key": voice_key,
                        "duration_seconds": float(voice_duration),
                        "start_time": 0.0,
                        "title": f"{base_title} · Voiceover",
                        "hook": None,
                    }
                )

                scene_keys: list[str] = []
                scene_count = max(1, len(scene_video_paths))
                scene_duration = max(0.2, float(final_duration or target_duration) / float(scene_count))
                scene_beats_for_meta = _extract_post_scene_beats(raw_visual_prompt)
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
                    scene_hook = _post_scene_beat_for_index(
                        scene_beats=scene_beats_for_meta,
                        scene_index=idx,
                        scene_count=scene_count,
                    )
                    extra_clips.append(
                        {
                            "storage_key": scene_key,
                            "duration_seconds": float(scene_duration),
                            "start_time": float(idx) * float(scene_duration),
                            "title": f"{base_title} · Scene {idx + 1}",
                            "hook": scene_hook,
                        }
                    )
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
                                            "settings": {
                                                **settings,
                                                "scene_index": idx + 1,
                                                "scene_count": attempt_image_count,
                                                "mode": "post",
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
                                if strict_provider or not allow_demo_fallback:
                                    raise RuntimeError(f"Google post image generation failed: {exc}") from exc
                                print(
                                    f"[worker] post image fallback job_id={job_id} scene={idx + 1}/{attempt_image_count} "
                                    f"err={type(exc).__name__}: {exc}"
                                )
                                break

                    if capacity_hit:
                        break

                    if not _file_has_data(img_path):
                        if use_google_provider and not allow_demo_fallback:
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
                        if not strict_provider and allow_demo_fallback:
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
            base_title = _title_from_prompt(raw_visual_prompt) or f"AI Post {job_id}"
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

            key = f"clips/generated-posts/{job_id}-{uuid.uuid4().hex}.mp4"
            _upload_file(out_path, key, content_type="video/mp4")

            extra_clips: list[dict[str, Any]] = []
            voice_key = f"assets/post-voiceovers/{job_id}-{uuid.uuid4().hex}.mp3"
            _upload_file(audio_path, voice_key, content_type="audio/mpeg")
            voice_duration = _probe_audio_duration(audio_path) or final_duration or target_duration
            extra_clips.append(
                {
                    "storage_key": voice_key,
                    "duration_seconds": float(voice_duration),
                    "start_time": 0.0,
                    "title": f"{base_title} · Voiceover",
                    "hook": None,
                }
            )

            scene_keys: list[str] = []
            scene_count = max(1, len(image_paths))
            scene_duration = max(0.2, float(final_duration or target_duration) / float(scene_count))
            scene_beats_for_meta = _extract_post_scene_beats(raw_visual_prompt)
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
                scene_hook = _post_scene_beat_for_index(
                    scene_beats=scene_beats_for_meta,
                    scene_index=idx,
                    scene_count=scene_count,
                )
                extra_clips.append(
                    {
                        "storage_key": scene_key,
                        "duration_seconds": float(scene_duration),
                        "start_time": float(idx) * float(scene_duration),
                        "title": f"{base_title} · Scene {idx + 1}",
                        "hook": scene_hook,
                    }
                )
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
        content_type = "video/mp4"
        provider_duration: float | None = None
        provider_title: str | None = None
        provider_capacity_error = False

        if use_google_provider:
            try:
                video_model_id = _resolve_google_video_model_id(style_preset)
                if _env("GOOGLE_VIDEO_API_URL", ""):
                    media_bytes, remote_type, remote_duration, remote_title = _call_google_generation_endpoint(
                        endpoint_env="GOOGLE_VIDEO_API_URL",
                        payload={
                            "prompt": styled_prompt,
                            "negative_prompt": negative_prompt or None,
                            "aspect_ratio": aspect_ratio,
                            "duration_seconds": duration,
                            "generation_speed": generation_speed,
                            "model": model or "google",
                            "provider_model_id": video_model_id,
                            "settings": settings,
                            "kind": JOB_KIND_VIDEO,
                        },
                    )
                else:
                    media_bytes, remote_type, remote_duration, remote_title = _run_google_vertex_video_generation(
                        prompt=styled_prompt,
                        negative_prompt=negative_prompt,
                        aspect_ratio=aspect_ratio,
                        duration_seconds=duration,
                        style_preset=style_preset,
                    )
                _write_bytes(out_path, media_bytes)
                if (remote_type or "").startswith("video/"):
                    content_type = remote_type
                if isinstance(remote_duration, (int, float)) and float(remote_duration) > 0:
                    provider_duration = float(remote_duration)
                provider_title = remote_title
            except Exception as exc:
                provider_capacity_error = _is_provider_capacity_error(exc)
                if strict_provider or (not allow_demo_fallback and not provider_capacity_error):
                    raise RuntimeError(f"Google video generation failed: {exc}") from exc
                print(f"[worker] video provider fallback job_id={job_id} err={type(exc).__name__}: {exc}")

        if not _file_has_data(out_path):
            if use_google_provider and not allow_demo_fallback and not provider_capacity_error:
                raise RuntimeError("Google video generation returned no media payload")
            prep_delay = _video_mode_prep_delay_seconds(generation_speed)
            if prep_delay > 0:
                time.sleep(prep_delay)
            _run_ffmpeg_text_video(
                prompt=styled_prompt or "Untitled",
                duration=duration,
                aspect_ratio=aspect_ratio,
                out_path=out_path,
            )

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

        ext = _extension_for_content_type(content_type, ".mp4")
        key = f"clips/generated/{job_id}-{uuid.uuid4().hex}{ext}"
        _upload_file(out_path, key, content_type=content_type)
        final_duration = provider_duration if provider_duration and provider_duration > 0 else float(max(2, duration))
        return {
            "storage_key": key,
            "content_type": content_type,
            "duration_seconds": float(final_duration),
            "title": provider_title or _title_from_prompt(prompt),
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

    print("[worker] clipforge-labs generation worker starting")

    while True:
        with Session() as db:
            job = _next_generate_job(db)
            if not job:
                db.commit()
                time.sleep(poll)
                continue

            job_id = int(job["id"])
            upload_id = int(job["upload_id"])
            kind = str(job.get("kind") or JOB_KIND_VIDEO)

            try:
                _mark_job_status(db, job_id, "running", None)
                db.commit()

                result = _process_job(job)
                key = str(result.get("storage_key") or "")
                content_type = str(result.get("content_type") or "application/octet-stream")
                duration_seconds = float(result.get("duration_seconds") or 0.0)
                title = result.get("title")
                extra_clips = result.get("extra_clips") if isinstance(result.get("extra_clips"), list) else []
                settings_patch = result.get("settings_patch") if isinstance(result.get("settings_patch"), dict) else None

                if not key:
                    raise RuntimeError("Generation returned no storage key")

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
                _mark_job_status(db, job_id, "done", None)
                db.commit()
                print(f"[worker] generated asset kind={kind} job_id={job_id} key={key} content_type={content_type}")
            except Exception as exc:
                refunded = 0
                try:
                    refunded = _refund_reserved_credits(db, job_id)
                    _mark_job_status(db, job_id, "failed", str(exc)[:500])
                    db.commit()
                except Exception:
                    db.rollback()
                if refunded:
                    print(f"[worker] refunded {refunded} credits for failed job_id={job_id}")
                print(f"[worker] job failed kind={kind} job_id={job_id} err={type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
