from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional, Literal, Dict, Any
import json

from core.database import get_db
from models.upload import Upload
from models.job import Job
from models.user import User
from storage import get_storage

from routers.auth import get_current_user

router = APIRouter(prefix="/uploads", tags=["uploads"])


AspectRatio = Literal["9:16", "1:1", "4:3"]


class RegisterUploadRequest(BaseModel):
    original_filename: str = Field(..., min_length=1)
    storage_key: str = Field(..., min_length=1)

    # Optional render settings (processing-time)
    aspect_ratio: AspectRatio = Field(default="9:16")
    captions_enabled: bool = Field(default=True)
    watermark_enabled: bool = Field(default=True)

    # Arbitrary caption styling config (UI can send later)
    # Example fields you can support later in worker:
    # { "font": "Inter", "size": 44, "color": "#FFFFFF", "stroke": true, "position": "bottom", "margin": 0.08 }
    caption_style: Optional[Dict[str, Any]] = Field(default=None)

    # Allows re-render / retries without changing storage_key
    create_new_job: bool = Field(default=False)


def _safe_filename(name: str) -> str:
    name = (name or "").strip()
    name = name.replace("\\", "_").replace("/", "_")
    name = name.replace("\x00", "_")
    if not name:
        return "upload.mp4"
    if len(name) > 200:
        name = name[:200]
    return name


def _require_user_key_namespace(user_id: int, storage_key: str):
    """
    Production guard:
    - User can only register uploads under their own namespace.
    Expected format: users/{user_id}/videos/...
    """
    key = (storage_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Missing storage_key")

    prefix = f"users/{user_id}/videos/"
    if not key.startswith(prefix):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"storage_key must be under {prefix}",
        )


def _job_kwargs_from_req(req: RegisterUploadRequest) -> dict:
    style_json = None
    if req.caption_style is not None:
        try:
            style_json = json.dumps(req.caption_style)
        except Exception:
            # If caller sends non-serializable content, reject early
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="caption_style must be valid JSON",
            )

    return {
        "status": "queued",
        "aspect_ratio": req.aspect_ratio,
        "captions_enabled": req.captions_enabled,
        "watermark_enabled": req.watermark_enabled,
        "caption_style_json": style_json,
    }


@router.post("/register")
def register_upload(
    req: RegisterUploadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    storage = get_storage()

    # ✅ enforce key namespace (prevents registering someone else's uploaded key)
    _require_user_key_namespace(current_user.id, req.storage_key)

    # Safety guard: must exist in storage
    try:
        exists = storage.exists(req.storage_key)
        if exists is False:
            raise FileNotFoundError()
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file not found in storage",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Storage verification failed",
        )

    job_kwargs = _job_kwargs_from_req(req)

    # Idempotency: if upload already registered, reuse it (unless create_new_job)
    existing_upload = db.query(Upload).filter(Upload.storage_key == req.storage_key).first()
    if existing_upload:
        # ✅ still enforce ownership
        if existing_upload.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Forbidden")

        if req.create_new_job:
            job = Job(upload_id=existing_upload.id, **job_kwargs)
            db.add(job)
            db.commit()
            db.refresh(job)
            return {"upload_id": existing_upload.id, "job_id": job.id, "status": job.status}

        existing_job = (
            db.query(Job)
            .filter(Job.upload_id == existing_upload.id)
            .order_by(Job.id.desc())
            .first()
        )
        if existing_job:
            return {
                "upload_id": existing_upload.id,
                "job_id": existing_job.id,
                "status": existing_job.status,
            }

        # Upload exists but job missing -> create job
        job = Job(upload_id=existing_upload.id, **job_kwargs)
        db.add(job)
        db.commit()
        db.refresh(job)
        return {"upload_id": existing_upload.id, "job_id": job.id, "status": job.status}

    # Create new upload + job
    upload = Upload(
        user_id=current_user.id,
        original_filename=_safe_filename(req.original_filename),
        storage_key=req.storage_key,
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)

    job = Job(upload_id=upload.id, **job_kwargs)
    db.add(job)
    db.commit()
    db.refresh(job)

    return {"upload_id": upload.id, "job_id": job.id, "status": job.status}
