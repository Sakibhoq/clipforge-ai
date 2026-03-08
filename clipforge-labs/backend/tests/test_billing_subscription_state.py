from types import SimpleNamespace

from routers.billing import _subscription_status_payload


def test_subscription_status_payload_no_active_subscriptions():
    status, cancel_at_period_end, subscription_id = _subscription_status_payload([])
    assert status == "no_active_subscription"
    assert cancel_at_period_end is False
    assert subscription_id is None


def test_subscription_status_payload_active_when_any_subscription_not_canceling():
    rows = [
        SimpleNamespace(id="sub_a", cancel_at_period_end=True),
        SimpleNamespace(id="sub_b", cancel_at_period_end=False),
    ]
    status, cancel_at_period_end, subscription_id = _subscription_status_payload(rows)
    assert status == "active"
    assert cancel_at_period_end is False
    assert subscription_id == "sub_a"


def test_subscription_status_payload_cancel_state_when_all_canceling():
    rows = [
        SimpleNamespace(id="sub_a", cancel_at_period_end=True),
        SimpleNamespace(id="sub_b", cancel_at_period_end=True),
    ]
    status, cancel_at_period_end, subscription_id = _subscription_status_payload(rows)
    assert status == "cancel_at_period_end"
    assert cancel_at_period_end is True
    assert subscription_id == "sub_a"
