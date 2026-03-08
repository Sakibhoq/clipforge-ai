# backend/routers/billing.py

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Generator, Optional

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.database import SessionLocal
from models.user import User
from routers.auth import get_current_user
from services.mailer import send_billing_confirmation_email

router = APIRouter(prefix="/billing", tags=["billing"])

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

ALLOWED_PLANS = {
    "free",
    "starter",
    "creator",
    "studio",
    "labs_spark",
    "labs_velocity",
    "labs_starter",
    "labs_creator",
}
ALLOWED_INTERVALS = {"month", "monthly", "year", "yearly"}
MONTHLY_ONLY_PLANS = {"free", "starter", "studio", "labs_spark", "labs_starter"}


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

def _allow_free_trial_without_stripe() -> bool:
    """
    Dev-only bypass so free trials can work without Stripe configured.
    Controlled by ALLOW_FREE_TRIAL_WITHOUT_STRIPE=1 or non-production APP_ENV.
    """
    flag = (os.getenv("ALLOW_FREE_TRIAL_WITHOUT_STRIPE") or "").strip().lower()
    if flag in {"1", "true", "yes", "on"}:
        return True
    env = (os.getenv("APP_ENV") or "development").strip().lower()
    return env != "production"


def _price_id_from_env(plan: str, interval: str) -> Optional[str]:
    interval = interval.lower().strip()

    if interval in {"month", "monthly"}:
        suffixes = ("MONTHLY", "MONTH")
    elif interval in {"year", "yearly"}:
        suffixes = ("YEARLY", "YEAR")
    else:
        return None

    candidates = [str(plan or "").strip().upper()]
    legacy_aliases = {
        "LABS_SPARK": "LABS_STARTER",
        "LABS_VELOCITY": "LABS_CREATOR",
    }
    alias = legacy_aliases.get(candidates[0] or "")
    if alias:
        candidates.append(alias)

    for suffix in suffixes:
        for candidate in candidates:
            value = (os.getenv(f"STRIPE_PRICE_{candidate}_{suffix}") or "").strip()
            if value:
                return value
    return None


def _expected_price_env_keys(plan: str, interval: str) -> list[str]:
    normalized_plan = str(plan or "").strip().upper()
    normalized_interval = str(interval or "").strip().lower()
    suffixes = ("MONTHLY", "MONTH") if normalized_interval in {"month", "monthly"} else ("YEARLY", "YEAR")
    candidates = [normalized_plan]
    legacy_aliases = {
        "LABS_SPARK": "LABS_STARTER",
        "LABS_VELOCITY": "LABS_CREATOR",
    }
    alias = legacy_aliases.get(normalized_plan)
    if alias:
        candidates.append(alias)
    return [f"STRIPE_PRICE_{candidate}_{suffix}" for candidate in candidates for suffix in suffixes]


def _canonical_checkout_plan(plan: str) -> str:
    normalized = str(plan or "").strip().lower()
    aliases = {
        "labs_starter": "labs_spark",
        "labs_creator": "labs_velocity",
    }
    return aliases.get(normalized, normalized)


def _stripe_error_message(exc: Exception) -> str:
    if isinstance(exc, stripe.error.StripeError):
        msg = (getattr(exc, "user_message", None) or str(exc) or "").strip()
        return msg or "Stripe request failed"
    return (str(exc) or "").strip() or "Unknown billing error"


def _active_subscriptions_for_customer(customer_id: str) -> list:
    active_states = {"active", "trialing", "past_due", "unpaid"}
    subs = stripe.Subscription.list(customer=customer_id, status="all", limit=20)
    rows: list = []
    for sub in getattr(subs, "data", []) or []:
        status = str(getattr(sub, "status", "") or "").lower()
        if status in active_states:
            rows.append(sub)
    return rows


def _subscription_item_id(subscription: object) -> Optional[str]:
    items_container = getattr(subscription, "items", None)
    items = getattr(items_container, "data", None)

    if items is None and isinstance(items_container, dict):
        items = items_container.get("data")
    if items is None and isinstance(subscription, dict):
        items = (subscription.get("items") or {}).get("data")

    for item in items or []:
        if isinstance(item, dict):
            item_id = str(item.get("id", "") or "").strip()
        else:
            item_id = str(getattr(item, "id", "") or "").strip()
        if item_id:
            return item_id
    return None


def _subscription_status_payload(active_subs: list) -> tuple[str, bool, Optional[str]]:
    if not active_subs:
        return ("no_active_subscription", False, None)
    any_non_canceling = any(not bool(getattr(sub, "cancel_at_period_end", False)) for sub in active_subs)
    primary_id = str(getattr(active_subs[0], "id", "") or "") or None
    if any_non_canceling:
        return ("active", False, primary_id)
    return ("cancel_at_period_end", True, primary_id)


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

    try:
        customer = stripe.Customer.create(
            email=user.email,
            metadata={"user_id": str(user.id)},
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe customer setup failed: {_stripe_error_message(e)}")
    except Exception:
        raise HTTPException(status_code=502, detail="Could not reach billing provider to create customer")

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
    - Free trial: 65 (one-time)
    - Starter: 150 / month
    - Creator: 300 / month * pack_qty
    - Labs Spark: 390 / month
    - Labs Velocity: 990 / month
    - Studio: manual
    """
    plan = plan.lower().strip()
    interval = interval.lower().strip()

    if plan == "free":
        return 65

    if plan == "starter":
        return 150 if interval in {"month", "monthly"} else 150 * 12

    if plan == "creator":
        base = 300 if interval in {"month", "monthly"} else 300 * 12
        qty = max(1, int(pack_qty or 1))
        return base * qty

    if plan == "labs_spark":
        return 390 if interval in {"month", "monthly"} else 390 * 12

    if plan == "labs_velocity":
        return 990 if interval in {"month", "monthly"} else 990 * 12

    return 0


def _reset_download_meter(user: User) -> None:
    if hasattr(user, "downloads_used"):
        user.downloads_used = 0
    if hasattr(user, "downloads_window"):
        user.downloads_window = datetime.now(timezone.utc).strftime("%Y-%m")


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


class SubscriptionStatusResponse(BaseModel):
    status: str
    cancel_at_period_end: bool = False
    subscription_id: Optional[str] = None


class BillingHistoryInvoice(BaseModel):
    id: str
    number: Optional[str] = None
    status: Optional[str] = None
    currency: str
    amount_paid: int
    amount_due: int
    created: int
    hosted_invoice_url: Optional[str] = None
    invoice_pdf: Optional[str] = None


class BillingHistoryResponse(BaseModel):
    invoices: list[BillingHistoryInvoice]


# ------------------------------------------------------------------
# Checkout Session
# ------------------------------------------------------------------

@router.post("/checkout-session", response_model=CheckoutSessionResponse)
def create_checkout_session(
    payload: CheckoutSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = _canonical_checkout_plan(payload.plan)
    interval = payload.interval.strip().lower()

    if plan not in ALLOWED_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    if interval not in ALLOWED_INTERVALS:
        raise HTTPException(status_code=400, detail="Invalid interval")

    if plan in MONTHLY_ONLY_PLANS and interval in {"year", "yearly"}:
        raise HTTPException(
            status_code=400,
            detail=f"{plan.capitalize()} supports monthly billing only",
        )

    # Dev-only: allow free trial credits without Stripe configured
    if plan == "free" and not stripe.api_key and _allow_free_trial_without_stripe():
        user = _reload_user(db, current_user)
        if getattr(user, "trial_used", False):
            raise HTTPException(status_code=400, detail="Free trial already used")

        user.credits = (user.credits or 0) + _credits_for_plan("free", interval, 1)
        user.trial_used = True
        user.plan = "free"
        _reset_download_meter(user)
        db.commit()

        base = _frontend_base_url()
        return CheckoutSessionResponse(url=f"{base}/app/billing?checkout=success&trial=local")

    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    price_id = _price_id_from_env(plan, interval)
    if not price_id:
        expected = ", ".join(_expected_price_env_keys(plan, interval))
        raise HTTPException(status_code=500, detail=f"Stripe price not configured ({expected})")

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

    try:
        active_subs = _active_subscriptions_for_customer(customer_id)
        if active_subs:
            primary = active_subs[0]
            sub_item_id = _subscription_item_id(primary)
            if sub_item_id:
                stripe.Subscription.modify(
                    primary.id,
                    cancel_at_period_end=False,
                    proration_behavior="create_prorations",
                    items=[{"id": sub_item_id, "price": price_id, "quantity": quantity}],
                    metadata={
                        "user_id": str(user.id),
                        "plan": plan,
                        "interval": interval,
                        "pack": str(quantity),
                    },
                )

                for sub in active_subs[1:]:
                    if not bool(getattr(sub, "cancel_at_period_end", False)):
                        stripe.Subscription.modify(sub.id, cancel_at_period_end=True)

                user.plan = plan
                _reset_download_meter(user)
                db.commit()
                return CheckoutSessionResponse(url=f"{base}/app/billing?checkout=success&updated=1")

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
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe checkout failed: {_stripe_error_message(e)}")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Could not reach billing provider to start checkout")

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

    try:
        active_subs = _active_subscriptions_for_customer(customer_id)
        if not active_subs:
            return CancelSubscriptionResponse(status="no_active_subscription")

        for sub in active_subs:
            if not bool(getattr(sub, "cancel_at_period_end", False)):
                stripe.Subscription.modify(sub.id, cancel_at_period_end=True)
        return CancelSubscriptionResponse(status="cancel_at_period_end")
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe error while canceling subscription: {str(e)}")
    except Exception:
        raise HTTPException(status_code=502, detail="Could not reach billing provider to cancel subscription")


@router.get("/subscription-status", response_model=SubscriptionStatusResponse)
def subscription_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    user = _reload_user(db, current_user)
    customer_id = getattr(user, "stripe_customer_id", None)
    if not customer_id:
        return SubscriptionStatusResponse(status="no_active_subscription")

    try:
        status, cancel_at_period_end, subscription_id = _subscription_status_payload(
            _active_subscriptions_for_customer(customer_id)
        )
        return SubscriptionStatusResponse(
            status=status,
            cancel_at_period_end=cancel_at_period_end,
            subscription_id=subscription_id,
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe error while checking subscription: {str(e)}")
    except Exception:
        raise HTTPException(status_code=502, detail="Could not reach billing provider to check subscription")


@router.get("/history", response_model=BillingHistoryResponse)
def billing_history(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = _reload_user(db, current_user)
    customer_id = getattr(user, "stripe_customer_id", None)
    safe_limit = max(1, min(int(limit or 20), 50))

    # Return empty history when Stripe is not configured or customer is missing.
    if not stripe.api_key or not customer_id:
        return BillingHistoryResponse(invoices=[])

    try:
        invoices = stripe.Invoice.list(customer=customer_id, limit=safe_limit)
    except Exception:
        # Keep UI usable even if Stripe temporarily fails.
        return BillingHistoryResponse(invoices=[])

    rows: list[BillingHistoryInvoice] = []
    for inv in invoices.data:
        rows.append(
            BillingHistoryInvoice(
                id=str(inv.get("id") or ""),
                number=inv.get("number"),
                status=inv.get("status"),
                currency=str(inv.get("currency") or "usd").upper(),
                amount_paid=int(inv.get("amount_paid") or 0),
                amount_due=int(inv.get("amount_due") or 0),
                created=int(inv.get("created") or 0),
                hosted_invoice_url=inv.get("hosted_invoice_url"),
                invoice_pdf=inv.get("invoice_pdf"),
            )
        )

    return BillingHistoryResponse(invoices=rows)


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
        plan = _canonical_checkout_plan(md.get("plan") or "")
        interval = (md.get("interval") or "monthly").strip().lower()
        pack = int(md.get("pack") or 1)

        if plan not in ALLOWED_PLANS:
            return {"status": "ignored", "reason": "invalid plan"}

        grant = _credits_for_plan(plan, interval, pack)

        # Apply changes atomically
        user.plan = plan
        _reset_download_meter(user)

        if plan == "free":
            user.credits = max(int(user.credits or 0), int(grant))
            if hasattr(user, "trial_used"):
                user.trial_used = True
        else:
            user.credits = int(user.credits or 0) + int(grant)

        if hasattr(user, "last_stripe_event_id"):
            user.last_stripe_event_id = event_id

        db.commit()

        try:
            send_billing_confirmation_email(
                to_email=user.email,
                plan=plan,
                interval=interval,
                credits_granted=int(grant),
                credits_balance=int(user.credits or 0),
            )
        except Exception as exc:
            print(f"[billing] confirmation email skipped: {type(exc).__name__}")

    return {"status": "ok"}
