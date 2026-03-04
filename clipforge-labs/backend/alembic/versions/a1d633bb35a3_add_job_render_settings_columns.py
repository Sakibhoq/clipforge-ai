"""add job render settings columns

Revision ID: a1d633bb35a3
Revises: 75ab2f84aeea
Create Date: 2026-01-27
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a1d633bb35a3"
down_revision = "75ab2f84aeea"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use direct add_column to avoid sqlite batch column reordering issues.
    op.add_column("jobs", sa.Column("aspect_ratio", sa.String(), nullable=False, server_default="9:16"))
    op.add_column("jobs", sa.Column("captions_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("jobs", sa.Column("watermark_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("jobs", sa.Column("caption_style_json", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("jobs") as batch:
        batch.drop_column("caption_style_json")
        batch.drop_column("watermark_enabled")
        batch.drop_column("captions_enabled")
        batch.drop_column("aspect_ratio")
