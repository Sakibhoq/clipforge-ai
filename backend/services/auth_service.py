from sqlalchemy.orm import Session
from models.user import User
from core.security import hash_password, verify_password, create_access_token

def register(db: Session, email: str, password: str):
    user = User(email=email, hashed_password=hash_password(password))
    db.add(user)
    db.commit()
    return user

def authenticate(db: Session, email: str, password: str):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        return None
    return create_access_token({"sub": user.email})
