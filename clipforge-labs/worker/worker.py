from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import tempfile
import time
import uuid

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

JOB_KIND_VIDEO = "generate"
JOB_KIND_IMAGE = "generate_image"
JOB_KIND_VOICEOVER = "generate_voiceover"


def _env(name: str, default: str = "") -> str:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v else default


def _env_int(name: str, default: int, *, min_value: int = 0, max_value: int = 3_600) -> int:
    raw = _env(name, "")
    if not raw:
        return default
    try:
        return max(min_value, min(max_value, int(raw)))
    except Exception:
        return default


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


def _upload_file(path: str, key: str, *, content_type: str) -> None:
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
    if ar == "16:9":
        return 1920, 1080
    if ar == "1:1":
        return 1080, 1080
    return 1080, 1920  # default 9:16


def _run_ffmpeg_text_video(*, prompt: str, duration: int, aspect_ratio: str, out_path: str) -> None:
    w, h = _clip_dimensions(aspect_ratio)
    safe_duration = max(2, min(int(duration or 6), 20))

    fd, txt_path = tempfile.mkstemp(prefix="cflabs-video-prompt-", suffix=".txt")
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
            f"drawtext=fontfile={fontfile}:textfile={txt_path}:reload=1:"
            "fontcolor=white:fontsize=48:line_spacing=10:"
            "x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=22,"
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
            raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg video failed").strip()[:500])
    finally:
        try:
            os.unlink(txt_path)
        except Exception:
            pass


def _run_ffmpeg_text_image(*, prompt: str, aspect_ratio: str, out_path: str) -> None:
    w, h = _clip_dimensions(aspect_ratio)
    fd, txt_path = tempfile.mkstemp(prefix="cflabs-image-prompt-", suffix=".txt")
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
            "format=rgb24,"
            f"drawtext=fontfile={fontfile}:textfile={txt_path}:reload=1:"
            "fontcolor=white:fontsize=44:line_spacing=8:"
            "x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.4:boxborderw=20,"
            f"drawtext=fontfile={fontfile}:text='{brand}':"
            "fontcolor=white@0.78:fontsize=26:x=(w-text_w)/2:y=h-84"
        )

        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=#0f172a:s={w}x{h}:d=1",
            "-frames:v",
            "1",
            "-vf",
            vf,
            out_path,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg image failed").strip()[:500])
    finally:
        try:
            os.unlink(txt_path)
        except Exception:
            pass


def _probe_audio_duration(path: str) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return 0.0
    raw = (proc.stdout or "").strip()
    try:
        return max(0.0, float(raw))
    except Exception:
        return 0.0


def _run_fallback_tone_voiceover(*, script: str, out_path: str) -> None:
    # Fallback when espeak is unavailable: duration scales with text length.
    duration = max(2, min(90, int(math.ceil(max(1, len(script or "")) / 13.0))))
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=220:duration={duration}",
        "-filter:a",
        "volume=0.18",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "160k",
        out_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "ffmpeg tone voiceover failed").strip()[:500])


def _run_voiceover(*, script: str, voice_name: str, speed_wpm: int, out_path: str) -> None:
    safe_script = (script or "").strip()[:6000]
    if not safe_script:
        safe_script = "Untitled voiceover."

    espeak_bin = shutil.which("espeak-ng") or shutil.which("espeak")
    if not espeak_bin:
        _run_fallback_tone_voiceover(script=safe_script, out_path=out_path)
        return

    fd, wav_path = tempfile.mkstemp(prefix="cflabs-voice-", suffix=".wav")
    os.close(fd)
    try:
        voice = (voice_name or "en-us").strip()[:64] or "en-us"
        speed = max(80, min(260, int(speed_wpm or 165)))
        tts = [
            espeak_bin,
            "-v",
            voice,
            "-s",
            str(speed),
            "-w",
            wav_path,
            safe_script,
        ]
        tts_proc = subprocess.run(tts, capture_output=True, text=True)
        if tts_proc.returncode != 0:
            _run_fallback_tone_voiceover(script=safe_script, out_path=out_path)
            return

        enc = [
            "ffmpeg",
            "-y",
            "-i",
            wav_path,
            "-c:a",
            "libmp3lame",
            "-b:a",
            "160k",
            out_path,
        ]
        enc_proc = subprocess.run(enc, capture_output=True, text=True)
        if enc_proc.returncode != 0:
            raise RuntimeError((enc_proc.stderr or enc_proc.stdout or "ffmpeg mp3 encode failed").strip()[:500])
    finally:
        try:
            os.unlink(wav_path)
        except Exception:
            pass


def _next_generate_job(db) -> dict | None:
    row = db.execute(
        text(
            """
            SELECT
              id,
              upload_id,
              COALESCE(kind, 'generate') AS kind,
              COALESCE(prompt, '') AS prompt,
              COALESCE(negative_prompt, '') AS negative_prompt,
              COALESCE(model, '') AS model,
              COALESCE(duration_seconds, 6) AS duration_seconds,
              COALESCE(aspect_ratio, '9:16') AS aspect_ratio,
              COALESCE(caption_style_json, '{}') AS settings_json
            FROM jobs
            WHERE kind IN ('generate', 'generate_image', 'generate_voiceover')
              AND status = 'queued'
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
    safe_duration = max(0.0, float(duration_seconds or 0.0))
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
            "end_time": safe_duration,
            "duration": safe_duration,
            "title": (title or None),
            "hook": None,
        },
    )


def _title_from_prompt(prompt: str) -> str | None:
    s = (prompt or "").strip()
    if not s:
        return None
    if len(s) > 64:
        s = s[:61].rstrip() + "..."
    return s


def _parse_settings(raw: str) -> dict:
    text_value = (raw or "").strip()
    if not text_value:
        return {}
    try:
        data = json.loads(text_value)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _video_mode_prep_delay_seconds(speed: str) -> int:
    # Relax mode intentionally runs on a slower lane to keep cost-efficiency.
    if (speed or "").strip().lower() == "fast":
        return _env_int("WORKER_FAST_PREP_DELAY_SECONDS", 0, min_value=0, max_value=120)
    return _env_int("WORKER_RELAX_PREP_DELAY_SECONDS", 4, min_value=0, max_value=120)


def _process_job(job: dict) -> tuple[str, str, float, str | None]:
    """
    Returns:
      storage_key, content_type, duration_seconds, title
    """
    job_id = int(job["id"])
    kind = str(job.get("kind") or JOB_KIND_VIDEO).strip().lower()
    prompt = str(job.get("prompt") or "").strip()
    aspect_ratio = str(job.get("aspect_ratio") or "9:16").strip()
    duration = int(job.get("duration_seconds") or 6)
    settings = _parse_settings(str(job.get("settings_json") or "{}"))

    if kind == JOB_KIND_IMAGE:
        fd, out_path = tempfile.mkstemp(prefix=f"cflabs-image-{job_id}-", suffix=".png")
        os.close(fd)
        try:
            _run_ffmpeg_text_image(prompt=prompt or "Generated image", aspect_ratio=aspect_ratio, out_path=out_path)
            key = f"assets/images/{job_id}-{uuid.uuid4().hex}.png"
            _upload_file(out_path, key, content_type="image/png")
            return key, "image/png", 0.0, _title_from_prompt(prompt) or f"Image {job_id}"
        finally:
            try:
                os.unlink(out_path)
            except Exception:
                pass

    if kind == JOB_KIND_VOICEOVER:
        fd, out_path = tempfile.mkstemp(prefix=f"cflabs-voice-{job_id}-", suffix=".mp3")
        os.close(fd)
        try:
            voice_name = str(settings.get("voice_name") or "en-us")
            speed = int(settings.get("speed_wpm") or 165)
            _run_voiceover(script=prompt or "Untitled voiceover", voice_name=voice_name, speed_wpm=speed, out_path=out_path)
            dur = _probe_audio_duration(out_path)
            key = f"assets/voiceovers/{job_id}-{uuid.uuid4().hex}.mp3"
            _upload_file(out_path, key, content_type="audio/mpeg")
            final_duration = dur if dur > 0 else max(2.0, min(90.0, len(prompt) / 12.0))
            return key, "audio/mpeg", final_duration, _title_from_prompt(prompt) or f"Voiceover {job_id}"
        finally:
            try:
                os.unlink(out_path)
            except Exception:
                pass

    # Default video generation
    fd, out_path = tempfile.mkstemp(prefix=f"cflabs-video-{job_id}-", suffix=".mp4")
    os.close(fd)
    try:
        generation_speed = str(settings.get("generation_speed") or "relax").strip().lower()
        prep_delay = _video_mode_prep_delay_seconds(generation_speed)
        if prep_delay > 0:
            time.sleep(prep_delay)

        _run_ffmpeg_text_video(
            prompt=prompt or "Untitled",
            duration=duration,
            aspect_ratio=aspect_ratio,
            out_path=out_path,
        )
        key = f"clips/generated/{job_id}-{uuid.uuid4().hex}.mp4"
        _upload_file(out_path, key, content_type="video/mp4")
        return key, "video/mp4", float(max(2, duration)), _title_from_prompt(prompt)
    finally:
        try:
            os.unlink(out_path)
        except Exception:
            pass


def main() -> None:
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
            kind = str(job.get("kind") or JOB_KIND_VIDEO)

            try:
                _mark_job_status(db, job_id, "running", None)
                db.commit()

                key, content_type, duration_seconds, title = _process_job(job)

                _insert_clip(
                    db,
                    upload_id=upload_id,
                    job_id=job_id,
                    storage_key=key,
                    duration_seconds=duration_seconds,
                    title=title,
                )
                _mark_job_status(db, job_id, "done", None)
                db.commit()
                print(f"[worker] generated asset kind={kind} job_id={job_id} key={key} content_type={content_type}")
            except Exception as exc:
                refunded = 0
                try:
                    refunded = _refund_reserved_credits(db, job_id)
                    _mark_job_status(db, job_id, "failed", str(exc)[:500])
                    db.commit()
                except Exception:
                    db.rollback()
                if refunded:
                    print(f"[worker] refunded {refunded} credits for failed job_id={job_id}")
                print(f"[worker] job failed kind={kind} job_id={job_id} err={type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
