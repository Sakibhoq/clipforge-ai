import os
from sqlalchemy import inspect, text

from core.database import Base, engine
import models  # noqa: F401  # ensure models are registered on Base


def init_db() -> None:
    """
    Safe auto-init to prevent 500s on first run / during early deploys.

    - Can be disabled with AUTO_CREATE_DB=0.
    - Creates missing tables (idempotent) for any DB backend.
    - Adds a small set of missing columns additively to keep older DBs compatible
      with the current ORM models (dev-friendly; not a full migration system).
    """
    auto_create = (os.getenv("AUTO_CREATE_DB") or "1").strip().lower() not in {"0", "false", "no"}
    auto_backfill = (os.getenv("AUTO_BACKFILL_DB") or "1").strip().lower() not in {"0", "false", "no"}
    if not auto_create and not auto_backfill:
        return

    db_url = str(engine.url).lower()

    # Local sqlite path convenience
    if db_url.startswith("sqlite"):
        db_path = getattr(engine.url, "database", None)
        if db_path and db_path != ":memory:":
            os.makedirs(os.path.dirname(db_path), exist_ok=True)

    # Ensure missing tables are created (idempotent) when enabled.
    if auto_create:
        try:
            Base.metadata.create_all(bind=engine)
        except Exception as e:
            print(f"[db-init] create_all failed: {e}")
            if not auto_backfill:
                return

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    dialect = (getattr(engine.dialect, "name", "") or "").lower()

    def _bool(v: bool) -> str:
        # Postgres uses TRUE/FALSE. SQLite accepts 0/1 (and treats BOOLEAN as affinity).
        if dialect.startswith("postgres"):
            return "TRUE" if v else "FALSE"
        return "1" if v else "0"

    def _str(v: str) -> str:
        # Minimal SQL literal escape for single quotes.
        return "'" + (v or "").replace("'", "''") + "'"

    # Backfill missing columns on older schemas (safe, additive only).
    # NOTE: Keep these small and focused; this is not meant to replace migrations.
    table_backfills = {
        "users": {
            "name": f"TEXT",
            "is_active": f"BOOLEAN DEFAULT {_bool(True)} NOT NULL",
            "plan": f"TEXT DEFAULT {_str('free')} NOT NULL",
            "credits": f"INTEGER DEFAULT 0 NOT NULL",
            "stripe_customer_id": f"TEXT",
            "last_stripe_event_id": f"TEXT",
            "trial_used": f"BOOLEAN DEFAULT {_bool(False)} NOT NULL",
            "downloads_used": f"INTEGER DEFAULT 0 NOT NULL",
            "downloads_window": f"TEXT",
            "pref_email_reports": f"BOOLEAN DEFAULT {_bool(True)} NOT NULL",
            "pref_product_tips": f"BOOLEAN DEFAULT {_bool(False)} NOT NULL",
            "pref_autoplay_previews": f"BOOLEAN DEFAULT {_bool(True)} NOT NULL",
            "notif_receipts": f"BOOLEAN DEFAULT {_bool(True)} NOT NULL",
            "notif_processing_alerts": f"BOOLEAN DEFAULT {_bool(False)} NOT NULL",
        },
        "uploads": {
            "source_type": f"TEXT DEFAULT {_str('upload')} NOT NULL",
            "source_url": f"TEXT",
            "source_id": f"TEXT",
        },
        "jobs": {
            "credits_reserved": f"INTEGER DEFAULT 0 NOT NULL",
            "credits_refunded": f"BOOLEAN DEFAULT {_bool(False)} NOT NULL",
            "aspect_ratio": f"TEXT DEFAULT {_str('9:16')} NOT NULL",
            "captions_enabled": f"BOOLEAN DEFAULT {_bool(True)} NOT NULL",
            "watermark_enabled": f"BOOLEAN DEFAULT {_bool(True)} NOT NULL",
            "caption_style_json": f"TEXT",
        },
        "clips": {
            "title": f"TEXT",
            "hook": f"TEXT",
        },
        "social_posts": {
            "post_options_json": f"TEXT",
        },
    }

    if not auto_backfill:
        return

    with engine.begin() as conn:
        # Postgres: use ADD COLUMN IF NOT EXISTS directly.
        # This is more resilient than inspector-only checks in long-lived prod DBs.
        if dialect.startswith("postgres"):
            for table_name, cols in table_backfills.items():
                if table_name not in tables:
                    continue
                for col, sql in cols.items():
                    try:
                        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {col} {sql}"))
                    except Exception as e:
                        print(f"[db-init] failed to add column {table_name}.{col}: {e}")
            return

        # Use a connection-bound inspector to avoid SQLite lock contention.
        conn_inspector = inspect(conn)
        for table_name, cols in table_backfills.items():
            if table_name not in tables:
                continue
            existing_cols = {c["name"] for c in conn_inspector.get_columns(table_name)}
            for col, sql in cols.items():
                if col not in existing_cols:
                    try:
                        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col} {sql}"))
                        print(f"[db-init] added column {table_name}.{col}")
                    except Exception as e:
                        # Don't crash the whole app on additive backfill failures.
                        # This can happen if the DB user lacks ALTER privileges.
                        print(f"[db-init] failed to add column {table_name}.{col}: {e}")
