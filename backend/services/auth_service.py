# backend/services/auth_service.py

from sqlalchemy.orm import Session

from models.user import User
from core.security import hash_password


def register(db: Session, email: str, password: str) -> User:
    # New users MUST start at 0 credits.
    # Credits are granted ONLY after Stripe checkout success (webhook).
    user = User(
        email=email,
        hashed_password=hash_password(password),
        credits=0,
        # keep plan as whatever your system expects right now
        # (we’ll tighten “plan only after checkout” next)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
