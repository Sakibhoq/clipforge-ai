from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.sql import func
from core.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id"), nullable=False, index=True)

    status = Column(String, nullable=False, default="queued", index=True)
    error = Column(String, nullable=True)

    # =========================================================
    # Render settings (processing-time config)
    # - Stored on Job so we can later "re-render" by creating a new job
    # =========================================================
    # Aspect ratio: "9:16" | "1:1" | "4:3"
    aspect_ratio = Column(String, nullable=False, default="9:16")

    # Captions burned-in
    captions_enabled = Column(Boolean, nullable=False, default=True)

    # Watermark burned-in
    watermark_enabled = Column(Boolean, nullable=False, default=True)

    # JSON string for caption styling (font/size/color/position etc.)
    # Kept as Text for SQLite compatibility + flexibility.
    caption_style_json = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # ✅ Always set, and bump on updates (supports heartbeat + stale reclaim)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
