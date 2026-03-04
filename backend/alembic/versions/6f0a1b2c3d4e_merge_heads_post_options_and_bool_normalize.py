"""merge heads: post options + postgres bool normalization

Revision ID: 6f0a1b2c3d4e
Revises: 0d9e6c4b7a11, f2a1e4b8c9d0
Create Date: 2026-03-04 00:00:00.000000
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "6f0a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = ("0d9e6c4b7a11", "f2a1e4b8c9d0")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
