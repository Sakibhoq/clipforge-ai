from sqlalchemy import Column, Integer, String, Boolean
from core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)

    name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)
    plan = Column(String, default="free", nullable=False)

    credits = Column(Integer, default=0, nullable=False)
    stripe_customer_id = Column(String, nullable=True)
    last_stripe_event_id = Column(String, nullable=True)
    trial_used = Column(Boolean, default=False, nullable=False)

    # User settings/preferences
    pref_email_reports = Column(Boolean, default=True, nullable=False)
    pref_product_tips = Column(Boolean, default=False, nullable=False)
    pref_autoplay_previews = Column(Boolean, default=True, nullable=False)
    notif_receipts = Column(Boolean, default=True, nullable=False)
    notif_processing_alerts = Column(Boolean, default=False, nullable=False)
