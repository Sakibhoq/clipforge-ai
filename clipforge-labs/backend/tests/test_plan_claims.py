from routers.billing import MONTHLY_ONLY_PLANS, _credits_for_plan
from routers.social import _allowed_posting_providers_for_plan


def test_plan_claims_credit_grants_match_pricing_cards():
    assert _credits_for_plan("starter", "monthly", 1) == 150
    assert _credits_for_plan("creator", "monthly", 1) == 300
    assert _credits_for_plan("creator", "yearly", 1) == 3600
    assert _credits_for_plan("labs_spark", "monthly", 1) == 390
    assert _credits_for_plan("labs_velocity", "monthly", 1) == 990
    assert _credits_for_plan("labs_velocity", "yearly", 1) == 11880


def test_plan_claims_monthly_only_cards_match_backend_rules():
    assert "starter" in MONTHLY_ONLY_PLANS
    assert "labs_spark" in MONTHLY_ONLY_PLANS
    assert "creator" not in MONTHLY_ONLY_PLANS
    assert "labs_velocity" not in MONTHLY_ONLY_PLANS


def test_plan_claims_starter_posting_limits_are_enforced():
    assert _allowed_posting_providers_for_plan("starter") == {"facebook", "instagram"}


def test_plan_claims_labs_plans_have_creator_level_posting_access():
    full = {"youtube", "tiktok", "instagram", "facebook"}
    assert _allowed_posting_providers_for_plan("creator") == full
    assert _allowed_posting_providers_for_plan("labs_spark") == full
    assert _allowed_posting_providers_for_plan("labs_velocity") == full

