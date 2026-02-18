from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from core.database import Base


class Storefront(Base):
    __tablename__ = "creator_storefronts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    handle = Column(String, nullable=False, unique=True, index=True)
    display_name = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    hero = Column(Text, nullable=True)
    pricing_json = Column(Text, nullable=True)  # JSON string (tier/price summary)

    published = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
