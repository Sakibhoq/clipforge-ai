from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from core.database import Base
from datetime import datetime


class Upload(Base):
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    original_filename = Column(String, nullable=False)
    storage_key = Column(String, nullable=False, unique=True)

    transcript = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
