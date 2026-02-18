"""add hook to clips

Revision ID: e8b7c2a7a9b6
Revises: 9f3c2b8e1a7d
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e8b7c2a7a9b6"
down_revision = "9f3c2b8e1a7d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clips", sa.Column("hook", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("clips", "hook")
