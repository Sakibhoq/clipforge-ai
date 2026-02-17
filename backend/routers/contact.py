from __future__ import annotations

import os
import smtplib
import time
from collections import defaultdict, deque
from email.message import EmailMessage
from threading import Lock

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from services.mailer import send_contact_autoreply

router = APIRouter(prefix="/contact", tags=["contact"])

# Simple in-memory throttle per IP to reduce bot spam.
_RATE_WINDOW_SECONDS = 60
_RATE_MAX_PER_WINDOW = 5
_rate_hits: dict[str, deque[float]] = defaultdict(deque)
_rate_lock = Lock()


class ContactSendRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    subject: str = Field(min_length=3, max_length=180)
    message: str = Field(min_length=10, max_length=5000)
    # Optional honeypot field (bots may fill it).
    website: str | None = None


class ContactSendResponse(BaseModel):
    status: str


def _env_bool(key: str, default: bool) -> bool:
    raw = (os.getenv(key) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _client_ip(request: Request) -> str:
    # Prefer first forwarded IP when behind proxy/ALB.
    xff = (request.headers.get("x-forwarded-for") or "").strip()
    if xff:
        return xff.split(",")[0].strip()
    return (request.client.host if request.client else "unknown").strip() or "unknown"


def _allow_request(ip: str) -> bool:
    now = time.time()
    with _rate_lock:
        dq = _rate_hits[ip]
        while dq and (now - dq[0]) > _RATE_WINDOW_SECONDS:
            dq.popleft()
        if len(dq) >= _RATE_MAX_PER_WINDOW:
            return False
        dq.append(now)
        return True


@router.post("/send", response_model=ContactSendResponse)
def send_contact_message(payload: ContactSendRequest, request: Request):
    ip = _client_ip(request)
    if not _allow_request(ip):
        raise HTTPException(status_code=429, detail="Too many requests. Try again in a minute.")

    # Honeypot: silently accept to avoid giving bots feedback.
    if (payload.website or "").strip():
        return ContactSendResponse(status="ok")

    smtp_host = (os.getenv("SMTP_HOST") or "").strip()
    smtp_port = int((os.getenv("SMTP_PORT") or "587").strip())
    smtp_username = (os.getenv("SMTP_USERNAME") or "").strip()
    smtp_password = (os.getenv("SMTP_PASSWORD") or "").strip()
    smtp_use_tls = _env_bool("SMTP_USE_TLS", True)
    smtp_use_ssl = _env_bool("SMTP_USE_SSL", False)

    support_to = (os.getenv("CONTACT_TO_EMAIL") or "support@orbito.cc").strip()
    from_email = (
        (os.getenv("CONTACT_FROM_EMAIL") or "").strip()
        or smtp_username
        or support_to
    )

    if not smtp_host:
        raise HTTPException(status_code=500, detail="Contact email is not configured (SMTP_HOST missing).")
    if smtp_use_ssl and smtp_use_tls:
        raise HTTPException(status_code=500, detail="Invalid SMTP config: set only one of SMTP_USE_SSL or SMTP_USE_TLS.")

    clean_name = payload.name.strip()
    clean_email = str(payload.email).strip()
    clean_subject = payload.subject.strip()
    clean_message = payload.message.strip()

    msg = EmailMessage()
    msg["Subject"] = f"[Orbito Contact] {clean_subject[:120]}"
    msg["From"] = from_email
    msg["To"] = support_to
    msg["Reply-To"] = clean_email
    msg.set_content(
        "\n".join(
            [
                "New message from orbito.cc contact form",
                "",
                f"Name: {clean_name}",
                f"Email: {clean_email}",
                f"IP: {ip}",
                f"User-Agent: {(request.headers.get('user-agent') or '').strip()}",
                "",
                "Message:",
                clean_message,
            ]
        )
    )

    try:
        if smtp_use_ssl:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=20) as server:
                if smtp_username and smtp_password:
                    server.login(smtp_username, smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
                server.ehlo()
                if smtp_use_tls:
                    server.starttls()
                    server.ehlo()
                if smtp_username and smtp_password:
                    server.login(smtp_username, smtp_password)
                server.send_message(msg)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not send message right now.")

    # Optional auto-reply confirmation for the user.
    try:
        send_contact_autoreply(
            to_email=clean_email,
            name=clean_name,
            subject=clean_subject,
        )
    except Exception as exc:
        print(f"[contact] auto-reply skipped: {type(exc).__name__}")

    return ContactSendResponse(status="sent")
