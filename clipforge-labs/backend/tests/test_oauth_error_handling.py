import time

import jwt
import requests
import pytest
from starlette.requests import Request

import routers.oauth as oauth_router


def _request_with_oauth_ctx(provider: str, state: str) -> Request:
    ctx = {
        "provider": provider,
        "state": state,
        "code_verifier": "test-code-verifier",
        "next": "/app",
        "iat": int(time.time()),
    }
    token = jwt.encode(ctx, oauth_router.settings.SECRET_KEY, algorithm="HS256")
    cookie_header = f"{oauth_router.OAUTH_CTX_COOKIE}={token}".encode()
    scope = {
        "type": "http",
        "method": "GET",
        "scheme": "https",
        "path": f"/auth/oauth/{provider}/callback",
        "headers": [(b"cookie", cookie_header)],
        "query_string": b"",
    }
    return Request(scope)


def test_oauth_callback_token_exchange_non_json_returns_502(monkeypatch):
    monkeypatch.setattr(oauth_router.settings, "SECRET_KEY", "test-secret-key")
    monkeypatch.setattr(oauth_router, "PUBLIC_API_BASE", "https://api.example.com")
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_SECRET", "test-client-secret")

    class FakeOkNonJson:
        status_code = 200
        text = "<html>not json</html>"

        def json(self):
            raise ValueError("not json")

    monkeypatch.setattr(oauth_router.requests, "post", lambda *a, **k: FakeOkNonJson())

    state = "state-non-json"
    request = _request_with_oauth_ctx("google", state)

    with pytest.raises(oauth_router.HTTPException) as exc:
        oauth_router.oauth_callback(
            provider="google",
            request=request,
            code="dummy",
            state=state,
            db=None,
        )

    assert exc.value.status_code == 502
    assert exc.value.detail == "OAuth token exchange returned an invalid response"


def test_oauth_callback_token_exchange_request_exception_returns_502(monkeypatch):
    monkeypatch.setattr(oauth_router.settings, "SECRET_KEY", "test-secret-key")
    monkeypatch.setattr(oauth_router, "PUBLIC_API_BASE", "https://api.example.com")
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("OAUTH_GOOGLE_CLIENT_SECRET", "test-client-secret")

    def boom(*args, **kwargs):
        raise requests.Timeout("timeout")

    monkeypatch.setattr(oauth_router.requests, "post", boom)

    state = "state-request-exception"
    request = _request_with_oauth_ctx("google", state)

    with pytest.raises(oauth_router.HTTPException) as exc:
        oauth_router.oauth_callback(
            provider="google",
            request=request,
            code="dummy",
            state=state,
            db=None,
        )

    assert exc.value.status_code == 502
    assert exc.value.detail == "OAuth token exchange request failed"
