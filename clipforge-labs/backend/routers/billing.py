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


def _stripe_obj_get(obj: object, key: str, default: object | None = None) -> object | None:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _stripe_list_data(list_obj: object) -> list:
    if isinstance(list_obj, dict):
        return list_obj.get("data") or []
    return getattr(list_obj, "data", []) or []


def _customer_id_from_customer(customer: object) -> Optional[str]:
    token = str(_stripe_obj_get(customer, "id", "") or "").strip()
    return token or None


def _stripe_customer_ids_for_user(user: User) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()

    def add(customer_id: object) -> None:
        token = str(customer_id or "").strip()
        if token and token not in seen:
            seen.add(token)
            ids.append(token)

    add(getattr(user, "stripe_customer_id", None))

    email = str(getattr(user, "email", "") or "").strip().lower()
    if not email:
        return ids

    customers = stripe.Customer.list(email=email, limit=100)
    for customer in _stripe_list_data(customers):
        if bool(_stripe_obj_get(customer, "deleted", False)):
            continue
        customer_email = str(_stripe_obj_get(customer, "email", "") or "").strip().lower()
        if customer_email == email:
            add(_customer_id_from_customer(customer))

    return ids


def _active_subscriptions_for_customer(customer_id: str) -> list:
    active_states = {"active", "trialing", "past_due", "unpaid"}
    subs = stripe.Subscription.list(customer=customer_id, status="all", limit=20)
    rows: list = []
    for sub in _stripe_list_data(subs):
        status = str(_stripe_obj_get(sub, "status", "") or "").lower()
        if status in active_states:
            rows.append(sub)
    return rows


def _active_subscriptions_for_user(user: User) -> tuple[list, list[str]]:
    customer_ids = _stripe_customer_ids_for_user(user)
    rows: list = []
    seen: set[str] = set()

    for customer_id in customer_ids:
        for sub in _active_subscriptions_for_customer(customer_id):
            sub_id = str(_stripe_obj_get(sub, "id", "") or "").strip()
            key = sub_id or f"{customer_id}:{id(sub)}"
            if key in seen:
                continue
            seen.add(key)
            rows.append(sub)

    return rows, customer_ids


def _subscription_customer_id(subscription: object) -> Optional[str]:
    raw = _stripe_obj_get(subscription, "customer", None)
    if isinstance(raw, dict):
        token = str(raw.get("id") or "").strip()
    else:
        token = str(getattr(raw, "id", raw) or "").strip()
    return token or None


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


def _subscription_price_id(subscription: object) -> Optional[str]:
    items_container = _stripe_obj_get(subscription, "items", None)
    items = getattr(items_container, "data", None)

    if items is None and isinstance(items_container, dict):
        items = items_container.get("data")
    if items is None and isinstance(subscription, dict):
        items = (subscription.get("items") or {}).get("data")

    for item in items or []:
        price_obj = item.get("price") if isinstance(item, dict) else getattr(item, "price", None)
        price_id = price_obj.get("id") if isinstance(price_obj, dict) else getattr(price_obj, "id", None)
        if price_id:
            return str(price_id)
    return None


def _subscription_status_payload(active_subs: list) -> tuple[str, bool, Optional[str]]:
    if not active_subs:
        return ("no_active_subscription", False, None)
    any_non_canceling = any(not bool(_stripe_obj_get(sub, "cancel_at_period_end", False)) for sub in active_subs)
    primary_id = str(_stripe_obj_get(active_subs[0], "id", "") or "") or None
    if any_non_canceling:
        return ("active", False, primary_id)
    return ("cancel_at_period_end", True, primary_id)


def _remember_active_subscription_customer(db: Session, user: User, active_subs: list) -> None:
    current_id = str(getattr(user, "stripe_customer_id", "") or "").strip()
    active_customer_ids: list[str] = []
    seen: set[str] = set()

    for sub in active_subs:
        customer_id = _subscription_customer_id(sub)
        if customer_id and customer_id not in seen:
            seen.add(customer_id)
            active_customer_ids.append(customer_id)

    if active_customer_ids and current_id not in seen:
        user.stripe_customer_id = active_customer_ids[0]
        db.commit()


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


def _get_user_from_customer_id(db: Session, customer_id: str | None) -> Optional[User]:
    cid = str(customer_id or "").strip()
    if not cid:
        return None
    return db.query(User).filter(User.stripe_customer_id == cid).first()


def _get_user_from_customer_id_or_email(db: Session, customer_id: str | None) -> Optional[User]:
    cid = str(customer_id or "").strip()
    user = _get_user_from_customer_id(db, cid)
    if user or not cid or not stripe.api_key:
        return user

    try:
        customer = stripe.Customer.retrieve(cid)
    except Exception:
        return None

    email = str(_stripe_obj_get(customer, "email", "") or "").strip().lower()
    if not email:
        return None
    user = db.query(User).filter(User.email == email).first()
    if user and not str(getattr(user, "stripe_customer_id", "") or "").strip():
        user.stripe_customer_id = cid
    return user


def _normalize_interval(interval: str | None) -> str:
    token = str(interval or "").strip().lower()
    return "yearly" if token in {"year", "yearly"} else "monthly"


def _resolve_plan_interval_from_price_id(price_id: str | None) -> tuple[Optional[str], Optional[str]]:
    pid = str(price_id or "").strip()
    if not pid:
        return (None, None)
    for plan in sorted(ALLOWED_PLANS):
        for interval in ("monthly", "yearly"):
            expected = _price_id_from_env(plan, interval)
            if expected and expected == pid:
                return (_canonical_checkout_plan(plan), _normalize_interval(interval))
    return (None, None)


def _highest_active_subscription_plan(customer_id: str | None) -> Optional[str]:
    cid = str(customer_id or "").strip()
    if not cid:
        return None
    return _highest_plan_from_subscriptions(_active_subscriptions_for_customer(cid))


def _highest_plan_from_subscriptions(active_subs: list) -> Optional[str]:
    best_plan: Optional[str] = None
    for sub in active_subs:
        price_id = _subscription_price_id(sub)
        plan, _interval = _resolve_plan_interval_from_price_id(price_id)
        if plan and _plan_tier(plan) >= _plan_tier(best_plan):
            best_plan = plan
    return best_plan


def _first_invoice_line_price_and_quantity(invoice_obj: object) -> tuple[Optional[str], int]:
    lines = None
    if isinstance(invoice_obj, dict):
        lines = ((invoice_obj.get("lines") or {}).get("data") or [])
    else:
        lines_container = getattr(invoice_obj, "lines", None)
        if isinstance(lines_container, dict):
            lines = lines_container.get("data")
        else:
            lines = getattr(lines_container, "data", None)

    for line in lines or []:
        price_obj = line.get("price") if isinstance(line, dict) else getattr(line, "price", None)
        price_id = price_obj.get("id") if isinstance(price_obj, dict) else getattr(price_obj, "id", None)
        if price_id:
            qty = line.get("quantity") if isinstance(line, dict) else getattr(line, "quantity", None)
            quantity = max(1, int(qty or 1))
            return (str(price_id), quantity)
    return (None, 1)


def _safe_int(value: object, default: int = 0) -> int:
    try:
        return int(value)  # type: ignore[arg-type]
    except Exception:
        return int(default)


def _is_new_user_trial_eligible(user: User) -> bool:
    plan_token = _canonical_checkout_plan(str(getattr(user, "plan", "free") or "free"))
    if plan_token != "free":
        return False
    if bool(getattr(user, "trial_used", False)):
        return False
    if bool(getattr(user, "stripe_customer_id", None)):
        return False
    return True


def _apply_plan_grant(
    *,
    user: User,
    plan: str,
    interval: str,
    pack: int,
    event_id: Optional[str],
) -> int:
    grant = int(_credits_for_plan(plan, interval, pack))
    user.plan = plan

    if plan == "free":
        user.credits = max(int(user.credits or 0), grant)
        if hasattr(user, "trial_used"):
            user.trial_used = True
    else:
        user.credits = int(user.credits or 0) + grant

    if hasattr(user, "last_stripe_event_id") and event_id:
        user.last_stripe_event_id = event_id
    return grant


def _credits_for_plan(plan: str, interval: str, pack_qty: int) -> int:
    """
    - Free trial: 65 credits (one-time)
    - Orbito Starter: 150 / month
    - Orbito Creator: 300 / month * pack_qty
    - Labs Spark: 390 / month
    - Labs Velocity: 990 / month * pack_qty
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

    if plan in {"labs_spark", "labs_starter"}:
        return 390 if interval in {"month", "monthly"} else 390 * 12

    if plan in {"labs_velocity", "labs_creator"}:
        base = 990 if interval in {"month", "monthly"} else 990 * 12
        qty = max(1, int(pack_qty or 1))
        return base * qty

    if plan == "studio":
        return 3000 if interval in {"month", "monthly"} else 3000 * 12

    return 0


def _plan_tier(plan: str | None) -> int:
    token = _canonical_checkout_plan(str(plan or "").strip().lower())
    legacy = {
        "starter_monthly": "starter",
        "creator_plus": "creator",
    }
    token = legacy.get(token, token)

    if token == "free":
        return 0
    if token == "starter":
        return 1
    if token == "creator":
        return 2
    if token in {"labs_spark", "labs_starter"}:
        return 3
    if token in {"labs_velocity", "labs_creator"}:
        return 4
    if token == "studio":
        return 5
    return 0


def _credits_delta_for_upgrade(previous_plan: str | None, next_plan: str, interval: str, pack_qty: int) -> int:
    if _plan_tier(next_plan) <= _plan_tier(previous_plan):
        return 0
    return int(_credits_for_plan(next_plan, interval, pack_qty))


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

    if plan == "free":
        if not _is_new_user_trial_eligible(user):
            if bool(getattr(user, "trial_used", False)):
                raise HTTPException(status_code=400, detail="Free trial already used")
            raise HTTPException(
                status_code=400,
                detail="Free trial is only available once for brand-new accounts with a new payment method",
            )

    customer_id = _ensure_stripe_customer(db, user)

    base = _frontend_base_url()
    success_url = f"{base}/app/billing?checkout=success"
    cancel_url = f"{base}/app/billing?checkout=cancel"

    try:
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
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe checkout failed: {_stripe_error_message(e)}")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Could not reach billing provider to start checkout")


@router.post("/cancel", response_model=CancelSubscriptionResponse)
def cancel_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    user = _reload_user(db, current_user)
    customer_id = getattr(user, "stripe_customer_id", None)
    if not customer_id and not str(getattr(user, "email", "") or "").strip():
        raise HTTPException(status_code=400, detail="No Stripe customer found")

    try:
        active_subs, _customer_ids = _active_subscriptions_for_user(user)
        _remember_active_subscription_customer(db, user, active_subs)
        if not active_subs:
            return CancelSubscriptionResponse(status="no_active_subscription")

        for sub in active_subs:
            sub_id = str(_stripe_obj_get(sub, "id", "") or "").strip()
            if sub_id and not bool(_stripe_obj_get(sub, "cancel_at_period_end", False)):
                stripe.Subscription.modify(sub_id, cancel_at_period_end=True)
        return CancelSubscriptionResponse(status="cancel_at_period_end")
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe error while canceling subscription: {_stripe_error_message(e)}")
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
    if not customer_id and not str(getattr(user, "email", "") or "").strip():
        return SubscriptionStatusResponse(status="no_active_subscription")

    try:
        active_subs, _customer_ids = _active_subscriptions_for_user(user)
        _remember_active_subscription_customer(db, user, active_subs)
        status, cancel_at_period_end, subscription_id = _subscription_status_payload(
            active_subs
        )
        return SubscriptionStatusResponse(
            status=status,
            cancel_at_period_end=cancel_at_period_end,
            subscription_id=subscription_id,
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe error while checking subscription: {_stripe_error_message(e)}")
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

        if plan != "free":
            # Paid plans are credited on invoice.paid so click-only actions
            # never grant credits before Stripe confirms payment.
            # Also mark any previous active subscriptions to cancel at period end
            # once this new checkout succeeds, so users don't keep multiple renewals.
            customer_id = session.get("customer") if isinstance(session, dict) else getattr(session, "customer", None)
            new_subscription = session.get("subscription") if isinstance(session, dict) else getattr(session, "subscription", None)
            new_sub_id = (
                new_subscription.get("id")
                if isinstance(new_subscription, dict)
                else getattr(new_subscription, "id", new_subscription)
            )
            new_sub_id = str(new_sub_id or "").strip() or None

            if customer_id:
                active_subs = _active_subscriptions_for_customer(str(customer_id))
                for sub in active_subs:
                    sub_id = str(getattr(sub, "id", "") or "").strip()
                    if not sub_id or (new_sub_id and sub_id == new_sub_id):
                        continue
                    if not bool(getattr(sub, "cancel_at_period_end", False)):
                        stripe.Subscription.modify(sub_id, cancel_at_period_end=True)
            return {"status": "ok"}

        grant = _apply_plan_grant(
            user=user,
            plan=plan,
            interval=interval,
            pack=pack,
            event_id=event_id,
        )
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

    if event["type"] == "invoice.paid":
        invoice = event["data"]["object"]
        customer_id = invoice.get("customer") if isinstance(invoice, dict) else getattr(invoice, "customer", None)
        user = _get_user_from_customer_id_or_email(db, customer_id)
        if not user:
            return {"status": "ignored", "reason": "user not found"}

        if getattr(user, "last_stripe_event_id", None) == event_id:
            return {"status": "ignored", "reason": "duplicate event"}

        price_id, quantity = _first_invoice_line_price_and_quantity(invoice)
        plan, interval = _resolve_plan_interval_from_price_id(price_id)
        if not plan or plan not in ALLOWED_PLANS:
            return {"status": "ignored", "reason": "unmapped invoice price"}

        if plan == "free":
            return {"status": "ignored", "reason": "free plan has no paid invoice credits"}

        grant = _apply_plan_grant(
            user=user,
            plan=plan,
            interval=interval or "monthly",
            pack=max(1, _safe_int(quantity, 1)),
            event_id=event_id,
        )
        # Stripe can briefly leave an older lower-tier subscription active while a
        # newer higher-tier Labs plan is already live. Keep account state/email copy
        # anchored to the highest active subscription so billing notices stay accurate.
        effective_plan = _highest_active_subscription_plan(customer_id) or plan
        user.plan = effective_plan
        db.commit()

        try:
            send_billing_confirmation_email(
                to_email=user.email,
                plan=effective_plan,
                interval=interval or "monthly",
                credits_granted=int(grant),
                credits_balance=int(user.credits or 0),
            )
        except Exception as exc:
            print(f"[billing] confirmation email skipped: {type(exc).__name__}")

    if event["type"] in {"customer.subscription.deleted", "customer.subscription.updated"}:
        subscription = event["data"]["object"]
        customer_id = _subscription_customer_id(subscription)
        user = _get_user_from_customer_id_or_email(db, customer_id)
        if not user:
            print(f"[billing] subscription sync ignored: user not found (customer={customer_id})")
            return {"status": "ignored", "reason": "user not found"}

        if getattr(user, "last_stripe_event_id", None) == event_id:
            return {"status": "ignored", "reason": "duplicate event"}

        active_subs, _customer_ids = _active_subscriptions_for_user(user)
        _remember_active_subscription_customer(db, user, active_subs)

        if active_subs:
            effective_plan = _highest_plan_from_subscriptions(active_subs)
            if effective_plan:
                user.plan = effective_plan
        else:
            user.plan = "free"

        if hasattr(user, "last_stripe_event_id"):
            user.last_stripe_event_id = event_id
        db.commit()

    return {"status": "ok"}
