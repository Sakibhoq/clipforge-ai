import stripe
from core.config import settings
from models.user import User

# NOTE: this module is legacy and not used by the current billing flow.
# Keep it safe + consistent with the new plan names to avoid surprises.
stripe.api_key = settings.STRIPE_SECRET_KEY or ""

PLANS = {
    # Credit system is authoritative. These are generous defaults to avoid
    # accidental gating if a legacy call path uses usage_guard.
    "free": {
        "price_id": None,
        "jobs": 9999,
        "clips": 9999,
        "captions": True,
    },
    "starter": {
        "price_id": None,
        "jobs": 9999,
        "clips": 9999,
        "captions": True,
    },
    "creator": {
        "price_id": None,
        "jobs": 9999,
        "clips": 9999,
        "captions": True,
    },
    "studio": {
        "price_id": None,
        "jobs": 9999,
        "clips": 9999,
        "captions": True,
    },
}

def create_checkout_session(user: User, plan: str):
    if plan not in PLANS or plan == "free":
        return None

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        mode="subscription",
        customer_email=user.email,
        line_items=[{
            "price": PLANS[plan]["price_id"],
            "quantity": 1
        }],
        success_url=f"{settings.FRONTEND_BASE_URL}/app/billing",
        cancel_url=f"{settings.FRONTEND_BASE_URL}/pricing",
    )

    return session.url
