from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from core.database import Base


class YouTubeIngestItem(Base):
    __tablename__ = "youtube_ingest_queue"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    channel_id = Column(Integer, ForeignKey("youtube_channels.id"), nullable=True, index=True)

    video_id = Column(String, nullable=False, index=True)
    video_url = Column(String, nullable=False)
    title = Column(String, nullable=True)
    duration_seconds = Column(Integer, nullable=True)

    status = Column(String, nullable=False, default="queued")  # queued, downloaded, uploaded, registered, failed
    last_error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
