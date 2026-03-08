import pytest
from fastapi import HTTPException

from models.user import User
from routers.labs import _has_labs_plan_access, _labs_next_target, labs_launch


def _mk_user(plan: str) -> User:
    return User(
        id=1,
        email="labs-user@example.com",
        hashed_password="x",
        plan=plan,
        credits=99,
    )


@pytest.mark.parametrize(
    "plan,expected",
    [
        ("free", False),
        ("starter", False),
        ("labs_starter", True),
        ("labs_spark", True),
        ("labs_creator", True),
        ("labs_velocity", True),
        ("velocity_plus", False),
    ],
)
def test_has_labs_plan_access(plan: str, expected: bool):
    assert _has_labs_plan_access(plan) is expected


@pytest.mark.parametrize(
    "target,expected",
    [
        ("app", "/app"),
        ("generate", "/app/generate"),
        ("clips", "/app/clips?generated=1"),
        ("unknown", "/app"),
    ],
)
def test_labs_next_target(target: str, expected: str):
    assert _labs_next_target(target) == expected


def test_labs_launch_blocks_locked_targets_without_labs_plan(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LABS_ENFORCE_PLAN_LOCK", "1")
    user = _mk_user("starter")

    with pytest.raises(HTTPException) as exc:
        labs_launch(target="generate", current_user=user)
    assert exc.value.status_code == 402
    assert "Labs plan required" in str(exc.value.detail)


def test_labs_launch_allows_generate_when_lock_disabled(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LABS_FRONTEND_URL", "https://labs.example")
    monkeypatch.setenv("LABS_ENFORCE_PLAN_LOCK", "0")
    user = _mk_user("starter")

    res = labs_launch(target="generate", current_user=user)

    assert res.target == "generate"
    assert res.launch_url.startswith("https://labs.example/login?")
    assert "next=%2Fapp%2Fgenerate" in res.launch_url


def test_labs_launch_clips_uses_generated_filter(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LABS_FRONTEND_URL", "https://labs.example")
    user = _mk_user("labs_creator")

    res = labs_launch(target="clips", current_user=user)

    assert res.target == "clips"
    assert res.launch_url.startswith("https://labs.example/login?")
    assert "next=%2Fapp%2Fclips%3Fgenerated%3D1" in res.launch_url


def test_labs_launch_allows_app_target_without_labs_plan(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LABS_FRONTEND_URL", "https://labs.example")
    user = _mk_user("starter")

    res = labs_launch(target="app", current_user=user)

    assert res.target == "app"
    assert res.launch_url.startswith("https://labs.example/login?")
    assert "next=%2Fapp" in res.launch_url


def test_labs_launch_allows_generate_for_labs_plan(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LABS_FRONTEND_URL", "https://labs.example")
    user = _mk_user("labs_creator")

    res = labs_launch(target="generate", current_user=user)

    assert res.target == "generate"
    assert res.launch_url.startswith("https://labs.example/login?")
    assert "next=%2Fapp%2Fgenerate" in res.launch_url
