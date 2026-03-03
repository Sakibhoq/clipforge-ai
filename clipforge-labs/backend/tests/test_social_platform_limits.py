import uuid

import pytest
from fastapi import HTTPException

from core.database import SessionLocal
from models.clip import Clip
from models.job import Job
from models.social_post import SocialPost
from models.upload import Upload
from models.user import User
from routers.social import _enforce_clip_platform_limit, _normalize_provider_post_options


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


def test_legacy_starter_alias_applies_starter_provider_limits(db):
    u = _mk_user(db, plan="starter_monthly")
    clip = _mk_clip(db, user_id=u.id)
    _enforce_clip_platform_limit(db, user=u, clip_id=clip.id, provider="facebook")
    _enforce_clip_platform_limit(db, user=u, clip_id=clip.id, provider="instagram")
    with pytest.raises(HTTPException):
        _enforce_clip_platform_limit(db, user=u, clip_id=clip.id, provider="tiktok")


def test_legacy_creator_alias_unlocks_full_provider_access(db):
    u = _mk_user(db, plan="creator_plus")
    clip = _mk_clip(db, user_id=u.id)
    for provider in ("youtube", "tiktok", "instagram", "facebook"):
        _enforce_clip_platform_limit(db, user=u, clip_id=clip.id, provider=provider)


def test_normalize_youtube_post_options_defaults_invalid_values():
    out = _normalize_provider_post_options("youtube", {"privacy_status": "friends_only"})
    assert out["privacy_status"] == "public"


def test_normalize_tiktok_post_options_maps_toggles():
    out = _normalize_provider_post_options(
        "tiktok",
        {
            "publish_mode": "media_upload",
            "privacy_level": "self_only",
            "allow_comments": "0",
            "allow_duet": "false",
            "allow_stitch": "yes",
            "branded_content": "1",
            "brand_organic": "true",
            "is_aigc": "on",
        },
    )
    assert out["publish_mode"] == "MEDIA_UPLOAD"
    assert out["privacy_level"] == "SELF_ONLY"
    assert out["allow_comments"] is False
    assert out["allow_duet"] is False
    assert out["allow_stitch"] is True
    assert out["branded_content"] is True
    assert out["brand_organic"] is True
    assert out["is_aigc"] is True
