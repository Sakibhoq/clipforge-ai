# backend/routers/storage.py

import os
import uuid
import traceback
import hmac
import hashlib
import urllib.parse
import json
import time
import shutil
from typing import Optional, Dict

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form
from pydantic import BaseModel, Field

import boto3
from botocore.config import Config
from botocore.exceptions import NoCredentialsError, ClientError

from models.user import User
from routers.auth import get_current_user
from core.config import settings
from storage.local import LocalStorage
from storage import get_storage

router = APIRouter(prefix="/storage", tags=["storage"])

# Basic production allowlist (extend later)
ALLOWED_CONTENT_PREFIXES = ("video/",)

# Optional safety limit (shared convention with your upload router)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(2 * 1024 * 1024 * 1024)))  # 2GB
UPLOAD_PROXY_CHUNK_SIZE = int(os.getenv("UPLOAD_PROXY_CHUNK_SIZE", str(64 * 1024)))  # 64KB
UPLOAD_PROXY_SESSION_TTL_SEC = int(os.getenv("UPLOAD_PROXY_SESSION_TTL_SEC", str(24 * 60 * 60)))
UPLOAD_PROXY_TMP_DIR = os.getenv("UPLOAD_PROXY_TMP_DIR", "/tmp/orbito-upload-proxy")
os.makedirs(UPLOAD_PROXY_TMP_DIR, exist_ok=True)


def _safe_filename(name: str) -> str:
    """
    Sanitize filename. We only use it as metadata now, but keep it safe anyway.
    """
    name = (name or "").strip()
    name = name.replace("\\", "_").replace("/", "_")
    name = name.replace("\x00", "_")
    if not name:
        return "upload.mp4"
    if len(name) > 200:
        name = name[:200]
    return name

def _sign_storage_key(key: str) -> str:
    secret = (settings.SECRET_KEY or "dev-local-secret").encode("utf-8")
    return hmac.new(secret, key.encode("utf-8"), hashlib.sha256).hexdigest()

def _verify_storage_key(key: str, token: str) -> bool:
    if not token:
        return False
    expected = _sign_storage_key(key)
    return hmac.compare_digest(expected, token)

def _validate_local_key(key: str) -> str:
    key = (key or "").strip()
    if not key or key.startswith("/") or ".." in key:
        raise HTTPException(status_code=400, detail="Invalid storage key")
    return key


class PresignRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)
    # Optional: client can send file size for quick rejection before S3 upload.
    content_length: Optional[int] = Field(default=None, ge=1)


class PresignResponse(BaseModel):
    put_url: str
    storage_key: str
    # The client MUST send these headers on PUT exactly, or S3 will 403 / SignatureDoesNotMatch.
    required_headers: Dict[str, str]


class ProxyUploadResponse(BaseModel):
    storage_key: str


class ProxyChunkInitRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)
    content_length: Optional[int] = Field(default=None, ge=1)
    storage_key: Optional[str] = None


class ProxyChunkInitResponse(BaseModel):
    upload_id: str
    storage_key: str
    chunk_size: int


class ProxyChunkCompleteRequest(BaseModel):
    upload_id: str
    storage_key: str
    total_parts: int = Field(..., ge=1)
    content_type: Optional[str] = None


def _s3_client(region: str):
    """
    Use default credential chain:
    - env vars (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
    - ~/.aws/credentials if mounted into container
    - IAM role (EC2/ECS) in prod
    """
    return boto3.client(
        "s3",
        region_name=region,
        config=Config(signature_version="s3v4"),
    )


def _new_storage_key(user_id: int, filename: str) -> str:
    safe_name = _safe_filename(filename or "upload.mp4")
    ext = ""
    if "." in safe_name:
        ext = "." + safe_name.split(".")[-1].lower()
        if len(ext) > 12:
            ext = ext[:12]
    return f"users/{user_id}/videos/{uuid.uuid4().hex}{ext}"


def _validate_user_storage_key(storage_key: str, user_id: int) -> str:
    key = _validate_local_key(storage_key)
    required_prefix = f"users/{user_id}/videos/"
    if not key.startswith(required_prefix):
        raise HTTPException(status_code=400, detail="Invalid storage key namespace")
    return key


def _chunk_session_dir(upload_id: str) -> str:
    return os.path.join(UPLOAD_PROXY_TMP_DIR, upload_id)


def _chunk_meta_path(upload_id: str) -> str:
    return os.path.join(_chunk_session_dir(upload_id), "meta.json")


def _cleanup_chunk_session(upload_id: str) -> None:
    try:
        shutil.rmtree(_chunk_session_dir(upload_id), ignore_errors=True)
    except Exception:
        pass


def _save_chunk_meta(upload_id: str, meta: Dict) -> None:
    session_dir = _chunk_session_dir(upload_id)
    os.makedirs(session_dir, exist_ok=True)
    with open(_chunk_meta_path(upload_id), "w", encoding="utf-8") as f:
        json.dump(meta, f)


def _load_chunk_meta(upload_id: str) -> Dict:
    path = _chunk_meta_path(upload_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Upload session not found")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read upload session")


def _validate_chunk_session_owner(meta: Dict, current_user_id: int) -> None:
    owner = int(meta.get("user_id") or 0)
    if owner != int(current_user_id):
        raise HTTPException(status_code=403, detail="Invalid upload session owner")


def _validate_chunk_session_ttl(meta: Dict, upload_id: str) -> None:
    created_at = int(meta.get("created_at") or 0)
    now = int(time.time())
    if created_at <= 0 or (now - created_at) > UPLOAD_PROXY_SESSION_TTL_SEC:
        _cleanup_chunk_session(upload_id)
        raise HTTPException(status_code=410, detail="Upload session expired")


@router.post("/presign", response_model=PresignResponse)
def presign_put(
    req: PresignRequest,
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    try:
        backend = (os.getenv("STORAGE_BACKEND") or "local").lower().strip()

        bucket = os.getenv("S3_BUCKET")
        region = os.getenv("AWS_REGION")
        if backend == "s3" and (not bucket or not region):
            raise HTTPException(status_code=500, detail="S3 config missing (S3_BUCKET/AWS_REGION)")

        ct = (req.content_type or "").strip().lower()
        if not ct or not ct.startswith(ALLOWED_CONTENT_PREFIXES):
            raise HTTPException(status_code=415, detail=f"Unsupported content type: {ct}")

        if req.content_length and req.content_length > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Upload too large (>{MAX_UPLOAD_BYTES} bytes).",
            )

        safe_name = _safe_filename(req.filename)

        # ✅ Per-user namespace
        key = _new_storage_key(current_user.id, safe_name)

        # Client must include these EXACT headers on PUT
        required_headers = {
            "Content-Type": ct,
            "x-amz-meta-original_filename": safe_name,
        }

        # Local dev flow (no AWS required)
        if backend != "s3":
            token = _sign_storage_key(key)
            # Use same-origin relative path so frontend proxy rules can forward to backend
            # in local/codespaces without cross-origin PUT/CORS.
            put_url = f"/storage/local-upload?key={urllib.parse.quote(key)}&token={token}"
            return {"put_url": put_url, "storage_key": key, "required_headers": required_headers}

        s3 = _s3_client(region)

        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": ct,
                "Metadata": {"original_filename": safe_name},
            },
            ExpiresIn=3600,
        )

        return {"put_url": url, "storage_key": key, "required_headers": required_headers}

    except HTTPException:
        # keep explicit HTTP errors
        raise

    except NoCredentialsError:
        # return JSON so the frontend doesn't just see "Internal Server Error"
        print("[/storage/presign] NoCredentialsError")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail="AWS credentials not available to backend container (mount ~/.aws or set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY).",
        )

    except ClientError as e:
        print("[/storage/presign] ClientError")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

    except Exception as e:
        # Always log a traceback
        print("[/storage/presign] Unhandled exception")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-proxy", response_model=ProxyUploadResponse)
async def upload_proxy(
    file: UploadFile = File(...),
    content_type: Optional[str] = Form(default=None),
    storage_key: Optional[str] = Form(default=None),
    current_user: User = Depends(get_current_user),
):
    """
    Fallback upload path for environments where direct browser PUT is blocked
    (S3 CORS, strict proxies, enterprise browsers).
    Works with both STORAGE_BACKEND=local and STORAGE_BACKEND=s3.
    """
    if not file:
        raise HTTPException(status_code=400, detail="No file received")

    ct = (content_type or file.content_type or "").strip().lower()
    if not ct:
        ct = "video/mp4"
    if not ct.startswith(ALLOWED_CONTENT_PREFIXES):
        raise HTTPException(status_code=415, detail=f"Unsupported content type: {ct}")

    key = (
        _validate_user_storage_key(storage_key, current_user.id)
        if storage_key
        else _new_storage_key(current_user.id, file.filename or "upload.mp4")
    )

    # Best-effort size guard. Works for SpooledTemporaryFile and regular files.
    try:
        file.file.seek(0, os.SEEK_END)
        size = int(file.file.tell() or 0)
        file.file.seek(0)
        if size > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Upload too large (>{MAX_UPLOAD_BYTES} bytes).",
            )
    except HTTPException:
        raise
    except Exception:
        # If size probing fails, continue and let storage/backend constraints apply.
        try:
            file.file.seek(0)
        except Exception:
            pass

    storage = get_storage()
    try:
        storage.save(file.file, key, content_type=ct)  # type: ignore[arg-type]
    except NoCredentialsError:
        raise HTTPException(status_code=500, detail="AWS credentials missing for upload")
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print("[/storage/upload-proxy] Unhandled exception")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

    return {"storage_key": key}


@router.post("/upload-proxy-init", response_model=ProxyChunkInitResponse)
def upload_proxy_init(
    payload: ProxyChunkInitRequest,
    current_user: User = Depends(get_current_user),
):
    ct = (payload.content_type or "").strip().lower()
    if not ct:
        ct = "video/mp4"
    if not ct.startswith(ALLOWED_CONTENT_PREFIXES):
        raise HTTPException(status_code=415, detail=f"Unsupported content type: {ct}")

    if payload.content_length and payload.content_length > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Upload too large (>{MAX_UPLOAD_BYTES} bytes).",
        )

    if payload.storage_key:
        key = _validate_user_storage_key(payload.storage_key, current_user.id)
    else:
        key = _new_storage_key(current_user.id, payload.filename or "upload.mp4")

    upload_id = uuid.uuid4().hex
    meta = {
        "user_id": current_user.id,
        "storage_key": key,
        "content_type": ct,
        "filename": _safe_filename(payload.filename),
        "created_at": int(time.time()),
    }
    _save_chunk_meta(upload_id, meta)

    return {
        "upload_id": upload_id,
        "storage_key": key,
        "chunk_size": max(64 * 1024, UPLOAD_PROXY_CHUNK_SIZE),
    }


@router.post("/upload-proxy-chunk")
async def upload_proxy_chunk(
    upload_id: str = Form(...),
    storage_key: str = Form(...),
    part_index: int = Form(...),
    total_parts: int = Form(...),
    chunk: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if total_parts <= 0:
        raise HTTPException(status_code=400, detail="total_parts must be > 0")
    if part_index < 0 or part_index >= total_parts:
        raise HTTPException(status_code=400, detail="Invalid part_index")

    meta = _load_chunk_meta(upload_id)
    _validate_chunk_session_owner(meta, current_user.id)
    _validate_chunk_session_ttl(meta, upload_id)

    expected_key = str(meta.get("storage_key") or "")
    if storage_key != expected_key:
        raise HTTPException(status_code=400, detail="storage_key mismatch")

    session_dir = _chunk_session_dir(upload_id)
    os.makedirs(session_dir, exist_ok=True)
    part_path = os.path.join(session_dir, f"part-{part_index:08d}.bin")

    received = 0
    try:
        with open(part_path, "wb") as out:
            while True:
                buf = chunk.file.read(1024 * 1024)
                if not buf:
                    break
                received += len(buf)
                out.write(buf)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to write upload chunk")

    if received <= 0:
        raise HTTPException(status_code=400, detail="Empty upload chunk")

    return {
        "ok": True,
        "upload_id": upload_id,
        "storage_key": storage_key,
        "part_index": part_index,
        "total_parts": total_parts,
        "received_bytes": received,
    }


@router.post("/upload-proxy-complete", response_model=ProxyUploadResponse)
def upload_proxy_complete(
    payload: ProxyChunkCompleteRequest,
    current_user: User = Depends(get_current_user),
):
    meta = _load_chunk_meta(payload.upload_id)
    _validate_chunk_session_owner(meta, current_user.id)
    _validate_chunk_session_ttl(meta, payload.upload_id)

    expected_key = str(meta.get("storage_key") or "")
    if payload.storage_key != expected_key:
        raise HTTPException(status_code=400, detail="storage_key mismatch")

    ct = (payload.content_type or str(meta.get("content_type") or "video/mp4")).strip().lower()
    if not ct.startswith(ALLOWED_CONTENT_PREFIXES):
        raise HTTPException(status_code=415, detail=f"Unsupported content type: {ct}")

    session_dir = _chunk_session_dir(payload.upload_id)
    assembled_path = os.path.join(session_dir, "_assembled.bin")
    total_bytes = 0

    try:
        with open(assembled_path, "wb") as out:
            for idx in range(payload.total_parts):
                part_path = os.path.join(session_dir, f"part-{idx:08d}.bin")
                if not os.path.exists(part_path):
                    raise HTTPException(status_code=400, detail=f"Missing upload chunk: {idx}")
                with open(part_path, "rb") as src:
                    while True:
                        buf = src.read(1024 * 1024)
                        if not buf:
                            break
                        total_bytes += len(buf)
                        if total_bytes > MAX_UPLOAD_BYTES:
                            raise HTTPException(
                                status_code=413,
                                detail=f"Upload too large (>{MAX_UPLOAD_BYTES} bytes).",
                            )
                        out.write(buf)

        storage = get_storage()
        try:
            storage.upload(assembled_path, payload.storage_key, content_type=ct)  # type: ignore[attr-defined]
        except AttributeError:
            # Storage fallback if .upload is not implemented
            with open(assembled_path, "rb") as f:
                storage.save(f, payload.storage_key, content_type=ct)  # type: ignore[arg-type]
    finally:
        _cleanup_chunk_session(payload.upload_id)

    return {"storage_key": payload.storage_key}


@router.put("/local-upload")
async def local_upload(
    request: Request,
    key: str,
    token: str,
):
    backend = (os.getenv("STORAGE_BACKEND") or "local").lower().strip()
    # Allow local storage upload whenever STORAGE_BACKEND=local.
    # Production/local deployments rely on this path + signed key token.
    if backend == "s3":
        raise HTTPException(status_code=403, detail="Local uploads are disabled")

    key = _validate_local_key(key)
    if not _verify_storage_key(key, token):
        raise HTTPException(status_code=403, detail="Invalid upload token")

    storage = LocalStorage()
    path = storage._full_path(key)
    os.makedirs(os.path.dirname(path), exist_ok=True)

    try:
        with open(path, "wb") as f:
            async for chunk in request.stream():
                if not chunk:
                    continue
                f.write(chunk)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to write upload")

    return {"ok": True, "storage_key": key}


@router.get("/local-get")
def local_get(
    key: str,
    token: str,
    response_content_disposition: Optional[str] = None,
):
    backend = (os.getenv("STORAGE_BACKEND") or "local").lower().strip()
    # Allow local storage reads whenever STORAGE_BACKEND=local.
    # Signed key token still protects direct object access.
    if backend == "s3":
        raise HTTPException(status_code=404, detail="Not found")

    key = _validate_local_key(key)
    if not _verify_storage_key(key, token):
        raise HTTPException(status_code=403, detail="Invalid token")

    storage = LocalStorage()
    path = storage._full_path(key)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")

    from fastapi.responses import FileResponse

    headers = {}
    if response_content_disposition:
        headers["Content-Disposition"] = response_content_disposition
    return FileResponse(path, media_type="video/mp4", headers=headers)
