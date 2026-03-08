import uuid

import pytest

from core.database import SessionLocal
from models.clip import Clip
from models.job import Job
from models.upload import Upload
from models.user import User
from routers import clips as clips_router


class _MockStorage:
    def exists(self, _key: str) -> bool:
        return True

    def presign_get(self, key: str) -> str:
        return f"/storage/{key}"


def _mk_user(db, *, plan: str = "labs_spark") -> User:
    u = User(
        email=f"u_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        plan=plan,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _mk_clip(
    db,
    *,
    user_id: int,
    source_type: str,
    storage_key: str,
) -> Clip:
    up = Upload(
        user_id=user_id,
        original_filename="asset.mp4",
        storage_key=f"users/{user_id}/uploads/{uuid.uuid4().hex}.mp4",
        source_type=source_type,
    )
    db.add(up)
    db.commit()
    db.refresh(up)

    job = Job(upload_id=up.id, status="done")
    db.add(job)
    db.commit()
    db.refresh(job)

    clip = Clip(
        upload_id=up.id,
        job_id=job.id,
        storage_key=storage_key,
        start_time=0.0,
        end_time=10.0,
        duration=10.0,
        title="Test",
    )
    db.add(clip)
    db.commit()
    db.refresh(clip)
    return clip


@pytest.fixture()
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(autouse=True)
def _clean(db):
    for model in (Clip, Job, Upload, User):
        db.query(model).delete()
    db.commit()
    yield


def test_generated_only_excludes_orbito_clip_jobs(db, monkeypatch: pytest.MonkeyPatch):
    user = _mk_user(db)
    labs_clip = _mk_clip(
        db,
        user_id=user.id,
        source_type="generated",
        storage_key=f"clips/generated/{uuid.uuid4().hex}.mp4",
    )
    _mk_clip(
        db,
        user_id=user.id,
        source_type="upload",
        storage_key=f"users/{user.id}/clips/{uuid.uuid4().hex}.mp4",
    )

    monkeypatch.setattr(clips_router, "get_storage", lambda: _MockStorage())
    rows = clips_router.list_clips(
        upload_id=None,
        grouped=False,
        generated_only=True,
        db=db,
        current_user=user,
        request=None,
    )

    ids = {int(r["id"]) for r in rows}
    assert ids == {int(labs_clip.id)}


def test_generated_only_excludes_regular_orbito_clip(db, monkeypatch: pytest.MonkeyPatch):
    user = _mk_user(db)
    _mk_clip(
        db,
        user_id=user.id,
        source_type="upload",
        storage_key=f"users/{user.id}/clips/{uuid.uuid4().hex}.mp4",
    )

    monkeypatch.setattr(clips_router, "get_storage", lambda: _MockStorage())
    rows = clips_router.list_clips(
        upload_id=None,
        grouped=False,
        generated_only=True,
        db=db,
        current_user=user,
        request=None,
    )

    assert rows == []


def test_generated_only_excludes_generated_source_without_labs_asset_signature(
    db, monkeypatch: pytest.MonkeyPatch
):
    user = _mk_user(db)
    _mk_clip(
        db,
        user_id=user.id,
        source_type="generated",
        storage_key=f"users/{user.id}/clips/{uuid.uuid4().hex}.mp4",
    )

    monkeypatch.setattr(clips_router, "get_storage", lambda: _MockStorage())
    rows = clips_router.list_clips(
        upload_id=None,
        grouped=False,
        generated_only=True,
        db=db,
        current_user=user,
        request=None,
    )

    assert rows == []
