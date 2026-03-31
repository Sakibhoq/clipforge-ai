import uuid
from types import SimpleNamespace

from core.database import SessionLocal
from models.job import Job
from models.upload import Upload
from models.user import User
from routers.generate import GeneratePostRequest, _default_post_scene_count, create_post_generation


def _mk_user(db, *, plan: str, credits: int = 1000) -> int:
    user = User(
        email=f"post_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        plan=plan,
        credits=credits,
    )
    db.add(user)
    db.flush()
    user_id = int(user.id)
    db.commit()
    return user_id


def test_default_post_scene_count_matches_duration_targets():
    assert _default_post_scene_count(60) == 6
    assert _default_post_scene_count(90) == 8
    assert _default_post_scene_count(120) == 10


def _reserve_post_credits(post_visual_mode: str) -> int:
    db = SessionLocal()
    try:
        user_id = _mk_user(db, plan="creator", credits=1000)
        current_user = SimpleNamespace(id=user_id)
        shared_payload = dict(
            visual_prompt="Anime founder story with a recurring protagonist and premium neon framing.",
            voice_script="This is a polished narration script with enough words to cover the short post comfortably.",
            aspect_ratio="9:16",
            duration_seconds=60,
            style_preset="anime",
            image_count=6,
        )

        result = create_post_generation(
            payload=GeneratePostRequest(post_visual_mode=post_visual_mode, **shared_payload),
            db=db,
            current_user=current_user,
        )
        return int(result.credits_reserved or 0)
    finally:
        db.close()


def test_picture_post_charges_less_than_video_post():
    picture_credits = _reserve_post_credits("image")
    video_credits = _reserve_post_credits("video")

    assert picture_credits < video_credits
    assert 16 <= picture_credits <= 20
    assert 75 <= video_credits <= 100
