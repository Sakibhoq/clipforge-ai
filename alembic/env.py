from logging.config import fileConfig
from alembic import context
from sqlalchemy import create_engine, pool
import os
import sys

# Point Alembic to backend/
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
sys.path.insert(0, BACKEND_DIR)

from core.database import Base
from core.config import settings

# ⬇️ IMPORT MODELS CORRECTLY
import models  # this loads backend/models/*

config = context.config

if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_database_url():
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    return f"sqlite:///{settings.DB_PATH}"


def run_migrations_offline():
    context.configure(
        url=get_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    engine = create_engine(
        get_database_url(),
        connect_args={"check_same_thread": False}
        if get_database_url().startswith("sqlite")
        else {},
        poolclass=pool.NullPool,
    )

    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
