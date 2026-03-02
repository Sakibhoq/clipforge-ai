"""fix jobs.credits_refunded type for postgres

Revision ID: f4c2a9e7d1b0
Revises: 9b1f2c7a4f3e, e8b7c2a7a9b6
Create Date: 2026-03-02 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f4c2a9e7d1b0"
down_revision: Union[str, Sequence[str], None] = ("9b1f2c7a4f3e", "e8b7c2a7a9b6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_type_name(conn, table: str, column: str) -> str:
    inspector = sa.inspect(conn)
    try:
        cols = inspector.get_columns(table)
    except Exception:
        return ""
    for c in cols:
        if str(c.get("name")) == column:
            return str(c.get("type") or "").lower()
    return ""


def upgrade() -> None:
    conn = op.get_bind()
    dialect = (conn.dialect.name or "").lower()

    # SQLite stores booleans as integer affinity; nothing to migrate there.
    if dialect.startswith("sqlite"):
        return

    col_type = _column_type_name(conn, "jobs", "credits_refunded")
    if not col_type:
        return

    # Already boolean -> nothing to do.
    if "bool" in col_type:
        return

    # Postgres: convert existing integer-ish values to boolean.
    if dialect.startswith("postgres"):
        op.execute(
            "ALTER TABLE jobs "
            "ALTER COLUMN credits_refunded TYPE BOOLEAN "
            "USING (credits_refunded <> 0)"
        )
        op.execute("ALTER TABLE jobs ALTER COLUMN credits_refunded SET DEFAULT FALSE")
        op.execute("UPDATE jobs SET credits_refunded = FALSE WHERE credits_refunded IS NULL")
        op.execute("ALTER TABLE jobs ALTER COLUMN credits_refunded SET NOT NULL")


def downgrade() -> None:
    # No-op downgrade; we intentionally do not coerce boolean back to integer.
    return

