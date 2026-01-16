from alembic import op
import sqlalchemy as sa


revision = "bc413afa7343"
down_revision = "b7d7ef669222"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "clips",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("upload_id", sa.Integer(), sa.ForeignKey("uploads.id"), nullable=False),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("storage_key", sa.String(), nullable=False, unique=True),
        sa.Column("start_time", sa.Float(), nullable=False),
        sa.Column("end_time", sa.Float(), nullable=False),
        sa.Column("duration", sa.Float(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
    )
    op.create_index("ix_clips_upload_id", "clips", ["upload_id"])
    op.create_index("ix_clips_job_id", "clips", ["job_id"])


def downgrade():
    op.drop_index("ix_clips_job_id", table_name="clips")
    op.drop_index("ix_clips_upload_id", table_name="clips")
    op.drop_table("clips")
