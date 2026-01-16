import os
import uuid
from pathlib import Path
from typing import Tuple

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.database import get_db
from models.upload import Upload
from models.job import Job
from models.user import User

# Reuse the auth dependency from your auth router (cookie-based)
from routers.auth import get_current_user

router = APIRouter(prefix="/upload", tags=["upload"])


# local storage target (same as LocalStorage)
DEFAULT_STORAGE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "data", "storage")
)
BASE_STORAGE_PATH = os.getenv("LOCAL_STORAGE_PATH", DEFAULT_STORAGE_PATH)

# Production safety limits (override via env if needed)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(2 * 1024 * 1024 * 1024)))  # 2GB default
ALLOWED_MIME_PREFIXES: Tuple[str, ...] = ("video/",)


def _safe_filename(name: str) -> str:
    """
    Prevent path traversal and weird separators. Keep it predictable.
    """
    name = (name or "").strip()
    name = name.replace("\\", "_").replace("/", "_")
    name = name.replace("\x00", "_")
    if not name:
        return "upload.bin"
    # keep it reasonably short to avoid filesystem issues
    if len(name) > 180:
        base, ext = os.path.splitext(name)
        name = base[:160] + ext[:20]
    return name


def _ensure_under_base(base_dir: Path, target: Path) -> None:
    """
    Ensure target path stays under base_dir to prevent traversal.
    """
    base_resolved = base_dir.resolve()
    target_resolved = target.resolve()
    if base_resolved not in target_resolved.parents and base_resolved != target_resolved:
        raise HTTPException(status_code=400, detail="Invalid storage path")


@router.post("")
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # --- Basic validation (production) ---
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    ct = (file.content_type or "").strip().lower()
    if ct and not ct.startswith(ALLOWED_MIME_PREFIXES):
        raise HTTPException(status_code=415, detail=f"Unsupported content type: {ct}")

    safe_name = _safe_filename(file.filename)
    storage_key = f"videos/{uuid.uuid4().hex}_{safe_name}"

    base_dir = Path(BASE_STORAGE_PATH)
    full_path = base_dir / storage_key
    _ensure_under_base(base_dir, full_path)

    full_path.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    try:
        with open(full_path, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)  # 1MB
                if not chunk:
                    break

                out.write(chunk)
                size += len(chunk)

                if size > MAX_UPLOAD_BYTES:
                    # Clean up partial file
                    try:
                        out.close()
                    except Exception:
                        pass
                    try:
                        if full_path.exists():
                            full_path.unlink()
                    except Exception:
                        pass
                    raise HTTPException(
                        status_code=413,
                        detail=f"Upload too large (>{MAX_UPLOAD_BYTES} bytes).",
                    )
    except HTTPException:
        raise
    except Exception as e:
        # Best-effort cleanup
        try:
            if full_path.exists():
                full_path.unlink()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to store file: {e}")
    finally:
        try:
            await file.close()
        except Exception:
            pass

    if size < 1024:  # sanity
        try:
            if full_path.exists():
                full_path.unlink()
        except Exception:
            pass
        raise HTTPException(
            status_code=400,
            detail=f"Upload too small ({size} bytes). Bad file upload.",
        )

    # ✅ Tie upload to the authenticated user (already correct)
    upload = Upload(
        user_id=current_user.id,
        original_filename=safe_name,
        storage_key=storage_key,
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)

    # ✅ Job created for this upload
    job = Job(upload_id=upload.id, status="queued")
    db.add(job)
    db.commit()
    db.refresh(job)

    return {
        "upload_id": upload.id,
        "job_id": job.id,
        "status": job.status,
        "bytes_saved": size,
    }
