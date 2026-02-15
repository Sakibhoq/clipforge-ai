import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def _database_url() -> str:
    # Keep worker defaults aligned with docker-compose dev defaults.
    v = (os.getenv("DATABASE_URL") or "").strip()
    if v:
        return v
    return "sqlite:////data/app.db"


DB_URL = _database_url()

connect_args = {}
if DB_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DB_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

# SessionLocal is used directly by worker/worker.py (SQL text queries).
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

