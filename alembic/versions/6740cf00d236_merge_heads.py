"""merge heads

Revision ID: 6740cf00d236
Revises: 8df24900091f, bc413afa7343
Create Date: 2026-01-31 00:44:13.530436

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6740cf00d236'
down_revision: Union[str, Sequence[str], None] = ('8df24900091f', 'bc413afa7343')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
