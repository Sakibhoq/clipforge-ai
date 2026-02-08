# backend/routers/clips.py
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.database import get_db
from models.clip import Clip
from models.upload import Upload
from models.user import User
from storage import get_storage
from routers.auth import get_current_user

router = APIRouter(prefix="/clips", tags=["clips"])


def _sanitize_download_name(name: str) -> str:
    cleaned = "".join(ch for ch in (name or "clip.mp4") if ch not in '/\\:*?"<>|').strip()
    if not cleaned:
        cleaned = "clip.mp4"
    if not cleaned.lower().endswith(".mp4"):
        cleaned += ".mp4"
    return cleaned


def _stream_filelike(body, chunk_size: int = 1024 * 1024):
    try:
        while True:
            chunk = body.read(chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        try:
            body.close()
        except Exception:
            pass


def _ensure_sqlite_clip_schema(db: Session) -> None:
    """
    Self-heal local SQLite schemas that predate additive clip metadata columns.
    This avoids 500s when older DB files are reused in dev/test.
    """
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "sqlite":
        return

    cols = {
        str(row[1])
        for row in db.execute(text("PRAGMA table_info(clips)")).fetchall()
        if len(row) > 1
    }

    if "hook" in cols:
        return

    try:
        db.execute(text("ALTER TABLE clips ADD COLUMN hook TEXT"))
        db.commit()
    except Exception as exc:
        db.rollback()
        if "duplicate column name" not in str(exc).lower():
            raise


@router.get("/{clip_id}/download")
def download_clip(
    clip_id: int,
    filename: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    clip = (
        db.query(Clip)
        .join(Upload, Clip.upload_id == Upload.id)
        .filter(Clip.id == clip_id, Upload.user_id == current_user.id)
        .first()
    )
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")

    preferred = filename or (clip.storage_key.split("/")[-1] if clip.storage_key else f"clip-{clip.id}.mp4")
    safe_name = _sanitize_download_name(preferred)
    storage = get_storage()

    # Keep downloads same-origin so "Download" never opens a raw media page.
    if hasattr(storage, "presign_get"):
        try:
            signed = storage.presign_get(  # type: ignore[attr-defined]
                clip.storage_key,
                expires_in=3600,
                response_content_disposition=f'attachment; filename="{safe_name}"; filename*=UTF-8\'\'{quote(safe_name)}',
            )
            if isinstance(signed, str) and signed.startswith("/"):
                base = ""  # same-origin relative URL
                signed = f"{base}{signed}"
            from fastapi.responses import RedirectResponse

            return RedirectResponse(url=signed, status_code=307)
        except TypeError:
            # Storage backend does not support response_content_disposition.
            pass
        except Exception:
            # Fallback to backend stream below.
            pass

    try:
        body = storage.open(clip.storage_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Clip file not found")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to open clip file")

    headers = {
        "Content-Disposition": f'attachment; filename="{safe_name}"; filename*=UTF-8\'\'{quote(safe_name)}'
    }
    return StreamingResponse(_stream_filelike(body), media_type="video/mp4", headers=headers)


@router.get("")  # ✅ IMPORTANT: no trailing slash -> avoids 307 redirect
def list_clips(
    upload_id: Optional[int] = Query(default=None),
    grouped: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    """
    - If upload_id provided: returns flat list of clips for that upload.
    - If upload_id missing:
        grouped=true  -> returns [{ upload: {...}, clips: [...] }, ...]
        grouped=false -> returns flat list of all clips for user
    """
    _ensure_sqlite_clip_schema(db)
    storage = get_storage()

    def _clip_url(key: str) -> str:
        url = storage.presign_get(key)  # type: ignore[attr-defined]
        if isinstance(url, str) and url.startswith("/"):
            base = str(request.base_url).rstrip("/")
            return f"{base}{url}"
        return url

    def clip_dict(clip: Clip):
        return {
            "id": clip.id,
            "upload_id": clip.upload_id,
            "storage_key": clip.storage_key,
            "url": _clip_url(clip.storage_key),
            "start_time": clip.start_time,
            "end_time": clip.end_time,
            "duration": clip.duration,
            "title": clip.title,
            "hook": clip.hook,
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
