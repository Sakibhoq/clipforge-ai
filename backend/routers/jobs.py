from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from models.job import Job
from models.upload import Upload
from models.user import User

from routers.auth import get_current_user

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("")
def list_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ✅ Scope jobs to the authenticated user via Upload ownership
    jobs = (
        db.query(Job)
        .join(Upload, Job.upload_id == Upload.id)
        .filter(Upload.user_id == current_user.id)
        .order_by(Job.created_at.desc(), Job.id.desc())
        .all()
    )

    # Keep response shape stable
    return [
        {
            "id": job.id,
            "upload_id": job.upload_id,
            "status": job.status,
            "error": job.error,
            "created_at": job.created_at,
        }
        for job in jobs
    ]


@router.get("/{job_id}")
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch a single job by id, scoped to the authenticated user (via Upload ownership).
    This is the polling endpoint the frontend should use instead of scanning /jobs.
    """
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
