# backend/routers/storage.py

import os
import uuid
from typing import Optional, Dict

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

import boto3
from botocore.config import Config

from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/storage", tags=["storage"])

# Basic production allowlist (extend later)
ALLOWED_CONTENT_PREFIXES = ("video/",)

# Optional safety limit (shared convention with your upload router)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(2 * 1024 * 1024 * 1024)))  # 2GB


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


class PresignRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)
    # Optional: client can send file size for quick rejection before S3 upload.
    content_length: Optional[int] = Field(default=None, ge=1)


class PresignResponse(BaseModel):
    put_url: str
    storage_key: str
    # The client MUST send these headers on PUT exactly, or S3 will 403 / CORS-fail.
    required_headers: Dict[str, str]


@router.post("/presign", response_model=PresignResponse)
def presign_put(
    req: PresignRequest,
    current_user: User = Depends(get_current_user),
):
    # Only support S3 presign when configured
    if os.getenv("STORAGE_BACKEND") != "s3":
        raise HTTPException(status_code=400, detail="STORAGE_BACKEND is not 's3'")

    bucket = os.getenv("S3_BUCKET")
    region = os.getenv("AWS_REGION")
    if not bucket or not region:
        raise HTTPException(status_code=500, detail="S3 config missing")

    ct = (req.content_type or "").strip().lower()
    if not ct or not ct.startswith(ALLOWED_CONTENT_PREFIXES):
        raise HTTPException(status_code=415, detail=f"Unsupported content type: {ct}")

    if req.content_length and req.content_length > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Upload too large (>{MAX_UPLOAD_BYTES} bytes).",
        )

    # Keep extension (best effort)
    safe_name = _safe_filename(req.filename)
    ext = ""
    if "." in safe_name:
        ext = "." + safe_name.split(".")[-1].lower()
        # clamp ext length
        if len(ext) > 12:
            ext = ext[:12]

    # ✅ Per-user namespace (critical for production safety)
    key = f"users/{current_user.id}/videos/{uuid.uuid4().hex}{ext}"

    # These are the exact headers that will be signed into the presigned URL.
    # The browser/client must include them on PUT verbatim.
    required_headers = {
        "Content-Type": ct,
        "x-amz-meta-user_id": str(current_user.id),
        "x-amz-meta-original_filename": safe_name,
    }

    # Force SigV4 (fixes 403 with many setups)
    s3 = boto3.client(
        "s3",
        region_name=region,
        config=Config(signature_version="s3v4"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )

    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": ct,
                "Metadata": {
                    "user_id": str(current_user.id),
                    "original_filename": safe_name,
                },
            },
            ExpiresIn=3600,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"put_url": url, "storage_key": key, "required_headers": required_headers}
