from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage


def _env_bool(key: str, default: bool) -> bool:
    raw = (os.getenv(key) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _smtp_config() -> dict:
    return {
        "host": (os.getenv("SMTP_HOST") or "").strip(),
        "port": int((os.getenv("SMTP_PORT") or "587").strip()),
        "username": (os.getenv("SMTP_USERNAME") or "").strip(),
        "password": (os.getenv("SMTP_PASSWORD") or "").strip(),
        "use_tls": _env_bool("SMTP_USE_TLS", True),
        "use_ssl": _env_bool("SMTP_USE_SSL", False),
    }


def _support_email() -> str:
    return (os.getenv("CONTACT_TO_EMAIL") or "support@orbito.cc").strip()


def _default_no_reply_email() -> str:
    explicit = (os.getenv("EMAIL_FROM_EMAIL") or "").strip()
    if explicit:
        return explicit

    support = _support_email()
    if "@" in support:
        return f"no-reply@{support.split('@', 1)[1]}"
    return "no-reply@orbito.cc"


def _from_header() -> str:
    name = (os.getenv("EMAIL_FROM_NAME") or "Orbito").strip()
    sender = _default_no_reply_email()
    if name and sender:
        return f"{name} <{sender}>"
    return sender


def _reply_to_email() -> str:
    return (os.getenv("EMAIL_REPLY_TO") or _support_email()).strip()


def _automations_enabled() -> bool:
    return _env_bool("EMAIL_AUTOMATIONS_ENABLED", True)


def send_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    from_header: str | None = None,
    reply_to: str | None = None,
) -> bool:
    cfg = _smtp_config()
    if not cfg["host"]:
        return False
    if cfg["use_ssl"] and cfg["use_tls"]:
        return False

    msg = EmailMessage()
    msg["Subject"] = (subject or "").strip()[:200] or "Orbito notification"
    msg["From"] = (from_header or _from_header()).strip()
    msg["To"] = (to_email or "").strip()
    if reply_to:
        msg["Reply-To"] = reply_to.strip()
    msg.set_content((text_body or "").strip())

    try:
        if cfg["use_ssl"]:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=20) as server:
                if cfg["username"] and cfg["password"]:
                    server.login(cfg["username"], cfg["password"])
                server.send_message(msg)
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=20) as server:
                server.ehlo()
                if cfg["use_tls"]:
                    server.starttls()
                    server.ehlo()
                if cfg["username"] and cfg["password"]:
                    server.login(cfg["username"], cfg["password"])
                server.send_message(msg)
        return True
    except Exception as exc:
        print(f"[mailer] send failed: {type(exc).__name__}")
        return False


def send_welcome_email(to_email: str, name: str | None = None) -> bool:
    if not _automations_enabled() or not _env_bool("EMAIL_SEND_WELCOME", True):
        return False

    first = (name or "").strip().split(" ")[0] or "there"
    support = _support_email()
    body = "\n".join(
        [
            f"Hi {first},",
            "",
            "Welcome to Orbito.",
            "Your account is ready. You can now upload videos, generate clips, and publish to connected platforms.",
            "",
            "This is an automated message from an unmonitored inbox. Please do not reply to this email.",
            f"For help, contact {support}.",
        ]
    )
    return send_email(
        to_email=to_email,
        subject="Welcome to Orbito",
        text_body=body,
        reply_to=_reply_to_email(),
    )


def send_billing_confirmation_email(
    *,
    to_email: str,
    plan: str,
    interval: str,
    credits_granted: int,
    credits_balance: int | None = None,
) -> bool:
    if not _automations_enabled() or not _env_bool("EMAIL_SEND_BILLING_CONFIRMATION", True):
        return False

    support = _support_email()
    interval_label = "monthly" if interval in {"month", "monthly"} else "yearly"
    balance_line = (
        f"Current credits balance: {int(credits_balance)}"
        if isinstance(credits_balance, int)
        else "Credits balance updated on your account."
    )

    body = "\n".join(
        [
            "Your Orbito billing update is complete.",
            "",
            f"Plan: {plan.capitalize()} ({interval_label})",
            f"Credits added: {int(credits_granted)}",
            balance_line,
            "",
            "This is an automated message from an unmonitored inbox. Please do not reply to this email.",
            f"For billing help, contact {support}.",
        ]
    )
    return send_email(
        to_email=to_email,
        subject="Orbito billing confirmation",
        text_body=body,
        reply_to=_reply_to_email(),
    )


def send_contact_autoreply(
    *,
    to_email: str,
    name: str,
    subject: str,
) -> bool:
    if not _automations_enabled() or not _env_bool("EMAIL_SEND_CONTACT_AUTOREPLY", True):
        return False

    first = (name or "").strip().split(" ")[0] or "there"
    support = _support_email()
    body = "\n".join(
        [
            f"Hi {first},",
            "",
            "We received your message and our team will review it shortly.",
            f"Subject: {subject}",
            "",
            "This is an automated message from an unmonitored inbox. Please do not reply to this email.",
            f"If needed, send a new message to {support}.",
        ]
    )
    return send_email(
        to_email=to_email,
        subject="We received your message",
        text_body=body,
        reply_to=_reply_to_email(),
    )
