import os

from routers.billing import _price_id_from_env


def test_labs_spark_falls_back_to_legacy_labs_starter(monkeypatch):
    monkeypatch.delenv("STRIPE_PRICE_LABS_SPARK_MONTHLY", raising=False)
    monkeypatch.setenv("STRIPE_PRICE_LABS_STARTER_MONTHLY", "price_legacy_starter")
    assert _price_id_from_env("labs_spark", "monthly") == "price_legacy_starter"


def test_labs_velocity_falls_back_to_legacy_labs_creator(monkeypatch):
    monkeypatch.delenv("STRIPE_PRICE_LABS_VELOCITY_MONTHLY", raising=False)
    monkeypatch.setenv("STRIPE_PRICE_LABS_CREATOR_MONTHLY", "price_legacy_creator")
    assert _price_id_from_env("labs_velocity", "month") == "price_legacy_creator"


def test_labs_velocity_supports_yearly_key(monkeypatch):
    monkeypatch.setenv("STRIPE_PRICE_LABS_VELOCITY_YEARLY", "price_labs_velocity_yearly")
    assert _price_id_from_env("labs_velocity", "yearly") == "price_labs_velocity_yearly"
