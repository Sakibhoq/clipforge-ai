from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import time
import uuid

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


def _env(name: str, default: str = "") -> str:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v else default


def _db_url() -> str:
    v = _env("DATABASE_URL", "")
    if v:
        return v
    # Match backend default path when running with the compose /data volume.
    return "sqlite:////data/app.db"


def _connect_engine():
    url = _db_url()
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


def _storage_backend() -> str:
    return _env("STORAGE_BACKEND", "local").lower()


def _local_storage_path() -> str:
    # Used when STORAGE_BACKEND=local. In docker compose we mount ./data -> /data.
    return os.path.abspath(_env("LOCAL_STORAGE_PATH", "/data/storage"))


def _upload_file(path: str, key: str, *, content_type: str = "video/mp4") -> None:
    backend = _storage_backend()
    if backend == "s3":
        import boto3

        bucket = _env("S3_BUCKET", "")
        if not bucket:
            raise RuntimeError("S3_BUCKET is required when STORAGE_BACKEND=s3")
        region = _env("AWS_REGION", "us-east-1")
        s3 = boto3.client("s3", region_name=region)
        s3.upload_file(path, bucket, key, ExtraArgs={"ContentType": content_type})
        return

    base = _local_storage_path()
    dest = os.path.join(base, key)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copyfile(path, dest)


def _clip_dimensions(aspect_ratio: str) -> tuple[int, int]:
    ar = (aspect_ratio or "").strip()
    # Reasonable defaults for social video.
    if ar == "16:9":
        return 1920, 1080
    if ar == "1:1":
        return 1080, 1080
    # default 9:16
    return 1080, 1920


def _run_ffmpeg_text_video(*, prompt: str, duration: int, aspect_ratio: str, out_path: str) -> None:
    w, h = _clip_dimensions(aspect_ratio)
    safe_duration = max(2, min(int(duration or 6), 20))

    # Avoid shell escaping by using a textfile.
    fd, txt_path = tempfile.mkstemp(prefix="cflabs-prompt-", suffix=".txt")
    os.close(fd)
    try:
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write((prompt or "").strip()[:1200])

        fontfile = _env(
            "WORKER_DRAWTEXT_FONTFILE",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        )
        brand = _env("WORKER_BRAND_TEXT", "Clipforge Labs")

        vf = (
            f"scale={w}:{h},"
            "format=yuv420p,"
            # Prompt text
            f"drawtext=fontfile={fontfile}:textfile={txt_path}:reload=1:"
            "fontcolor=white:fontsize=48:line_spacing=10:"
            "x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=22,"
            # Brand footer
            f"drawtext=fontfile={fontfile}:text='{brand}':"
            "fontcolor=white@0.75:fontsize=24:"
            "x=(w-text_w)/2:y=h-72"
        )

        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=black:s={w}x{h}:d={safe_duration}",
            "-vf",
            vf,
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            out_path,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg failed").strip()[:500])
    finally:
        try:
            os.unlink(txt_path)
        except Exception:
            pass


def _next_generate_job(db) -> dict | None:
    row = db.execute(
        text(
            """
            SELECT
              id,
              upload_id,
              COALESCE(prompt, '') AS prompt,
              COALESCE(negative_prompt, '') AS negative_prompt,
              COALESCE(model, '') AS model,
              COALESCE(duration_seconds, 6) AS duration_seconds,
              COALESCE(aspect_ratio, '9:16') AS aspect_ratio
            FROM jobs
            WHERE kind = 'generate' AND status = 'queued'
            ORDER BY id ASC
            LIMIT 1
            """
        )
    ).mappings().first()
    return dict(row) if row else None


def _mark_job_status(db, job_id: int, status: str, error: str | None = None) -> None:
    db.execute(
        text("UPDATE jobs SET status = :s, error = :e WHERE id = :id"),
        {"s": status, "e": error, "id": int(job_id)},
    )

def _refund_reserved_credits(db, job_id: int) -> int:
    """
    Best-effort refund for failed jobs.
    - Uses jobs.credits_reserved as the amount already deducted at job creation.
    - Guards with jobs.credits_refunded for idempotency.
    """
    row = db.execute(
        text(
            """
            SELECT
              COALESCE(j.credits_reserved, 0) AS reserved,
              COALESCE(j.credits_refunded, 0) AS refunded,
              COALESCE(u.user_id, 0) AS user_id
            FROM jobs j
            JOIN uploads u ON u.id = j.upload_id
            WHERE j.id = :id
            LIMIT 1
            """
        ),
        {"id": int(job_id)},
    ).mappings().first()

    if not row:
        return 0

    reserved = int(row.get("reserved") or 0)
    if reserved <= 0:
        return 0
    if bool(row.get("refunded")):
        return 0

    user_id = int(row.get("user_id") or 0)
    if user_id <= 0:
        return 0

    db.execute(
        text("UPDATE users SET credits = COALESCE(credits, 0) + :r WHERE id = :uid"),
        {"r": reserved, "uid": user_id},
    )
    db.execute(
        text("UPDATE jobs SET credits_refunded = 1 WHERE id = :id"),
        {"id": int(job_id)},
    )
    return reserved


def _insert_clip(
    db,
    *,
    upload_id: int,
    job_id: int,
    storage_key: str,
    duration_seconds: float,
    title: str | None,
) -> None:
    db.execute(
        text(
            """
            INSERT INTO clips (upload_id, job_id, storage_key, start_time, end_time, duration, title, hook)
            VALUES (:upload_id, :job_id, :storage_key, :start_time, :end_time, :duration, :title, :hook)
            """
        ),
        {
            "upload_id": int(upload_id),
            "job_id": int(job_id),
            "storage_key": str(storage_key),
            "start_time": 0.0,
            "end_time": float(duration_seconds),
            "duration": float(duration_seconds),
            "title": (title or None),
            "hook": None,
        },
    )


def _title_from_prompt(prompt: str) -> str | None:
    s = (prompt or "").strip()
    if not s:
        return None
    # Keep titles short and clean for UI + filenames.
    if len(s) > 64:
        s = s[:61].rstrip() + "..."
    return s


def main() -> None:
    # Support local runs: load ./worker/.env when present.
    load_dotenv()

    poll = max(2, int(_env("WORKER_POLL_SECONDS", "5")))
    engine = _connect_engine()
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    print("[worker] clipforge-labs generation worker starting")

    while True:
        with Session() as db:
            job = _next_generate_job(db)
            if not job:
                db.commit()
                time.sleep(poll)
                continue

            job_id = int(job["id"])
            upload_id = int(job["upload_id"])
            prompt = str(job.get("prompt") or "").strip()
            aspect_ratio = str(job.get("aspect_ratio") or "9:16").strip()
            duration = int(job.get("duration_seconds") or 6)

            try:
                _mark_job_status(db, job_id, "running", None)
                db.commit()

                fd, out_path = tempfile.mkstemp(prefix=f"cflabs-{job_id}-", suffix=".mp4")
                os.close(fd)
                try:
                    # TODO: replace with Google video generation API when configured.
                    # For now, always generate a placeholder MP4 so the full flow can ship.
                    _run_ffmpeg_text_video(
                        prompt=prompt or "Untitled",
                        duration=duration,
                        aspect_ratio=aspect_ratio,
                        out_path=out_path,
                    )

                    key = f"clips/generated/{job_id}-{uuid.uuid4().hex}.mp4"
                    _upload_file(out_path, key, content_type="video/mp4")

                finally:
                    try:
                        os.unlink(out_path)
                    except Exception:
                        pass

                _insert_clip(
                    db,
                    upload_id=upload_id,
                    job_id=job_id,
                    storage_key=key,
                    duration_seconds=float(max(2, duration)),
                    title=_title_from_prompt(prompt),
                )
                _mark_job_status(db, job_id, "done", None)
                db.commit()
                print(f"[worker] generated clip job_id={job_id} key={key}")
            except Exception as exc:
                try:
                    refunded = _refund_reserved_credits(db, job_id)
                    _mark_job_status(db, job_id, "failed", str(exc)[:500])
                    db.commit()
                except Exception:
                    db.rollback()
                if refunded:
                    print(f"[worker] refunded {refunded} credits for failed job_id={job_id}")
                print(f"[worker] job failed job_id={job_id} err={type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
