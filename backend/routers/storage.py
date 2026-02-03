# backend/routers/storage.py

import os
import uuid
import traceback
from typing import Optional, Dict

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

import boto3
from botocore.config import Config
from botocore.exceptions import NoCredentialsError, ClientError

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
    # The client MUST send these headers on PUT exactly, or S3 will 403 / SignatureDoesNotMatch.
    required_headers: Dict[str, str]


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


@router.post("/presign", response_model=PresignResponse)
def presign_put(
    req: PresignRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        # Only support S3 presign when configured
        if os.getenv("STORAGE_BACKEND") != "s3":
            raise HTTPException(status_code=400, detail="STORAGE_BACKEND is not 's3'")

        bucket = os.getenv("S3_BUCKET")
        region = os.getenv("AWS_REGION")
        if not bucket or not region:
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

        # Keep extension (best effort)
        ext = ""
        if "." in safe_name:
            ext = "." + safe_name.split(".")[-1].lower()
            if len(ext) > 12:
                ext = ext[:12]

        # ✅ Per-user namespace
        key = f"users/{current_user.id}/videos/{uuid.uuid4().hex}{ext}"

        # Client must include these EXACT headers on PUT
        required_headers = {
            "Content-Type": ct,
            "x-amz-meta-original_filename": safe_name,
        }

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
