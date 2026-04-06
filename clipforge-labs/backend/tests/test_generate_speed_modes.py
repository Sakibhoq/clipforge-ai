import uuid
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from core.database import SessionLocal
from models.job import Job
from models.upload import Upload
from models.user import User
from routers.generate import GenerateVideoRequest, GenerateVoiceoverRequest, create_video_generation, create_voiceover_generation


def _mk_user(db, *, plan: str, credits: int = 200) -> int:
    u = User(
        email=f"u_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        plan=plan,
        credits=credits,
    )
    db.add(u)
    db.flush()
    user_id = int(u.id)
    db.commit()
    return user_id


@pytest.fixture()
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(autouse=True)
def _clean(db):
    for model in (Job, Upload, User):
        db.query(model).delete()
    db.commit()
    yield


def test_starter_plan_rejects_fast_mode(db):
    user_id = _mk_user(db, plan="starter", credits=100)
    current_user = SimpleNamespace(id=user_id)

    payload = GenerateVideoRequest(
        prompt="A cinematic city sunrise with slow drone movement.",
        aspect_ratio="9:16",
        duration_seconds=6,
        generation_speed="fast",
    )

    with pytest.raises(HTTPException) as e:
        create_video_generation(payload=payload, db=db, current_user=current_user)
    assert e.value.status_code == 403


def test_starter_plan_relax_mode_charges_relax_rate(db):
    user_id = _mk_user(db, plan="starter", credits=100)
    current_user = SimpleNamespace(id=user_id)

    payload = GenerateVideoRequest(
        prompt="A cinematic city sunrise with slow drone movement.",
        aspect_ratio="9:16",
        duration_seconds=6,
        generation_speed="relax",
    )

    res = create_video_generation(payload=payload, db=db, current_user=current_user)
    assert int(res.credits_reserved or 0) > 0
    assert res.generation_speed == "relax"

    user_row = db.query(User).filter(User.id == user_id).first()
    assert user_row is not None
    assert int(user_row.credits or 0) == 100 - int(res.credits_reserved or 0)
    assert int(res.credits_reserved or 0) == 18


def test_creator_plan_fast_mode_charges_fast_rate(db):
    user_id = _mk_user(db, plan="creator", credits=100)
    current_user = SimpleNamespace(id=user_id)

    payload = GenerateVideoRequest(
        prompt="A cinematic city sunrise with slow drone movement.",
        aspect_ratio="9:16",
        duration_seconds=6,
        generation_speed="fast",
    )

    res = create_video_generation(payload=payload, db=db, current_user=current_user)
    assert int(res.credits_reserved or 0) > 0
    assert res.generation_speed == "fast"

    user_row = db.query(User).filter(User.id == user_id).first()
    assert user_row is not None
    assert int(user_row.credits or 0) == 100 - int(res.credits_reserved or 0)
    assert int(res.credits_reserved or 0) == 24


def test_labs_spark_plan_fast_mode_charges_fast_rate(db):
    user_id = _mk_user(db, plan="labs_spark", credits=100)
    current_user = SimpleNamespace(id=user_id)

    payload = GenerateVideoRequest(
        prompt="A cinematic city sunrise with slow drone movement.",
        aspect_ratio="9:16",
        duration_seconds=6,
        generation_speed="fast",
    )

    res = create_video_generation(payload=payload, db=db, current_user=current_user)
    assert int(res.credits_reserved or 0) > 0
    assert res.generation_speed == "fast"

    user_row = db.query(User).filter(User.id == user_id).first()
    assert user_row is not None
    assert int(user_row.credits or 0) == 100 - int(res.credits_reserved or 0)
    assert int(res.credits_reserved or 0) == 24


def test_video_voiceover_charges_extra_for_studio_voice(db):
    user_id = _mk_user(db, plan="creator", credits=200)
    base_payload = dict(
        prompt=" ".join(
            [
                "A premium founder monologue about rebuilding after a failed launch, regaining trust, "
                "and turning a rough comeback into a calm, cinematic story."
            ]
            * 8
        ),
        aspect_ratio="9:16",
        duration_seconds=6,
        generation_speed="relax",
    )

    db.commit()

    session_neural = SessionLocal()
    try:
        neural = create_video_generation(
            payload=GenerateVideoRequest(voice_name="en-US-Neural2-H", **base_payload),
            db=session_neural,
            current_user=SimpleNamespace(id=user_id),
        )
    finally:
        session_neural.close()

    session_studio = SessionLocal()
    try:
        studio = create_video_generation(
            payload=GenerateVideoRequest(voice_name="en-US-Studio-O", **base_payload),
            db=session_studio,
            current_user=SimpleNamespace(id=user_id),
        )
    finally:
        session_studio.close()

    assert int(studio.credits_reserved or 0) > int(neural.credits_reserved or 0)


def test_video_generation_persists_reference_image_key(db):
    user_id = _mk_user(db, plan="creator", credits=100)
    current_user = SimpleNamespace(id=user_id)

    payload = GenerateVideoRequest(
        prompt="A polished creator walks into frame and speaks directly to camera.",
        aspect_ratio="9:16",
        duration_seconds=6,
        generation_speed="relax",
        input_image_key=f"users/{user_id}/reference-images/hero.jpg",
    )

    res = create_video_generation(payload=payload, db=db, current_user=current_user)
    job = db.query(Job).filter(Job.id == int(res.job_id)).first()
    assert job is not None
    settings = json.loads(job.caption_style_json or "{}")
    assert settings.get("input_image_key") == f"users/{user_id}/reference-images/hero.jpg"


def test_voiceover_studio_voice_costs_more_than_neural2(db):
    user_id = _mk_user(db, plan="creator", credits=200)
    script = " ".join(["cinematic"] * 260)

    db.commit()

    session_neural = SessionLocal()
    try:
        neural = create_voiceover_generation(
            payload=GenerateVoiceoverRequest(script=script, voice_name="en-US-Neural2-H"),
            db=session_neural,
            current_user=SimpleNamespace(id=user_id),
        )
    finally:
        session_neural.close()

    session_studio = SessionLocal()
    try:
        studio = create_voiceover_generation(
            payload=GenerateVoiceoverRequest(script=script, voice_name="en-US-Studio-O"),
            db=session_studio,
            current_user=SimpleNamespace(id=user_id),
        )
    finally:
        session_studio.close()

    assert int(studio.credits_reserved or 0) > int(neural.credits_reserved or 0)
