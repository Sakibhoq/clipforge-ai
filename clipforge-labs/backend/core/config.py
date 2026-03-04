import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)


def _env(name: str, default: str | None = None) -> str | None:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v else default


class Settings:
    # -----------------------------
    # Database
    # -----------------------------
    DATABASE_URL: str | None = _env("DATABASE_URL")
    DB_PATH: str = _env("DB_PATH", str(DATA_DIR / "app.db"))  # used by some local setups

    # -----------------------------
    # Auth / JWT
    # -----------------------------
    # REQUIRED for auth endpoints (/auth/login, /auth/me).
    SECRET_KEY: str = _env("SECRET_KEY", "") or ""
    COOKIE_DOMAIN: str | None = _env("COOKIE_DOMAIN")

    # -----------------------------
    # Frontend base URL (for Stripe redirect URLs)
    # -----------------------------
    FRONTEND_BASE_URL: str = _env("FRONTEND_BASE_URL", "http://127.0.0.1:3000") or "http://127.0.0.1:3000"

    # -----------------------------
    # Stripe
    # -----------------------------
    STRIPE_SECRET_KEY: str | None = _env("STRIPE_SECRET_KEY")
    STRIPE_WEBHOOK_SECRET: str | None = _env("STRIPE_WEBHOOK_SECRET")

    # Optional: price-id mapping (so frontend doesn't need to know price IDs)
    STRIPE_PRICE_STARTER_MONTH: str | None = _env("STRIPE_PRICE_STARTER_MONTH")
    STRIPE_PRICE_STARTER_YEAR: str | None = _env("STRIPE_PRICE_STARTER_YEAR")
    STRIPE_PRICE_CREATOR_MONTH: str | None = _env("STRIPE_PRICE_CREATOR_MONTH")
    STRIPE_PRICE_CREATOR_YEAR: str | None = _env("STRIPE_PRICE_CREATOR_YEAR")
    STRIPE_PRICE_STUDIO_MONTH: str | None = _env("STRIPE_PRICE_STUDIO_MONTH")
    STRIPE_PRICE_STUDIO_YEAR: str | None = _env("STRIPE_PRICE_STUDIO_YEAR")

    # Future (credits / entitlements) — placeholders, safe defaults.
    # Later we can add separate SKUs for clip credits vs video-gen credits.
    CREDIT_GRANT_STARTER: int = int(_env("CREDIT_GRANT_STARTER", "0") or "0")
    CREDIT_GRANT_CREATOR: int = int(_env("CREDIT_GRANT_CREATOR", "0") or "0")
    CREDIT_GRANT_STUDIO: int = int(_env("CREDIT_GRANT_STUDIO", "0") or "0")


settings = Settings()

APP_ENV = (os.getenv("APP_ENV") or "development").strip().lower()

# Fail fast in production for missing SECRET_KEY (auth + signed tokens rely on it).
if not settings.SECRET_KEY:
    if APP_ENV == "production":
        raise RuntimeError("SECRET_KEY is required when APP_ENV=production")
    print("⚠️  WARNING: SECRET_KEY is not set. Auth endpoints will fail until it is set.")

# In production with split subdomains (clipforge.ai + api.clipforge.ai), COOKIE_DOMAIN must be set
# for the frontend domain to see the auth cookie.
if APP_ENV == "production" and not (settings.COOKIE_DOMAIN or "").strip():
    print("⚠️  WARNING: COOKIE_DOMAIN is not set. For clipforge.ai + api.clipforge.ai, set COOKIE_DOMAIN=.clipforge.ai")
