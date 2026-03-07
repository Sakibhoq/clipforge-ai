# backend/routers/clips.py
import json
import os
import re
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.database import get_db
from models.clip import Clip
from models.upload import Upload
from models.user import User
from storage import get_storage
from routers.auth import get_current_user

router = APIRouter(prefix="/clips", tags=["clips"])

DOWNLOAD_LIMITS = {
    "free": 20,
    "starter": 50,
    "creator": None,
    "studio": None,
}

DOWNLOAD_CREDIT_COST = {
    "free": 1,
    "starter": 1,
    "creator": 0,
    "studio": 0,
}


def _plan_key(raw_plan: Optional[str]) -> str:
    p = (raw_plan or "").strip().lower()
    token = re.sub(r"[^a-z0-9]+", "_", p).strip("_")
    if token in DOWNLOAD_LIMITS:
        return token

    aliases = {
        "free_trial": "free",
        "trial": "free",
        "trialing": "free",
        "starter_monthly": "starter",
        "starter_yearly": "starter",
        "labs_starter": "starter",
        "labs_spark": "starter",
        "creator_plus": "creator",
        "creator_monthly": "creator",
        "creator_yearly": "creator",
        "labs_creator": "creator",
        "labs_velocity": "creator",
        "pro": "creator",
        "pro_plus": "creator",
        "studio_monthly": "studio",
        "studio_yearly": "studio",
    }
    if token in aliases:
        return aliases[token]

    if token.startswith("starter") or "starter" in token or "spark" in token:
        return "starter"
    if token.startswith("creator") or token.startswith("pro") or "creator" in token or "velocity" in token:
        return "creator"
    if token.startswith("studio") or "studio" in token:
        return "studio"
    return "free"


def _download_window_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _consume_download_quota(db: Session, *, current_user: User) -> None:
    user_row = (
        db.query(User)
        .filter(User.id == current_user.id)
        .with_for_update()
        .first()
    )
    if not user_row:
        raise HTTPException(status_code=401, detail="Not authenticated")

    plan = _plan_key(getattr(user_row, "plan", None))
    limit = DOWNLOAD_LIMITS.get(plan)
    cost = int(DOWNLOAD_CREDIT_COST.get(plan, 0) or 0)

    now_window = _download_window_key()
    current_window = str(getattr(user_row, "downloads_window", "") or "")
    used = int(getattr(user_row, "downloads_used", 0) or 0)

    if current_window != now_window:
        current_window = now_window
        used = 0
        user_row.downloads_window = now_window
        user_row.downloads_used = 0

    if limit is not None and used >= int(limit):
        raise HTTPException(
            status_code=403,
            detail=(
                f"Download limit reached ({limit}/{limit}) for your current plan. "
                "Upgrade to unlock more downloads."
            ),
        )

    credits = int(getattr(user_row, "credits", 0) or 0)
    if cost > 0 and credits < cost:
        raise HTTPException(
            status_code=402,
            detail=f"Not enough credits to download (need {cost}, have {credits}).",
        )

    if cost > 0:
        user_row.credits = credits - cost

    if limit is not None:
        user_row.downloads_used = used + 1

    db.commit()


def _sanitize_download_name(name: str) -> str:
    cleaned = "".join(ch for ch in (name or "clip.mp4") if ch not in '/\\:*?"<>|').strip()
    if not cleaned:
        cleaned = "clip.mp4"
    if not cleaned.lower().endswith(".mp4"):
        cleaned += ".mp4"
    return cleaned


def _slugify_filename_base(text: str, fallback: str = "clip", max_len: int = 64) -> str:
    s = str(text or "").strip()
    if not s:
        return fallback
    s = s.encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^A-Za-z0-9\s\-_]+", "", s)
    s = re.sub(r"[\s_]+", "-", s).strip("-").lower()
    if not s:
        return fallback
    if len(s) > max_len:
        s = s[:max_len].strip("-")
    return s or fallback


def _clip_download_name(clip: Clip, override: Optional[str] = None) -> str:
    if override:
        return _sanitize_download_name(override)
    title = (clip.title or "").strip()
    if title:
        return _sanitize_download_name(f"{title}.mp4")
    if clip.storage_key:
        return _sanitize_download_name(clip.storage_key.split("/")[-1])
    return _sanitize_download_name(f"clip-{clip.id}.mp4")


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


def _copy_stream_to_path(body, dest_path: str, chunk_size: int = 1024 * 1024) -> None:
    try:
        with open(dest_path, "wb") as out:
            while True:
                chunk = body.read(chunk_size)
                if not chunk:
                    break
                out.write(chunk)
    finally:
        try:
            body.close()
        except Exception:
            pass


def _probe_video(path: str) -> tuple:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "ffprobe failed")

    data = json.loads(proc.stdout or "{}")
    streams = data.get("streams") or []
    v_stream = next((s for s in streams if str(s.get("codec_type", "")).lower() == "video"), None)
    if not v_stream:
        raise RuntimeError("No video stream found")

    width = int(v_stream.get("width") or 0)
    height = int(v_stream.get("height") or 0)
    if width <= 0 or height <= 0:
        raise RuntimeError("Invalid video dimensions")

    duration_val = (data.get("format") or {}).get("duration") or v_stream.get("duration")
    duration = float(duration_val) if duration_val is not None else 0.0
    return width, height, max(0.0, duration)


def _even_floor(v: int) -> int:
    iv = int(v)
    if iv % 2:
        iv -= 1
    return max(2, iv)


def _clip_url(storage, key: str, request: Optional[Request]) -> str:
    url = storage.presign_get(key)  # type: ignore[attr-defined]
    if isinstance(url, str) and url.startswith("/") and request is not None:
        base = str(request.base_url).rstrip("/")
        return f"{base}{url}"
    return str(url)


def _clip_dict(clip: Clip, storage, request: Optional[Request]):
    return {
        "id": clip.id,
        "upload_id": clip.upload_id,
        "storage_key": clip.storage_key,
        "url": _clip_url(storage, clip.storage_key, request),
        "start_time": clip.start_time,
        "end_time": clip.end_time,
        "duration": clip.duration,
        "title": clip.title,
        "hook": clip.hook,
    }


def _clip_storage_exists(storage, key: str) -> bool:
    k = (key or "").strip()
    if not k:
        return False
    try:
        if hasattr(storage, "exists"):
            return bool(storage.exists(k))
    except Exception:
        # Fail-open to avoid hiding clips on transient storage HEAD errors.
        return True
    return True


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


class ClipCropRequest(BaseModel):
    x: float = Field(default=0.0, ge=0.0, le=1.0)
    y: float = Field(default=0.0, ge=0.0, le=1.0)
    w: float = Field(default=1.0, gt=0.0, le=1.0)
    h: float = Field(default=1.0, gt=0.0, le=1.0)
    trim_start: float = Field(default=0.0, ge=0.0)
    trim_end: Optional[float] = Field(default=None, ge=0.0)


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

    safe_name = _clip_download_name(clip, filename)
    storage = get_storage()

    if not _clip_storage_exists(storage, clip.storage_key):
        raise HTTPException(status_code=404, detail="Clip file not found")

    try:
        body = storage.open(clip.storage_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Clip file not found")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to open clip file")

    try:
        _consume_download_quota(db, current_user=current_user)
    except Exception:
        try:
            body.close()
        except Exception:
            pass
        raise

    headers = {
        "Content-Disposition": f'attachment; filename="{safe_name}"; filename*=UTF-8\'\'{quote(safe_name)}'
    }
    return StreamingResponse(_stream_filelike(body), media_type="video/mp4", headers=headers)


@router.post("/{clip_id}/crop")
def crop_clip(
    clip_id: int,
    payload: ClipCropRequest,
    request: Request,
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

    plan = _plan_key(getattr(current_user, "plan", None))
    if plan == "free":
        raise HTTPException(status_code=403, detail="Editor is available on Starter and above.")

    if (payload.x + payload.w) > 1.000001 or (payload.y + payload.h) > 1.000001:
        raise HTTPException(status_code=422, detail="Crop rectangle must stay within frame bounds")

    storage = get_storage()
    src_fd, src_path = tempfile.mkstemp(prefix=f"clip-src-{clip.id}-", suffix=".mp4")
    out_fd, out_path = tempfile.mkstemp(prefix=f"clip-crop-{clip.id}-", suffix=".mp4")
    os.close(src_fd)
    os.close(out_fd)

    try:
        try:
            body = storage.open(clip.storage_key)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Clip file not found")
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to open clip file")

        _copy_stream_to_path(body, src_path)
        src_w, src_h, detected_duration = _probe_video(src_path)

        trim_start = float(payload.trim_start or 0.0)
        trim_start = max(0.0, min(trim_start, detected_duration))

        trim_end = detected_duration if payload.trim_end is None else float(payload.trim_end)
        trim_end = max(0.0, min(trim_end, detected_duration))
        if (trim_end - trim_start) < 0.35:
            raise HTTPException(status_code=422, detail="Trim range is too short")

        crop_w = min(_even_floor(src_w), _even_floor(round(src_w * float(payload.w))))
        crop_h = min(_even_floor(src_h), _even_floor(round(src_h * float(payload.h))))
        if crop_w < 2 or crop_h < 2:
            raise HTTPException(status_code=422, detail="Crop size is too small")

        x = int(round(src_w * float(payload.x)))
        y = int(round(src_h * float(payload.y)))
        max_x = max(0, src_w - crop_w)
        max_y = max(0, src_h - crop_h)
        x = max(0, min(x, max_x))
        y = max(0, min(y, max_y))
        if x % 2:
            x = max(0, x - 1)
        if y % 2:
            y = max(0, y - 1)

        ffmpeg_cmd = [
            "ffmpeg",
            "-y",
            "-i",
            src_path,
            "-ss",
            f"{trim_start:.3f}",
            "-to",
            f"{trim_end:.3f}",
            "-vf",
            f"crop={crop_w}:{crop_h}:{x}:{y}",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            out_path,
        ]
        proc = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "ffmpeg crop failed").strip()
            raise HTTPException(status_code=500, detail=detail[-400:])

        parent = clip.storage_key.rsplit("/", 1)[0] if "/" in clip.storage_key else f"users/{current_user.id}/clips"
        title_base = (clip.title or f"Clip {clip.id}").strip() or f"Clip {clip.id}"
        cropped_title = f"{title_base} (Cropped)"
        stem = _slugify_filename_base(cropped_title, fallback=f"clip-{clip.id}-cropped")
        new_key = f"{parent}/{stem}.mp4"
        if hasattr(storage, "exists"):
            try:
                if storage.exists(new_key):
                    new_key = f"{parent}/{stem}-{uuid.uuid4().hex[:8]}.mp4"
            except Exception:
                pass

        if hasattr(storage, "upload"):
            storage.upload(out_path, new_key, content_type="video/mp4")  # type: ignore[attr-defined]
        else:
            with open(out_path, "rb") as f:
                storage.save(f, new_key, content_type="video/mp4")
        clip_base_start = float(clip.start_time or 0.0)
        new_start = clip_base_start + trim_start
        new_end = clip_base_start + trim_end
        new_clip = Clip(
            upload_id=clip.upload_id,
            job_id=clip.job_id,
            storage_key=new_key,
            start_time=new_start,
            end_time=new_end,
            duration=max(0.0, new_end - new_start),
            title=cropped_title,
            hook=clip.hook,
        )
        db.add(new_clip)
        db.commit()
        db.refresh(new_clip)

        return _clip_dict(new_clip, storage, request)
    finally:
        try:
            os.unlink(src_path)
        except Exception:
            pass
        try:
            os.unlink(out_path)
        except Exception:
            pass


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
        clips = [c for c in clips if _clip_storage_exists(storage, c.storage_key)]
        return [_clip_dict(c, storage, request) for c in clips]

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
        visible = [c for c in all_clips if _clip_storage_exists(storage, c.storage_key)]
        return [_clip_dict(c, storage, request) for c in visible]

    by_upload = {}
    for c in all_clips:
        if not _clip_storage_exists(storage, c.storage_key):
            continue
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
                "clips": [_clip_dict(c, storage, request) for c in clips_for_u],
            }
        )

    return out
