from __future__ import annotations

import html
import os
import smtplib
from email.message import EmailMessage
from urllib.parse import urlsplit, urlunsplit


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
    return "https://app.orbito.cc"


def _rewrite_api_host_to_app(url: str) -> str:
    parsed = urlsplit((url or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return (url or "").strip()
    host = (parsed.hostname or "").strip().lower()
    if not host.startswith("api."):
        return (url or "").strip()
    app_host = f"app.{host[4:]}"
    if parsed.port:
        app_netloc = f"{app_host}:{parsed.port}"
    else:
        app_netloc = app_host
    return urlunsplit((parsed.scheme, app_netloc, parsed.path, parsed.query, parsed.fragment))


def _prefer_raster_logo(url: str) -> str:
    parsed = urlsplit((url or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return (url or "").strip()
    path = parsed.path or ""
    if path.lower().endswith(".svg"):
        path = f"{path[:-4]}.png"
    return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, parsed.fragment))


def _email_logo_url() -> str:
    explicit = (os.getenv("EMAIL_LOGO_URL") or "").strip()
    if explicit:
        return _prefer_raster_logo(_rewrite_api_host_to_app(explicit))
    return _prefer_raster_logo(f"{_rewrite_api_host_to_app(_frontend_base_url())}/orbito-mark.png")


def _default_no_reply_email() -> str:
    explicit = (os.getenv("EMAIL_FROM_EMAIL") or "").strip()
    if explicit:
        return explicit

    return "no-reply@orbito.cc"


def _from_header() -> str:
    name = (os.getenv("EMAIL_FROM_NAME") or "Orbito Team").strip()
    sender = _default_no_reply_email()
    if name and sender:
        return f"{name} <{sender}>"
    return sender


def _reply_to_email() -> str:
    return (os.getenv("EMAIL_REPLY_TO") or _support_email()).strip()


def _automations_enabled() -> bool:
    return _env_bool("EMAIL_AUTOMATIONS_ENABLED", True)


def _render_branded_email_html(
    *,
    title: str,
    content_html: str,
    footer_html: str,
    cta_label: str | None = None,
    cta_url: str | None = None,
) -> str:
    esc_title = html.escape((title or "").strip() or "Orbito")
    esc_logo_url = html.escape(_email_logo_url(), quote=True)
    esc_cta_label = html.escape((cta_label or "").strip())
    esc_cta_url = html.escape((cta_url or "").strip(), quote=True)
    cta_block = ""
    if esc_cta_label and esc_cta_url:
        cta_block = f"""
            <tr>
              <td align="center" style="padding:20px 24px 16px 24px;">
                <a href="{esc_cta_url}" style="display:inline-block;padding:11px 18px;background:#3b82f6;border-radius:10px;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:600;font-size:14px;">{esc_cta_label}</a>
              </td>
            </tr>
""".rstrip()

    return f"""
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#0b0f19;border:1px solid #1f2a44;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;text-align:center;">
                <img src="{esc_logo_url}" alt="Orbito" width="56" height="56" style="display:block;margin:0 auto 12px auto;" />
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;font-weight:700;color:#ffffff;">{esc_title}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;color:#d8e2f1;font-size:14px;line-height:1.6;">
                {content_html}
              </td>
            </tr>
            {cta_block}
            <tr>
              <td style="padding:0 24px 22px 24px;font-family:Arial,Helvetica,sans-serif;color:#9fb0c7;font-size:12px;line-height:1.6;">
                {footer_html}
                <div style="margin-top:10px;color:#7f8ea5;">Orbito is operated by Sakib LLC.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()


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
    msg["Subject"] = (subject or "").strip()[:200] or "Orbito notification"
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

    body = "\n".join(
        [
            f"Hi {first},",
            "",
            "Welcome to Orbito.",
            "Your account is ready.",
            "",
            "You can now:",
            "- Upload videos",
            "- Generate clips",
            "- Publish to connected platforms",
            "",
            f"Open Orbito: {app_url}",
            "",
            "This is an automated message from an unmonitored inbox.",
            f"For help, contact {support}.",
        ]
    )

    esc_first = html.escape(first)
    esc_support = html.escape(support)
    esc_support_mailto = html.escape(support, quote=True)
    html_body = _render_branded_email_html(
        title="Welcome to Orbito",
        content_html=(
            f"Hi {esc_first},<br /><br />"
            "Your account is ready. You can now upload videos, generate clips, and publish to connected platforms."
        ),
        cta_label="Open Orbito",
        cta_url=app_url,
        footer_html=(
            "This is an automated message from an unmonitored inbox.<br />"
            f'For help, contact <a href="mailto:{esc_support_mailto}" style="color:#9ecbff;text-decoration:none;">{esc_support}</a>.'
        ),
    )

    return send_email(
        to_email=to_email,
        subject="Welcome to Orbito",
        text_body=body,
        html_body=html_body,
        reply_to=_reply_to_email(),
    )


def send_password_reset_email(*, to_email: str, token: str, name: str | None = None) -> bool:
    if not _automations_enabled() or not _env_bool("EMAIL_SEND_PASSWORD_RESET", True):
        return False
    if not token:
        return False

    first = (name or "").strip().split(" ")[0] or "there"
    support = _support_email()
    base = _frontend_base_url()
    reset_url = f"{base}/reset-password?token={token}"

    body = "\n".join(
        [
            f"Hi {first},",
            "",
            "We received a request to reset your Orbito password.",
            f"Reset your password: {reset_url}",
            "",
            f"This link expires in {int((os.getenv('PASSWORD_RESET_TOKEN_TTL_MINUTES') or '60').strip() or '60')} minutes.",
            "",
            "If you did not request this, you can ignore this email.",
            f"For help, contact {support}.",
        ]
    )

    esc_first = html.escape(first)
    esc_support = html.escape(support)
    esc_support_mailto = html.escape(support, quote=True)
    html_body = _render_branded_email_html(
        title="Reset your password",
        content_html=(
            f"Hi {esc_first},<br /><br />"
            "We received a request to reset your Orbito password."
        ),
        cta_label="Reset password",
        cta_url=reset_url,
        footer_html=(
            "If you did not request this, you can ignore this email.<br />"
            f'For help, contact <a href="mailto:{esc_support_mailto}" style="color:#9ecbff;text-decoration:none;">{esc_support}</a>.'
        ),
    )

    return send_email(
        to_email=to_email,
        subject="Reset your Orbito password",
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
    interval_label = "monthly" if interval in {"month", "monthly"} else "yearly"
    balance_line = (
        f"Current credits balance: {int(credits_balance)}"
        if isinstance(credits_balance, int)
        else "Credits balance updated on your account."
    )

    body = "\n".join(
        [
            "Hi there,",
            "",
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
    esc_plan = html.escape(plan.capitalize())
    esc_interval = html.escape(interval_label)
    esc_support = html.escape(support)
    esc_support_mailto = html.escape(support, quote=True)
    esc_balance = html.escape(balance_line)
    billing_url = f"{app_url.rstrip('/')}/app/billing"
    html_body = _render_branded_email_html(
        title="Orbito billing confirmation",
        content_html=(
            "Hi there,<br /><br />"
            "Your Orbito billing update is complete."
            '<div style="margin-top:14px;border:1px solid #24314e;border-radius:10px;background:#11192a;padding:12px 14px;">'
            f'<div><span style="color:#9fb0c7;">Plan:</span> {esc_plan} ({esc_interval})</div>'
            f'<div style="margin-top:6px;"><span style="color:#9fb0c7;">Credits added:</span> {int(credits_granted)}</div>'
            f'<div style="margin-top:6px;"><span style="color:#9fb0c7;">{esc_balance}</span></div>'
            "</div>"
        ),
        cta_label="Open Billing",
        cta_url=billing_url,
        footer_html=(
            "This is an automated message from an unmonitored inbox. Please do not reply to this email.<br />"
            f'For billing help, contact <a href="mailto:{esc_support_mailto}" style="color:#9ecbff;text-decoration:none;">{esc_support}</a>.'
        ),
    )
    return send_email(
        to_email=to_email,
        subject="Orbito billing confirmation",
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
    contact_url = f"{app_url.rstrip('/')}/contact"
    body = "\n".join(
        [
            f"Hi {first},",
            "",
            "Thank you for contacting Orbito.",
            "We received your message and our team will review it shortly.",
            f"Subject: {subject.strip() if subject else 'General inquiry'}",
            "",
            "This is an automated message from an unmonitored inbox. Please do not reply to this email.",
            f"If you need additional help, contact {support}.",
        ]
    )
    esc_first = html.escape(first)
    esc_subject = html.escape((subject or "").strip() or "General inquiry")
    esc_support = html.escape(support)
    esc_support_mailto = html.escape(support, quote=True)
    html_body = _render_branded_email_html(
        title="We received your message",
        content_html=(
            f"Hi {esc_first},<br /><br />"
            "Thanks for contacting Orbito. Our team has received your message and will review it shortly.<br /><br />"
            f'<span style="color:#9fb0c7;">Subject:</span> {esc_subject}'
        ),
        cta_label="Open Contact Page",
        cta_url=contact_url,
        footer_html=(
            "This is an automated message from an unmonitored inbox. Please do not reply to this email.<br />"
            f'For support, contact <a href="mailto:{esc_support_mailto}" style="color:#9ecbff;text-decoration:none;">{esc_support}</a>.'
        ),
    )
    return send_email(
        to_email=to_email,
        subject="Orbito — We received your message",
        text_body=body,
        html_body=html_body,
        reply_to=_reply_to_email(),
    )
