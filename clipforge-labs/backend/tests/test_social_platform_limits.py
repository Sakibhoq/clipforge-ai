import uuid

import pytest
from fastapi import HTTPException

from core.database import SessionLocal
from models.clip import Clip
from models.job import Job
from models.social_post import SocialPost
from models.upload import Upload
from models.user import User
from routers.social import _enforce_clip_platform_limit


def _mk_user(db, *, plan: str) -> User:
    u = User(
        email=f"u_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        plan=plan,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _mk_clip(db, *, user_id: int) -> Clip:
    up = Upload(
        user_id=user_id,
        original_filename="test.mp4",
        storage_key=f"users/{user_id}/videos/{uuid.uuid4().hex}.mp4",
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
        storage_key=f"users/{user_id}/clips/{uuid.uuid4().hex}.mp4",
        start_time=0.0,
        end_time=10.0,
        duration=10.0,
    )
    db.add(clip)
    db.commit()
    db.refresh(clip)
    return clip


def _mk_post(db, *, user_id: int, clip_id: int, provider: str, status: str = "queued") -> SocialPost:
    p = SocialPost(
        user_id=user_id,
        clip_id=clip_id,
        provider=provider,
        storage_key=f"users/{user_id}/clips/{uuid.uuid4().hex}.mp4",
        caption="hello",
        status=status,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture()
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(autouse=True)
def _clean(db):
    # Clear rows between tests.
    for model in (SocialPost, Clip, Job, Upload, User):
        db.query(model).delete()
    db.commit()
    yield


def test_free_plan_cannot_publish_to_social(db):
    u = _mk_user(db, plan="free")
    clip = _mk_clip(db, user_id=u.id)

    with pytest.raises(HTTPException) as e:
        _enforce_clip_platform_limit(db, user=u, clip_id=clip.id, provider="facebook")
    assert e.value.status_code == 403


def test_starter_plan_allows_facebook_and_instagram_only(db):
    u = _mk_user(db, plan="starter")
    clip = _mk_clip(db, user_id=u.id)

    _enforce_clip_platform_limit(db, user=u, clip_id=clip.id, provider="facebook")
    _mk_post(db, user_id=u.id, clip_id=clip.id, provider="facebook")
    _enforce_clip_platform_limit(db, user=u, clip_id=clip.id, provider="instagram")
    _mk_post(db, user_id=u.id, clip_id=clip.id, provider="instagram")

    with pytest.raises(HTTPException) as e:
        _enforce_clip_platform_limit(db, user=u, clip_id=clip.id, provider="youtube")
    assert e.value.status_code == 403

    with pytest.raises(HTTPException) as e:
        _enforce_clip_platform_limit(db, user=u, clip_id=clip.id, provider="tiktok")
    assert e.value.status_code == 403


def test_starter_plan_allows_reposting_to_existing_provider(db):
    u = _mk_user(db, plan="starter")
    clip = _mk_clip(db, user_id=u.id)
    _mk_post(db, user_id=u.id, clip_id=clip.id, provider="facebook")
    _mk_post(db, user_id=u.id, clip_id=clip.id, provider="instagram")

    # Re-posting to an existing provider for the same clip is allowed.
    _enforce_clip_platform_limit(db, user=u, clip_id=clip.id, provider="facebook")


def test_creator_plan_is_unlimited(db):
    u = _mk_user(db, plan="creator")
    clip = _mk_clip(db, user_id=u.id)
    _mk_post(db, user_id=u.id, clip_id=clip.id, provider="youtube")
    _mk_post(db, user_id=u.id, clip_id=clip.id, provider="tiktok")
    _mk_post(db, user_id=u.id, clip_id=clip.id, provider="instagram")

    _enforce_clip_platform_limit(db, user=u, clip_id=clip.id, provider="facebook")
