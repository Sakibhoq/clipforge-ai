"""add post options to social posts

Revision ID: f2a1e4b8c9d0
Revises: 9b1f2c7a4f3e, e8b7c2a7a9b6
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f2a1e4b8c9d0"
down_revision = ("9b1f2c7a4f3e", "e8b7c2a7a9b6")
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = inspector.get_columns(table)
    return any(str(c.get("name") or "").lower() == column.lower() for c in cols)


def upgrade():
    if not _has_column("social_posts", "post_options_json"):
        with op.batch_alter_table("social_posts") as batch:
            batch.add_column(sa.Column("post_options_json", sa.Text(), nullable=True))


def downgrade():
    if _has_column("social_posts", "post_options_json"):
        with op.batch_alter_table("social_posts") as batch:
            batch.drop_column("post_options_json")
