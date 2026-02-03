"""add social, youtube ingest, automation, storefront

Revision ID: 9f3c2b8e1a7d
Revises: d7c2f8a4b2e1
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9f3c2b8e1a7d"
down_revision = "d7c2f8a4b2e1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "social_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("account_id", sa.String(), nullable=True),
        sa.Column("account_name", sa.String(), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.Integer(), nullable=True),
        sa.Column("scopes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="connected"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_social_accounts_user_id", "social_accounts", ["user_id"])
    op.create_index("ix_social_accounts_provider", "social_accounts", ["provider"])
    op.create_index("ix_social_accounts_account_id", "social_accounts", ["account_id"])

    op.create_table(
        "social_posts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("clip_id", sa.Integer(), sa.ForeignKey("clips.id"), nullable=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("storage_key", sa.String(), nullable=True),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("remote_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_social_posts_user_id", "social_posts", ["user_id"])
    op.create_index("ix_social_posts_provider", "social_posts", ["provider"])
    op.create_index("ix_social_posts_clip_id", "social_posts", ["clip_id"])

    op.create_table(
        "youtube_channels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("channel_id", sa.String(), nullable=False),
        sa.Column("channel_title", sa.String(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_polled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_video_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_youtube_channels_user_id", "youtube_channels", ["user_id"])
    op.create_index("ix_youtube_channels_channel_id", "youtube_channels", ["channel_id"])

    op.create_table(
        "youtube_ingest_queue",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("channel_id", sa.Integer(), sa.ForeignKey("youtube_channels.id"), nullable=True),
        sa.Column("video_id", sa.String(), nullable=False),
        sa.Column("video_url", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_youtube_ingest_queue_user_id", "youtube_ingest_queue", ["user_id"])
    op.create_index("ix_youtube_ingest_queue_video_id", "youtube_ingest_queue", ["video_id"])

    op.create_table(
        "automation_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("trigger", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("config_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_automation_rules_user_id", "automation_rules", ["user_id"])

    op.create_table(
        "creator_storefronts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("handle", sa.String(), nullable=False, unique=True),
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("hero", sa.Text(), nullable=True),
        sa.Column("pricing_json", sa.Text(), nullable=True),
        sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_creator_storefronts_user_id", "creator_storefronts", ["user_id"])
    op.create_index("ix_creator_storefronts_handle", "creator_storefronts", ["handle"])


def downgrade():
    op.drop_index("ix_creator_storefronts_handle", table_name="creator_storefronts")
    op.drop_index("ix_creator_storefronts_user_id", table_name="creator_storefronts")
    op.drop_table("creator_storefronts")

    op.drop_index("ix_automation_rules_user_id", table_name="automation_rules")
    op.drop_table("automation_rules")

    op.drop_index("ix_youtube_ingest_queue_video_id", table_name="youtube_ingest_queue")
    op.drop_index("ix_youtube_ingest_queue_user_id", table_name="youtube_ingest_queue")
    op.drop_table("youtube_ingest_queue")

    op.drop_index("ix_youtube_channels_channel_id", table_name="youtube_channels")
    op.drop_index("ix_youtube_channels_user_id", table_name="youtube_channels")
    op.drop_table("youtube_channels")

    op.drop_index("ix_social_posts_clip_id", table_name="social_posts")
    op.drop_index("ix_social_posts_provider", table_name="social_posts")
    op.drop_index("ix_social_posts_user_id", table_name="social_posts")
    op.drop_table("social_posts")

    op.drop_index("ix_social_accounts_account_id", table_name="social_accounts")
    op.drop_index("ix_social_accounts_provider", table_name="social_accounts")
    op.drop_index("ix_social_accounts_user_id", table_name="social_accounts")
    op.drop_table("social_accounts")
