import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from core.database import SessionLocal
from models.job import Job
from models.upload import Upload
from models.user import User
from routers.generate import GenerateVideoRequest, create_video_generation


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
    assert res.credits_reserved == 84
    assert res.generation_speed == "relax"

    user_row = db.query(User).filter(User.id == user_id).first()
    assert user_row is not None
    assert int(user_row.credits or 0) == 16


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
    assert res.credits_reserved == 90
    assert res.generation_speed == "fast"

    user_row = db.query(User).filter(User.id == user_id).first()
    assert user_row is not None
    assert int(user_row.credits or 0) == 10


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
    assert res.credits_reserved == 90
    assert res.generation_speed == "fast"

    user_row = db.query(User).filter(User.id == user_id).first()
    assert user_row is not None
    assert int(user_row.credits or 0) == 10
