from passlib.context import CryptContext

# NOTE: Routers implement cookie/JWT auth directly.
# This module is only used by legacy service helpers (and for hashing utilities).
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)

