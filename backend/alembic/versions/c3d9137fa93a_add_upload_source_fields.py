"""add_upload_source_fields

Revision ID: c3d9137fa93a
Revises: a1d633bb35a3
Create Date: 2026-01-27
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "c3d9137fa93a"
down_revision = "a1d633bb35a3"
branch_labels = None
depends_on = None


def _has_column(table_name: str, col_name: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    cols = [c["name"] for c in insp.get_columns(table_name)]
    return col_name in cols


def upgrade() -> None:
    # This migration must ONLY touch uploads.
    if not _has_column("uploads", "source_type"):
        op.add_column(
            "uploads",
            sa.Column("source_type", sa.String(), nullable=False, server_default="upload"),
        )

    if not _has_column("uploads", "source_url"):
        op.add_column("uploads", sa.Column("source_url", sa.String(), nullable=True))

    if not _has_column("uploads", "source_id"):
        op.add_column("uploads", sa.Column("source_id", sa.String(), nullable=True))


def downgrade() -> None:
    if _has_column("uploads", "source_id"):
        op.drop_column("uploads", "source_id")
    if _has_column("uploads", "source_url"):
        op.drop_column("uploads", "source_url")
    if _has_column("uploads", "source_type"):
        op.drop_column("uploads", "source_type")
