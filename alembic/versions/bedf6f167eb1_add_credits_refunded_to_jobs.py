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


def upgrade() -> None:
    """
    SQLite-safe add column.
    credits_refunded:
      - 0 = not refunded
      - 1 = refunded (worker already returned credits)
    """
    with op.batch_alter_table("jobs") as batch:
        batch.add_column(
            sa.Column(
                "credits_refunded",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )

    # Keep DB clean: remove server_default after backfill (optional but nice)
    with op.batch_alter_table("jobs") as batch:
        batch.alter_column("credits_refunded", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("jobs") as batch:
        batch.drop_column("credits_refunded")
