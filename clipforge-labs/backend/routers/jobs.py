import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.database import get_db
from models.clip import Clip
from models.job import Job
from models.upload import Upload
from models.user import User

from routers.auth import get_current_user

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _parse_job_settings(raw: object) -> dict | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        txt = raw.strip()
        if not txt:
            return None
        try:
            data = json.loads(txt)
        except Exception:
            return None
        return data if isinstance(data, dict) else None
    return None


# ---------------------------------------------------------
# List jobs (scoped to user)
# ---------------------------------------------------------

@router.get("")
def list_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    clip_counts_sq = (
        db.query(
            Clip.job_id.label("job_id"),
            func.count(Clip.id).label("clips_generated"),
        )
        .group_by(Clip.job_id)
        .subquery()
    )

    jobs = (
        db.query(
            Job,
            func.coalesce(clip_counts_sq.c.clips_generated, 0).label("clips_generated"),
        )
        .join(Upload, Job.upload_id == Upload.id)
        .outerjoin(clip_counts_sq, clip_counts_sq.c.job_id == Job.id)
        .filter(Upload.user_id == current_user.id)
        .order_by(Job.created_at.desc(), Job.id.desc())
        .all()
    )

    return [
        {
            "clips_generated": int(clips_generated or 0),
            "id": job.id,
            "upload_id": job.upload_id,
            "kind": getattr(job, "kind", "clip"),
            "status": job.status,
            "error": job.error,
            "credits_reserved": int(job.credits_reserved or 0),
            "credits_refunded": bool(job.credits_refunded),
            "prompt": getattr(job, "prompt", None),
            "aspect_ratio": getattr(job, "aspect_ratio", None),
            "duration_seconds": getattr(job, "duration_seconds", None),
            "settings": _parse_job_settings(getattr(job, "caption_style_json", None)),
            "created_at": job.created_at,
            "updated_at": getattr(job, "updated_at", None),
        }
        for job, clips_generated in jobs
    ]


# ---------------------------------------------------------
# Get single job (polling endpoint)
# ---------------------------------------------------------

@router.get("/{job_id}")
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = (
        db.query(Job)
        .join(Upload, Job.upload_id == Upload.id)
        .filter(Job.id == job_id)
        .filter(Upload.user_id == current_user.id)
        .first()
    )

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    clips_generated = db.query(func.count(Clip.id)).filter(Clip.job_id == job.id).scalar() or 0

    return {
        "clips_generated": int(clips_generated),
        "id": job.id,
        "upload_id": job.upload_id,
        "kind": getattr(job, "kind", "clip"),
        "status": job.status,
        "error": job.error,
        "credits_reserved": int(job.credits_reserved or 0),
        "credits_refunded": bool(job.credits_refunded),
        "prompt": getattr(job, "prompt", None),
        "aspect_ratio": getattr(job, "aspect_ratio", None),
        "duration_seconds": getattr(job, "duration_seconds", None),
        "settings": _parse_job_settings(getattr(job, "caption_style_json", None)),
        "created_at": job.created_at,
        "updated_at": getattr(job, "updated_at", None),
    }


# ---------------------------------------------------------
# Cancel job (NEW — REQUIRED)
# ---------------------------------------------------------

@router.post("/{job_id}/cancel")
def cancel_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = (
        db.query(Job)
        .join(Upload, Job.upload_id == Upload.id)
        .filter(Job.id == job_id)
        .filter(Upload.user_id == current_user.id)
        .first()
    )

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # If already finished, treat as no-op
    if job.status in ("done", "failed", "canceled"):
        return {
            "ok": True,
            "status": job.status,
        }

    refunded = 0
    # Refund reserved credits immediately on cancel so users are not charged
    # for jobs they explicitly canceled (queued or currently running).
    if job.status in ("queued", "running"):
        reserved = int(job.credits_reserved or 0)
        already_refunded = bool(job.credits_refunded)
        if reserved > 0 and not already_refunded:
            # Lock user row while updating credit balance.
            user_row = (
                db.query(User)
                .filter(User.id == current_user.id)
                .with_for_update()
                .first()
            )
            if user_row:
                user_row.credits = int(user_row.credits or 0) + reserved
                job.credits_refunded = True
                refunded = reserved

    # Mark canceled
    job.status = "canceled"
    job.error = "Canceled by user"

    db.commit()

    return {
        "ok": True,
        "status": "canceled",
        "credits_refunded": refunded,
    }
