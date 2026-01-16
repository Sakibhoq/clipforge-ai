from sqlalchemy.orm import Session

from models.job import Job
from models.upload import Upload


def create_job(db: Session, upload_id: int) -> Job:
    job = Job(
        upload_id=upload_id,
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def list_jobs(db: Session, user_id: int):
    """
    Return jobs scoped to a user via Upload ownership.
    Avoid relying on relationship join magic; do an explicit join.
    """
    return (
        db.query(Job)
        .join(Upload, Job.upload_id == Upload.id)
        .filter(Upload.user_id == user_id)
        .order_by(Job.created_at.desc(), Job.id.desc())
        .all()
    )
