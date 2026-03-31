import os
import threading
from datetime import datetime, timedelta, timezone

from core.database import SessionLocal
from models.clip import Clip
from models.job import Job
from storage import get_storage


def _env_bool(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int, *, min_value: int, max_value: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except Exception:
        return default
    return max(min_value, min(max_value, value))


def clip_retention_enabled() -> bool:
    return _env_bool("CLIP_RETENTION_ENABLED", True)


def clip_retention_days() -> int:
    return _env_int("CLIP_RETENTION_DAYS", 90, min_value=1, max_value=3650)


def clip_retention_interval_seconds() -> int:
    return _env_int("CLIP_RETENTION_INTERVAL_SECONDS", 21_600, min_value=300, max_value=604_800)


def clip_retention_batch_size() -> int:
    return _env_int("CLIP_RETENTION_BATCH_SIZE", 200, min_value=1, max_value=5_000)


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_datetime(value: object) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def purge_expired_clips(*, limit: int | None = None) -> int:
    if not clip_retention_enabled():
        return 0

    cutoff = _utc_now_naive() - timedelta(days=clip_retention_days())
    batch_size = int(limit or clip_retention_batch_size())
    deleted_ids: list[int] = []
    db = SessionLocal()
    try:
        storage = get_storage()
        rows = (
            db.query(Clip.id, Clip.storage_key, Job.created_at)
            .join(Job, Clip.job_id == Job.id)
            .order_by(Job.created_at.asc(), Clip.id.asc())
            .limit(batch_size)
            .all()
        )

        for clip_id, storage_key, created_at in rows:
            created = _normalize_datetime(created_at)
            if created is None or created > cutoff:
                break

            key = str(storage_key or "").strip()
            if key:
                try:
                    storage.delete(key)
                except Exception as exc:
                    print(f"[clip-retention] skip clip_id={clip_id} key={key} delete failed: {exc}")
                    continue

            deleted_ids.append(int(clip_id))

        if deleted_ids:
            db.query(Clip).filter(Clip.id.in_(deleted_ids)).delete(synchronize_session=False)
            db.commit()

        return len(deleted_ids)
    finally:
        db.close()


def retention_loop(stop_event: threading.Event) -> None:
    interval = clip_retention_interval_seconds()
    while not stop_event.is_set():
        try:
            deleted = purge_expired_clips()
            if deleted:
                print(f"[clip-retention] deleted={deleted} older_than_days={clip_retention_days()}")
        except Exception as exc:
            print(f"[clip-retention] error: {exc}")
        stop_event.wait(interval)
