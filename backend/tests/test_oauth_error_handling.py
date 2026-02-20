from urllib.parse import urlparse, parse_qs

import httpx
import requests
import pytest

from main import app
import routers.oauth as oauth_router


def _extract_state_from_google_auth_url(url: str) -> str:
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    state = (qs.get("state") or [None])[0]
    assert state, "missing state in oauth start redirect URL"
    return state


@pytest.mark.anyio
async def test_oauth_callback_token_exchange_non_json_returns_502(monkeypatch):
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_SECRET", "test-client-secret")

    class FakeOkNonJson:
        status_code = 200
        text = "<html>not json</html>"

        def json(self):
            raise ValueError("not json")

    monkeypatch.setattr(oauth_router.requests, "post", lambda *a, **k: FakeOkNonJson())

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        start = await client.get("/auth/oauth/google/start?next=%2Fapp", follow_redirects=False)
        assert start.status_code in (302, 307)
        state = _extract_state_from_google_auth_url(start.headers["location"])

        cb = await client.get(
            f"/auth/oauth/google/callback?code=dummy&state={state}",
            follow_redirects=False,
        )
        assert cb.status_code == 502


@pytest.mark.anyio
async def test_oauth_callback_token_exchange_request_exception_returns_502(monkeypatch):
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_SECRET", "test-client-secret")

    def boom(*args, **kwargs):
        raise requests.Timeout("timeout")

    monkeypatch.setattr(oauth_router.requests, "post", boom)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        start = await client.get("/auth/oauth/google/start?next=%2Fapp", follow_redirects=False)
        assert start.status_code in (302, 307)
        state = _extract_state_from_google_auth_url(start.headers["location"])

        cb = await client.get(
            f"/auth/oauth/google/callback?code=dummy&state={state}",
            follow_redirects=False,
        )
        assert cb.status_code == 502


@pytest.mark.anyio
async def test_oauth_callback_malformed_frontend_base_still_redirects(monkeypatch):
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://app.orbito.cc,\nhttps://bad-value")
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://app.orbito.cc")

    class FakeTokenResponse:
        status_code = 200
        text = '{"access_token":"tok"}'

        def json(self):
            return {"access_token": "tok"}

    class FakeUserInfoResponse:
        status_code = 200
        text = '{"sub":"google-user-123","email":"oauth-google-test@orbito.cc","name":"OAuth Test"}'

        def json(self):
            return {
                "sub": "google-user-123",
                "email": "oauth-google-test@orbito.cc",
                "name": "OAuth Test",
            }

    monkeypatch.setattr(oauth_router.requests, "post", lambda *a, **k: FakeTokenResponse())
    monkeypatch.setattr(oauth_router.requests, "get", lambda *a, **k: FakeUserInfoResponse())

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        start = await client.get("/auth/oauth/google/start?next=%2Fapp", follow_redirects=False)
        assert start.status_code in (302, 307)
        state = _extract_state_from_google_auth_url(start.headers["location"])

        cb = await client.get(
            f"/auth/oauth/google/callback?code=dummy&state={state}",
            follow_redirects=False,
        )
        assert cb.status_code in (302, 303, 307)
        assert cb.headers["location"].startswith("https://app.orbito.cc/")


@pytest.mark.anyio
async def test_oauth_callback_host_only_frontend_base_still_redirects(monkeypatch):
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("FRONTEND_BASE_URL", "app.orbito.cc")
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://app.orbito.cc")

    class FakeTokenResponse:
        status_code = 200
        text = '{"access_token":"tok"}'

        def json(self):
            return {"access_token": "tok"}

    class FakeUserInfoResponse:
        status_code = 200
        text = '{"sub":"google-user-456","email":"oauth-google-hostonly@orbito.cc","name":"OAuth HostOnly"}'

        def json(self):
            return {
                "sub": "google-user-456",
                "email": "oauth-google-hostonly@orbito.cc",
                "name": "OAuth HostOnly",
            }

    monkeypatch.setattr(oauth_router.requests, "post", lambda *a, **k: FakeTokenResponse())
    monkeypatch.setattr(oauth_router.requests, "get", lambda *a, **k: FakeUserInfoResponse())

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        start = await client.get("/auth/oauth/google/start?next=%2Fapp", follow_redirects=False)
        assert start.status_code in (302, 307)
        state = _extract_state_from_google_auth_url(start.headers["location"])

        cb = await client.get(
            f"/auth/oauth/google/callback?code=dummy&state={state}",
            follow_redirects=False,
        )
        assert cb.status_code in (302, 303, 307)
        assert cb.headers["location"].startswith("https://app.orbito.cc/")
