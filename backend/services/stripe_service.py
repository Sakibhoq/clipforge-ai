import stripe
from core.config import settings
from models.user import User

stripe.api_key = "YOUR_STRIPE_SECRET_KEY"

PLANS = {
    "free": {
        "price_id": None,
        "jobs": 2,
        "clips": 2,
        "captions": False
    },
    "pro": {
        "price_id": "price_pro_xxx",
        "jobs": 20,
        "clips": 5,
        "captions": True
    },
    "business": {
        "price_id": "price_business_xxx",
        "jobs": 9999,
        "clips": 10,
        "captions": True
    }
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
        success_url=f"{settings.FRONTEND_URL}/dashboard",
        cancel_url=f"{settings.FRONTEND_URL}/pricing"
    )

    return session.url
