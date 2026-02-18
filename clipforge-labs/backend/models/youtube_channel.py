from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func

from core.database import Base


class YouTubeChannel(Base):
    __tablename__ = "youtube_channels"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    channel_id = Column(String, nullable=False, index=True)
    channel_title = Column(String, nullable=True)

    active = Column(Boolean, default=True, nullable=False)
    last_polled_at = Column(DateTime(timezone=True), nullable=True)
    last_video_id = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
