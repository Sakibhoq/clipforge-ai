from datetime import datetime, timedelta, timezone
import uuid

import pytest

from core.database import SessionLocal
from models.clip import Clip
from models.job import Job
from models.upload import Upload
from models.user import User
from services import clip_retention


class _MockStorage:
    def __init__(self) -> None:
        self.deleted: list[str] = []

    def delete(self, key: str) -> None:
        self.deleted.append(key)


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _mk_user(db) -> User:
    user = User(
        email=f"retention_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        plan="creator",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _mk_clip(db, *, user_id: int, created_at: datetime, storage_key: str) -> Clip:
    upload = Upload(
        user_id=user_id,
        original_filename="asset.mp4",
        storage_key=f"users/{user_id}/uploads/{uuid.uuid4().hex}.mp4",
        source_type="generated",
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)

    job = Job(upload_id=upload.id, kind="generate", status="done", created_at=created_at)
    db.add(job)
    db.commit()
    db.refresh(job)

    clip = Clip(
        upload_id=upload.id,
        job_id=job.id,
        storage_key=storage_key,
        start_time=0.0,
        end_time=6.0,
        duration=6.0,
        title="Retention Test",
    )
    db.add(clip)
    db.commit()
    db.refresh(clip)
    return clip


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _clean(db):
    for model in (Clip, Job, Upload, User):
        db.query(model).delete()
    db.commit()
    yield


def test_purge_expired_clips_deletes_only_assets_older_than_90_days(db, monkeypatch: pytest.MonkeyPatch):
    user = _mk_user(db)
    old_clip = _mk_clip(
        db,
        user_id=user.id,
        created_at=_utc_now_naive() - timedelta(days=91),
        storage_key=f"clips/generated/{uuid.uuid4().hex}.mp4",
    )
    recent_clip = _mk_clip(
        db,
        user_id=user.id,
        created_at=_utc_now_naive() - timedelta(days=60),
        storage_key=f"clips/generated/{uuid.uuid4().hex}.mp4",
    )
    old_clip_id = int(old_clip.id)
    old_clip_key = str(old_clip.storage_key)
    recent_clip_id = int(recent_clip.id)

    storage = _MockStorage()
    monkeypatch.setattr(clip_retention, "get_storage", lambda: storage)
    monkeypatch.setenv("CLIP_RETENTION_ENABLED", "1")
    monkeypatch.setenv("CLIP_RETENTION_DAYS", "90")

    deleted = clip_retention.purge_expired_clips(limit=20)

    db.expire_all()
    assert deleted == 1
    assert storage.deleted == [old_clip_key]
    assert db.query(Clip).filter(Clip.id == old_clip_id).first() is None
    assert db.query(Clip).filter(Clip.id == recent_clip_id).first() is not None
