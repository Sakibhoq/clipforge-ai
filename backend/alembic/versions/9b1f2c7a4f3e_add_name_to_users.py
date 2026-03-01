"""add name to users

Revision ID: 9b1f2c7a4f3e
Revises: d7c2f8a4b2e1
Create Date: 2026-02-05 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "9b1f2c7a4f3e"
down_revision: Union[str, Sequence[str], None] = "d7c2f8a4b2e1"
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
        if not _has_column(conn, "users", "name"):
            batch.add_column(sa.Column("name", sa.String(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    with op.batch_alter_table("users") as batch:
        if _has_column(conn, "users", "name"):
            batch.drop_column("name")
