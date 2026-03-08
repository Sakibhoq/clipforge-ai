from routers.auth import _has_labs_plan_access


def test_has_labs_plan_access_allows_only_labs_starter_creator_aliases():
    assert _has_labs_plan_access("labs_starter") is True
    assert _has_labs_plan_access("labs_spark") is True
    assert _has_labs_plan_access("labs_creator") is True
    assert _has_labs_plan_access("labs_velocity") is True

    assert _has_labs_plan_access("starter") is False
    assert _has_labs_plan_access("creator") is False
    assert _has_labs_plan_access("velocity_plus") is False
    assert _has_labs_plan_access("labs_enterprise") is False
