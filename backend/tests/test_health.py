from fastapi.testclient import TestClient

import main


def test_health_ok():
    with TestClient(main.app) as c:
        r = c.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}

