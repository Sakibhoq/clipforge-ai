from __future__ import annotations

import json
import math
import logging
from typing import Optional, Any, Dict

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError, SQLAlchemyError

from models.upload import Upload
from models.job import Job
from models.user import User
from storage import get_storage

logger = logging.getLogger(__name__)


def _safe_filename(name: str) -> str:
    name = (name or "").strip()
    name = name.replace("\\", "_").replace("/", "_").replace("\x00", "_")
    return name[:200] or "upload.mp4"


def _normalize_caption_style(caption_style_json: Optional[Any], caption_style: Optional[Dict[str, Any]]) -> Optional[str]:
    val = caption_style_json or caption_style
    if val is None:
        return None
    if isinstance(val, str):
        try:
            json.loads(val)
            return val
        except Exception:
            raise HTTPException(422, "caption_style_json must be valid JSON")
    try:
        return json.dumps(val)
    except Exception:
        raise HTTPException(422, "caption_style_json must be JSON-serializable")


def _credits_needed(duration_seconds: float) -> int:
    minutes = max(1, int(math.ceil(float(duration_seconds) / 60)))
    return minutes * 2


def _is_paid_plan(plan: Optional[str]) -> bool:
    return (plan or "").lower() in {"starter", "creator", "studio"}


def register_upload_for_user(
    *,
    db: Session,
    user: User,
    storage_key: str,
    original_filename: str,
    source_type: str = "upload",
    source_url: Optional[str] = None,
    source_id: Optional[str] = None,
    aspect_ratio: str = "9:16",
    captions_enabled: bool = True,
    watermark_enabled: bool = True,
    caption_style_json: Optional[Any] = None,
    caption_style: Optional[Dict[str, Any]] = None,
    create_new_job: bool = False,
) -> dict:
    storage = get_storage()

    if not storage_key:
        raise HTTPException(422, "storage_key is required")

    if not storage.exists(storage_key):
        raise HTTPException(400, "Uploaded file not found")

    try:
        duration_seconds = storage.get_duration_seconds(storage_key)
    except Exception:
        raise HTTPException(400, "Could not determine video duration")

    credits_needed = _credits_needed(duration_seconds)
    if credits_needed <= 0:
        raise HTTPException(500, "Invalid credit calculation")

    job_kwargs = {
        "status": "queued",
        "aspect_ratio": aspect_ratio,
        "captions_enabled": bool(captions_enabled),
        "watermark_enabled": bool(watermark_enabled),
        "caption_style_json": _normalize_caption_style(caption_style_json, caption_style),
    }

    try:
        with db.begin():
            # 🔒 Lock user
            user = (
                db.query(User)
                .filter(User.id == user.id)
                .with_for_update()
                .one()
            )

            # Enforce watermark rule
            if not _is_paid_plan(user.plan):
                job_kwargs["watermark_enabled"] = True

            # Re-fetch upload INSIDE transaction
            upload = (
                db.query(Upload)
                .filter(Upload.storage_key == storage_key)
                .with_for_update()
                .first()
            )

            if upload and upload.user_id != user.id:
                raise HTTPException(403, "Forbidden")

            # Reuse existing job ONLY if valid
            if upload and not create_new_job:
                existing_job = (
                    db.query(Job)
                    .filter(Job.upload_id == upload.id)
                    .order_by(Job.id.desc())
                    .first()
                )
                if existing_job and int(existing_job.credits_reserved or 0) > 0:
                    return {
                        "upload_id": upload.id,
                        "job_id": existing_job.id,
                        "status": existing_job.status,
                        "credits_needed": credits_needed,
                        "credits_reserved": int(existing_job.credits_reserved),
                    }

            # Check credits
            if int(user.credits or 0) < credits_needed:
                raise HTTPException(
                    status_code=402,
                    detail=f"Insufficient credits (need {credits_needed}, have {int(user.credits or 0)})",
                )

            user.credits = int(user.credits or 0) - credits_needed

            # Create upload if needed
            if not upload:
                upload = Upload(
                    user_id=user.id,
                    original_filename=_safe_filename(original_filename),
                    storage_key=storage_key,
                    source_type=source_type,
                    source_url=source_url,
                    source_id=source_id,
                )
                db.add(upload)
                db.flush()

            # Create job
            job = Job(upload_id=upload.id, **job_kwargs)
            job.credits_reserved = credits_needed

            db.add(job)
            db.flush()

            if int(job.credits_reserved or 0) != credits_needed:
                raise HTTPException(500, "credits_reserved failed to persist")

            return {
                "upload_id": upload.id,
                "job_id": job.id,
                "status": job.status,
                "credits_needed": credits_needed,
                "credits_reserved": int(job.credits_reserved),
            }

    except HTTPException:
        raise
    except IntegrityError as exc:
        db.rollback()
        logger.exception(
            "register_upload integrity error user_id=%s storage_key=%s",
            getattr(user, "id", None),
            storage_key,
        )
        raise HTTPException(409, "Upload already registered. Please retry.")
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception(
            "register_upload database error user_id=%s storage_key=%s",
            getattr(user, "id", None),
            storage_key,
        )
        if isinstance(exc, OperationalError):
            raise HTTPException(503, "Database temporarily unavailable. Please retry.")
        if isinstance(exc, ProgrammingError):
            raise HTTPException(500, "Database schema mismatch. Please contact support.")
        raise HTTPException(500, "Database error while registering upload.")
    except Exception as exc:
        logger.exception(
            "register_upload unexpected error user_id=%s storage_key=%s",
            getattr(user, "id", None),
            storage_key,
        )
        raise HTTPException(500, f"Failed to register upload ({type(exc).__name__})")
