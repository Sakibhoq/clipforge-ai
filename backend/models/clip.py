from sqlalchemy import Column, Integer, String, ForeignKey, Float
from core.database import Base


class Clip(Base):
    __tablename__ = "clips"

    id = Column(Integer, primary_key=True)

    upload_id = Column(Integer, ForeignKey("uploads.id"), index=True, nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), index=True, nullable=False)

    # S3 key where the clip lives
    storage_key = Column(String, unique=True, nullable=False)

    # Timing (seconds)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    duration = Column(Float, nullable=False)

    # Optional metadata (v1 simple)
    title = Column(String, nullable=True)
