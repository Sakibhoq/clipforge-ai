import uuid

import pytest
from fastapi import HTTPException

from core.database import SessionLocal
from models.user import User
from routers.clips import _consume_download_quota, _download_window_key


def _mk_user(db, *, plan: str, credits: int = 0) -> User:
    u = User(
        email=f"dl_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        plan=plan,
        credits=credits,
        downloads_used=0,
        downloads_window=_download_window_key(),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(autouse=True)
def _clean(db):
    db.query(User).delete()
    db.commit()
    yield


def test_free_download_costs_one_credit_and_counts_toward_limit(db):
    u = _mk_user(db, plan="free", credits=5)
    _consume_download_quota(db, current_user=u)

    db.refresh(u)
    assert int(u.credits or 0) == 4
    assert int(u.downloads_used or 0) == 1


def test_free_download_requires_credit(db):
    u = _mk_user(db, plan="free", credits=0)
    with pytest.raises(HTTPException) as e:
        _consume_download_quota(db, current_user=u)
    assert e.value.status_code == 402


def test_starter_download_limit_is_50(db):
    u = _mk_user(db, plan="starter", credits=0)
    u.downloads_used = 50
    db.commit()

    with pytest.raises(HTTPException) as e:
        _consume_download_quota(db, current_user=u)
    assert e.value.status_code == 403


def test_starter_download_costs_one_credit_and_counts_toward_limit(db):
    u = _mk_user(db, plan="starter", credits=5)
    _consume_download_quota(db, current_user=u)

    db.refresh(u)
    assert int(u.credits or 0) == 4
    assert int(u.downloads_used or 0) == 1


def test_starter_download_requires_credit(db):
    u = _mk_user(db, plan="starter", credits=0)
    with pytest.raises(HTTPException) as e:
        _consume_download_quota(db, current_user=u)
    assert e.value.status_code == 402


def test_creator_downloads_are_unlimited_and_free(db):
    u = _mk_user(db, plan="creator", credits=7)
    u.downloads_used = 500
    db.commit()

    _consume_download_quota(db, current_user=u)

    db.refresh(u)
    assert int(u.credits or 0) == 7


def test_labs_spark_downloads_are_unlimited_and_free(db):
    u = _mk_user(db, plan="labs_spark", credits=7)
    u.downloads_used = 500
    db.commit()

    _consume_download_quota(db, current_user=u)

    db.refresh(u)
    assert int(u.credits or 0) == 7
