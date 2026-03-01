"""add stripe fields to users

Revision ID: d7c2f8a4b2e1
Revises: bedf6f167eb1
Create Date: 2026-02-03 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d7c2f8a4b2e1"
down_revision: Union[str, Sequence[str], None] = "bedf6f167eb1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(conn, table: str, col: str) -> bool:
    inspector = sa.inspect(conn)
    try:
        rows = inspector.get_columns(table)
    except Exception:
        return False
    return any(str(r.get("name")) == col for r in rows)


def upgrade() -> None:
    conn = op.get_bind()

    with op.batch_alter_table("users") as batch:
        if not _has_column(conn, "users", "stripe_customer_id"):
            batch.add_column(sa.Column("stripe_customer_id", sa.String(), nullable=True))
        if not _has_column(conn, "users", "last_stripe_event_id"):
            batch.add_column(sa.Column("last_stripe_event_id", sa.String(), nullable=True))
        if not _has_column(conn, "users", "trial_used"):
            batch.add_column(
                sa.Column(
                    "trial_used",
                    sa.Boolean(),
                    nullable=False,
                    server_default="0",
                )
            )

    # Clean up server defaults (SQLite-safe)
    if _has_column(conn, "users", "trial_used"):
        with op.batch_alter_table("users") as batch:
            batch.alter_column("trial_used", server_default=None)


def downgrade() -> None:
    conn = op.get_bind()
    with op.batch_alter_table("users") as batch:
        if _has_column(conn, "users", "stripe_customer_id"):
            batch.drop_column("stripe_customer_id")
        if _has_column(conn, "users", "last_stripe_event_id"):
            batch.drop_column("last_stripe_event_id")
        if _has_column(conn, "users", "trial_used"):
            batch.drop_column("trial_used")
