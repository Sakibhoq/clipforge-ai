import os
from sqlalchemy import inspect, text

from core.database import Base, engine
import models  # noqa: F401  # ensure models are registered on Base


def init_db() -> None:
    """
    Safe auto-init for local SQLite dev to prevent 500s on first run.
    - Only runs for sqlite.
    - Can be disabled with AUTO_CREATE_DB=0.
    - Creates tables if missing (idempotent).
    """
    db_url = str(engine.url).lower()
    if not db_url.startswith("sqlite"):
        return

    auto = (os.getenv("AUTO_CREATE_DB") or "1").strip().lower()
    if auto in {"0", "false", "no"}:
        return

    db_path = getattr(engine.url, "database", None)
    if db_path and db_path != ":memory:":
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

    # Always ensure missing tables are created (idempotent).
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    # Backfill missing columns on older sqlite schemas (safe, additive only).
    table_backfills = {
        "users": {
            "name": "TEXT",
            "is_active": "BOOLEAN DEFAULT 1",
            "plan": "TEXT DEFAULT 'free'",
            "credits": "INTEGER DEFAULT 0",
            "stripe_customer_id": "TEXT",
            "last_stripe_event_id": "TEXT",
            "trial_used": "BOOLEAN DEFAULT 0",
            "pref_email_reports": "BOOLEAN DEFAULT 1",
            "pref_product_tips": "BOOLEAN DEFAULT 0",
            "pref_autoplay_previews": "BOOLEAN DEFAULT 1",
            "notif_receipts": "BOOLEAN DEFAULT 1",
            "notif_processing_alerts": "BOOLEAN DEFAULT 0",
        },
        "clips": {
            "title": "TEXT",
            "hook": "TEXT",
        },
    }

    with engine.begin() as conn:
        for table_name, cols in table_backfills.items():
            if table_name not in tables:
                continue
            existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
            for col, sql in cols.items():
                if col not in existing_cols:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col} {sql}"))
