from __future__ import annotations

import html
import os
import smtplib
from email.message import EmailMessage
from urllib.parse import urlsplit


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
    return (os.getenv("CONTACT_TO_EMAIL") or "support@clipforge.ai").strip()


def _frontend_base_url() -> str:
    for raw in (
        os.getenv("FRONTEND_BASE_URL"),
        os.getenv("FRONTEND_ORIGIN"),
    ):
        val = (raw or "").strip().strip("'").strip('"')
        if not val:
            continue
        val = val.split(",")[0].strip()
        if "://" not in val and "/" not in val and "." in val:
            val = f"https://{val}"
        parsed = urlsplit(val)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            path = (parsed.path or "").rstrip("/")
            return f"{parsed.scheme}://{parsed.netloc}{path}"
    return "https://clipforge.ai"


def _email_logo_url() -> str:
    explicit = (os.getenv("EMAIL_LOGO_URL") or "").strip()
    if explicit:
        return explicit
    return f"{_frontend_base_url()}/clipforge-labs-mark.svg"


def _default_no_reply_email() -> str:
    explicit = (os.getenv("EMAIL_FROM_EMAIL") or "").strip()
    if explicit:
        return explicit

    return "no-reply@clipforge.ai"


def _from_header() -> str:
    name = (os.getenv("EMAIL_FROM_NAME") or "Clipforge Labs").strip()
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
    html_body: str | None = None,
    from_header: str | None = None,
    reply_to: str | None = None,
) -> bool:
    cfg = _smtp_config()
    if not cfg["host"]:
        return False
    if cfg["use_ssl"] and cfg["use_tls"]:
        return False

    msg = EmailMessage()
    msg["Subject"] = (subject or "").strip()[:200] or "Clipforge Labs notification"
    msg["From"] = (from_header or _from_header()).strip()
    msg["To"] = (to_email or "").strip()
    if reply_to:
        msg["Reply-To"] = reply_to.strip()
    msg.set_content((text_body or "").strip())
    if html_body and html_body.strip():
        msg.add_alternative(html_body.strip(), subtype="html")

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
        print(f"[mailer] send failed: {type(exc).__name__}: {exc}")
        return False


def send_welcome_email(to_email: str, name: str | None = None) -> bool:
    if not _automations_enabled() or not _env_bool("EMAIL_SEND_WELCOME", True):
        return False

    first = (name or "").strip().split(" ")[0] or "there"
    support = _support_email()
    app_url = _frontend_base_url()
    logo_url = _email_logo_url()
    body = "\n".join(
        [
            f"Hi {first},",
            "",
            "Welcome to Clipforge Labs.",
            "Your account is ready. You can now generate videos and publish to connected platforms.",
            "",
            f"Open Clipforge Labs: {app_url}",
            "",
            "This is an automated message from an unmonitored inbox. Please do not reply to this email.",
            f"For help, contact {support}.",
        ]
    )
    esc_first = html.escape(first)
    esc_support = html.escape(support)
    esc_app_url = html.escape(app_url, quote=True)
    esc_logo_url = html.escape(logo_url, quote=True)
    esc_support_mailto = html.escape(support, quote=True)
    html_body = f"""
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#0b0f19;border:1px solid #2b3348;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;text-align:center;">
                <img src="{esc_logo_url}" alt="Clipforge Labs" width="56" height="56" style="display:block;margin:0 auto 12px auto;" />
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;font-weight:700;color:#ffffff;">Welcome to Clipforge Labs</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;color:#d8e2f1;font-size:14px;line-height:1.6;">
                Hi {esc_first},<br /><br />
                Your account is ready. You can now generate AI video, image, and voiceover assets.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 24px 16px 24px;">
                <a href="{esc_app_url}" style="display:inline-block;padding:11px 18px;background:#f97316;border-radius:10px;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:600;font-size:14px;">Open Clipforge Labs</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 22px 24px;font-family:Arial,Helvetica,sans-serif;color:#9fb0c7;font-size:12px;line-height:1.6;">
                This is an automated message from an unmonitored inbox. Please do not reply to this email.<br />
                For help, contact <a href="mailto:{esc_support_mailto}" style="color:#9ecbff;text-decoration:none;">{esc_support}</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()
    return send_email(
        to_email=to_email,
        subject="Welcome to Clipforge Labs",
        text_body=body,
        html_body=html_body,
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
    app_url = _frontend_base_url()
    logo_url = _email_logo_url()
    interval_label = "monthly" if interval in {"month", "monthly"} else "yearly"
    balance_line = (
        f"Current credits balance: {int(credits_balance)}"
        if isinstance(credits_balance, int)
        else "Credits balance updated on your account."
    )

    body = "\n".join(
        [
            "Your Clipforge Labs billing update is complete.",
            "",
            f"Plan: {plan.capitalize()} ({interval_label})",
            f"Credits added: {int(credits_granted)}",
            balance_line,
            "",
            "This is an automated message from an unmonitored inbox. Please do not reply to this email.",
            f"For billing help, contact {support}.",
        ]
    )
    esc_support = html.escape(support)
    esc_plan = html.escape(plan.capitalize())
    esc_interval = html.escape(interval_label)
    esc_credits_granted = html.escape(str(int(credits_granted)))
    esc_balance = html.escape(balance_line)
    esc_app_url = html.escape(app_url, quote=True)
    esc_logo_url = html.escape(logo_url, quote=True)
    esc_support_mailto = html.escape(support, quote=True)
    html_body = f"""
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#0b0f19;border:1px solid #2b3348;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;text-align:center;">
                <img src="{esc_logo_url}" alt="Clipforge Labs" width="56" height="56" style="display:block;margin:0 auto 12px auto;" />
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;font-weight:700;color:#ffffff;">Billing confirmation</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;color:#d8e2f1;font-size:14px;line-height:1.7;">
                Your Clipforge Labs billing update is complete.<br /><br />
                <span style="color:#9fb0c7;">Plan:</span> {esc_plan} ({esc_interval})<br />
                <span style="color:#9fb0c7;">Credits added:</span> {esc_credits_granted}<br />
                <span style="color:#9fb0c7;">Balance:</span> {esc_balance}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 24px 16px 24px;">
                <a href="{esc_app_url}" style="display:inline-block;padding:11px 18px;background:#f97316;border-radius:10px;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:600;font-size:14px;">Open Clipforge Labs</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 22px 24px;font-family:Arial,Helvetica,sans-serif;color:#9fb0c7;font-size:12px;line-height:1.6;">
                This is an automated message from an unmonitored inbox. Please do not reply to this email.<br />
                For billing help, contact <a href="mailto:{esc_support_mailto}" style="color:#9ecbff;text-decoration:none;">{esc_support}</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()
    return send_email(
        to_email=to_email,
        subject="Clipforge Labs billing confirmation",
        text_body=body,
        html_body=html_body,
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
    app_url = _frontend_base_url()
    logo_url = _email_logo_url()
    contact_url = f"{app_url}/contact"
    body = "\n".join(
        [
            f"Hi {first},",
            "",
            "Thanks for contacting Clipforge Labs.",
            "We received your message and our team will review it shortly.",
            f"Subject: {subject.strip() if subject else 'General inquiry'}",
            "",
            "This is an automated message from an unmonitored inbox. Please do not reply to this email.",
            f"If needed, send a new message to {support}.",
        ]
    )
    esc_first = html.escape(first)
    esc_subject = html.escape((subject or "").strip() or "General inquiry")
    esc_support = html.escape(support)
    esc_contact_url = html.escape(contact_url, quote=True)
    esc_logo_url = html.escape(logo_url, quote=True)
    esc_support_mailto = html.escape(support, quote=True)
    html_body = f"""
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#0b0f19;border:1px solid #2b3348;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;text-align:center;">
                <img src="{esc_logo_url}" alt="Clipforge Labs" width="56" height="56" style="display:block;margin:0 auto 12px auto;" />
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;font-weight:700;color:#ffffff;">We received your message</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;color:#d8e2f1;font-size:14px;line-height:1.6;">
                Hi {esc_first},<br /><br />
                Thanks for contacting Clipforge Labs. Our team has received your message and will review it shortly.<br /><br />
                <span style="color:#9fb0c7;">Subject:</span> {esc_subject}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 24px 16px 24px;">
                <a href="{esc_contact_url}" style="display:inline-block;padding:11px 18px;background:#f97316;border-radius:10px;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:600;font-size:14px;">Open Contact Page</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 22px 24px;font-family:Arial,Helvetica,sans-serif;color:#9fb0c7;font-size:12px;line-height:1.6;">
                This is an automated message from an unmonitored inbox. Please do not reply to this email.<br />
                For support, contact <a href="mailto:{esc_support_mailto}" style="color:#9ecbff;text-decoration:none;">{esc_support}</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()
    return send_email(
        to_email=to_email,
        subject="Clipforge Labs — We received your message",
        text_body=body,
        html_body=html_body,
        reply_to=_reply_to_email(),
    )
