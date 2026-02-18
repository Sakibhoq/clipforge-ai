from models.user import User
from services.stripe_service import PLANS


def _get_plan(user: User):
    key = (getattr(user, "plan", None) or "").strip()
    if not key:
        # safe default if plan missing
        key = "free"
    if key not in PLANS:
        # production guard: unknown plan shouldn't 500
        key = "free"
    return PLANS[key]


def can_create_job(user: User, jobs_this_month: int) -> bool:
    plan = _get_plan(user)
    limit = int(plan.get("jobs", 0) or 0)
    return int(jobs_this_month or 0) < limit


def max_clips(user: User) -> int:
    plan = _get_plan(user)
    return int(plan.get("clips", 0) or 0)


def captions_allowed(user: User) -> bool:
    plan = _get_plan(user)
    return bool(plan.get("captions", False))
