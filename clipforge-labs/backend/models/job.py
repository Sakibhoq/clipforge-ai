from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.sql import func
from core.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id"), nullable=False, index=True)

    # Job kind:
    # - "clip" (legacy Orbito flow)
    # - "generate" (Clipforge Labs: AI video generation)
    kind = Column(String, nullable=False, default="clip", index=True)

    status = Column(String, nullable=False, default="queued", index=True)
    error = Column(String, nullable=True)

    # 💳 credits reserved for this job (charged once, refunded on failure)
    credits_reserved = Column(Integer, nullable=False, default=0)

    # 💸 whether credits were refunded after a failure (idempotency guard)
    credits_refunded = Column(Boolean, nullable=False, default=False)

    # =========================================================
    # Render settings
    # =========================================================
    aspect_ratio = Column(String, nullable=False, default="9:16")
    captions_enabled = Column(Boolean, nullable=False, default=True)
    watermark_enabled = Column(Boolean, nullable=False, default=True)
    caption_style_json = Column(Text, nullable=True)

    # =========================================================
    # Generation settings (for kind="generate")
    # =========================================================
    prompt = Column(Text, nullable=True)
    negative_prompt = Column(Text, nullable=True)
    model = Column(String, nullable=True)
    duration_seconds = Column(Integer, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
