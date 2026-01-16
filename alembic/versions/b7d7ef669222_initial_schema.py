from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b7d7ef669222"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # USERS
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String, nullable=False),
        sa.Column("hashed_password", sa.String, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("1")),
        sa.Column("plan", sa.String, nullable=False, server_default="free"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # UPLOADS
    op.create_table(
        "uploads",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("original_filename", sa.String, nullable=False),
        sa.Column("storage_key", sa.String, nullable=False),
        sa.Column("transcript", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_uploads_storage_key", "uploads", ["storage_key"], unique=True)

    # JOBS
    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("upload_id", sa.Integer, nullable=False),
        sa.Column("status", sa.String, nullable=False, server_default="queued"),
        sa.Column("locked", sa.Boolean, nullable=False, server_default=sa.text("0")),
        sa.Column("retries", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("error", sa.String, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_jobs_status", "jobs", ["status"])
    op.create_index("ix_jobs_upload_id", "jobs", ["upload_id"])


def downgrade():
    op.drop_table("jobs")
    op.drop_table("uploads")
    op.drop_table("users")
