from routers.health import health


def test_health_ok():
    assert health() == {"status": "ok"}
