"""add user credits (and create users table if missing)

Revision ID: 8df24900091f
Revises:
Create Date: 2026-01-09 21:59:22.341496
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "8df24900091f"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    tables = set(insp.get_table_names())

    # If users table doesn't exist yet, create it with the columns your API expects.
    if "users" not in tables:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("hashed_password", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("plan", sa.String(), nullable=False, server_default=sa.text("'free'")),
            sa.Column("credits", sa.Integer(), nullable=False, server_default=sa.text("60")),
            sa.UniqueConstraint("email", name="uq_users_email"),
        )
        return

    # Otherwise, add credits if missing.
    cols = {c["name"] for c in insp.get_columns("users")}
    if "credits" not in cols:
        op.add_column(
            "users",
            sa.Column("credits", sa.Integer(), nullable=False, server_default=sa.text("60")),
        )

    # Also ensure plan exists (some earlier dev DBs might not have it)
    if "plan" not in cols:
        op.add_column(
            "users",
            sa.Column("plan", sa.String(), nullable=False, server_default=sa.text("'free'")),
        )

    # And is_active (same idea)
    if "is_active" not in cols:
        op.add_column(
            "users",
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        )


def downgrade() -> None:
    # Dev-safe downgrade: only drop the credits column if it exists.
    bind = op.get_bind()
    insp = inspect(bind)
    if "users" in set(insp.get_table_names()):
        cols = {c["name"] for c in insp.get_columns("users")}
        if "credits" in cols:
            op.drop_column("users", "credits")
