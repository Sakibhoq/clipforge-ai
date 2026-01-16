from fastapi import APIRouter, Request, Header, HTTPException, Depends
from pydantic import BaseModel
import stripe

from core.config import settings
from core.database import SessionLocal
from models.user import User

# Import the same auth dependency your frontend expects (Bearer JWT)
from routers.auth import get_current_user

router = APIRouter(prefix="/billing", tags=["billing"])

stripe.api_key = getattr(settings, "STRIPE_SECRET_KEY", None)

ALLOWED_PLANS = {"free", "starter", "creator", "studio"}


def _get_plan_from_session(session_obj: dict) -> str | None:
    md = (session_obj.get("metadata") or {})
    plan = md.get("plan")
    if not plan:
        return None
    if plan not in ALLOWED_PLANS:
        return None
    return plan


def _get_user_from_session(db, session_obj: dict) -> User | None:
    md = (session_obj.get("metadata") or {})

    user_id = md.get("user_id")
    if user_id:
        try:
            uid = int(user_id)
            user = db.query(User).filter(User.id == uid).first()
            if user:
                return user
        except Exception:
            pass

    email = session_obj.get("customer_email")
    if email:
        return db.query(User).filter(User.email == email).first()

    return None


def _frontend_base_url() -> str:
    """
    Where Stripe should send users back after checkout.
    You can set FRONTEND_BASE_URL in .env later (AWS-ready).
    """
    return getattr(settings, "FRONTEND_BASE_URL", None) or "http://127.0.0.1:3000"


def _price_id_from_env(plan: str, interval: str) -> str | None:
    """
    Optional env-based mapping (you can add these later):
      STRIPE_PRICE_STARTER_MONTH
      STRIPE_PRICE_STARTER_YEAR
      STRIPE_PRICE_CREATOR_MONTH
      STRIPE_PRICE_CREATOR_YEAR
      STRIPE_PRICE_STUDIO_MONTH
      STRIPE_PRICE_STUDIO_YEAR
    """
    key = f"STRIPE_PRICE_{plan.upper()}_{interval.upper()}"
    return getattr(settings, key, None)


class CheckoutSessionRequest(BaseModel):
    plan: str
    interval: str = "month"  # "month" | "year"
    price_id: str | None = None
    quantity: int = 1


class CheckoutSessionResponse(BaseModel):
    url: str


@router.post("/checkout-session", response_model=CheckoutSessionResponse)
def create_checkout_session(
    payload: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
):
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe secret key not configured")

    plan = (payload.plan or "").strip()
    interval = (payload.interval or "month").strip().lower()

    if plan not in ALLOWED_PLANS or plan == "free":
        raise HTTPException(status_code=400, detail="Invalid plan")
    if interval not in {"month", "year"}:
        raise HTTPException(status_code=400, detail="Invalid interval")
    if payload.quantity < 1 or payload.quantity > 100:
        raise HTTPException(status_code=400, detail="Invalid quantity")

    # Either accept a price_id from the frontend OR use env mapping.
    price_id = (payload.price_id or "").strip() or _price_id_from_env(plan, interval)
    if not price_id:
        raise HTTPException(
            status_code=500,
            detail="Stripe price_id not provided and no env mapping configured",
        )

    base = _frontend_base_url()

    # You can change these routes later to whatever your frontend uses.
    success_url = f"{base}/app/billing?checkout=success"
    cancel_url = f"{base}/app/billing?checkout=cancel"

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": payload.quantity}],
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=current_user.email,
            metadata={
                "user_id": str(current_user.id),
                "plan": plan,
                "interval": interval,
            },
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")

    return CheckoutSessionResponse(url=session.url)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature"),
):
    webhook_secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", None)
    if not webhook_secret:
        raise HTTPException(status_code=500, detail="Stripe webhook secret not configured")

    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=webhook_secret,
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    db = SessionLocal()
    try:
        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]

            user = _get_user_from_session(db, session)
            if not user:
                return {"status": "ignored", "reason": "user not found / not identifiable"}

            plan = _get_plan_from_session(session)
            if not plan:
                return {"status": "ignored", "reason": "missing/unknown plan metadata"}

            user.plan = plan
            db.commit()
            return {"status": "ok", "updated": True, "plan": plan}

        return {"status": "ok", "ignored": True, "event_type": event["type"]}
    finally:
        db.close()
