from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "3bc72006ea79"
down_revision = "c3d9137fa93a"
branch_labels = None
depends_on = None


def _has_column(table, col):
    insp = inspect(op.get_bind())
    return col in [c["name"] for c in insp.get_columns(table)]


def upgrade():
    if not _has_column("jobs", "credits_reserved"):
        op.add_column(
            "jobs",
            sa.Column("credits_reserved", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade():
    if _has_column("jobs", "credits_reserved"):
        op.drop_column("jobs", "credits_reserved")
