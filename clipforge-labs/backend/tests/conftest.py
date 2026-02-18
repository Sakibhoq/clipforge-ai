import os
import sys
import tempfile
import uuid
from pathlib import Path

import pytest


# Ensure `import main`, `import routers`, etc. works when running from repo root.
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


# Keep tests isolated from real env/.env and from Postgres.
TEST_DB_PATH = Path(tempfile.gettempdir()) / f"orbito-test-{uuid.uuid4().hex}.db"
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB_PATH}")
os.environ.setdefault("SOCIAL_DISPATCH_ENABLED", "0")
os.environ.setdefault("ENABLE_YOUTUBE_INGEST", "0")


@pytest.fixture(scope="session", autouse=True)
def _create_test_schema():
    # Import after env is set so the global engine points at the test DB.
    from core.database import Base, engine
    import models  # noqa: F401 - register models on Base

    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    try:
        TEST_DB_PATH.unlink(missing_ok=True)
    except Exception:
        pass


@pytest.fixture(scope="session")
def anyio_backend():
    # Keep test runs deterministic and avoid requiring Trio in all environments.
    return "asyncio"
