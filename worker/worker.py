# =====================================================
# Clipforge Worker — FINAL (Section 1 / 10)
# Bootstrap, Config, Logging, DB, Claiming, Heartbeat, Stale Recovery
# (NO main_loop / NO entrypoint here — see Section 10)
# =====================================================

import os
import sys
import time
import json
import math
import uuid
import re
import traceback
import threading
import faulthandler
import signal
import requests

faulthandler.enable()
try:
    faulthandler.register(signal.SIGUSR1, all_threads=True)
except Exception:
    pass

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

# -----------------------------------------------------
# Environment bootstrap
# -----------------------------------------------------

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(ROOT_DIR, ".env"), override=False)

WORKER_NAME = os.getenv("CLIPFORGE_WORKER_NAME", "worker-1")

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")
AUTOMATION_WEBHOOK_SECRET = os.getenv("AUTOMATION_WEBHOOK_SECRET", "")

POLL_INTERVAL = float(os.getenv("WORKER_POLL_INTERVAL", "2.0"))
HEARTBEAT_INTERVAL = float(os.getenv("WORKER_HEARTBEAT_INTERVAL", "10.0"))
STALE_JOB_SECONDS = int(os.getenv("WORKER_STALE_JOB_SECONDS", "1800"))  # 30 min

# -----------------------------------------------------
# Database
# -----------------------------------------------------

from core.database import SessionLocal

# -----------------------------------------------------
# Logging (stdout only, container-safe)
# -----------------------------------------------------

def log(msg: str, *, job_id: Optional[int] = None, level: str = "INFO"):
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    prefix = f"[{ts}][{WORKER_NAME}][{level}]"
    if job_id is not None:
        prefix += f"[job:{job_id}]"
    print(prefix, msg, flush=True)


def trigger_automations(job_id: int, user_id: int):
    """
    Notify backend to run automation rules (best-effort, non-fatal).
    """
    if not BACKEND_URL:
        return
    try:
        url = f"{BACKEND_URL.rstrip('/')}/automations/trigger"
        headers = {}
        if AUTOMATION_WEBHOOK_SECRET:
            headers["X-Orbito-Automation-Secret"] = AUTOMATION_WEBHOOK_SECRET
        requests.post(
            url,
            json={"event": "job.completed", "job_id": int(job_id), "user_id": int(user_id)},
            headers=headers,
            timeout=8,
        )
    except Exception as e:
        try:
            log(f"Automation trigger failed: {e}", job_id=job_id, level="WARN")
        except Exception:
            pass

# -----------------------------------------------------
# Job status helpers
# -----------------------------------------------------

def update_job_status(
    db,
    job_id: int,
    status: str,
    error: Optional[str] = None,
):
    try:
        db.execute(
            text(
                """
                UPDATE jobs
                SET status = :status,
                    error = :error,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :job_id
                """
            ),
            {"job_id": int(job_id), "status": str(status), "error": error},
        )
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

def heartbeat(db, *, job_id: int):
    try:
        db.execute(
            text(
                """
                UPDATE jobs
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = :job_id
                """
            ),
            {"job_id": int(job_id)},
        )
        db.commit()
    except SQLAlchemyError:
        db.rollback()

# -----------------------------------------------------
# Atomic job claiming
# -----------------------------------------------------

def claim_next_job(db) -> Optional[int]:
    """
    Atomically claims the next queued job.
    Works on Postgres and modern SQLite. Falls back for older SQLite.
    """
    # Preferred path (Postgres / modern SQLite with RETURNING)
    try:
        row = db.execute(
            text(
                """
                UPDATE jobs
                SET status = 'running',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = (
                    SELECT id FROM jobs
                    WHERE status = 'queued'
                    ORDER BY id ASC
                    LIMIT 1
                )
                AND status = 'queued'
                RETURNING id
                """
            )
        ).fetchone()
        db.commit()
        if row:
            return int(row[0])
        return None
    except SQLAlchemyError:
        db.rollback()

    # Fallback path (older SQLite: select then conditional update)
    try:
        row = db.execute(
            text(
                """
                SELECT id FROM jobs
                WHERE status = 'queued'
                ORDER BY id ASC
                LIMIT 1
                """
            )
        ).fetchone()

        if not row:
            db.commit()
            return None

        job_id = int(row[0])

        res = db.execute(
            text(
                """
                UPDATE jobs
                SET status = 'running',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :job_id
                  AND status = 'queued'
                """
            ),
            {"job_id": int(job_id)},
        )

        db.commit()
        if getattr(res, "rowcount", 0) == 1:
            return job_id
        return None
    except SQLAlchemyError:
        db.rollback()
        return None

# -----------------------------------------------------
# Stale job recovery
# -----------------------------------------------------

def reclaim_stale_jobs(db):
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=STALE_JOB_SECONDS)
    try:
        db.execute(
            text(
                """
                UPDATE jobs
                SET status = 'queued',
                    error = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE status = 'running'
                  AND updated_at < :cutoff
                """
            ),
            {"cutoff": cutoff},
        )
        db.commit()
    except SQLAlchemyError:
        db.rollback()

# =====================================================
# END SECTION 1 / 10
# =====================================================

# =====================================================
# Clipforge Worker — FINAL (Section 2 / 10)
# Storage, Download, Video Preflight (CANCEL-SAFE)
# =====================================================

import os
import uuid
import time
import signal
import sqlite3
import subprocess
from pathlib import Path
from typing import Tuple, Optional

from storage import get_storage

# -----------------------------------------------------
# Temp directory
# -----------------------------------------------------

TMP_ROOT = Path(os.getenv("WORKER_TMP_DIR", "/tmp/clipforge"))
TMP_ROOT.mkdir(parents=True, exist_ok=True)

MAX_SOURCE_BYTES = int(os.getenv("WORKER_MAX_SOURCE_BYTES", str(5 * 1024**3)))  # 5GB

# -----------------------------------------------------
# Cancel checks (sqlite fallback)
# -----------------------------------------------------

WORKER_DB_PATH = os.getenv("WORKER_DB_PATH", "/data/app.db")
CANCEL_POLL_S = float(os.getenv("WORKER_CANCEL_POLL_S", "0.35"))

def is_job_canceled(job_id: int) -> bool:
    if not job_id:
        return False
    try:
        if not WORKER_DB_PATH or not os.path.exists(WORKER_DB_PATH):
            return False
        conn = sqlite3.connect(WORKER_DB_PATH, timeout=0.25)
        try:
            cur = conn.cursor()
            cur.execute("SELECT status FROM jobs WHERE id = ?", (int(job_id),))
            row = cur.fetchone()
            return bool(row and str(row[0]).lower() == "canceled")
        finally:
            conn.close()
    except Exception:
        return False

# -----------------------------------------------------
# Filesystem helpers (SELF-CONTAINED)
# -----------------------------------------------------

def ensure_parent_dir(path: Path) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise RuntimeError(f"Failed to create parent dir for {path}: {e}")

def make_tmp_file(suffix: str) -> Path:
    p = TMP_ROOT / f"{uuid.uuid4().hex}{suffix}"
    ensure_parent_dir(p)
    return p

def safe_unlink(path: Path):
    try:
        if path and path.exists():
            path.unlink()
    except Exception:
        pass

# -----------------------------------------------------
# Subprocess runner (CANCEL-SAFE)
# -----------------------------------------------------

def _kill_process_tree(proc: subprocess.Popen) -> None:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except Exception:
        try:
            proc.terminate()
        except Exception:
            pass

    try:
        proc.wait(timeout=1.5)
        return
    except Exception:
        pass

    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass

def run_subprocess(
    cmd: list,
    *,
    timeout: int,
    desc: str,
    allow_stderr: bool = False,
    job_id: Optional[int] = None,
) -> Tuple[str, str]:
    start = time.time()

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
    except Exception as e:
        raise RuntimeError(f"{desc} failed to start: {e}")

    while True:
        if job_id and is_job_canceled(job_id):
            _kill_process_tree(proc)
            raise RuntimeError("Canceled by user")

        rc = proc.poll()
        if rc is not None:
            out = (proc.stdout.read() or b"").decode(errors="ignore")
            err = (proc.stderr.read() or b"").decode(errors="ignore")
            if rc != 0 and not allow_stderr:
                raise RuntimeError(f"{desc} failed:\n{err or out}")
            return out, err

        if timeout and (time.time() - start) > timeout:
            _kill_process_tree(proc)
            raise RuntimeError(f"{desc} timed out")

        time.sleep(CANCEL_POLL_S)

# -----------------------------------------------------
# Source download (CANCEL-SAFE)
# -----------------------------------------------------

def download_source_video(*, storage_key: str, job_id: int) -> Path:
    storage = get_storage()
    tmp_path = make_tmp_file(".mp4")

    total = 0
    try:
        with storage.open(storage_key) as body, open(tmp_path, "wb") as f:
            while True:
                if is_job_canceled(job_id):
                    raise RuntimeError("Canceled by user")

                chunk = body.read(1024 * 1024)
                if not chunk:
                    break

                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise RuntimeError("Source video exceeds size limit")

                f.write(chunk)
    except Exception:
        safe_unlink(tmp_path)
        raise

    if total <= 0:
        safe_unlink(tmp_path)
        raise RuntimeError("Downloaded video is empty (0 bytes)")

    return tmp_path

# -----------------------------------------------------
# FFprobe helpers (CANCEL-SAFE)
# -----------------------------------------------------

def probe_video_basic(path: Path, *, job_id: Optional[int] = None) -> Tuple[int, int, float]:
    out, _ = run_subprocess(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=nw=1:nk=1",
            str(path),
        ],
        timeout=30,
        desc="ffprobe duration",
        job_id=job_id,
    )

    try:
        duration = float(out.strip())
    except Exception:
        raise RuntimeError("Failed to parse video duration")

    out, _ = run_subprocess(
        [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0",
            str(path),
        ],
        timeout=30,
        desc="ffprobe dimensions",
        job_id=job_id,
    )

    try:
        w, h = out.strip().split(",")
        width, height = int(w), int(h)
    except Exception:
        raise RuntimeError("Failed to parse video dimensions")

    if width <= 0 or height <= 0 or duration <= 0.1:
        raise RuntimeError("Invalid or corrupt video file")

    return width, height, duration

def preflight_source_video(*, source_path: Path, job_id: int) -> Tuple[int, int, float]:
    return probe_video_basic(source_path, job_id=job_id)

# =====================================================
# END SECTION 2 / 10
# =====================================================

# =====================================================
# Clipforge Worker — FINAL (Section 3 / 10)
# Audio Pipeline: Extract, Silence, Energy
# =====================================================

import wave
import struct
import math
from typing import List, Dict, Any

# -----------------------------------------------------
# Audio configuration
# -----------------------------------------------------

AUDIO_SAMPLE_RATE = 16000
AUDIO_CHANNELS = 1
AUDIO_FORMAT = "pcm_s16le"

SILENCE_DB = os.getenv("WORKER_SILENCE_DB", "-35dB")
SILENCE_MIN_DUR = os.getenv("WORKER_SILENCE_MIN_DUR", "0.35")

FFMPEG_TIMEOUT = int(os.getenv("WORKER_FFMPEG_TIMEOUT", "120"))

# -----------------------------------------------------
# Audio extraction
# -----------------------------------------------------

def extract_audio_wav(
    *,
    source_video: Path,
    job_id: int,
) -> Path:
    """
    Extracts mono WAV (16kHz) from video.
    """
    wav_path = make_tmp_file(".wav")

    log("Extracting audio track", job_id=job_id)

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-i", str(source_video),
        "-vn",
        "-acodec", AUDIO_FORMAT,
        "-ar", str(AUDIO_SAMPLE_RATE),
        "-ac", str(AUDIO_CHANNELS),
        str(wav_path),
    ]

    run_subprocess(
        cmd,
        timeout=FFMPEG_TIMEOUT,
        desc="ffmpeg audio extract",
        allow_stderr=True,
        job_id=int(job_id),
    )

    if not wav_path.exists() or wav_path.stat().st_size <= 0:
        safe_unlink(wav_path)
        raise RuntimeError("Extracted audio is empty")

    return wav_path

# -----------------------------------------------------
# Silence detection (FIXED: parse stderr)
# -----------------------------------------------------

def detect_silence_intervals(
    *,
    source_video: Path,
    job_id: int,
) -> List[tuple]:
    """
    Uses ffmpeg silencedetect.
    Returns list of (start, end) in seconds.
    """
    log("Detecting silence intervals", job_id=job_id)

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i", str(source_video),
        "-af", f"silencedetect=noise={SILENCE_DB}:d={SILENCE_MIN_DUR}",
        "-f", "null",
        "-",
    ]

    # silencedetect writes to stderr
    _, stderr = run_subprocess(
        cmd,
        timeout=FFMPEG_TIMEOUT,
        desc="ffmpeg silencedetect",
        allow_stderr=True,
    )

    intervals: List[tuple] = []
    start = None

    for line in stderr.splitlines():
        if "silence_start" in line:
            try:
                start = float(line.split("silence_start:")[1].strip())
            except Exception:
                start = None
        elif "silence_end" in line and start is not None:
            try:
                end = float(
                    line.split("silence_end:")[1].split("|")[0].strip()
                )
                if end > start:
                    intervals.append((start, end))
            except Exception:
                pass
            start = None

    return intervals

# -----------------------------------------------------
# Speaker energy scoring (stable)
# -----------------------------------------------------

def compute_audio_energy(
    *,
    wav_path: Path,
    job_id: int,
) -> float:
    """
    Returns normalized speaker energy score [0..1].
    Uses percentile spread to avoid punishing quiet speakers.
    """
    log("Computing audio energy", job_id=job_id)

    try:
        wf = wave.open(str(wav_path), "rb")
    except Exception:
        return 0.0

    if wf.getnchannels() != 1:
        wf.close()
        return 0.0

    frames = wf.readframes(wf.getnframes())
    wf.close()

    if not frames:
        return 0.0

    samples = struct.unpack(
        "<" + "h" * (len(frames) // 2),
        frames,
    )

    window = 800  # ~50ms
    rms_vals = []

    for i in range(0, len(samples), window):
        chunk = samples[i : i + window]
        if not chunk:
            continue
        rms = math.sqrt(sum(s * s for s in chunk) / len(chunk))
        rms_vals.append(rms)

    if len(rms_vals) < 10:
        return 0.0

    rms_vals.sort()

    p10 = rms_vals[int(len(rms_vals) * 0.10)]
    p90 = rms_vals[int(len(rms_vals) * 0.90)]

    spread = p90 - p10
    norm = spread / (p90 + 1e-6)

    # Clamp into [0,1]
    return max(0.0, min(1.0, norm))

# -----------------------------------------------------
# Voice activity timeline (speech-presence detection)
# -----------------------------------------------------

VOICE_WINDOW_MS = int(os.getenv("WORKER_VOICE_WINDOW_MS", "30"))
VOICE_MIN_RUN_S = float(os.getenv("WORKER_VOICE_MIN_RUN_S", "0.30"))
VOICE_MAX_GAP_S = float(os.getenv("WORKER_VOICE_MAX_GAP_S", "0.22"))
VOICE_THRESHOLD_STRENGTH = float(os.getenv("WORKER_VOICE_THRESHOLD_STRENGTH", "0.22"))


def _percentile_sorted(vals: List[float], p: float) -> float:
    if not vals:
        return 0.0
    i = int(max(0, min(len(vals) - 1, round((len(vals) - 1) * p))))
    return float(vals[i])


def detect_voice_activity(
    *,
    wav_path: Path,
    job_id: int,
) -> Dict[str, Any]:
    """
    Detect speech-presence windows from waveform energy.
    Returns:
      - segments: list[(start_s, end_s)]
      - coverage: voiced ratio in [0..1]
      - threshold: energy threshold used
    """
    log("Detecting voice activity", job_id=job_id)

    try:
        wf = wave.open(str(wav_path), "rb")
    except Exception:
        return {"segments": [], "coverage": 0.0, "threshold": 0.0}

    try:
        channels = int(wf.getnchannels() or 0)
        sample_rate = int(wf.getframerate() or AUDIO_SAMPLE_RATE)
        frame_count = int(wf.getnframes() or 0)
        frames = wf.readframes(frame_count)
    finally:
        wf.close()

    if channels != 1 or sample_rate <= 0 or not frames:
        return {"segments": [], "coverage": 0.0, "threshold": 0.0}

    samples = struct.unpack("<" + "h" * (len(frames) // 2), frames)
    if not samples:
        return {"segments": [], "coverage": 0.0, "threshold": 0.0}

    win = max(1, int(sample_rate * (max(10, VOICE_WINDOW_MS) / 1000.0)))
    vals: List[float] = []
    windows: List[tuple] = []

    t = 0.0
    dt = float(win) / float(sample_rate)
    for i in range(0, len(samples), win):
        chunk = samples[i : i + win]
        if not chunk:
            continue
        rms = math.sqrt(sum(s * s for s in chunk) / len(chunk))
        vals.append(rms)
        windows.append((t, t + dt, rms))
        t += dt

    if len(vals) < 8:
        return {"segments": [], "coverage": 0.0, "threshold": 0.0}

    svals = sorted(float(v) for v in vals)
    p10 = _percentile_sorted(svals, 0.10)
    p35 = _percentile_sorted(svals, 0.35)
    p85 = _percentile_sorted(svals, 0.85)

    spread = max(1e-6, (p85 - p35))
    threshold = p35 + (spread * max(0.05, min(0.55, VOICE_THRESHOLD_STRENGTH)))
    floor = p10 * 1.08
    threshold = max(threshold, floor)

    active_windows: List[tuple] = []
    for ws, we, rms in windows:
        if float(rms) >= threshold:
            active_windows.append((float(ws), float(we)))

    if not active_windows:
        return {"segments": [], "coverage": 0.0, "threshold": float(threshold)}

    merged: List[List[float]] = [[active_windows[0][0], active_windows[0][1]]]
    for ws, we in active_windows[1:]:
        ps, pe = merged[-1]
        if float(ws) - float(pe) <= float(VOICE_MAX_GAP_S):
            merged[-1][1] = float(we)
        else:
            merged.append([float(ws), float(we)])

    segments: List[tuple] = []
    for s, e in merged:
        if float(e) - float(s) >= float(VOICE_MIN_RUN_S):
            segments.append((float(s), float(e)))

    total_duration = max(1e-6, len(samples) / float(sample_rate))
    voiced = sum(max(0.0, float(e) - float(s)) for s, e in segments)
    coverage = max(0.0, min(1.0, voiced / total_duration))

    return {
        "segments": segments,
        "coverage": coverage,
        "threshold": float(threshold),
    }

# -----------------------------------------------------
# Combined audio pipeline
# -----------------------------------------------------

def run_audio_pipeline(
    *,
    source_video: Path,
    job_id: int,
) -> Dict:
    """
    Full audio prep:
      - WAV extraction
      - Silence intervals
      - Energy score
    """
    wav_path = None
    try:
        wav_path = extract_audio_wav(
            source_video=source_video,
            job_id=job_id,
        )

        silences = detect_silence_intervals(
            source_video=source_video,
            job_id=job_id,
        )

        energy = compute_audio_energy(
            wav_path=wav_path,
            job_id=job_id,
        )

        voice = detect_voice_activity(
            wav_path=wav_path,
            job_id=job_id,
        )

        return {
            "wav_path": wav_path,
            "silences": silences,
            "energy": energy,
            "voice_segments": voice.get("segments", []),
            "voice_coverage": float(voice.get("coverage", 0.0)),
            "voice_threshold": float(voice.get("threshold", 0.0)),
        }

    except Exception:
        if wav_path:
            safe_unlink(wav_path)
        raise

# =====================================================
# END SECTION 3 / 10
# =====================================================
# =====================================================
# Clipforge Worker — FINAL (Section 4 / 10)
# Transcription + Utterance Building
# =====================================================

import re
from typing import Dict, Any, List

# -----------------------------------------------------
# Whisper configuration
# -----------------------------------------------------

WHISPER_MODEL_NAME = os.getenv("WORKER_WHISPER_MODEL", "base")
WHISPER_FP16 = os.getenv("WORKER_WHISPER_FP16", "0") == "1"

_whisper_model = None

# -----------------------------------------------------
# Whisper loader (singleton)
# -----------------------------------------------------

def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        log(f"Loading Whisper model: {WHISPER_MODEL_NAME}")
        try:
            import whisper  # type: ignore
        except Exception as e:
            raise RuntimeError(
                "Whisper is not installed. Rebuild the worker with INSTALL_AI_DEPS=1 "
                "or install openai-whisper + torch."
            ) from e
        _whisper_model = whisper.load_model(WHISPER_MODEL_NAME)
        log("Whisper model loaded")
    return _whisper_model

# -----------------------------------------------------
# Transcription
# -----------------------------------------------------

def transcribe_audio(
    *,
    wav_path: Path,
    job_id: int,
) -> Dict[str, Any]:
    """
    Runs Whisper transcription with word timestamps.
    """
    log("Transcribing audio", job_id=job_id)

    model = get_whisper_model()

    try:
        result = model.transcribe(
            str(wav_path),
            fp16=WHISPER_FP16,
            word_timestamps=True,
            verbose=False,
        )
    except Exception as e:
        raise RuntimeError(f"Whisper transcription failed: {e}")

    if not result or "segments" not in result:
        raise RuntimeError("Whisper returned empty transcript")

    return result

# -----------------------------------------------------
# Transcript normalization
# -----------------------------------------------------

def normalize_transcript(
    transcript: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Normalizes Whisper output into a stable shape.
    """
    segments = transcript.get("segments") or []
    norm_segments = []

    for seg in segments:
        try:
            start = float(seg.get("start", 0.0))
            end = float(seg.get("end", 0.0))
        except Exception:
            continue

        text = (seg.get("text") or "").strip()

        words = []
        for w in seg.get("words") or []:
            try:
                ws = float(w.get("start"))
                we = float(w.get("end"))
                wd = str(w.get("word") or "").strip()
                if wd:
                    words.append(
                        {
                            "start": ws,
                            "end": we,
                            "word": wd,
                        }
                    )
            except Exception:
                continue

        if words:
            norm_segments.append(
                {
                    "start": start,
                    "end": end,
                    "text": text,
                    "words": words,
                }
            )

    if not norm_segments:
        raise RuntimeError("Transcript contains no usable words")

    transcript["segments"] = norm_segments
    return transcript

# -----------------------------------------------------
# Word helpers
# -----------------------------------------------------

def extract_words(
    transcript: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Flattens word timestamps into a sorted list.
    """
    out: List[Dict[str, Any]] = []

    for seg in transcript.get("segments", []):
        for w in seg.get("words", []):
            if "start" in w and "end" in w and "word" in w:
                out.append(w)

    out.sort(key=lambda x: float(x["start"]))
    return out

def words_in_range(
    words: List[Dict[str, Any]],
    start: float,
    end: float,
) -> List[Dict[str, Any]]:
    return [
        w
        for w in words
        if float(w["end"]) > start and float(w["start"]) < end
    ]

# -----------------------------------------------------
# Text utilities
# -----------------------------------------------------

_PUNCT_RE = re.compile(r"[.!?…]$")

def ends_with_punctuation(word: str) -> bool:
    return bool(_PUNCT_RE.search(word or ""))

def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()

def truncate_text(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"

# -----------------------------------------------------
# Utterance segmentation (BUG-FIXED)
# -----------------------------------------------------

UTTERANCE_MAX_SECONDS = float(
    os.getenv("WORKER_UTTERANCE_MAX_SECONDS", "12.0")
)
UTTERANCE_PAUSE_SECONDS = float(
    os.getenv("WORKER_UTTERANCE_PAUSE_SECONDS", "0.55")
)

def build_utterances(
    words: List[Dict[str, Any]],
) -> List[Dict[str, float]]:
    """
    Groups words into utterances using:
      - pause duration
      - punctuation
      - max utterance length
    """
    if not words:
        return []

    utterances = []
    cur_start = words[0]["start"]
    last_end = words[0]["end"]

    for w in words[1:]:
        ws = w["start"]
        we = w["end"]

        pause = ws - last_end
        duration = last_end - cur_start

        boundary = False
        if pause >= UTTERANCE_PAUSE_SECONDS:
            boundary = True
        elif duration >= UTTERANCE_MAX_SECONDS:
            boundary = True
        elif ends_with_punctuation(w["word"]):  # FIXED
            boundary = True

        if boundary:
            utterances.append(
                {
                    "start": float(cur_start),
                    "end": float(last_end),
                }
            )
            cur_start = ws

        last_end = we

    if last_end > cur_start:
        utterances.append(
            {
                "start": float(cur_start),
                "end": float(last_end),
            }
        )

    return utterances

# =====================================================
# END SECTION 4 / 10
# =====================================================
# =====================================================
# Clipforge Worker — FINAL (Section 5 / 10)
# Clip Segmentation Engine
# =====================================================

from typing import List, Dict

# -----------------------------------------------------
# Segmentation configuration
# -----------------------------------------------------

CLIP_MIN_SECONDS = float(
    os.getenv("WORKER_CLIP_MIN_SECONDS", "20.0")
)
CLIP_TARGET_SECONDS = float(
    os.getenv("WORKER_CLIP_TARGET_SECONDS", "35.0")
)
CLIP_MAX_SECONDS = float(
    os.getenv("WORKER_CLIP_MAX_SECONDS", "60.0")
)
MIN_CLIPS_PER_MINUTE = float(
    os.getenv("WORKER_MIN_CLIPS_PER_MINUTE", "0.8")
)

SILENCE_PADDING = float(
    os.getenv("WORKER_SILENCE_PADDING", "0.15")
)
MAX_GAP_MERGE = float(
    os.getenv("WORKER_MAX_GAP_MERGE", "0.6")
)

# -----------------------------------------------------
# Helpers
# -----------------------------------------------------

def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(v, hi))

def overlaps(a_start, a_end, b_start, b_end) -> bool:
    return not (a_end <= b_start or b_end <= a_start)

# -----------------------------------------------------
# Silence snapping
# -----------------------------------------------------

def snap_to_silence(
    start: float,
    end: float,
    silences: List[tuple],
) -> tuple:
    """
    Adjusts clip boundaries to nearby silence edges.
    """
    for s, e in silences:
        if abs(start - e) <= SILENCE_PADDING:
            start = e
        if abs(end - s) <= SILENCE_PADDING:
            end = s
    return start, end

# -----------------------------------------------------
# Core segmentation
# -----------------------------------------------------

def generate_clip_plans(
    *,
    utterances: List[Dict[str, float]],
    silences: List[tuple],
    video_duration: float,
) -> List[Dict[str, float]]:
    """
    Returns a list of clip plans:
      {start, end, duration}

    HARD GUARANTEES:
      - At least one clip
      - No overlaps
      - Within video duration
    """

    clips: List[Dict[str, float]] = []

    # -------------------------------------------------
    # Absolute fallback (short or silent videos)
    # -------------------------------------------------
    if not utterances or video_duration < CLIP_MIN_SECONDS:
        end = min(video_duration, CLIP_TARGET_SECONDS)
        return [
            {
                "start": 0.0,
                "end": end,
                "duration": end,
            }
        ]

    # -------------------------------------------------
    # Build clips from utterances
    # -------------------------------------------------

    cur_start = utterances[0]["start"]
    cur_end = utterances[0]["end"]

    for utt in utterances[1:]:
        gap = utt["start"] - cur_end
        proposed_dur = utt["end"] - cur_start

        # Merge if gap small and target not exceeded
        if gap <= MAX_GAP_MERGE and proposed_dur <= CLIP_TARGET_SECONDS:
            cur_end = utt["end"]
            continue

        # Finalize current clip
        s, e = snap_to_silence(cur_start, cur_end, silences)
        dur = e - s

        if dur >= CLIP_MIN_SECONDS:
            clips.append(
                {
                    "start": clamp(s, 0.0, video_duration),
                    "end": clamp(e, 0.0, video_duration),
                    "duration": clamp(dur, 0.0, video_duration),
                }
            )

        cur_start = utt["start"]
        cur_end = utt["end"]

    # Last clip
    s, e = snap_to_silence(cur_start, cur_end, silences)
    dur = e - s
    if dur >= CLIP_MIN_SECONDS:
        clips.append(
            {
                "start": clamp(s, 0.0, video_duration),
                "end": clamp(e, 0.0, video_duration),
                "duration": clamp(dur, 0.0, video_duration),
            }
        )

    # -------------------------------------------------
    # Enforce max duration
    # -------------------------------------------------

    normalized: List[Dict[str, float]] = []

    for c in clips:
        if c["duration"] <= CLIP_MAX_SECONDS:
            normalized.append(c)
            continue

        s = c["start"]
        while s < c["end"]:
            e = min(s + CLIP_MAX_SECONDS, c["end"])
            if e - s >= CLIP_MIN_SECONDS:
                normalized.append(
                    {
                        "start": s,
                        "end": e,
                        "duration": e - s,
                    }
                )
            s = e

    # -------------------------------------------------
    # Final fallback
    # -------------------------------------------------

    if not normalized:
        end = min(video_duration, CLIP_TARGET_SECONDS)
        return [
            {
                "start": 0.0,
                "end": end,
                "duration": end,
            }
        ]

    # -------------------------------------------------
    # Remove overlaps defensively
    # -------------------------------------------------

    final: List[Dict[str, float]] = []
    for c in normalized:
        if not final:
            final.append(c)
            continue

        last = final[-1]
        if overlaps(
            last["start"], last["end"],
            c["start"], c["end"],
        ):
            continue
        final.append(c)

    # -------------------------------------------------
    # Ensure minimum clip count for long videos
    # -------------------------------------------------
    try:
        min_clips = max(1, int(math.ceil((video_duration / 60.0) * MIN_CLIPS_PER_MINUTE)))
    except Exception:
        min_clips = 1

    if len(final) < min_clips and video_duration >= CLIP_MIN_SECONDS:
        # Fallback segmentation should not hard-cap at CLIP_MAX_SECONDS,
        # otherwise long videos collapse into identical 60s chunks.
        seg_len = max(CLIP_MIN_SECONDS, video_duration / float(min_clips))
        generated: List[Dict[str, float]] = []
        s = 0.0
        while s < video_duration and len(generated) < min_clips:
            e = min(s + seg_len, video_duration)
            if e - s >= CLIP_MIN_SECONDS:
                generated.append(
                    {
                        "start": s,
                        "end": e,
                        "duration": e - s,
                    }
                )
            s = e
        if generated:
            return generated

    return final

# =====================================================
# END SECTION 5 / 10
# =====================================================
# -----------------------------------------------------
# Scoring + selection + titles (launch-safe defaults)
# -----------------------------------------------------

HOOK_CONF_THRESHOLD = float(os.getenv("WORKER_HOOK_CONF_THRESHOLD", "0.55"))
TOP_K_CLIPS = int(os.getenv("WORKER_TOP_K_CLIPS", "3"))
MAX_TOP_K_CLIPS = int(os.getenv("WORKER_MAX_TOP_K_CLIPS", "8"))
MAX_RENDER_CLIPS_PER_JOB = int(os.getenv("WORKER_MAX_RENDER_CLIPS_PER_JOB", "4"))

def compute_clip_quality_score(
    *,
    clip: Dict[str, Any],
    words: list,
    silences: list,
    audio_energy: float,
    motion_metrics: dict,
    voice_segments: Optional[List[tuple]] = None,
) -> Dict[str, Any]:
    """
    Launch-safe heuristic score in [0..1].
    Considers:
      - duration closeness to target
      - speech density (word count)
      - audio_energy (proxy for speaker presence)
      - motion_score (smoothness)
    """
    s = float(clip.get("start", 0.0))
    e = float(clip.get("end", 0.0))
    dur = max(0.01, e - s)

    # duration score: prefer near CLIP_TARGET_SECONDS, penalize very short/long
    dur_err = abs(dur - float(CLIP_TARGET_SECONDS))
    dur_score = 1.0 / (1.0 + (dur_err / 12.0))

    # speech density: words per second (cap)
    cw = words_in_range(words, s, e)
    wps = min(6.0, (len(cw) / dur))
    speech_score = min(1.0, wps / 3.0)  # ~3 wps feels "dense enough"

    # energy: already [0..1]
    energy_score = max(0.0, min(1.0, float(audio_energy)))

    # motion smoothness: [0..1], higher is better
    motion_score = max(0.0, min(1.0, float(motion_metrics.get("motion_score", 0.60))))

    # hook score: early words feel punchy
    hook_score = compute_hook_score(words, s, e)

    # voice-presence score: prefer regions with actual speech activity
    voiced_seconds = 0.0
    for vs, ve in voice_segments or []:
        vs = float(vs)
        ve = float(ve)
        overlap = max(0.0, min(e, ve) - max(s, vs))
        voiced_seconds += overlap
    voice_ratio = max(0.0, min(1.0, voiced_seconds / dur))
    voice_score = min(1.0, voice_ratio / 0.72)

    # silence penalty: if the clip is mostly inside silence intervals, penalize
    silence_seconds = 0.0
    for ss, se in silences or []:
        ss = float(ss); se = float(se)
        overlap = max(0.0, min(e, se) - max(s, ss))
        silence_seconds += overlap
    silence_ratio = max(0.0, min(1.0, silence_seconds / dur))
    silence_penalty = 1.0 - (silence_ratio * 0.75)

    score = (
        0.24 * dur_score +
        0.28 * speech_score +
        0.18 * energy_score +
        0.12 * motion_score +
        0.08 * hook_score +
        0.10 * voice_score
    ) * silence_penalty

    score = max(0.0, min(1.0, float(score)))
    clip["quality_score"] = score
    clip["voice_ratio"] = voice_ratio
    return clip

def select_top_k_clips(clips: list, *, top_k: Optional[int] = None) -> list:
    """
    Sort by quality_score desc, keep top_k, enforce non-overlap.
    """
    if not clips:
        return []

    max_keep = int(top_k or TOP_K_CLIPS)
    max_keep = max(1, max_keep)

    # sort by score then duration (slight preference for longer if tie)
    ordered = sorted(
        clips,
        key=lambda c: (float(c.get("quality_score", 0.0)), float(c.get("duration", (c["end"] - c["start"])))),
        reverse=True,
    )

    picked = []
    for c in ordered:
        if len(picked) >= max_keep:
            break
        s = float(c["start"]); e = float(c["end"])
        if any(overlaps(s, e, float(p["start"]), float(p["end"])) for p in picked):
            continue
        picked.append(c)

    # absolute fallback: if overlap rules eliminated all, take best one
    if not picked and ordered:
        picked = [ordered[0]]

    # ensure rank order is stable
    return picked

HOOK_KEYWORDS = [
    "wait", "watch", "listen", "here's", "this is", "why", "how", "what",
    "secret", "mistake", "truth", "nobody", "never", "always", "stop",
    "new", "best", "worst", "top", "fast", "easy", "simple", "warning",
]

def compute_hook_score(words: list, clip_start: float, clip_end: float) -> float:
    """
    Heuristic hook score from the first few seconds of a clip.
    """
    if not words:
        return 0.0

    window_end = min(clip_end, clip_start + 6.0)
    head_words = words_in_range(words, clip_start, window_end)
    text = clean_text(" ".join(str(w.get("word", "")) for w in head_words)).lower()
    if not text:
        return 0.0

    score = 0.0
    if "?" in text:
        score += 0.12
    if "!" in text:
        score += 0.08
    if any(k in text for k in HOOK_KEYWORDS):
        score += 0.22
    if re.match(r"^(why|how|what|when|where|who)\b", text):
        score += 0.18
    if re.search(r"\b\d+(\.\d+)?\b", text):
        score += 0.12

    return max(0.0, min(1.0, score))

def generate_hook_heuristic(snippet: str) -> Tuple[str, float]:
    """
    Hook-style string (short, punchy).
    """
    s = clean_text(snippet or "")
    if not s:
        return ("", 0.1)

    s = re.sub(r"^(um|uh|like|you know)\b[:,]?\s*", "", s, flags=re.IGNORECASE)
    s = s.strip()

    # Prefer first sentence or question.
    sentence = re.split(r"(?<=[\.\?\!])\s+", s)[0] if s else s
    sentence = truncate_text(sentence, 64)

    if len(sentence) < 12:
        sentence = truncate_text(s, 64)

    conf = 0.6 if len(sentence) >= 14 else 0.4
    return (sentence, conf)

TITLE_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
    "for", "from", "had", "has", "have", "he", "her", "here", "hers", "him",
    "his", "i", "if", "in", "into", "is", "it", "its", "just", "me", "my",
    "of", "on", "or", "our", "ours", "out", "so", "that", "the", "their",
    "them", "there", "they", "this", "to", "too", "up", "was", "we", "were",
    "what", "when", "where", "which", "who", "why", "with", "you", "your",
}


def _title_tokens(text: str) -> List[str]:
    parts = re.findall(r"[A-Za-z0-9']+", (text or "").lower())
    out: List[str] = []
    for p in parts:
        if len(p) < 3:
            continue
        if p in TITLE_STOPWORDS:
            continue
        out.append(p)
    return out


def _extract_title_keywords(snippet: str, clip_words: Optional[list]) -> List[str]:
    counts: Dict[str, int] = {}
    if clip_words:
        source = [str(w.get("word", "")) for w in clip_words]
        text = " ".join(source)
    else:
        text = snippet or ""

    for t in _title_tokens(text):
        counts[t] = counts.get(t, 0) + 1

    if not counts:
        return []

    ranked = sorted(counts.items(), key=lambda kv: (kv[1], len(kv[0])), reverse=True)
    return [w for w, _n in ranked[:3]]


def _headline_case(s: str) -> str:
    if not s:
        return s
    s = clean_text(s)
    if not s:
        return s
    return s[0].upper() + s[1:]


def generate_title_heuristic(
    snippet: str,
    *,
    clip_words: Optional[list] = None,
    clip_index: Optional[int] = None,
) -> Tuple[str, float]:
    """
    Simple launch-safe title generator from transcript snippet.
    Returns (title, confidence).
    """
    s = clean_text(snippet or "")
    if s:
        s = re.sub(r"^(um|uh|like|you know)\b[:,]?\s*", "", s, flags=re.IGNORECASE).strip()

    kws = _extract_title_keywords(s, clip_words)
    first_sentence = re.split(r"(?<=[\.\?\!])\s+", s)[0] if s else ""
    first_sentence = truncate_text(first_sentence, 68)

    title = ""
    conf = 0.35

    if first_sentence and "?" in first_sentence and len(first_sentence) >= 16:
        title = first_sentence
        conf = 0.80
    elif kws and len(kws) >= 2:
        title = f"{kws[0].capitalize()} and {kws[1]}: key takeaway"
        conf = 0.76
    elif kws:
        title = f"{kws[0].capitalize()} explained in under a minute"
        conf = 0.72
    elif first_sentence:
        title = first_sentence
        conf = 0.62
    else:
        n = int(clip_index or 0) + 1
        title = f"Highlight {n}"
        conf = 0.30

    title = _headline_case(truncate_text(title, 68))
    if not title:
        n = int(clip_index or 0) + 1
        return (f"Highlight {n}", 0.25)
    return (title, conf)

def generate_title_llm(snippet: str) -> Optional[str]:
    """
    Launch-safe stub.
    If you haven't wired an LLM key/service yet, return None (no crash).
    """
    return None

# =====================================================
# Clipforge Worker — FINAL (Section 6 / 10)
# Smart Reframing Engine + Motion Metrics (FIXED + Launch-Safe)
#
# Fixes:
# - When OpenCV is unavailable, camera path now returns SOURCE-PIXEL centers
#   (not normalized 0..1), matching downstream expectations.
# - Always returns meta with src_w/src_h so captions margin lift works.
# - Motion metrics remain launch-safe.
# =====================================================

from typing import Callable, Tuple, Optional, List, Dict, Any

# NOTE:
# We use OpenCV if available. If OpenCV isn't installed,
# we fall back to stable center-bias logic (still launch-safe).

try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
    _HAS_CV2 = True
except Exception:
    cv2 = None
    np = None
    _HAS_CV2 = False

# -----------------------------------------------------
# Reframing configuration
# -----------------------------------------------------

REFRAME_SAMPLE_FPS = float(os.getenv("WORKER_REFRAME_SAMPLE_FPS", "4.0"))
REFRAME_MAX_SAMPLE_FPS = float(os.getenv("WORKER_REFRAME_MAX_SAMPLE_FPS", "8.0"))
REFRAME_ANALYZE_EVERY_FRAME = os.getenv("WORKER_REFRAME_ANALYZE_EVERY_FRAME", "0") == "1"
REFRAME_MAX_KEYFRAMES = int(os.getenv("WORKER_REFRAME_MAX_KEYFRAMES", "220"))
REFRAME_MAX_KEYFRAMES_PER_CLIP = int(os.getenv("WORKER_REFRAME_MAX_KEYFRAMES_PER_CLIP", "120"))

REFRAME_SMOOTHING_FACE = float(os.getenv("WORKER_REFRAME_SMOOTHING_FACE", "0.86"))
REFRAME_SMOOTHING_OBJECT = float(os.getenv("WORKER_REFRAME_SMOOTHING_OBJECT", "0.90"))
REFRAME_SMOOTHING_FALLBACK = float(os.getenv("WORKER_REFRAME_SMOOTHING_FALLBACK", "0.93"))

REFRAME_CENTER_BIAS_Y = float(os.getenv("WORKER_REFRAME_CENTER_BIAS_Y", "0.62"))
OBJECT_CENTER_BIAS_Y = float(os.getenv("WORKER_OBJECT_CENTER_BIAS_Y", "0.44"))

# Clamp crop motion per sample (prevents violent jumps if detector glitches)
REFRAME_MAX_STEP_PX = float(os.getenv("WORKER_REFRAME_MAX_STEP_PX", "120.0"))

# If no faces/people detected, keep crops biased slightly above center (good for talking heads)
FALLBACK_CENTER_BIAS_Y = float(os.getenv("WORKER_FALLBACK_CENTER_BIAS_Y", "0.58"))
PERSON_DETECT_EVERY_N = int(os.getenv("WORKER_PERSON_DETECT_EVERY_N", "5"))

# -----------------------------------------------------
# Aspect ratio normalization
# -----------------------------------------------------

def normalize_aspect(aspect: str) -> Tuple[int, int]:
    """
    Returns (target_w, target_h).
    Chosen defaults match typical export resolutions.
    """
    a = (aspect or "").strip()

    if a == "1:1":
        return 1080, 1080
    if a == "4:5":
        return 1080, 1350
    if a == "16:9":
        return 1920, 1080
    if a == "4:3":
        return 1440, 1080

    # Default vertical (9:16)
    return 1080, 1920

# -----------------------------------------------------
# Face detection (OpenCV Haar cascade)
# -----------------------------------------------------

_face_cascade = None

def _get_face_cascade():
    global _face_cascade
    if not _HAS_CV2:
        return None
    if _face_cascade is None:
        try:
            path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            _face_cascade = cv2.CascadeClassifier(path)
        except Exception:
            _face_cascade = None
    return _face_cascade

def _detect_faces(frame_bgr) -> list:
    """
    Returns list of (x, y, w, h).
    Empty if no faces or CV unavailable.
    """
    if not _HAS_CV2:
        return []
    cascade = _get_face_cascade()
    if cascade is None:
        return []
    try:
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        faces = cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(80, 80),
        )
        return list(faces) if faces is not None else []
    except Exception:
        return []


_person_hog = None


def _get_person_hog():
    global _person_hog
    if not _HAS_CV2:
        return None
    if _person_hog is None:
        try:
            hog = cv2.HOGDescriptor()
            hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
            _person_hog = hog
        except Exception:
            _person_hog = None
    return _person_hog


def _detect_people(frame_bgr) -> list:
    """
    Returns list of (x, y, w, h) person boxes (OpenCV HOG).
    Launch-safe: returns [] if unavailable.
    """
    if not _HAS_CV2:
        return []
    hog = _get_person_hog()
    if hog is None:
        return []

    try:
        rects, _weights = hog.detectMultiScale(
            frame_bgr,
            winStride=(8, 8),
            padding=(8, 8),
            scale=1.05,
        )
        if rects is None:
            return []
        return list(rects)
    except Exception:
        return []

# -----------------------------------------------------
# Crop window helpers
# -----------------------------------------------------

def compute_crop_window(
    *,
    src_w: float,
    src_h: float,
    target_w: float,
    target_h: float,
) -> Tuple[float, float]:
    """
    Compute crop width/height (in source pixels) that matches the target aspect
    while staying within source bounds.

    Returns (crop_w, crop_h).
    """
    if src_w <= 0 or src_h <= 0:
        return (src_w, src_h)

    target_aspect = float(target_w) / float(target_h)
    src_aspect = float(src_w) / float(src_h)

    if src_aspect > target_aspect:
        # Source is wider => crop width
        crop_h = src_h
        crop_w = crop_h * target_aspect
    else:
        # Source is taller => crop height
        crop_w = src_w
        crop_h = crop_w / target_aspect

    crop_w = max(1.0, min(float(src_w), float(crop_w)))
    crop_h = max(1.0, min(float(src_h), float(crop_h)))
    return crop_w, crop_h

def clamp_center_to_bounds(
    *,
    cx: float,
    cy: float,
    crop_w: float,
    crop_h: float,
    src_w: float,
    src_h: float,
) -> Tuple[float, float]:
    """
    Clamp center so crop rect stays within source.
    """
    half_w = crop_w / 2.0
    half_h = crop_h / 2.0

    cx = max(half_w, min(src_w - half_w, cx))
    cy = max(half_h, min(src_h - half_h, cy))
    return cx, cy

def limit_step(
    *,
    prev: float,
    cur: float,
    max_step: float,
) -> float:
    """
    Clamp changes to reduce detection spikes.
    """
    if max_step <= 0:
        return cur
    delta = cur - prev
    if delta > max_step:
        return prev + max_step
    if delta < -max_step:
        return prev - max_step
    return cur


def compress_camera_samples(samples: list, max_points: int) -> list:
    """
    Reduce dense per-frame camera paths to an ffmpeg-safe number of keyframes.
    Keeps temporal ordering and always retains the last sample.
    """
    if not samples:
        return []
    if max_points <= 0 or len(samples) <= max_points:
        return samples

    stride = max(1, int(math.ceil(len(samples) / float(max_points))))
    reduced = [samples[i] for i in range(0, len(samples), stride)]
    if reduced[-1][0] != samples[-1][0]:
        reduced.append(samples[-1])
    return reduced

# -----------------------------------------------------
# Camera path builder
# -----------------------------------------------------

def build_camera_path(
    *,
    source_video: Path,
    job_id: int,
    target_w: int,
    target_h: int,
    analyze_start: Optional[float] = None,
    analyze_end: Optional[float] = None,
) -> Tuple[
    Callable[[float], float],
    Callable[[float], float],
    list,
    dict,
]:
    """
    Returns:
      cam_x(t), cam_y(t), samples[(t, cx, cy)], meta

    cam_x/cam_y return SOURCE-PIXEL centers for the crop window.
    """
    # If CV isn't present, return stable center path in SOURCE PIXELS.
    if not _HAS_CV2:
        # Try to read source dims via ffprobe so samples/meta are correct.
        try:
            src_w_i, src_h_i, _dur = probe_video_basic(source_video)
            src_w = float(src_w_i)
            src_h = float(src_h_i)
        except Exception:
            # If ffprobe fails here, fall back to neutral-ish but still safe.
            src_w = 1920.0
            src_h = 1080.0

        crop_w, crop_h = compute_crop_window(
            src_w=src_w,
            src_h=src_h,
            target_w=float(target_w),
            target_h=float(target_h),
        )

        cx = src_w / 2.0
        cy = src_h * float(FALLBACK_CENTER_BIAS_Y)
        cx, cy = clamp_center_to_bounds(
            cx=cx, cy=cy,
            crop_w=crop_w, crop_h=crop_h,
            src_w=src_w, src_h=src_h,
        )

        meta = {
            "src_w": src_w,
            "src_h": src_h,
            "crop_w": crop_w,
            "crop_h": crop_h,
            "mode": "center_no_cv2",
            "duration": None,
            "sample_step": None,
        }

        range_start = max(0.0, float(analyze_start or 0.0))
        if analyze_end is None:
            range_end = range_start + 0.5
        else:
            range_end = max(range_start + 0.01, float(analyze_end))

        # Provide at least a couple samples for downstream margin calculations.
        samples = [(range_start, float(cx), float(cy)), (range_end, float(cx), float(cy))]

        return (
            lambda _t: float(cx),
            lambda _t: float(cy),
            samples,
            meta,
        )

    log("Building camera path (face-first)", job_id=job_id)

    cap = cv2.VideoCapture(str(source_video))
    if not cap.isOpened():
        raise RuntimeError("Failed to open video for reframing")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
    duration = (frame_count / fps) if fps > 0 else 0.0

    src_w = float(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0.0)
    src_h = float(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0.0)

    if src_w <= 0 or src_h <= 0 or duration <= 0:
        cap.release()
        raise RuntimeError("Invalid video metadata for reframing")

    crop_w, crop_h = compute_crop_window(
        src_w=src_w,
        src_h=src_h,
        target_w=float(target_w),
        target_h=float(target_h),
    )

    analysis_start_s = max(0.0, min(float(duration), float(analyze_start or 0.0)))
    if analyze_end is None:
        analysis_end_s = float(duration)
    else:
        analysis_end_s = max(analysis_start_s, min(float(duration), float(analyze_end)))

    # Sampling cadence:
    # - sequential frame reads (fast)
    # - process every Nth frame to meet target sample fps
    if REFRAME_ANALYZE_EVERY_FRAME:
        target_fps = float(fps)
    else:
        target_fps = max(
            1.0,
            min(float(REFRAME_SAMPLE_FPS), float(REFRAME_MAX_SAMPLE_FPS), float(fps)),
        )
    step_frames = max(1, int(round(float(fps) / max(1.0, target_fps))))
    sample_step = float(step_frames) / max(1.0, float(fps))

    # Initialize center
    last_x = src_w / 2.0
    last_y = src_h * float(FALLBACK_CENTER_BIAS_Y)

    samples = []
    sample_idx = 0
    start_frame = max(0, int(math.floor(analysis_start_s * float(fps))))
    end_frame = max(start_frame, int(math.ceil(analysis_end_s * float(fps))))
    frame_idx = start_frame

    face_hits = 0
    person_hits = 0
    fallback_hits = 0
    last_people: List[Any] = []

    dynamic_step_limit = max(18.0, min(float(REFRAME_MAX_STEP_PX), min(crop_w, crop_h) * 0.12))

    try:
        cap.set(cv2.CAP_PROP_POS_FRAMES, float(start_frame))
    except Exception:
        pass

    while True:
        if frame_idx > end_frame:
            break
        try:
            ok, frame = cap.read()
        except Exception:
            ok, frame = False, None

        if not ok or frame is None:
            break

        if frame_idx % step_frames != 0:
            frame_idx += 1
            continue

        t = min(float(duration), float(frame_idx) / max(1.0, float(fps)))
        if t > analysis_end_s + 1e-6:
            break

        faces = _detect_faces(frame)
        people: list = []

        subject_mode = "fallback"
        if faces:
            # Choose largest face
            x, y, w, h = max(faces, key=lambda f: float(f[2]) * float(f[3]))
            cx = float(x) + float(w) / 2.0
            cy = float(y) + float(h) / 2.0
            subject_mode = "face"
            face_hits += 1
        else:
            # Person detector is heavier; run at a lower cadence and reuse last hit.
            if sample_idx % max(1, int(PERSON_DETECT_EVERY_N)) == 0 or not last_people:
                last_people = _detect_people(frame)
            people = list(last_people or [])

            if people:
                x, y, w, h = max(people, key=lambda p: float(p[2]) * float(p[3]))
                cx = float(x) + float(w) / 2.0
                cy = float(y) + float(h) * float(OBJECT_CENTER_BIAS_Y)
                subject_mode = "person"
                person_hits += 1
            else:
                # Bias to upper-middle for speaking content
                cx = src_w / 2.0
                cy = src_h * float(REFRAME_CENTER_BIAS_Y)
                fallback_hits += 1

        # Clamp sudden detector spikes
        cx = limit_step(prev=last_x, cur=cx, max_step=dynamic_step_limit)
        cy = limit_step(prev=last_y, cur=cy, max_step=dynamic_step_limit)

        if subject_mode == "face":
            smoothing = float(REFRAME_SMOOTHING_FACE)
        elif subject_mode == "person":
            smoothing = float(REFRAME_SMOOTHING_OBJECT)
        else:
            smoothing = float(REFRAME_SMOOTHING_FALLBACK)

        # Smooth with mode-specific damping
        cx = smoothing * last_x + (1.0 - smoothing) * cx
        cy = smoothing * last_y + (1.0 - smoothing) * cy

        # Clamp so crop stays inside bounds
        cx, cy = clamp_center_to_bounds(
            cx=cx,
            cy=cy,
            crop_w=crop_w,
            crop_h=crop_h,
            src_w=src_w,
            src_h=src_h,
        )

        samples.append((float(t), float(cx), float(cy)))
        last_x, last_y = cx, cy
        sample_idx += 1
        frame_idx += 1

    cap.release()

    if not samples:
        # Fail-safe: still return stable clamped center
        cx = src_w / 2.0
        cy = src_h * float(FALLBACK_CENTER_BIAS_Y)
        cx, cy = clamp_center_to_bounds(
            cx=cx, cy=cy,
            crop_w=crop_w, crop_h=crop_h,
            src_w=src_w, src_h=src_h,
        )
        fallback_t0 = float(analysis_start_s)
        fallback_t1 = max(float(analysis_end_s), fallback_t0 + max(0.5, sample_step))
        samples = [(fallback_t0, float(cx), float(cy)), (fallback_t1, float(cx), float(cy))]

    raw_sample_count = len(samples)
    samples = compress_camera_samples(samples, max(50, int(REFRAME_MAX_KEYFRAMES)))

    times = np.array([s[0] for s in samples], dtype=float)
    xs = np.array([s[1] for s in samples], dtype=float)
    ys = np.array([s[2] for s in samples], dtype=float)

    def cam_x(tq: float) -> float:
        return float(np.interp(float(tq), times, xs))

    def cam_y(tq: float) -> float:
        return float(np.interp(float(tq), times, ys))

    meta = {
        "src_w": src_w,
        "src_h": src_h,
        "crop_w": crop_w,
        "crop_h": crop_h,
        "mode": "face_person_tracking_cv2",
        "duration": float(duration),
        "analysis_start": float(analysis_start_s),
        "analysis_end": float(analysis_end_s),
        "sample_step": float(sample_step),
        "raw_samples": int(raw_sample_count),
        "keyframes": int(len(samples)),
        "face_hits": int(face_hits if "face_hits" in locals() else 0),
        "person_hits": int(person_hits if "person_hits" in locals() else 0),
        "fallback_hits": int(fallback_hits if "fallback_hits" in locals() else 0),
    }

    return cam_x, cam_y, samples, meta

# -----------------------------------------------------
# Motion metrics
# -----------------------------------------------------

def compute_motion_metrics(samples: list) -> dict:
    """
    Computes:
      - avg_speed (px/sample)
      - jerk (abs diff in speed)
      - motion_score (0..1) where higher = smoother/less chaotic
    """
    if not samples or len(samples) < 3 or not _HAS_CV2:
        return {
            "avg_speed": 0.0,
            "jerk": 0.0,
            "motion_score": 0.60,  # neutral-safe
        }

    speeds = []
    for i in range(1, len(samples)):
        _, x1, y1 = samples[i - 1]
        _, x2, y2 = samples[i]
        speeds.append(((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5)

    avg_speed = float(np.mean(speeds)) if speeds else 0.0
    jerk = float(np.mean(np.abs(np.diff(speeds)))) if len(speeds) > 2 else 0.0

    # Convert to [0..1] where smoother is better.
    # These constants are tuned to not over-penalize normal head movement.
    motion_score = 1.0 / (1.0 + avg_speed * 0.002 + jerk * 0.010)
    motion_score = max(0.0, min(1.0, float(motion_score)))

    return {
        "avg_speed": avg_speed,
        "jerk": jerk,
        "motion_score": motion_score,
    }

def motion_metrics_for_clip(
    *,
    samples: list,
    clip_start: float,
    clip_end: float,
) -> dict:
    """
    Computes motion metrics restricted to a clip time window.
    """
    if not samples:
        return {
            "avg_speed": 0.0,
            "jerk": 0.0,
            "motion_score": 0.60,
        }

    sub = [s for s in samples if float(s[0]) >= clip_start and float(s[0]) <= clip_end]
    if len(sub) < 3:
        # If too few samples, use neutral
        return {
            "avg_speed": 0.0,
            "jerk": 0.0,
            "motion_score": 0.60,
        }

    return compute_motion_metrics(sub)

# =====================================================
# END SECTION 6 / 10
# =====================================================

# =====================================================
# Clipforge Worker — FINAL (Section 7 / 10)
# Captions Engine — ASS + Karaoke + Robust Chunking (FINAL + Launch-Ready)
#
# Guarantees:
# - Valid ASS header + Style field order (BorderStyle=1, correct format)
# - Base readable layer + Karaoke highlight layer (uses \k centiseconds)
# - Safe escaping + stable time formatting
# - Robust block chunking + line wrapping
# - Face-aware margin lift (uses camera samples in SOURCE pixels + src_h)
#
# Requirements:
# - Expects these to exist elsewhere in the file (already in your worker):
#     clean_text(text:str)->str
#     words_in_range(words:list,start:float,end:float)->list
#     make_tmp_file(suffix:str)->Path
#     safe_unlink(path:Path)->None
# =====================================================

from typing import Iterable, Any, Optional, List, Tuple

# -----------------------------------------------------
# Caption defaults (can be overridden via caption_style_json)
# -----------------------------------------------------

CAPTION_FONT = os.getenv("WORKER_CAPTION_FONT", "Montserrat")
CAPTION_FONT_SIZE = int(os.getenv("WORKER_CAPTION_FONT_SIZE", "64"))

# ASS colors are BGR (not RGB) in &HAABBGGRR format.
CAPTION_PRIMARY_COLOR = os.getenv("WORKER_CAPTION_COLOR", "&H00FFFFFF")   # white
CAPTION_OUTLINE_COLOR = os.getenv("WORKER_CAPTION_OUTLINE", "&H00000000") # black

CAPTION_OUTLINE_WIDTH = int(os.getenv("WORKER_CAPTION_OUTLINE_WIDTH", "3"))
CAPTION_SHADOW = int(os.getenv("WORKER_CAPTION_SHADOW", "0"))

# 2 = bottom-center
CAPTION_ALIGNMENT = int(os.getenv("WORKER_CAPTION_ALIGNMENT", "2"))

CAPTION_MARGIN_H = int(os.getenv("WORKER_CAPTION_MARGIN_H", "60"))

# UPDATED: raise captions higher by default (was 120)
# For 1080x1920, 360 is just below mid-screen; still safe across 1:1 / 16:9.
CAPTION_MARGIN_V_BASE = int(os.getenv("WORKER_CAPTION_MARGIN_V", "360"))

# Chunking controls
CAPTION_MAX_WORDS_PER_LINE = int(os.getenv("WORKER_CAPTION_MAX_WORDS_PER_LINE", "7"))
CAPTION_MAX_CHARS_PER_LINE = int(os.getenv("WORKER_CAPTION_MAX_CHARS_PER_LINE", "34"))
CAPTION_MAX_LINES = int(os.getenv("WORKER_CAPTION_MAX_LINES", "2"))
CAPTION_MAX_BLOCK_SECONDS = float(os.getenv("WORKER_CAPTION_MAX_BLOCK_SECONDS", "2.8"))
CAPTION_BREAK_PAUSE_SECONDS = float(os.getenv("WORKER_CAPTION_BREAK_PAUSE_SECONDS", "0.65"))

# Karaoke timing safety
KARAOKE_MIN_CS = int(os.getenv("WORKER_KARAOKE_MIN_CS", "2"))     # 0.02s
KARAOKE_MAX_CS = int(os.getenv("WORKER_KARAOKE_MAX_CS", "250"))   # 2.50s

# -----------------------------------------------------
# Style override parsing
# -----------------------------------------------------

def _safe_json_loads(s: Any) -> dict:
    if not s:
        return {}
    if isinstance(s, dict):
        return s
    try:
        return json.loads(str(s))
    except Exception:
        return {}

def resolve_caption_style(caption_style_json: Any) -> dict:
    """
    caption_style_json may come from DB as:
      - None
      - dict
      - JSON string

    Recognized keys:
      font, font_size,
      primary_color, outline_color,
      outline, shadow,
      margin_h, margin_v,
      alignment,
      bold (0/1), italic (0/1)
    """
    raw = _safe_json_loads(caption_style_json)
    style = {
        "font": CAPTION_FONT,
        "font_size": CAPTION_FONT_SIZE,
        "primary_color": CAPTION_PRIMARY_COLOR,
        "outline_color": CAPTION_OUTLINE_COLOR,
        "outline": CAPTION_OUTLINE_WIDTH,
        "shadow": CAPTION_SHADOW,
        "margin_h": CAPTION_MARGIN_H,
        "margin_v": CAPTION_MARGIN_V_BASE,
        "alignment": CAPTION_ALIGNMENT,
        "bold": 1,
        "italic": 0,
    }

    for k in list(style.keys()):
        if k in raw and raw[k] is not None:
            style[k] = raw[k]

    # Defensive casting
    for k, default in [
        ("font_size", CAPTION_FONT_SIZE),
        ("outline", CAPTION_OUTLINE_WIDTH),
        ("shadow", CAPTION_SHADOW),
        ("margin_h", CAPTION_MARGIN_H),
        ("margin_v", CAPTION_MARGIN_V_BASE),
        ("alignment", CAPTION_ALIGNMENT),
        ("bold", 1),
        ("italic", 0),
    ]:
        try:
            style[k] = int(style[k])
        except Exception:
            style[k] = int(default)

    style["primary_color"] = str(style["primary_color"])
    style["outline_color"] = str(style["outline_color"])
    style["font"] = str(style["font"])
    return style

# -----------------------------------------------------
# ASS helpers
# -----------------------------------------------------

def ass_time(seconds: float) -> str:
    """
    seconds -> H:MM:SS.xx
    ASS expects centiseconds-style display; we emit 2 decimals.
    """
    if seconds < 0:
        seconds = 0.0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def ass_escape(text: str) -> str:
    """
    Escape ASS control chars. Also normalize whitespace.
    """
    t = clean_text(text or "")
    t = t.replace("\\", r"\\")
    t = t.replace("{", r"\{").replace("}", r"\}")
    t = t.replace("\n", r"\N")
    return t


_ATTACH_LEFT_PUNCT_RE = re.compile(r"^[\.,!\?:;%\)\]\}…]")
_ATTACH_LEFT_CONTRACTION_RE = re.compile(r"^(?:n['’]t|['’](?:s|d|m|re|ve|ll|t))\b", re.IGNORECASE)


def _token_attaches_left(token: str) -> bool:
    s = (token or "").lstrip()
    if not s:
        return False
    if _ATTACH_LEFT_PUNCT_RE.match(s):
        return True
    if _ATTACH_LEFT_CONTRACTION_RE.match(s):
        return True
    return False


def _format_karaoke_token(raw_token: str, *, is_first_in_line: bool) -> str:
    """
    Whisper words can come with or without leading spaces.
    Preserve explicit whitespace, but inject a space when tokens are bare words.
    """
    raw = str(raw_token or "")
    if not raw:
        return ""

    if is_first_in_line:
        return ass_escape(raw.lstrip())

    # Preserve explicit leading whitespace from model output.
    if raw[:1].isspace():
        return ass_escape(raw)

    stripped = raw.lstrip()
    if _token_attaches_left(stripped):
        return ass_escape(stripped)

    return ass_escape(" " + stripped)

# -----------------------------------------------------
# Face-aware margin lift (source-space normalized)
# -----------------------------------------------------

def compute_caption_margin_v(
    *,
    samples: list,
    src_h: Optional[float],
    base_margin_v: int,
) -> int:
    """
    samples: list[(t, cx, cy)] in SOURCE pixel coordinates.
    Normalize avg_y by src_h so behavior is resolution-independent.
    """
    if not samples or not src_h or float(src_h) <= 0:
        return base_margin_v

    ys = [float(y) for (_t, _x, y) in samples[: min(len(samples), 80)]]
    if not ys:
        return base_margin_v

    avg_y = sum(ys) / len(ys)
    frac = avg_y / float(src_h)  # 0..1 in source space

    # UPDATED: since base captions are higher now, keep lift milder.
    # If subject is low, push captions a bit higher.
    if frac > 0.58:
        return int(base_margin_v * 1.4)
    if frac > 0.52:
        return int(base_margin_v * 1.2)
    return base_margin_v

# -----------------------------------------------------
# ASS header builder (FINAL)
# -----------------------------------------------------

def build_ass_header(
    *,
    play_res_x: int,
    play_res_y: int,
    style: dict,
    margin_v: int,
) -> str:
    """
    Two styles:
      - Base: regular subtitle layer
      - Karaoke: highlight layer (SecondaryColour used as highlight)
    """
    fmt = (
        "Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
    )

    # Single-layer karaoke:
    # - SecondaryColour = base text (unsung)
    # - PrimaryColour = highlight (sung)
    karaoke_primary = os.getenv("WORKER_KARAOKE_HIGHLIGHT", "&H0000FFFF")  # bright yellow
    karaoke = (
        f"Style: Karaoke,{style['font']},{int(style['font_size'])},"
        f"{karaoke_primary},{style['primary_color']},{style['outline_color']},&H00000000,"
        f"{int(style['bold'])},{int(style['italic'])},0,0,100,100,0,0,"
        f"1,{int(style['outline'])},{int(style['shadow'])},"
        f"{int(style['alignment'])},{int(style['margin_h'])},{int(style['margin_h'])},{int(margin_v)},1"
    )

    return (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {int(play_res_x)}\n"
        f"PlayResY: {int(play_res_y)}\n"
        "\n"
        "[V4+ Styles]\n"
        f"Format: {fmt}\n"
        f"{karaoke}\n"
        "\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Text\n"
    )

# -----------------------------------------------------
# Karaoke builder
# -----------------------------------------------------

def _karaoke_clamp_cs(v_cs: int) -> int:
    if v_cs < KARAOKE_MIN_CS:
        return KARAOKE_MIN_CS
    if v_cs > KARAOKE_MAX_CS:
        return KARAOKE_MAX_CS
    return int(v_cs)

def build_karaoke_text(words: Iterable[dict]) -> str:
    """
    Builds \k karaoke string. Each token:
      {\kNN}word
    where NN is centiseconds duration.
    """
    parts = []
    token_index = 0
    for w in words:
        try:
            start = float(w["start"])
            end = float(w["end"])
            token = str(w["word"])
        except Exception:
            continue

        dur = max(0.0, end - start)
        dur_cs = int(round(dur * 100.0))
        dur_cs = _karaoke_clamp_cs(dur_cs)

        formatted = _format_karaoke_token(token, is_first_in_line=(token_index == 0))
        if formatted:
            parts.append(rf"{{\k{dur_cs}}}{formatted}")
            token_index += 1

    return "".join(parts)

def build_karaoke_text_for_lines(words: list, line_indices: list[list[int]]) -> str:
    r"""
    Karaoke text with explicit line breaks using \N.
    line_indices are indexes into the words list (order preserved).
    """
    if not words:
        return ""

    parts = []
    for li, idxs in enumerate(line_indices or []):
        token_index = 0
        for wi in idxs:
            if wi >= len(words):
                continue
            w = words[wi]
            try:
                start = float(w["start"])
                end = float(w["end"])
                token = str(w["word"])
            except Exception:
                continue

            dur = max(0.0, end - start)
            dur_cs = int(round(dur * 100.0))
            dur_cs = _karaoke_clamp_cs(dur_cs)
            formatted = _format_karaoke_token(token, is_first_in_line=(token_index == 0))
            if not formatted:
                continue
            parts.append(rf"{{\k{dur_cs}}}{formatted}")
            token_index += 1

        if li < len(line_indices) - 1:
            parts.append(r"\N")

    if not parts:
        return build_karaoke_text(words)

    return "".join(parts)

# -----------------------------------------------------
# Caption chunking
# -----------------------------------------------------

def _wrap_word_indices(words: list) -> list[list[int]]:
    """
    Wraps words into line indices (preserves original timing tokens).
    """
    cleaned = [clean_text(w).strip() for w in words]
    if not any(cleaned):
        return []

    lines: list[list[int]] = [[]]
    cur_len = 0

    for i, t in enumerate(cleaned):
        if not t:
            continue

        # hard word-count wrap
        if len(lines[-1]) >= CAPTION_MAX_WORDS_PER_LINE:
            if len(lines) < CAPTION_MAX_LINES:
                lines.append([])
                cur_len = 0

        # soft char-count wrap
        proposed = (cur_len + (1 if cur_len > 0 else 0) + len(t))
        if proposed > CAPTION_MAX_CHARS_PER_LINE and lines[-1]:
            if len(lines) < CAPTION_MAX_LINES:
                lines.append([])
                cur_len = 0

        if lines[-1]:
            cur_len += 1 + len(t)
        else:
            cur_len += len(t)

        lines[-1].append(i)

    return [line for line in lines if line][:CAPTION_MAX_LINES]

def build_caption_blocks(*, clip_words: list) -> list:
    """
    Convert word list into blocks with timing + wrapped lines:
      [(start, end, words_for_block, text_lines)]
    """
    if not clip_words:
        return []

    blocks = []
    cur = []
    block_start = None
    last_end = None

    def flush():
        nonlocal cur, block_start, last_end
        if not cur or block_start is None or last_end is None:
            cur = []
            block_start = None
            last_end = None
            return

        raw_tokens = [str(w["word"]) for w in cur if w.get("word")]
        line_indices = _wrap_word_indices(raw_tokens)
        lines = []
        for idxs in line_indices:
            parts = []
            for i in idxs:
                tok = clean_text(raw_tokens[i]).strip()
                if tok:
                    parts.append(tok)
            if parts:
                lines.append(" ".join(parts))
        blocks.append((float(block_start), float(last_end), cur[:], lines, line_indices))

        cur = []
        block_start = None
        last_end = None

    for w in clip_words:
        try:
            ws = float(w["start"])
            we = float(w["end"])
            token = str(w["word"])
        except Exception:
            continue

        if block_start is None:
            block_start = ws

        pause = 0.0 if last_end is None else (ws - last_end)
        duration = 0.0 if last_end is None else (last_end - block_start)

        would_words = len(cur) + 1
        should_break_readability = (
            would_words > (CAPTION_MAX_WORDS_PER_LINE * CAPTION_MAX_LINES + 3)
        )

        should_break = False
        if last_end is not None and pause >= CAPTION_BREAK_PAUSE_SECONDS and cur:
            should_break = True
        if duration >= CAPTION_MAX_BLOCK_SECONDS and cur:
            should_break = True
        if should_break_readability and cur:
            should_break = True

        if should_break:
            flush()
            block_start = ws

        cur.append({"start": ws, "end": we, "word": token})
        last_end = we

    flush()
    return blocks

# -----------------------------------------------------
# Full ASS builder for a clip (FINAL)
# -----------------------------------------------------

def build_ass_subtitles_for_clip(
    *,
    words_all: list,
    clip_start: float,
    clip_end: float,
    target_w: int,
    target_h: int,
    camera_samples: Optional[list],
    source_h: Optional[float],
    caption_style_json: Any,
) -> str:
    """
    Creates ASS subtitles for this clip.
    Emits two Dialogue lines per block:
      - Base readable layer
      - Karaoke highlight layer (with \k tokens)
    """
    style = resolve_caption_style(caption_style_json)

    clip_words = words_in_range(words_all, clip_start, clip_end)

    margin_v = compute_caption_margin_v(
        samples=camera_samples or [],
        src_h=source_h,
        base_margin_v=int(style["margin_v"]),
    )

    header = build_ass_header(
        play_res_x=int(target_w),
        play_res_y=int(target_h),
        style=style,
        margin_v=margin_v,
    )

    blocks = build_caption_blocks(clip_words=clip_words)

    events = []
    for (b_start, b_end, b_words, lines, line_indices) in blocks:
        s = max(float(clip_start), float(b_start))
        e = min(float(clip_end), float(b_end))
        if e <= s:
            continue

        karaoke_text = build_karaoke_text_for_lines(b_words, line_indices)
        if not karaoke_text:
            plain = ass_escape(clean_text(" ".join(str(w.get("word", "")) for w in b_words)))
            karaoke_text = plain

        if karaoke_text:
            events.append(
                f"Dialogue: 0,{ass_time(s - clip_start)},{ass_time(e - clip_start)},Karaoke,{karaoke_text}"
            )

    return header + "\n" + "\n".join(events) + "\n"

# -----------------------------------------------------
# Utility: write ASS to temp file
# -----------------------------------------------------

def write_ass_file(
    *,
    ass_text: str,
    job_id: int,
    suffix: str = ".ass",
) -> Path:
    """
    Writes ASS content to a tmp file and returns the path.
    """
    path = make_tmp_file(suffix)
    try:
        path.write_text(ass_text, encoding="utf-8")
        return path
    except Exception as e:
        safe_unlink(path)
        raise RuntimeError(f"Failed to write ASS subtitles: {e}")

# =====================================================
# END SECTION 7 / 10
# =====================================================

# =====================================================
# Orbito Worker — FINAL (Section 8 / 10)
# Render / Export (MP4)
# - Global face-based reframing (dynamic crop)
# - Burn-in captions (ASS)
# - Watermark overlay (PNG + animated text)
# =====================================================

from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
import math
import os

# -----------------------------------------------------
# Watermark config
# -----------------------------------------------------

# Inside the worker container, this must exist.
# Prefer a baked-in asset for production, with a fallback to mounted public assets in dev.
_WM_ENV = (os.getenv("WORKER_WATERMARK_PNG") or "").strip()
_WM_DEFAULT = "/app/assets/orbito-mark.png"
_WM_FALLBACK = "/app/public/worker/orbito-mark.png"
if _WM_ENV:
    WATERMARK_PNG_PATH = _WM_ENV
elif os.path.exists(_WM_DEFAULT):
    WATERMARK_PNG_PATH = _WM_DEFAULT
else:
    WATERMARK_PNG_PATH = _WM_FALLBACK

WATERMARK_LOGO_W = int(os.getenv("WORKER_WATERMARK_LOGO_W", "300"))
WATERMARK_ALPHA = float(os.getenv("WORKER_WATERMARK_ALPHA", "0.88"))

WATERMARK_LEFT_PAD = int(os.getenv("WORKER_WATERMARK_LEFT_PAD", "36"))
WATERMARK_TEXT_GAP = int(os.getenv("WORKER_WATERMARK_TEXT_GAP", "18"))

# Text settings (vertical)
WATERMARK_TEXT = os.getenv("WORKER_WATERMARK_TEXT", "Orbito")
WATERMARK_TEXT_FONT = os.getenv("WORKER_WATERMARK_TEXT_FONT", "Montserrat")
WATERMARK_TEXT_FONTFILE = os.getenv("WORKER_WATERMARK_TEXT_FONTFILE", "").strip()
WATERMARK_TEXT_SIZE = int(os.getenv("WORKER_WATERMARK_TEXT_SIZE", "96"))

# Pulse timing (seconds)
WATERMARK_PULSE_PERIOD = float(os.getenv("WORKER_WATERMARK_PULSE_PERIOD", "10.0"))
WATERMARK_PULSE_ON = float(os.getenv("WORKER_WATERMARK_PULSE_ON", "3.0"))
WATERMARK_PULSE_FADE = float(os.getenv("WORKER_WATERMARK_PULSE_FADE", "0.6"))

# -----------------------------------------------------
# FFmpeg helpers
# -----------------------------------------------------

def _ffq(path: Path) -> str:
    # ffmpeg filter args are sensitive; keep this simple and safe
    return str(path).replace("\\", "/").replace("'", r"\'")


def _ff_drawtext_escape(text: str) -> str:
    """
    Escape drawtext text option safely.
    """
    t = str(text or "")
    t = t.replace("\\", r"\\")
    t = t.replace(":", r"\:")
    t = t.replace("'", r"\'")
    t = t.replace("%", r"\%")
    return t

def build_lerp_expr(samples: list, axis: str) -> str:
    """
    Builds an ffmpeg-safe lerp() expression from camera samples.
    axis: 'x' or 'y'
    """
    if not samples or len(samples) < 2:
        return "0"

    expr = ""
    for i in range(len(samples) - 1):
        t0, x0, y0 = samples[i]
        t1, x1, y1 = samples[i + 1]
        v0 = x0 if axis == "x" else y0
        v1 = x1 if axis == "x" else y1

        seg = (
            f"if(between(t,{t0:.3f},{t1:.3f}),"
            f"lerp({v0:.3f},{v1:.3f},(t-{t0:.3f})/{max(t1-t0,0.001):.6f}),"
        )
        expr += seg

    last = samples[-1][1 if axis == "x" else 2]
    expr += f"{last:.3f}" + ")" * (len(samples) - 1)
    return expr

def camera_samples_for_clip_window(
    samples: list,
    *,
    clip_start: float,
    clip_end: float,
    max_keyframes: int,
) -> list:
    """
    Keep only camera keyframes relevant to the clip window and rebase times to clip-local t.
    This keeps ffmpeg filter expressions small and much faster to evaluate.
    """
    if not samples:
        return []

    s = float(max(0.0, clip_start))
    e = float(max(s + 0.01, clip_end))
    dur = e - s

    before = None
    inside = []
    after = None

    for item in samples:
        if not isinstance(item, (list, tuple)) or len(item) < 3:
            continue
        t = float(item[0])
        if t < s:
            before = item
            continue
        if t > e:
            after = item
            break
        inside.append(item)

    use = []
    if before is not None:
        use.append(before)
    use.extend(inside)
    if after is not None:
        use.append(after)
    if not use:
        use = [samples[0], samples[-1]] if len(samples) > 1 else [samples[0]]

    rebased = []
    for item in use:
        t = max(0.0, min(dur, float(item[0]) - s))
        rebased.append((t, float(item[1]), float(item[2])))

    rebased.sort(key=lambda x: float(x[0]))

    # Ensure endpoints exist so interpolation is stable across full clip duration.
    if rebased and rebased[0][0] > 0.0:
        rebased.insert(0, (0.0, rebased[0][1], rebased[0][2]))
    if rebased and rebased[-1][0] < dur:
        rebased.append((dur, rebased[-1][1], rebased[-1][2]))
    if len(rebased) == 1:
        rebased.append((dur, rebased[0][1], rebased[0][2]))

    return compress_camera_samples(rebased, max(8, int(max_keyframes or 8)))

def _target_dims_for_aspect(aspect_ratio: Optional[str]) -> Tuple[int, int]:
    a = (aspect_ratio or "9:16").strip()
    if a == "1:1":
        return (1080, 1080)
    if a == "4:5":
        return (1080, 1350)
    if a == "16:9":
        return (1920, 1080)
    if a == "4:3":
        return (1440, 1080)
    return (1080, 1920)  # 9:16 default

# -----------------------------------------------------
# Render / Export
# -----------------------------------------------------

def render_clip_mp4(
    *,
    job_id: int,
    source_video: Path,
    clip_start: float,
    clip_end: float,
    out_path: Optional[Path] = None,
    src_w: Optional[int] = None,
    src_h: Optional[int] = None,
    aspect_ratio: Optional[str] = None,
    camera_samples: Optional[list] = None,

    # captions
    captions_enabled: bool = False,
    words_all: Optional[list] = None,
    caption_style_json: Any = None,

    # watermark
    watermark_enabled: bool = True,

    fps: int = 30,
    vf_parts: Optional[List[str]] = None,
    **_unused: Any,
) -> Dict[str, Any]:
    """
    Launch-safe render:
      - dynamic crop using camera_samples (source-pixel centers)
      - optional ASS captions (burn-in)
      - optional watermark (PNG + animated text)
    """

    if out_path is None:
        out_path = Path(f"/tmp/job_{job_id}_clip.mp4")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    clip_start = float(max(0.0, clip_start))
    clip_end = float(max(clip_start + 0.01, clip_end))
    clip_dur = clip_end - clip_start

    if not src_w or not src_h:
        raise RuntimeError("Missing source dimensions for reframing")

    target_w, target_h = _target_dims_for_aspect(aspect_ratio)

    # -------------------------------------------------
    # Crop window (in source pixels)
    # -------------------------------------------------

    target_ar = float(target_w) / float(target_h)
    src_ar = float(src_w) / float(src_h)

    if src_ar > target_ar:
        crop_h = int(src_h)
        crop_w = int(crop_h * target_ar)
    else:
        crop_w = int(src_w)
        crop_h = int(crop_w / target_ar)

    crop_w = max(2, min(int(src_w), int(crop_w)))
    crop_h = max(2, min(int(src_h), int(crop_h)))

    # -------------------------------------------------
    # Filters
    # -------------------------------------------------

    vf_chain: List[str] = []

    # Base VF parts hook (if you have extra things to add)
    if vf_parts:
        for p in (vf_parts or []):
            if p and isinstance(p, str):
                vf_chain.append(p)

    # Dynamic crop (clip-window reframing)
    if camera_samples:
        clip_camera_samples = camera_samples_for_clip_window(
            camera_samples,
            clip_start=clip_start,
            clip_end=clip_end,
            max_keyframes=int(REFRAME_MAX_KEYFRAMES_PER_CLIP),
        )
        cx_expr = build_lerp_expr(clip_camera_samples, "x")
        cy_expr = build_lerp_expr(clip_camera_samples, "y")
        x_expr = f"max(0,min({src_w-crop_w},{cx_expr}-{crop_w}/2))"
        y_expr = f"max(0,min({src_h-crop_h},{cy_expr}-{crop_h}/2))"

        crop_expr = (
            f"crop={crop_w}:{crop_h}:"
            f"x='{x_expr}':"
            f"y='{y_expr}'"
        )
        vf_chain.append(crop_expr)
    else:
        vf_chain.append(
            f"crop={crop_w}:{crop_h}:"
            f"x={(src_w-crop_w)//2}:y={(src_h-crop_h)//2}"
        )

    # Scale to target
    vf_chain.append(f"scale={target_w}:{target_h}")

    # Captions (burn-in ASS)
    captions_ass_path: Optional[Path] = None
    if captions_enabled and words_all:
        try:
            ass_text = build_ass_subtitles_for_clip(
                words_all=words_all,
                clip_start=float(clip_start),
                clip_end=float(clip_end),
                target_w=int(target_w),
                target_h=int(target_h),
                camera_samples=camera_samples or [],
                source_h=float(src_h) if src_h else None,
                caption_style_json=caption_style_json,
            )
            captions_ass_path = write_ass_file(ass_text=ass_text, job_id=job_id)
        except Exception as e:
            # captions should never crash render
            captions_ass_path = None
            try:
                log(f"Captions disabled due to error: {e}", job_id=job_id, level="WARN")
            except Exception:
                pass

    if captions_ass_path:
        vf_chain.append(f"subtitles='{_ffq(captions_ass_path)}'")

    # fps
    vf_chain.append(f"fps={int(fps)}")

    # We'll do watermark with filter_complex (overlay) so we can animate bobbing cleanly.
    vf = ",".join(vf_chain)

    # -------------------------------------------------
    # Build command
    # -------------------------------------------------

    log("Rendering clip (mp4)", job_id=job_id)

    # Default: no watermark (simple -vf)
    cmd: List[str]

    if watermark_enabled and os.path.exists(WATERMARK_PNG_PATH):
        # Premium watermark (left-center), pulsed every 10s for 3s by default.
        wm_q = WATERMARK_PNG_PATH.replace("\\", "/")

        # Pulse alpha for text (fade in/out)
        period = max(2.0, float(WATERMARK_PULSE_PERIOD))
        on_time = max(0.5, min(period, float(WATERMARK_PULSE_ON)))
        fade = max(0.1, min(on_time / 2.0, float(WATERMARK_PULSE_FADE)))

        # alpha: fade in -> hold -> fade out -> off
        alpha_expr = (
            f"if(lt(mod(t,{period}),{fade}),"
            f"mod(t,{period})/{fade},"
            f"if(lt(mod(t,{period}),{on_time - fade}),"
            f"1,"
            f"if(lt(mod(t,{period}),{on_time}),"
            f"({on_time}-mod(t,{period}))/{fade},"
            f"0)))"
        )

        enable_expr = f"between(mod(t\\,{period}),0,{on_time})"

        watermark_text = clean_text((WATERMARK_TEXT or "Orbito").strip()) or "Orbito"
        watermark_text_escaped = _ff_drawtext_escape(watermark_text)
        text_font_arg = (
            f"fontfile='{_ffq(Path(WATERMARK_TEXT_FONTFILE))}':"
            if WATERMARK_TEXT_FONTFILE
            else f"font='{WATERMARK_TEXT_FONT}':"
        )

        filter_complex = (
            f"[0:v]{vf}[v1];"
            f"[1:v]scale={WATERMARK_LOGO_W}:-1,format=rgba,"
            f"colorchannelmixer=aa={WATERMARK_ALPHA}[wm];"
            f"[v1][wm]overlay="
            f"x={WATERMARK_LEFT_PAD}:"
            f"y=(H-h)/2:"
            f"enable='{enable_expr}'"
            f"[v2];"
            f"[v2]drawtext="
            f"{text_font_arg}"
            f"text='{watermark_text_escaped}':"
            f"fontsize={WATERMARK_TEXT_SIZE}:"
            f"fontcolor=white@1.0:"
            f"alpha='{alpha_expr}':"
            f"shadowcolor=black@0.55:shadowx=2:shadowy=2:"
            f"borderw=2:bordercolor=black@0.35:"
            f"x={WATERMARK_LEFT_PAD + WATERMARK_LOGO_W + WATERMARK_TEXT_GAP}:"
            f"y=(H-text_h)/2"
            f"[vout]"
        )

        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss", f"{clip_start:.6f}",
            "-t", f"{clip_dur:.6f}",
            "-i", str(source_video),
            "-i", wm_q,
            "-filter_complex", filter_complex,
            "-map", "[vout]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-c:a", "aac",
            "-b:a", "128k",
            "-ac", "2",
            "-ar", "44100",
            "-pix_fmt", "yuv420p",
            "-preset", "veryfast",
            "-movflags", "+faststart",
            "-shortest",
            str(out_path),
        ]
    else:
        # fallback: no watermark, and no crash if png missing
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss", f"{clip_start:.6f}",
            "-t", f"{clip_dur:.6f}",
            "-i", str(source_video),
            "-vf", vf,
            "-map", "0:v:0",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-c:a", "aac",
            "-b:a", "128k",
            "-ac", "2",
            "-ar", "44100",
            "-pix_fmt", "yuv420p",
            "-preset", "veryfast",
            "-movflags", "+faststart",
            "-shortest",
            str(out_path),
        ]

    try:
        run_subprocess(
            cmd,
            timeout=60 * 30,
            desc="ffmpeg render mp4",
            job_id=job_id,
        )
    finally:
        if captions_ass_path:
            safe_unlink(captions_ass_path)

    return {"path": out_path}

# =====================================================
# END SECTION 8 / 10
# =====================================================


# =====================================================
# Orbito Worker — FINAL (Section 9 / 10)
# Job Orchestration + DB Persistence (UPLOAD VERIFIED)
# =====================================================

from typing import Optional, Dict, Any, List
from sqlalchemy import text

# -----------------------------------------------------
# DB fetch helper (JOIN jobs + uploads)
# -----------------------------------------------------

def fetch_job_row(db, job_id: int) -> Dict[str, Any]:
    row = db.execute(
        text(
            """
            SELECT
              j.id                 AS job_id,
              j.upload_id          AS upload_id,
              u.user_id            AS user_id,
              u.storage_key        AS source_storage_key,

              j.aspect_ratio       AS aspect_ratio,
              j.captions_enabled   AS captions_enabled,
              j.watermark_enabled  AS watermark_enabled,
              j.caption_style_json AS caption_style_json,

              j.credits_reserved   AS credits_reserved,
              j.credits_refunded   AS credits_refunded
            FROM jobs j
            JOIN uploads u ON u.id = j.upload_id
            WHERE j.id = :jid
            LIMIT 1
            """
        ),
        {"jid": int(job_id)},
    ).mappings().fetchone()

    if not row:
        raise RuntimeError(f"Job not found: {job_id}")

    return dict(row)

# -----------------------------------------------------
# Credit charge (exactly once per job run)
# -----------------------------------------------------

def charge_credits_once(*, db, user_id: int, credits_reserved: int) -> None:
    if int(credits_reserved) <= 0:
        raise RuntimeError("Job missing credits_reserved")

    row = db.execute(
        text("SELECT credits FROM users WHERE id = :uid"),
        {"uid": int(user_id)},
    ).fetchone()

    if not row:
        raise RuntimeError("User not found")

    current = int(row[0] or 0)
    if current < int(credits_reserved):
        raise RuntimeError("Insufficient credits")

    db.execute(
        text("UPDATE users SET credits = :c WHERE id = :uid"),
        {"c": current - int(credits_reserved), "uid": int(user_id)},
    )

# -----------------------------------------------------
# Refund credits (safe + atomic + idempotent)
# -----------------------------------------------------

def refund_credits_once(*, db, job_id: int, user_id: int, credits_reserved: int) -> bool:
    if int(job_id) <= 0 or int(user_id) <= 0 or int(credits_reserved) <= 0:
        return False

    res = db.execute(
        text(
            """
            UPDATE jobs
            SET credits_refunded = 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :job_id
              AND credits_reserved = :cr
              AND COALESCE(credits_refunded, 0) = 0
            """
        ),
        {"job_id": int(job_id), "cr": int(credits_reserved)},
    )

    if getattr(res, "rowcount", 0) != 1:
        return False

    db.execute(
        text("UPDATE users SET credits = COALESCE(credits, 0) + :cr WHERE id = :uid"),
        {"cr": int(credits_reserved), "uid": int(user_id)},
    )
    return True


class JobHeartbeat:
    """
    Keep a running job fresh in DB while long steps (Whisper/FFmpeg/upload) run.
    Prevents accidental stale requeue.
    """

    def __init__(self, job_id: int):
        self.job_id = int(job_id)
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._loop, name=f"hb-{self.job_id}", daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        while not self._stop.wait(max(1.0, float(HEARTBEAT_INTERVAL))):
            try:
                with SessionLocal() as db:
                    heartbeat(db, job_id=self.job_id)
            except Exception as e:
                try:
                    log(f"Heartbeat update failed: {e}", job_id=self.job_id, level="WARN")
                except Exception:
                    pass

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)

# -----------------------------------------------------
# MAIN JOB RUNNER
# -----------------------------------------------------

def run_job(job_id: int) -> None:
    log("Starting job pipeline", job_id=job_id)
    job_t0 = time.perf_counter()

    source_path: Optional[Path] = None
    audio_wav_path: Optional[Path] = None
    clips_created = 0
    charged = False

    user_id: Optional[int] = None
    upload_id: Optional[int] = None
    credits_reserved: int = 0
    hb: Optional[JobHeartbeat] = None

    try:
        # ---------------------------------------------
        # Load job metadata
        # ---------------------------------------------
        with SessionLocal() as db:
            job = fetch_job_row(db, int(job_id))

        upload_id = int(job["upload_id"])
        user_id = int(job["user_id"])
        storage_key = str(job["source_storage_key"])

        aspect_ratio = job.get("aspect_ratio") or "9:16"
        captions_enabled = bool(job.get("captions_enabled"))
        watermark_enabled = bool(job.get("watermark_enabled"))
        caption_style_json = job.get("caption_style_json")

        credits_reserved = int(job.get("credits_reserved") or 0)
        if credits_reserved <= 0:
            raise RuntimeError("Job missing credits_reserved")
        charged = True  # credits were already reserved at upload time

        hb = JobHeartbeat(job_id=job_id)
        hb.start()

        # ---------------------------------------------
        # Download + preflight
        # ---------------------------------------------
        stage_t = time.perf_counter()
        source_path = download_source_video(storage_key=storage_key, job_id=job_id)
        src_w, src_h, video_duration = preflight_source_video(
            source_path=source_path,
            job_id=job_id,
        )
        log(
            f"Source ready: {src_w}x{src_h}, duration={video_duration:.1f}s, prep={(time.perf_counter() - stage_t):.1f}s",
            job_id=job_id,
        )

        # Use per-clip camera analysis to avoid full-video tracking cost on long uploads.
        stage_t = time.perf_counter()
        target_w, target_h = normalize_aspect(aspect_ratio)
        cam_samples: List[tuple] = []
        log(
            f"Per-clip camera analysis enabled (setup {(time.perf_counter() - stage_t):.1f}s)",
            job_id=job_id,
        )

        # ---------------------------------------------
        # Audio + transcription
        # ---------------------------------------------
        stage_t = time.perf_counter()
        audio = run_audio_pipeline(source_video=source_path, job_id=job_id)
        log(
            f"Audio profile: energy={float(audio.get('energy', 0.0)):.3f} voice_coverage={float(audio.get('voice_coverage', 0.0)):.3f} in {(time.perf_counter() - stage_t):.1f}s",
            job_id=job_id,
        )
        audio_wav_path = Path(str(audio["wav_path"]))

        try:
            stage_t = time.perf_counter()
            transcript_raw = transcribe_audio(wav_path=audio_wav_path, job_id=job_id)
            log(f"Transcription complete in {(time.perf_counter() - stage_t):.1f}s", job_id=job_id)
        finally:
            safe_unlink(audio_wav_path)
            audio_wav_path = None

        transcript = normalize_transcript(transcript_raw)

        words = extract_words(transcript)
        utterances = build_utterances(words)

        clip_plans = generate_clip_plans(
            utterances=utterances,
            silences=audio["silences"],
            video_duration=float(video_duration),
        )

        # ---------------------------------------------
        # Score + select (viral-ish heuristic)
        # ---------------------------------------------
        scored: List[Dict[str, Any]] = []
        for plan in clip_plans:
            clip_start = float(plan["start"])
            clip_end = float(plan["end"])

            motion = motion_metrics_for_clip(
                samples=cam_samples or [],
                clip_start=clip_start,
                clip_end=clip_end,
            )

            scored.append(
                compute_clip_quality_score(
                    clip=plan,
                    words=words,
                    silences=audio["silences"],
                    audio_energy=audio["energy"],
                    motion_metrics=motion,
                    voice_segments=audio.get("voice_segments", []),
                )
            )

        try:
            min_clips = max(1, int(math.ceil((video_duration / 60.0) * MIN_CLIPS_PER_MINUTE)))
        except Exception:
            min_clips = 1

        top_k = max(TOP_K_CLIPS, min_clips)
        top_k = min(top_k, MAX_TOP_K_CLIPS, MAX_RENDER_CLIPS_PER_JOB)
        top_k = min(top_k, max(1, len(scored)))

        selected = select_top_k_clips(scored, top_k=top_k)
        selected = sorted(selected, key=lambda c: float(c.get("start", 0.0)))
        log(
            f"Clip selection: planned={len(clip_plans)} scored={len(scored)} selected={len(selected)} (limit={top_k})",
            job_id=job_id,
        )

        # ---------------------------------------------
        # Render + UPLOAD EACH CLIP (VERIFIED)
        # ---------------------------------------------
        seen_titles: set[str] = set()
        clip_errors: List[str] = []
        storage = get_storage()
        for idx, plan in enumerate(selected):
            clip_start = float(plan["start"])
            clip_end = float(plan["end"])
            clip_t0 = time.perf_counter()

            local_out = Path(f"/tmp/job_{job_id}_clip_{idx}.mp4")
            clip_path = Path(local_out)

            try:
                vf_parts: List[str] = []

                clip_words = words_in_range(words, clip_start, clip_end)
                snippet = clean_text(" ".join(str(w.get("word", "")) for w in clip_words))
                hook, _hook_conf = generate_hook_heuristic(snippet)
                title, _title_conf = generate_title_heuristic(
                    hook or snippet,
                    clip_words=clip_words,
                    clip_index=idx,
                )
                if not title or title.strip().lower() in {"new clip", "untitled", "highlight"}:
                    title = f"Clip {idx + 1}"
                base_title = title
                suffix = 2
                while title.lower() in seen_titles:
                    title = f"{base_title} ({suffix})"
                    suffix += 1
                seen_titles.add(title.lower())

                clip_cam_samples: List[tuple] = []
                try:
                    analyze_start = max(0.0, clip_start - 1.0)
                    analyze_end = min(float(video_duration), clip_end + 1.0)
                    _cx, _cy, clip_cam_samples, clip_cam_meta = build_camera_path(
                        source_video=source_path,
                        job_id=job_id,
                        target_w=int(target_w),
                        target_h=int(target_h),
                        analyze_start=analyze_start,
                        analyze_end=analyze_end,
                    )
                    log(
                        f"Clip {idx + 1} camera path: keyframes={clip_cam_meta.get('keyframes', len(clip_cam_samples))} window={max(0.0, analyze_end - analyze_start):.1f}s",
                        job_id=job_id,
                    )
                except Exception as cam_err:
                    clip_cam_samples = []
                    log(
                        f"Clip {idx + 1} camera fallback: {cam_err}",
                        job_id=job_id,
                        level="WARN",
                    )

                render = render_clip_mp4(
                    job_id=job_id,
                    source_video=source_path,
                    out_path=local_out,
                    clip_start=clip_start,
                    clip_end=clip_end,
                    src_w=int(src_w),
                    src_h=int(src_h),
                    aspect_ratio=str(aspect_ratio),
                    vf_parts=vf_parts,
                    camera_samples=clip_cam_samples,
                    captions_enabled=captions_enabled,
                    caption_style_json=caption_style_json,
                    words_all=words,
                    watermark_enabled=watermark_enabled,
                )

                # -----------------------------
                # HARD UPLOAD VERIFICATION
                # -----------------------------
                clip_key = f"users/{user_id}/clips/{job_id}_{idx}.mp4"
                clip_path = Path(render["path"])

                log(f"Preparing upload → {clip_key}", job_id=job_id)

                if not clip_path.exists():
                    raise RuntimeError("Rendered clip file missing before upload")

                size = clip_path.stat().st_size
                if size <= 0:
                    raise RuntimeError("Rendered clip file is 0 bytes")

                log(f"Rendered clip size: {size} bytes", job_id=job_id)

                storage.upload(str(clip_path), clip_key, content_type="video/mp4")

                log(f"Upload completed → {clip_key}", job_id=job_id)

                # -----------------------------
                # DB INSERT (AFTER UPLOAD)
                # -----------------------------
                with SessionLocal() as db:
                    db.execute(
                        text(
                            """
                            INSERT INTO clips (
                                job_id,
                                upload_id,
                                storage_key,
                                start_time,
                                end_time,
                                duration,
                                title,
                                hook
                            )
                            VALUES (
                                :job_id,
                                :upload_id,
                                :key,
                                :start,
                                :end,
                                :dur,
                                :title,
                                :hook
                            )
                            """
                        ),
                        {
                            "job_id": job_id,
                            "upload_id": upload_id,
                            "key": clip_key,
                            "start": clip_start,
                            "end": clip_end,
                            "dur": clip_end - clip_start,
                            "title": title,
                            "hook": hook,
                        },
                    )
                    db.commit()

                clips_created += 1
                log(
                    f"Clip {idx + 1}/{len(selected)} done in {(time.perf_counter() - clip_t0):.1f}s",
                    job_id=job_id,
                )
            except Exception as clip_err:
                clip_errors.append(f"clip {idx + 1}: {clip_err}")
                log(f"Clip {idx + 1} skipped: {clip_err}", job_id=job_id, level="WARN")
                continue
            finally:
                safe_unlink(local_out)

        if clips_created <= 0:
            details = "; ".join(clip_errors[:3]) if clip_errors else "render failed"
            raise RuntimeError(f"No clips rendered successfully ({details})")

        if clip_errors:
            log(
                f"Completed with {len(clip_errors)} skipped clip(s) and {clips_created} successful clip(s)",
                job_id=job_id,
                level="WARN",
            )

        with SessionLocal() as db:
            update_job_status(db=db, job_id=job_id, status="done", error=None)
            db.commit()

        log(
            f"Job completed ({clips_created} clips) in {(time.perf_counter() - job_t0):.1f}s",
            job_id=job_id,
        )
        try:
            if user_id:
                trigger_automations(job_id=int(job_id), user_id=int(user_id))
        except Exception:
            pass

    except Exception as e:
        err = str(e) or "Job failed"

        if charged and user_id and credits_reserved > 0:
            try:
                with SessionLocal() as db:
                    did = refund_credits_once(
                        db=db,
                        job_id=job_id,
                        user_id=user_id,
                        credits_reserved=credits_reserved,
                    )
                    db.commit()
                if did:
                    log(f"Refunded {credits_reserved} credits", job_id=job_id)
            except Exception:
                pass

        log(f"Job failed: {err}", job_id=job_id, level="ERROR")
        with SessionLocal() as db:
            update_job_status(db=db, job_id=job_id, status="failed", error=err[:1000])
            db.commit()
        raise

    finally:
        if hb:
            try:
                hb.stop()
            except Exception:
                pass
        if audio_wav_path:
            safe_unlink(audio_wav_path)
        if source_path:
            safe_unlink(source_path)

# =====================================================
# END SECTION 9 / 10
# =====================================================


# =====================================================
# Orbito Worker — FINAL (Section 10 / 10)
# Main loop + entrypoint (NO worker_sections imports)
# =====================================================

import time
import signal

_SHUTDOWN = False


def _handle_shutdown(sig, frame):
    global _SHUTDOWN
    _SHUTDOWN = True
    try:
        log(f"Received signal {sig}, shutting down", level="WARN")
    except Exception:
        pass


try:
    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)
except Exception:
    pass


def main():
    log("Worker started")
    try:
        wm_path = str(WATERMARK_PNG_PATH)
        wm_exists = os.path.exists(wm_path)
        wm_size = os.path.getsize(wm_path) if wm_exists else 0
        log(f"Worker file: {__file__}")
        log(f"Watermark path: {wm_path} (exists={wm_exists}, bytes={wm_size})")
    except Exception as e:
        log(f"Startup fingerprint failed: {e}", level="WARN")

    while not _SHUTDOWN:
        try:
            with SessionLocal() as db:
                reclaim_stale_jobs(db)
                job_id = claim_next_job(db)

            if job_id is None:
                time.sleep(POLL_INTERVAL)
                continue

            try:
                run_job(int(job_id))
            except Exception:
                # run_job handles:
                # - status updates
                # - refunds (if needed)
                # - logging
                pass

        except Exception as e:
            log(f"Worker loop error: {e}", level="ERROR")
            time.sleep(2.0)

    log("Worker exiting cleanly")


if __name__ == "__main__":
    main()
# =====================================================
# END SECTION 10 / 10
# =====================================================
 
