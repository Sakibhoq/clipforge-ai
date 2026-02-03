"""add credits_reserved to jobs

Revision ID: 7c54fae00967
Revises: 6740cf00d236
Create Date: 2026-01-31 00:50:50.467265
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7c54fae00967"
down_revision: Union[str, Sequence[str], None] = "6740cf00d236"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "credits_reserved",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "credits_reserved")
