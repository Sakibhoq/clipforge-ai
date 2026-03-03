from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from core.database import Base


class SocialPost(Base):
    __tablename__ = "social_posts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    clip_id = Column(Integer, ForeignKey("clips.id"), nullable=True, index=True)

    provider = Column(String, nullable=False, index=True)
    storage_key = Column(String, nullable=True)
    caption = Column(Text, nullable=True)
    post_options_json = Column(Text, nullable=True)

    status = Column(String, nullable=False, default="queued")  # queued, scheduled, posting, posted, failed
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    posted_at = Column(DateTime(timezone=True), nullable=True)

    attempts = Column(Integer, nullable=False, default=0)
    last_error = Column(Text, nullable=True)
    remote_id = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
