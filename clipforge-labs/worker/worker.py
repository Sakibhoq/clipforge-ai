from __future__ import annotations

import base64
import json
import math
import os
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


def _model_prefers_google(model: str | None) -> bool:
    model_name = (model or "").strip().lower()
    if model_name:
        return model_name == "google"
    return _labs_generation_provider() == "google"


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
) -> tuple[bytes, str, float | None, str | None]:
    project_id = _google_project_id()
    location = _env("GOOGLE_VERTEX_LOCATION", "us-central1")
    model_id = _env("GOOGLE_VIDEO_MODEL_ID", "veo-2.0-generate-001")
    headers = _google_auth_headers()

    endpoint_base = (
        f"https://{location}-aiplatform.googleapis.com/v1/"
        f"projects/{project_id}/locations/{location}/publishers/google/models/{model_id}"
    )
    start_url = f"{endpoint_base}:predictLongRunning"
    fetch_url = f"{endpoint_base}:fetchPredictOperation"

    safe_duration = max(5, min(int(duration_seconds or 6), 8))
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


def _run_google_vertex_image_generation(
    *,
    prompt: str,
    negative_prompt: str,
    aspect_ratio: str,
) -> tuple[bytes, str, float | None, str | None]:
    project_id = _google_project_id()
    location = _env("GOOGLE_VERTEX_LOCATION", "us-central1")
    model_id = _env("GOOGLE_IMAGE_MODEL_ID", "imagen-3.0-generate-002")
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


def _run_ffmpeg_text_video(*, prompt: str, duration: int, aspect_ratio: str, out_path: str) -> None:
    w, h = _clip_dimensions(aspect_ratio)
    safe_duration = max(2, min(int(duration or 6), 20))

    fd, txt_path = tempfile.mkstemp(prefix="cflabs-video-prompt-", suffix=".txt")
    os.close(fd)
    try:
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write((prompt or "").strip()[:1200])

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
        proc = subprocess.run(cmd, capture_output=True, text=True)
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
            f.write((prompt or "").strip()[:1200])

        fontfile = _env(
            "WORKER_DRAWTEXT_FONTFILE",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        )
        brand = _env("WORKER_BRAND_TEXT", "Clipforge Labs")

        vf = (
            "format=rgb24,"
            f"drawtext=fontfile={fontfile}:textfile={txt_path}:reload=1:"
            "fontcolor=white:fontsize=44:line_spacing=8:"
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
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg image failed").strip()[:500])
    finally:
        try:
            os.unlink(txt_path)
        except Exception:
            pass


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
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return 0.0
    raw = (proc.stdout or "").strip()
    try:
        return max(0.0, float(raw))
    except Exception:
        return 0.0


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
    proc = subprocess.run(cmd, capture_output=True, text=True)
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
        voice = (voice_name or "en-us").strip()[:64] or "en-us"
        speed = max(80, min(260, int(speed_wpm or 165)))
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
        tts_proc = subprocess.run(tts, capture_output=True, text=True)
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
        enc_proc = subprocess.run(enc, capture_output=True, text=True)
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


def _run_google_tts_voiceover(*, script: str, voice_name: str, speed_wpm: int, out_path: str) -> None:
    raw_endpoint = _env("GOOGLE_TTS_API_URL", "https://texttospeech.googleapis.com/v1/text:synthesize?key={API_KEY}")

    safe_script = (script or "").strip()[:6000]
    if not safe_script:
        safe_script = "Untitled voiceover."

    language_code = _voice_language_code(voice_name)
    speaking_rate = max(0.5, min(2.0, float(speed_wpm or 165) / 165.0))

    payload: dict[str, Any] = {
        "input": {"text": safe_script},
        "voice": {"languageCode": language_code},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": speaking_rate},
    }

    explicit_voice = (voice_name or "").strip()
    # Preserve explicit Google voice names like "en-US-Chirp3-HD-Aoede".
    if explicit_voice and explicit_voice.lower() not in {"en-us", "en_us"}:
        payload["voice"]["name"] = explicit_voice

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

    if use_google_auth:
        status, content_type, data, raw_bytes = _http_post_json_custom(
            endpoint,
            payload,
            headers=_google_auth_headers(),
        )
    else:
        status, content_type, data, raw_bytes = _http_post_json(endpoint, payload)
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
              COALESCE(caption_style_json, '{}') AS settings_json
            FROM jobs
            WHERE kind IN ('generate', 'generate_image', 'generate_voiceover')
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
) -> None:
    safe_duration = max(0.0, float(duration_seconds or 0.0))
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
            "start_time": 0.0,
            "end_time": safe_duration,
            "duration": safe_duration,
            "title": (title or None),
            "hook": None,
        },
    )


def _title_from_prompt(prompt: str) -> str | None:
    s = (prompt or "").strip()
    if not s:
        return None
    if len(s) > 64:
        s = s[:61].rstrip() + "..."
    return s


def _parse_settings(raw: str) -> dict:
    text_value = (raw or "").strip()
    if not text_value:
        return {}
    try:
        data = json.loads(text_value)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _video_mode_prep_delay_seconds(speed: str) -> int:
    # Relax mode intentionally runs on a slower lane to keep cost-efficiency.
    if (speed or "").strip().lower() == "fast":
        return _env_int("WORKER_FAST_PREP_DELAY_SECONDS", 0, min_value=0, max_value=120)
    return _env_int("WORKER_RELAX_PREP_DELAY_SECONDS", 4, min_value=0, max_value=120)


def _process_job(job: dict) -> tuple[str, str, float, str | None]:
    """
    Returns:
      storage_key, content_type, duration_seconds, title
    """
    job_id = int(job["id"])
    kind = str(job.get("kind") or JOB_KIND_VIDEO).strip().lower()
    prompt = str(job.get("prompt") or "").strip()
    aspect_ratio = str(job.get("aspect_ratio") or "9:16").strip()
    duration = int(job.get("duration_seconds") or 6)
    negative_prompt = str(job.get("negative_prompt") or "").strip()
    model = str(job.get("model") or "").strip()
    settings = _parse_settings(str(job.get("settings_json") or "{}"))
    use_google_provider = _model_prefers_google(model)
    strict_provider = _provider_strict_mode()
    allow_demo_fallback = _allow_demo_fallback()

    if kind == JOB_KIND_IMAGE:
        fd, out_path = tempfile.mkstemp(prefix=f"cflabs-image-{job_id}-", suffix=".png")
        os.close(fd)
        try:
            content_type = "image/png"
            provider_title: str | None = None

            if use_google_provider:
                try:
                    if _env("GOOGLE_IMAGE_API_URL", ""):
                        media_bytes, remote_type, _, remote_title = _call_google_generation_endpoint(
                            endpoint_env="GOOGLE_IMAGE_API_URL",
                            payload={
                                "prompt": prompt,
                                "negative_prompt": negative_prompt or None,
                                "aspect_ratio": aspect_ratio,
                                "model": model or "google",
                                "settings": settings,
                                "kind": JOB_KIND_IMAGE,
                            },
                        )
                    else:
                        media_bytes, remote_type, _, remote_title = _run_google_vertex_image_generation(
                            prompt=prompt,
                            negative_prompt=negative_prompt,
                            aspect_ratio=aspect_ratio,
                        )
                    _write_bytes(out_path, media_bytes)
                    if (remote_type or "").startswith("image/"):
                        content_type = remote_type
                    provider_title = remote_title
                except Exception as exc:
                    if strict_provider or not allow_demo_fallback:
                        raise RuntimeError(f"Google image generation failed: {exc}") from exc
                    print(f"[worker] image provider fallback job_id={job_id} err={type(exc).__name__}: {exc}")

            if not _file_has_data(out_path):
                if use_google_provider and not allow_demo_fallback:
                    raise RuntimeError("Google image generation returned no media payload")
                _run_ffmpeg_text_image(prompt=prompt or "Generated image", aspect_ratio=aspect_ratio, out_path=out_path)

            ext = _extension_for_content_type(content_type, ".png")
            key = f"assets/images/{job_id}-{uuid.uuid4().hex}{ext}"
            _upload_file(out_path, key, content_type=content_type)
            return key, content_type, 0.0, provider_title or _title_from_prompt(prompt) or f"Image {job_id}"
        finally:
            try:
                os.unlink(out_path)
            except Exception:
                pass

    if kind == JOB_KIND_VOICEOVER:
        fd, out_path = tempfile.mkstemp(prefix=f"cflabs-voice-{job_id}-", suffix=".mp3")
        os.close(fd)
        try:
            voice_name = str(settings.get("voice_name") or "en-us")
            speed = int(settings.get("speed_wpm") or 165)

            if use_google_provider:
                try:
                    _run_google_tts_voiceover(
                        script=prompt or "Untitled voiceover",
                        voice_name=voice_name,
                        speed_wpm=speed,
                        out_path=out_path,
                    )
                except Exception as exc:
                    if strict_provider or not allow_demo_fallback:
                        raise RuntimeError(f"Google voiceover generation failed: {exc}") from exc
                    print(f"[worker] voiceover provider fallback job_id={job_id} err={type(exc).__name__}: {exc}")

            if not _file_has_data(out_path):
                if use_google_provider and not allow_demo_fallback:
                    raise RuntimeError("Google voiceover generation returned no audio payload")
                _run_voiceover(script=prompt or "Untitled voiceover", voice_name=voice_name, speed_wpm=speed, out_path=out_path)

            dur = _probe_audio_duration(out_path)
            content_type = "audio/mpeg"
            ext = _extension_for_content_type(content_type, ".mp3")
            key = f"assets/voiceovers/{job_id}-{uuid.uuid4().hex}{ext}"
            _upload_file(out_path, key, content_type=content_type)
            final_duration = dur if dur > 0 else max(2.0, min(90.0, len(prompt) / 12.0))
            return key, content_type, final_duration, _title_from_prompt(prompt) or f"Voiceover {job_id}"
        finally:
            try:
                os.unlink(out_path)
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

        if use_google_provider:
            try:
                if _env("GOOGLE_VIDEO_API_URL", ""):
                    media_bytes, remote_type, remote_duration, remote_title = _call_google_generation_endpoint(
                        endpoint_env="GOOGLE_VIDEO_API_URL",
                        payload={
                            "prompt": prompt,
                            "negative_prompt": negative_prompt or None,
                            "aspect_ratio": aspect_ratio,
                            "duration_seconds": duration,
                            "generation_speed": generation_speed,
                            "model": model or "google",
                            "settings": settings,
                            "kind": JOB_KIND_VIDEO,
                        },
                    )
                else:
                    media_bytes, remote_type, remote_duration, remote_title = _run_google_vertex_video_generation(
                        prompt=prompt,
                        negative_prompt=negative_prompt,
                        aspect_ratio=aspect_ratio,
                        duration_seconds=duration,
                    )
                _write_bytes(out_path, media_bytes)
                if (remote_type or "").startswith("video/"):
                    content_type = remote_type
                if isinstance(remote_duration, (int, float)) and float(remote_duration) > 0:
                    provider_duration = float(remote_duration)
                provider_title = remote_title
            except Exception as exc:
                if strict_provider or not allow_demo_fallback:
                    raise RuntimeError(f"Google video generation failed: {exc}") from exc
                print(f"[worker] video provider fallback job_id={job_id} err={type(exc).__name__}: {exc}")

        if not _file_has_data(out_path):
            if use_google_provider and not allow_demo_fallback:
                raise RuntimeError("Google video generation returned no media payload")
            prep_delay = _video_mode_prep_delay_seconds(generation_speed)
            if prep_delay > 0:
                time.sleep(prep_delay)
            _run_ffmpeg_text_video(
                prompt=prompt or "Untitled",
                duration=duration,
                aspect_ratio=aspect_ratio,
                out_path=out_path,
            )

        ext = _extension_for_content_type(content_type, ".mp4")
        key = f"clips/generated/{job_id}-{uuid.uuid4().hex}{ext}"
        _upload_file(out_path, key, content_type=content_type)
        final_duration = provider_duration if provider_duration and provider_duration > 0 else float(max(2, duration))
        return key, content_type, final_duration, provider_title or _title_from_prompt(prompt)
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

                key, content_type, duration_seconds, title = _process_job(job)

                _insert_clip(
                    db,
                    upload_id=upload_id,
                    job_id=job_id,
                    storage_key=key,
                    duration_seconds=duration_seconds,
                    title=title,
                )
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
