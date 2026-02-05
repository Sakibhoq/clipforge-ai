# backend/routers/billing.py

from __future__ import annotations

import os
from typing import Generator, Optional

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.database import SessionLocal
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/billing", tags=["billing"])

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

ALLOWED_PLANS = {"free", "starter", "creator", "studio"}
ALLOWED_INTERVALS = {"month", "monthly", "year", "yearly"}


# ------------------------------------------------------------------
# DB dependency
# ------------------------------------------------------------------

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _frontend_base_url() -> str:
    return os.getenv("FRONTEND_BASE_URL") or "http://127.0.0.1:3000"


def _price_id_from_env(plan: str, interval: str) -> Optional[str]:
    interval = interval.lower().strip()

    if interval in {"month", "monthly"}:
        suffix = "MONTHLY"
    elif interval in {"year", "yearly"}:
        suffix = "YEARLY"
    else:
        return None

    return os.getenv(f"STRIPE_PRICE_{plan.upper()}_{suffix}")


def _reload_user(db: Session, current_user: User) -> User:
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _ensure_stripe_customer(db: Session, user: User) -> str:
    existing = getattr(user, "stripe_customer_id", None)
    if existing:
        return existing

    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    customer = stripe.Customer.create(
        email=user.email,
        metadata={"user_id": str(user.id)},
    )

    user.stripe_customer_id = customer.id
    db.commit()

    return customer.id


def _get_user_from_session(db: Session, session_obj: dict) -> Optional[User]:
    md = session_obj.get("metadata") or {}

    user_id = md.get("user_id")
    if user_id:
        try:
            return db.query(User).filter(User.id == int(user_id)).first()
        except Exception:
            pass

    email = session_obj.get("customer_email")
    if email:
        return db.query(User).filter(User.email == email).first()

    return None


def _credits_for_plan(plan: str, interval: str, pack_qty: int) -> int:
    """
    Launch credit rules:
    - Free trial: 60 (one-time)
    - Starter: 150 / month
    - Creator: 300 / month * pack_qty
    - Studio: manual
    """
    plan = plan.lower().strip()
    interval = interval.lower().strip()

    if plan == "free":
        return 60

    if plan == "starter":
        return 150 if interval in {"month", "monthly"} else 150 * 12

    if plan == "creator":
        base = 300 if interval in {"month", "monthly"} else 300 * 12
        qty = max(1, int(pack_qty or 1))
        return base * qty

    return 0


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------

class CheckoutSessionRequest(BaseModel):
    plan: str
    interval: str = "monthly"
    pack: int | None = None


class CheckoutSessionResponse(BaseModel):
    url: str


class CancelSubscriptionResponse(BaseModel):
    status: str


# ------------------------------------------------------------------
# Checkout Session
# ------------------------------------------------------------------

@router.post("/checkout-session", response_model=CheckoutSessionResponse)
def create_checkout_session(
    payload: CheckoutSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    plan = payload.plan.strip().lower()
    interval = payload.interval.strip().lower()

    if plan not in ALLOWED_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    if interval not in ALLOWED_INTERVALS:
        raise HTTPException(status_code=400, detail="Invalid interval")

    price_id = _price_id_from_env(plan, interval)
    if not price_id:
        raise HTTPException(status_code=500, detail="Stripe price not configured")

    quantity = 1
    if plan == "creator":
        quantity = max(1, min(10, int(payload.pack or 1)))

    user = _reload_user(db, current_user)

    if plan == "free" and getattr(user, "trial_used", False):
        raise HTTPException(status_code=400, detail="Free trial already used")

    customer_id = _ensure_stripe_customer(db, user)

    base = _frontend_base_url()
    success_url = f"{base}/app/billing?checkout=success"
    cancel_url = f"{base}/app/billing?checkout=cancel"

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": quantity}],
        success_url=success_url,
        cancel_url=cancel_url,
        customer=customer_id,
        payment_method_collection="always",
        allow_promotion_codes=True,
        metadata={
            "user_id": str(user.id),
            "plan": plan,
            "interval": interval,
            "pack": str(quantity),
        },
    )

    return CheckoutSessionResponse(url=session.url)


@router.post("/cancel", response_model=CancelSubscriptionResponse)
def cancel_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    user = _reload_user(db, current_user)
    customer_id = getattr(user, "stripe_customer_id", None)
    if not customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer found")

    subs = stripe.Subscription.list(customer=customer_id, status="active", limit=1)
    if not subs.data:
        return CancelSubscriptionResponse(status="no_active_subscription")

    sub = subs.data[0]
    stripe.Subscription.modify(sub.id, cancel_at_period_end=True)
    return CancelSubscriptionResponse(status="cancel_at_period_end")


# ------------------------------------------------------------------
# Stripe Webhook
# ------------------------------------------------------------------

@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature"),
    db: Session = Depends(get_db),
):
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not webhook_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=webhook_secret,
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook")

    # Idempotency guard
    event_id = event["id"]

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]

        user = _get_user_from_session(db, session)
        if not user:
            return {"status": "ignored", "reason": "user not found"}

        if getattr(user, "last_stripe_event_id", None) == event_id:
            return {"status": "ignored", "reason": "duplicate event"}

        md = session.get("metadata") or {}
        plan = (md.get("plan") or "").strip().lower()
        interval = (md.get("interval") or "monthly").strip().lower()
        pack = int(md.get("pack") or 1)

        if plan not in ALLOWED_PLANS:
            return {"status": "ignored", "reason": "invalid plan"}

        grant = _credits_for_plan(plan, interval, pack)

        # Apply changes atomically
        user.plan = plan

        if plan == "free":
            user.credits = max(int(user.credits or 0), 60)
            if hasattr(user, "trial_used"):
                user.trial_used = True
        else:
            user.credits = int(user.credits or 0) + int(grant)

        if hasattr(user, "last_stripe_event_id"):
            user.last_stripe_event_id = event_id

        db.commit()

    return {"status": "ok"}
