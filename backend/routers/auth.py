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


# =========================
# DB
# =========================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =========================
# Schemas
# =========================
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


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# =========================
# JWT
# =========================
def create_token(email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "iat": now,
        "exp": now + timedelta(days=TOKEN_TTL_DAYS),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        return email
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


# =========================
# Cookies (LAUNCH SAFE)
# =========================
def _is_https(request: Request) -> bool:
    """
    Proxy-safe https detection.
    Codespaces/nginx/ALB often terminates TLS upstream and forwards:
      X-Forwarded-Proto: https
    """
    xf_proto = (request.headers.get("x-forwarded-proto") or "").lower().strip()
    if xf_proto:
        return xf_proto == "https"
    return request.url.scheme == "https"


def _needs_cross_site_cookie(request: Request) -> bool:
    """
    If frontend is on a different origin (Codespaces: -3000.app.github.dev) talking
    to backend (-8000.app.github.dev), we must use SameSite=None + Secure=True.
    """
    origin = (request.headers.get("origin") or "").lower()
    return ".app.github.dev" in origin


def cookie_options(request: Request):
    https = _is_https(request)
    cross_site = _needs_cross_site_cookie(request)

    # Codespaces / cross-origin cookie auth:
    #   SameSite=None AND Secure=True (browser requirement)
    if https and cross_site:
        return {"httponly": True, "secure": True, "samesite": "none", "path": "/"}

    # Local http dev (localhost / 127.0.0.1):
    #   Secure=False, SameSite=Lax is fine
    if not https:
        return {"httponly": True, "secure": False, "samesite": "none", "path": "/"}

    # Normal production https same-site:
    return {"httponly": True, "secure": True, "samesite": "lax", "path": "/"}


def set_auth_cookie(response: Response, request: Request, token: str):
    """
    IMPORTANT FIX:
    - Use a real datetime Expires (RFC-compliant). Some browsers will ignore cookies
      if Expires isn't a valid HTTP-date.
    - Keep Max-Age for consistency.
    """
    opts = cookie_options(request)
    max_age = TOKEN_TTL_DAYS * 24 * 60 * 60
    expires_dt = datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age,
        expires=expires_dt,  # ✅ RFC-compliant Expires
        path=opts["path"],
        httponly=opts["httponly"],
        secure=opts["secure"],
        samesite=opts["samesite"],
    )


def clear_auth_cookie(response: Response, request: Request):
    opts = cookie_options(request)
    response.delete_cookie(
        key=COOKIE_NAME,
        path=opts["path"],
        secure=opts["secure"],
        samesite=opts["samesite"],
    )


# =========================
# Auth dependency
# =========================
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


# =========================
# Routes
# =========================
@router.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    password = (data.password or "").strip()

    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password too long")

    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="User already exists")

    user = User(
        email=data.email,
        hashed_password=pwd_context.hash(password),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {"ok": True}


@router.post("/login")
def login(
    data: LoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not pwd_context.verify(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user.email)
    set_auth_cookie(response, request, token)

    return {"ok": True}


@router.post("/logout")
def logout(response: Response, request: Request):
    clear_auth_cookie(response, request)
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)):
    return MeResponse(
        email=current_user.email,
        plan=current_user.plan,
        credits=current_user.credits,
    )


@router.post("/password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not pwd_context.verify(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid password")

    new_password = (data.new_password or "").strip()
    if not new_password:
        raise HTTPException(status_code=400, detail="Missing new password")

    if len(new_password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password too long")

    current_user.hashed_password = pwd_context.hash(new_password)
    db.commit()

    return {"ok": True}
