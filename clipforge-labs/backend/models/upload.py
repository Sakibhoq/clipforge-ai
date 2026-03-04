from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from core.database import Base
from datetime import datetime, timezone


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Upload(Base):
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    original_filename = Column(String, nullable=False)
    storage_key = Column(String, nullable=False, unique=True)

    # Source metadata (for YouTube ingestion + future channel subscriptions)
    # - source_type: "upload" (default) or "youtube"
    # - source_url: the original YouTube URL
    # - source_id: e.g., YouTube video id (optional but useful)
    source_type = Column(String, nullable=False, default="upload")
    source_url = Column(String, nullable=True)
    source_id = Column(String, nullable=True)

    transcript = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)
