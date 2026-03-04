import json
import uuid

import pytest
from fastapi import HTTPException

import routers.social as social_router
from core.database import SessionLocal
from models.social_account import SocialAccount
from models.social_post import SocialPost
from models.user import User
from routers.social import _validate_tiktok_post_options, get_provider_publish_options


def _mk_user(db) -> User:
    user = User(
        email=f"tt_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        plan="creator",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _mk_tiktok_account(db, *, user_id: int) -> SocialAccount:
    account = SocialAccount(
        user_id=user_id,
        provider="tiktok",
        account_id="open-id-1",
        account_name="creator-account",
        access_token="access-token",
        refresh_token="refresh-token",
        scopes=json.dumps(["video.upload", "video.publish", "user.info.basic"]),
        status="connected",
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@pytest.fixture()
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(autouse=True)
def _clean(db):
    for model in (SocialPost, SocialAccount, User):
        db.query(model).delete()
    db.commit()
    yield


def test_tiktok_publish_options_prefills_last_post_settings(monkeypatch, db):
    user = _mk_user(db)
    _mk_tiktok_account(db, user_id=user.id)

    db.add(
        SocialPost(
            user_id=user.id,
            provider="tiktok",
            clip_id=None,
            storage_key="users/1/clips/demo.mp4",
            caption="Reuse this TikTok caption",
            post_options_json=json.dumps(
                {
                    "publish_mode": "MEDIA_UPLOAD",
                    "allow_comments": True,
                    "allow_duet": True,
                    "allow_stitch": False,
                    "branded_content": True,
                    "brand_organic": False,
                    "is_aigc": True,
                    "privacy_level": "SELF_ONLY",
                    "confirm_music_usage": True,
                }
            ),
            status="posted",
        )
    )
    db.commit()

    monkeypatch.setattr(social_router, "_refresh_access_token_if_needed", lambda _db, _account: "fresh-token")
    monkeypatch.setattr(
        social_router,
        "_tiktok_query_creator_info",
        lambda _access_token: {
            "privacy_level_options": ["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "SELF_ONLY"],
            "comment_disabled": False,
            "duet_disabled": False,
            "stitch_disabled": False,
            "max_video_post_duration_sec": 180,
        },
    )

    result = get_provider_publish_options("tiktok", db=db, current_user=user)
    options = result["options"]

    assert result["last_caption"] == "Reuse this TikTok caption"
    assert options["publish_mode"]["value"] == "MEDIA_UPLOAD"
    # Keep privacy explicitly unselected for each new post per TikTok UX requirements.
    assert options["privacy_level"]["value"] == ""
    assert options["allow_comments"]["value"] is True
    assert options["allow_duet"]["value"] is True
    assert options["allow_stitch"]["value"] is False
    assert options["branded_content"]["value"] is True
    assert options["brand_organic"]["value"] is False
    assert options["is_aigc"]["value"] is True
    # Confirmations should always require explicit user action.
    assert options["confirm_music_usage"]["value"] is False
    assert options["confirm_branded_content"]["value"] is False


def test_tiktok_publish_options_marks_when_creator_cannot_post(monkeypatch, db):
    user = _mk_user(db)
    _mk_tiktok_account(db, user_id=user.id)

    monkeypatch.setattr(social_router, "_refresh_access_token_if_needed", lambda _db, _account: "fresh-token")
    monkeypatch.setattr(
        social_router,
        "_tiktok_query_creator_info",
        lambda _access_token: {
            "privacy_level_options": ["SELF_ONLY"],
            "can_post": False,
            "post_disabled_reason": "Daily posting quota reached",
        },
    )

    result = get_provider_publish_options("tiktok", db=db, current_user=user)
    assert result["post_blocked"] is True
    assert "quota reached" in str(result["post_block_reason"]).lower()


def test_validate_tiktok_post_options_rejects_when_creator_cannot_post(monkeypatch, db):
    user = _mk_user(db)
    _mk_tiktok_account(db, user_id=user.id)

    monkeypatch.setattr(social_router, "_refresh_access_token_if_needed", lambda _db, _account: "fresh-token")
    monkeypatch.setattr(
        social_router,
        "_tiktok_query_creator_info",
        lambda _access_token: {
            "privacy_level_options": ["SELF_ONLY"],
            "can_post_now": False,
            "reason": "Posting temporarily unavailable",
        },
    )

    with pytest.raises(HTTPException) as err:
        _validate_tiktok_post_options(
            db,
            user_id=user.id,
            clip_duration_seconds=12.0,
            options={
                "publish_mode": "DIRECT_POST",
                "privacy_level": "SELF_ONLY",
                "confirm_music_usage": True,
                "confirm_branded_content": False,
                "allow_comments": False,
                "allow_duet": False,
                "allow_stitch": False,
                "branded_content": False,
                "brand_organic": False,
                "is_aigc": False,
            },
        )
    assert err.value.status_code == 422
    assert "posting temporarily unavailable" in str(err.value.detail).lower()
