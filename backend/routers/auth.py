from fastapi import APIRouter, HTTPException, Depends, Response, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
import jwt

from core.database import SessionLocal
from models.user import User
from core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

COOKIE_NAME = "cf_token"
TOKEN_TTL_DAYS = 7


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class MeResponse(BaseModel):
    email: EmailStr
    plan: str
    credits: int


def create_token(email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "exp": now + timedelta(days=TOKEN_TTL_DAYS),
        "iat": now,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token (no subject)")
        return email
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_cookie_settings(request: Request):
    """
    Production-safe cookie defaults.
    - Secure must be True on https (Codespaces + prod are https)
    - SameSite=Lax works for same-site navigations; Codespaces frontend->backend are cross-origin,
      but still same 'site'? Not guaranteed. We use SameSite=None for cross-origin cookie auth.
    """
    # If you terminate TLS upstream, request.url.scheme should still be "https" in Codespaces.
    is_https = request.url.scheme == "https"

    # Cross-origin frontend (3000) -> backend (8000) needs SameSite=None
    samesite = "none"

    return {
        "httponly": True,
        "secure": True,  # should be True in prod
        "samesite": "none",                   # required for cross-origin cookie auth
        "path": "/",
    }


def set_auth_cookie(response: Response, request: Request, token: str):
    opts = get_cookie_settings(request)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=TOKEN_TTL_DAYS * 24 * 60 * 60,
        expires=TOKEN_TTL_DAYS * 24 * 60 * 60,
        **opts,
    )


def clear_auth_cookie(response: Response, request: Request):
    opts = get_cookie_settings(request)
    response.delete_cookie(
        key=COOKIE_NAME,
        path=opts["path"],
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    email = decode_token(token)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    password = (data.password or "").strip()

    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password must be 72 bytes or less")

    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    hashed_password = pwd_context.hash(password)

    # credits defaults to 60 via model/migration
    user = User(email=data.email, hashed_password=hashed_password)

    db.add(user)
    db.commit()
    db.refresh(user)

    return {"message": "User registered successfully"}


@router.post("/login")
def login(data: LoginRequest, response: Response, request: Request, db: Session = Depends(get_db)):
    password = (data.password or "").strip()

    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password must be 72 bytes or less")

    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not pwd_context.verify(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user.email)
    set_auth_cookie(response, request, token)

    # Return minimal body (frontend can just treat 200 as success)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response, request: Request):
    clear_auth_cookie(response, request)
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)):
    return MeResponse(email=current_user.email, plan=current_user.plan, credits=current_user.credits)
