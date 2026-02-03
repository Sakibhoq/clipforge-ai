from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from models.job import Job
from models.upload import Upload
from models.user import User

from routers.auth import get_current_user

router = APIRouter(prefix="/jobs", tags=["jobs"])


# ---------------------------------------------------------
# List jobs (scoped to user)
# ---------------------------------------------------------

@router.get("")
def list_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jobs = (
        db.query(Job)
        .join(Upload, Job.upload_id == Upload.id)
        .filter(Upload.user_id == current_user.id)
        .order_by(Job.created_at.desc(), Job.id.desc())
        .all()
    )

    return [
        {
            "id": job.id,
            "upload_id": job.upload_id,
            "status": job.status,
            "error": job.error,
            "created_at": job.created_at,
            "updated_at": getattr(job, "updated_at", None),
        }
        for job in jobs
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

    return {
        "id": job.id,
        "upload_id": job.upload_id,
        "status": job.status,
        "error": job.error,
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

    # Mark canceled
    job.status = "canceled"
    job.error = "Canceled by user"
    job.running_stage = None

    db.commit()

    return {
        "ok": True,
        "status": "canceled",
    }
