"""normalize boolean columns on postgres

Revision ID: 0d9e6c4b7a11
Revises: f4c2a9e7d1b0
Create Date: 2026-03-02 00:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0d9e6c4b7a11"
down_revision: Union[str, Sequence[str], None] = "f4c2a9e7d1b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_type_name(conn, table: str, column: str) -> str:
    inspector = sa.inspect(conn)
    try:
        cols = inspector.get_columns(table)
    except Exception:
        return ""
    for c in cols:
        if str(c.get("name")) == column:
            return str(c.get("type") or "").lower()
    return ""


def _is_bool_type(type_name: str) -> bool:
    t = (type_name or "").lower()
    return "bool" in t


def _normalize_bool_column(conn, table: str, column: str, *, default: bool, not_null: bool) -> None:
    col_type = _column_type_name(conn, table, column)
    if not col_type:
        return
    if _is_bool_type(col_type):
        return

    quoted = f"{table}.{column}"
    op.execute(
        f"ALTER TABLE {table} "
        f"ALTER COLUMN {column} TYPE BOOLEAN "
        f"USING (CASE "
        f"WHEN {column} IS NULL THEN FALSE "
        f"WHEN LOWER({column}::text) IN ('1','t','true','y','yes','on') THEN TRUE "
        f"ELSE FALSE END)"
    )
    op.execute(
        f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT {'TRUE' if default else 'FALSE'}"
    )
    if not_null:
        op.execute(f"UPDATE {table} SET {column} = {'TRUE' if default else 'FALSE'} WHERE {column} IS NULL")
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} SET NOT NULL")


def upgrade() -> None:
    conn = op.get_bind()
    dialect = (conn.dialect.name or "").lower()
    if not dialect.startswith("postgres"):
        return

    # Keep scope focused to columns used heavily in auth/upload flow.
    targets = [
        ("users", "is_active", True, True),
        ("users", "trial_used", False, True),
        ("jobs", "captions_enabled", True, True),
        ("jobs", "watermark_enabled", True, True),
        ("jobs", "credits_refunded", False, True),
    ]
    for table, column, default, not_null in targets:
        _normalize_bool_column(conn, table, column, default=default, not_null=not_null)


def downgrade() -> None:
    # Intentionally no-op.
    return

