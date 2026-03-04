import os

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from core.database import SessionLocal
from storage.s3_client import build_s3_client, uses_object_storage_backend

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health():
    return {"status": "ok"}


@router.get("/ready")
async def ready():
    """
    Readiness check for production orchestration.
    - DB connectivity
    - Storage backend basic sanity (local writable OR object storage bucket reachable)
    """
    checks: dict[str, str] = {}
    ok = True

    # DB
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as e:
        ok = False
        checks["db"] = f"fail: {type(e).__name__}"

    # Storage
    backend = (os.getenv("STORAGE_BACKEND") or "local").strip().lower()
    checks["storage_backend"] = backend

    if uses_object_storage_backend(backend):
        bucket = (os.getenv("S3_BUCKET") or "").strip()
        region = (os.getenv("AWS_REGION") or "").strip()
        if not bucket:
            ok = False
            checks["object_storage_bucket"] = "missing"
        else:
            try:
                s3 = build_s3_client(region_name=region or None)
                s3.head_bucket(Bucket=bucket)
                checks["object_storage"] = "ok"
            except Exception as e:
                ok = False
                checks["object_storage"] = f"fail: {type(e).__name__}"
    else:
        path = (os.getenv("LOCAL_STORAGE_PATH") or "/data/storage").strip()
        checks["local_storage_path"] = path
        try:
            os.makedirs(path, exist_ok=True)
            probe = os.path.join(path, ".readycheck")
            with open(probe, "wb") as f:
                f.write(b"ok")
            os.remove(probe)
            checks["local_storage"] = "ok"
        except Exception as e:
            ok = False
            checks["local_storage"] = f"fail: {type(e).__name__}"

    if not ok:
        raise HTTPException(status_code=503, detail={"status": "not_ready", "checks": checks})

    return {"status": "ok", "checks": checks}
