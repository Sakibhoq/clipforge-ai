from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from models.clip import Clip
from models.upload import Upload
from models.user import User
from storage.s3 import S3Storage

from routers.auth import get_current_user

router = APIRouter(prefix="/clips", tags=["clips"])


@router.get("/")
def list_clips(
    upload_id: Optional[int] = Query(default=None),
    grouped: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    - If upload_id provided: returns flat list of clips for that upload.
    - If upload_id missing:
        grouped=true  -> returns [{ upload: {...}, clips: [...] }, ...]
        grouped=false -> returns flat list of all clips for user
    """

    storage = S3Storage()

    def clip_dict(clip: Clip):
        return {
            "id": clip.id,
            "upload_id": clip.upload_id,
            "storage_key": clip.storage_key,
            "url": storage.presign_get(clip.storage_key),
            "start_time": clip.start_time,
            "end_time": clip.end_time,
            "duration": clip.duration,
        }

    # ---------------------------------------------------------
    # 1) Single-upload mode (keep your existing security)
    # ---------------------------------------------------------
    if upload_id is not None:
        upload = db.query(Upload).filter(Upload.id == upload_id).first()
        if not upload:
            raise HTTPException(status_code=404, detail="Upload not found")
        if upload.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Forbidden")

        clips = (
            db.query(Clip)
            .join(Upload, Clip.upload_id == Upload.id)
            .filter(Clip.upload_id == upload_id)
            .filter(Upload.user_id == current_user.id)
            .order_by(Clip.start_time.asc(), Clip.id.asc())
            .all()
        )
        return [clip_dict(c) for c in clips]

    # ---------------------------------------------------------
    # 2) All uploads for this user
    # ---------------------------------------------------------
    uploads = (
        db.query(Upload)
        .filter(Upload.user_id == current_user.id)
        .order_by(Upload.id.desc())
        .all()
    )

    if not uploads:
        return []

    upload_ids = [u.id for u in uploads]

    all_clips = (
        db.query(Clip)
        .filter(Clip.upload_id.in_(upload_ids))
        .order_by(Clip.upload_id.desc(), Clip.start_time.asc(), Clip.id.asc())
        .all()
    )

    if not grouped:
        return [clip_dict(c) for c in all_clips]

    by_upload = {}
    for c in all_clips:
        by_upload.setdefault(c.upload_id, []).append(c)

    out = []
    for u in uploads:
        clips_for_u = by_upload.get(u.id, [])
        if not clips_for_u:
            continue
        out.append(
            {
                "upload": {
                    "id": u.id,
                    "original_filename": u.original_filename,
                    "storage_key": u.storage_key,
                },
                "clips": [clip_dict(c) for c in clips_for_u],
            }
        )

    return out
