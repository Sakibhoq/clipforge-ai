#!/usr/bin/env python
"""
Orbito doctor: quick environment + dependency sanity checks.
Run:
  python backend/scripts/doctor.py
"""
from __future__ import annotations

import os
import sys
import json
import shutil
import socket
from pathlib import Path

from sqlalchemy import text

# Allow direct execution from repo root:
# python backend/scripts/doctor.py
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.config import settings
from core.database import SessionLocal
from storage.s3_client import uses_object_storage_backend


def _print(title: str, ok: bool, detail: str = "") -> None:
    status = "OK" if ok else "FAIL"
    print(f"[{status}] {title}{' — ' + detail if detail else ''}")


def _check_env(name: str, *, required: bool = True, redact: bool = True) -> bool:
    val = os.getenv(name)
    ok = bool(val)
    if ok:
        shown = "set" if redact else val
        _print(name, True, shown)
    else:
        _print(name, not required, "missing")
    return ok or not required


def _check_file(path: str, *, required: bool = False) -> bool:
    p = Path(path)
    ok = p.exists()
    _print(f"file:{path}", ok or not required, "present" if ok else "missing")
    return ok or not required


def _check_cmd(cmd: str) -> bool:
    ok = shutil.which(cmd) is not None
    _print(f"cmd:{cmd}", ok, "found" if ok else "missing")
    return ok


def _check_db() -> bool:
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        _print("database", True, "connection ok")
        return True
    except Exception as e:
        _print("database", False, str(e))
        return False


def _check_ports() -> None:
    # Optional: check if we can bind to common ports (diagnostic only)
    for port in (8000, 3000):
        try:
            s = socket.socket()
        except Exception as e:
            _print("port-check", True, f"skipped ({type(e).__name__})")
            return
        try:
            s.bind(("0.0.0.0", port))
            _print(f"port:{port}", True, "available")
        except Exception:
            _print(f"port:{port}", True, "in use (ok)")
        finally:
            try:
                s.close()
            except Exception:
                pass


def main() -> int:
    print("Orbito doctor — quick checks\n")

    ok = True

    # Core env
    ok &= _check_env("SECRET_KEY", required=True, redact=True)
    app_env = (os.getenv("APP_ENV") or "development").strip().lower()
    ok &= _check_env("FRONTEND_ORIGIN", required=False, redact=False)
    ok &= _check_env("FRONTEND_BASE_URL", required=False, redact=False)
    ok &= _check_env("APP_ENV", required=False, redact=False)
    _check_env("PUBLIC_API_BASE", required=False, redact=False)
    _check_env("COOKIE_DOMAIN", required=False, redact=False)
    if app_env == "production" and not (os.getenv("COOKIE_DOMAIN") or "").strip():
        _print("COOKIE_DOMAIN(prod)", False, "missing (recommended: .orbito.cc)")

    # Stripe
    ok &= _check_env("STRIPE_SECRET_KEY", required=False, redact=True)
    ok &= _check_env("STRIPE_WEBHOOK_SECRET", required=False, redact=True)
    _check_env("STRIPE_PRICE_STARTER_MONTHLY", required=False, redact=True)
    _check_env("STRIPE_PRICE_CREATOR_MONTHLY", required=False, redact=True)
    _check_env("STRIPE_PRICE_CREATOR_YEARLY", required=False, redact=True)
    _check_env("STRIPE_PRICE_STUDIO_MONTHLY", required=False, redact=True)

    # Storage
    backend = (os.getenv("STORAGE_BACKEND") or "local").lower()
    _print("STORAGE_BACKEND", True, backend)
    if uses_object_storage_backend(backend):
        ok &= _check_env("S3_BUCKET", required=True, redact=False)
        _check_env("AWS_REGION", required=False, redact=False)
        _check_env("S3_ENDPOINT_URL", required=False, redact=False)
        _check_env("S3_ADDRESSING_STYLE", required=False, redact=False)
        # Credentials can come from env or mounted ~/.aws
        has_creds = bool(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"))
        has_file = Path("/root/.aws/credentials").exists()
        _print("Object storage credentials", has_creds or has_file, "env or /root/.aws/credentials")
    else:
        _check_env("LOCAL_STORAGE_PATH", required=False, redact=False)

    # Automations (recommended in prod)
    if app_env == "production" and not (os.getenv("AUTOMATION_WEBHOOK_SECRET") or "").strip():
        _print("AUTOMATION_WEBHOOK_SECRET(prod)", False, "missing (recommended)")

    # Worker assets
    _check_file("/app/assets/orbito-mark.png", required=False)

    # Dependencies
    _check_cmd("ffmpeg")
    _check_cmd("ffprobe")

    # Database
    ok &= _check_db()

    # Ports (best-effort)
    _check_ports()

    print("\nDone.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
