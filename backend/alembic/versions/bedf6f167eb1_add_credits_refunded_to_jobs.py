"""add credits_refunded to jobs

Revision ID: bedf6f167eb1
Revises: 3bc72006ea79
Create Date: 2026-02-01 21:38:29.830289

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "bedf6f167eb1"
down_revision: Union[str, Sequence[str], None] = "3bc72006ea79"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(conn, table: str, col: str) -> bool:
    # SQLite-safe column existence check
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == col for r in rows)


def upgrade() -> None:
    """
    Adds jobs.credits_refunded (0/1).
    SQLite-safe via batch_alter_table.
    Idempotent: if column already exists, do nothing.
    """
    conn = op.get_bind()
    if _has_column(conn, "jobs", "credits_refunded"):
        return

    with op.batch_alter_table("jobs") as batch:
        batch.add_column(
            sa.Column(
                "credits_refunded",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )

    # optional cleanup: remove server_default after creation
    with op.batch_alter_table("jobs") as batch:
        batch.alter_column("credits_refunded", server_default=None)


def downgrade() -> None:
    """
    Best-effort drop.
    Idempotent: if column missing, do nothing (prevents KeyError).
    """
    conn = op.get_bind()
    if not _has_column(conn, "jobs", "credits_refunded"):
        return

    with op.batch_alter_table("jobs") as batch:
        batch.drop_column("credits_refunded")
