from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from core.database import Base


class SocialAccount(Base):
    __tablename__ = "social_accounts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    provider = Column(String, nullable=False, index=True)  # youtube, tiktok, instagram, etc
    account_id = Column(String, nullable=True, index=True)
    account_name = Column(String, nullable=True)

    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(Integer, nullable=True)  # epoch seconds
    scopes = Column(Text, nullable=True)  # JSON string

    status = Column(String, nullable=False, default="connected")  # connected / expired / revoked

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
