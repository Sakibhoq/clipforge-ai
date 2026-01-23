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
# Storage, Download, Video Preflight
# =====================================================

import subprocess
from pathlib import Path
from typing import Tuple

# -----------------------------------------------------
# Storage abstraction
# -----------------------------------------------------

from storage import get_storage

# -----------------------------------------------------
# Temp directory
# -----------------------------------------------------

TMP_ROOT = Path(os.getenv("WORKER_TMP_DIR", "/tmp/clipforge"))
TMP_ROOT.mkdir(parents=True, exist_ok=True)

MAX_SOURCE_BYTES = int(
    os.getenv("WORKER_MAX_SOURCE_BYTES", str(5 * 1024**3))  # 5 GB
)

# -----------------------------------------------------
# Temp helpers
# -----------------------------------------------------

def make_tmp_file(suffix: str) -> Path:
    return TMP_ROOT / f"{uuid.uuid4().hex}{suffix}"

def safe_unlink(path: Path):
    try:
        if path and path.exists():
            path.unlink()
    except Exception:
        pass

# -----------------------------------------------------
# Subprocess runner (strict)
# -----------------------------------------------------

def run_subprocess(
    cmd: list,
    *,
    timeout: int,
    desc: str,
    allow_stderr: bool = False,
) -> Tuple[str, str]:
    """
    Runs subprocess and returns (stdout, stderr).
    """
    try:
        p = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"{desc} timed out")

    stdout = p.stdout.decode(errors="ignore")
    stderr = p.stderr.decode(errors="ignore")

    if p.returncode != 0 and not allow_stderr:
        raise RuntimeError(f"{desc} failed:\n{stderr or stdout}")

    return stdout, stderr

# -----------------------------------------------------
# Source download
# -----------------------------------------------------

def download_source_video(
    *,
    storage_key: str,
    job_id: int,
) -> Path:
    """
    Streams source video from storage to disk.
    Fails fast on empty or oversized objects.
    """
    storage = get_storage()
    tmp_path = make_tmp_file(".mp4")

    log(f"Downloading source video: {storage_key}", job_id=job_id)

    total = 0
    try:
        with storage.open(storage_key) as body, open(tmp_path, "wb") as f:
            while True:
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

    if total <= 0 or not tmp_path.exists():
        safe_unlink(tmp_path)
        raise RuntimeError(
            "Downloaded video is empty (0 bytes). "
            "Likely presigned upload failed."
        )

    log(f"Download complete ({total / 1024**2:.1f} MB)", job_id=job_id)
    return tmp_path

# -----------------------------------------------------
# FFprobe helpers
# -----------------------------------------------------

def probe_video_basic(path: Path) -> Tuple[int, int, float]:
    """
    Returns (width, height, duration_seconds).
    Fails fast if video is unreadable or corrupt.
    """
    # Duration
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
    )
    try:
        duration = float(out.strip())
    except Exception:
        raise RuntimeError("Failed to parse video duration")

    # Dimensions
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
    )
    try:
        w, h = out.strip().split(",")
        width = int(w)
        height = int(h)
    except Exception:
        raise RuntimeError("Failed to parse video dimensions")

    if width <= 0 or height <= 0 or duration <= 0.1:
        raise RuntimeError("Invalid or corrupt video file")

    return width, height, duration

# -----------------------------------------------------
# Integrated preflight
# -----------------------------------------------------

def preflight_source_video(
    *,
    source_path: Path,
    job_id: int,
) -> Tuple[int, int, float]:
    """
    Ensures:
      - readable by ffmpeg
      - valid dimensions
      - non-zero duration
    """
    log("Preflighting source video", job_id=job_id)

    try:
        w, h, dur = probe_video_basic(source_path)
    except Exception as e:
        raise RuntimeError(
            f"Video preflight failed: {e}\n"
            "If you see 'moov atom not found', upload is corrupt."
        )

    log(f"Video OK — {w}x{h}, {dur:.1f}s", job_id=job_id)
    return w, h, dur

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
from typing import List, Dict

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

        return {
            "wav_path": wav_path,
            "silences": silences,
            "energy": energy,
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
        import whisper
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

    return final

# =====================================================
# END SECTION 5 / 10
# =====================================================
# -----------------------------------------------------
# Scoring + selection + titles (launch-safe defaults)
# -----------------------------------------------------

HOOK_CONF_THRESHOLD = float(os.getenv("WORKER_HOOK_CONF_THRESHOLD", "0.55"))
TOP_K_CLIPS = int(os.getenv("WORKER_TOP_K_CLIPS", "3"))

def compute_clip_quality_score(
    *,
    clip: Dict[str, Any],
    words: list,
    silences: list,
    audio_energy: float,
    motion_metrics: dict,
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

    # silence penalty: if the clip is mostly inside silence intervals, penalize
    silence_seconds = 0.0
    for ss, se in silences or []:
        ss = float(ss); se = float(se)
        overlap = max(0.0, min(e, se) - max(s, ss))
        silence_seconds += overlap
    silence_ratio = max(0.0, min(1.0, silence_seconds / dur))
    silence_penalty = 1.0 - (silence_ratio * 0.75)

    score = (
        0.30 * dur_score +
        0.35 * speech_score +
        0.20 * energy_score +
        0.15 * motion_score
    ) * silence_penalty

    score = max(0.0, min(1.0, float(score)))
    clip["quality_score"] = score
    return clip

def select_top_k_clips(clips: list) -> list:
    """
    Sort by quality_score desc, keep TOP_K_CLIPS, enforce non-overlap.
    """
    if not clips:
        return []

    # sort by score then duration (slight preference for longer if tie)
    ordered = sorted(
        clips,
        key=lambda c: (float(c.get("quality_score", 0.0)), float(c.get("duration", (c["end"] - c["start"])))),
        reverse=True,
    )

    picked = []
    for c in ordered:
        if len(picked) >= TOP_K_CLIPS:
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

def generate_title_heuristic(snippet: str) -> Tuple[str, float]:
    """
    Simple launch-safe title generator from transcript snippet.
    Returns (title, confidence).
    """
    s = clean_text(snippet or "")
    if not s:
        return ("New clip", 0.2)

    # Remove leading fillers
    s = re.sub(r"^(um|uh|like|you know)\b[:,]?\s*", "", s, flags=re.IGNORECASE)
    s = s.strip()

    # Shorten
    title = truncate_text(s, 60)
    conf = 0.65 if len(title) >= 14 else 0.45
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
REFRAME_SMOOTHING = float(os.getenv("WORKER_REFRAME_SMOOTHING", "0.85"))
REFRAME_CENTER_BIAS_Y = float(os.getenv("WORKER_REFRAME_CENTER_BIAS_Y", "0.62"))

# Clamp crop motion per sample (prevents violent jumps if detector glitches)
REFRAME_MAX_STEP_PX = float(os.getenv("WORKER_REFRAME_MAX_STEP_PX", "120.0"))

# If no faces detected, keep crops biased slightly above center (good for talking heads)
FALLBACK_CENTER_BIAS_Y = float(os.getenv("WORKER_FALLBACK_CENTER_BIAS_Y", "0.58"))

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

# -----------------------------------------------------
# Camera path builder
# -----------------------------------------------------

def build_camera_path(
    *,
    source_video: Path,
    job_id: int,
    target_w: int,
    target_h: int,
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

        # Provide at least a couple samples for downstream margin calculations.
        samples = [(0.0, float(cx), float(cy)), (0.5, float(cx), float(cy))]

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

    # Sampling step (in seconds) — cap to at least 1 frame step.
    step = max(1.0 / float(REFRAME_SAMPLE_FPS), 1.0 / float(fps))

    # Initialize center
    last_x = src_w / 2.0
    last_y = src_h * float(FALLBACK_CENTER_BIAS_Y)

    samples = []
    t = 0.0

    while t <= duration:
        try:
            cap.set(cv2.CAP_PROP_POS_MSEC, float(t) * 1000.0)
            ok, frame = cap.read()
        except Exception:
            ok, frame = False, None

        if not ok or frame is None:
            t += step
            continue

        faces = _detect_faces(frame)

        if faces:
            # Choose largest face
            x, y, w, h = max(faces, key=lambda f: float(f[2]) * float(f[3]))
            cx = float(x) + float(w) / 2.0
            cy = float(y) + float(h) / 2.0
        else:
            # Bias to upper-middle (better for captions + talking heads)
            cx = src_w / 2.0
            cy = src_h * float(REFRAME_CENTER_BIAS_Y)

        # Clamp sudden detector spikes
        cx = limit_step(prev=last_x, cur=cx, max_step=REFRAME_MAX_STEP_PX)
        cy = limit_step(prev=last_y, cur=cy, max_step=REFRAME_MAX_STEP_PX)

        # Smooth
        cx = float(REFRAME_SMOOTHING) * last_x + (1.0 - float(REFRAME_SMOOTHING)) * cx
        cy = float(REFRAME_SMOOTHING) * last_y + (1.0 - float(REFRAME_SMOOTHING)) * cy

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
        t += step

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
        samples = [(0.0, float(cx), float(cy)), (max(0.5, step), float(cx), float(cy))]

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
        "mode": "face_first_cv2",
        "duration": float(duration),
        "sample_step": float(step),
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

    # BorderStyle=1 => outline+shadow
    base = (
        f"Style: Base,{style['font']},{int(style['font_size'])},"
        f"{style['primary_color']},&H00FFFFFF,{style['outline_color']},&H00000000,"
        f"{int(style['bold'])},{int(style['italic'])},0,0,100,100,0,0,"
        f"1,{int(style['outline'])},{int(style['shadow'])},"
        f"{int(style['alignment'])},{int(style['margin_h'])},{int(style['margin_h'])},{int(margin_v)},1"
    )

    karaoke = (
        f"Style: Karaoke,{style['font']},{int(style['font_size'])},"
        f"{style['primary_color']},&H0000FFFF,{style['outline_color']},&H00000000,"
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
        f"{base}\n"
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

        # Whisper tokens often include leading spaces; preserve them.
        parts.append(rf"{{\k{dur_cs}}}{ass_escape(token)}")

    return "".join(parts)

# -----------------------------------------------------
# Caption chunking
# -----------------------------------------------------

def _line_wrap_words(words: list) -> list:
    toks = [clean_text(w).strip() for w in words if clean_text(w).strip()]
    if not toks:
        return []

    lines: list[list[str]] = [[]]
    cur_len = 0

    for t in toks:
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

        lines[-1].append(t)

    out = [" ".join(line).strip() for line in lines if line]
    return out[:CAPTION_MAX_LINES]

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
        lines = _line_wrap_words(raw_tokens)
        blocks.append((float(block_start), float(last_end), cur[:], lines))

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
    for (b_start, b_end, b_words, lines) in blocks:
        s = max(float(clip_start), float(b_start))
        e = min(float(clip_end), float(b_end))
        if e <= s:
            continue

        base_text = r"\N".join(ass_escape(line) for line in lines) if lines else ""
        karaoke_text = build_karaoke_text(b_words)

        # Base readable layer
        if base_text:
            events.append(
                f"Dialogue: 0,{ass_time(s - clip_start)},{ass_time(e - clip_start)},Base,{base_text}"
            )
        else:
            plain = ass_escape(clean_text(" ".join(str(w.get("word", "")) for w in b_words)))
            if plain:
                events.append(
                    f"Dialogue: 0,{ass_time(s - clip_start)},{ass_time(e - clip_start)},Base,{plain}"
                )

        # Karaoke highlight layer
        if karaoke_text:
            events.append(
                f"Dialogue: 1,{ass_time(s - clip_start)},{ass_time(e - clip_start)},Karaoke,{karaoke_text}"
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
# Clipforge Worker — FINAL (Section 8 / 10)
# Rendering / Export Engine — Crop + Scale + Subs + Watermark
# (FULL + Launch-Ready)
#
# Fixes included:
# - Supports 4:3 in aspect_to_target()
# - Safe subtitles path escaping for ffmpeg (colon + backslash + apostrophe)
# - drawtext uses fontfile when provided (more reliable than :font=)
# - Defensive even-dimension handling + safe clamps
# - UPDATED: watermark is bigger + more “alive” (pulse alpha + gentle drift + soft box)
# =====================================================

from typing import Optional, Tuple, Dict, Any
import os

# -----------------------------------------------------
# Render defaults
# -----------------------------------------------------

RENDER_CRF = int(os.getenv("WORKER_RENDER_CRF", "20"))          # 18-23 typical
RENDER_PRESET = os.getenv("WORKER_RENDER_PRESET", "veryfast")  # faster for launch
RENDER_FPS = int(os.getenv("WORKER_RENDER_FPS", "30"))
RENDER_AUDIO_BITRATE = os.getenv("WORKER_RENDER_AUDIO_BR", "128k")
RENDER_VIDEO_PROFILE = os.getenv("WORKER_RENDER_PROFILE", "high")
RENDER_PIX_FMT = os.getenv("WORKER_RENDER_PIX_FMT", "yuv420p")

RENDER_TIMEOUT = int(os.getenv("WORKER_RENDER_TIMEOUT", "3600"))  # 60 min/clip

# Watermark controls
WATERMARK_TEXT = os.getenv("WORKER_WATERMARK_TEXT", "Clipforge")
WATERMARK_FONT = os.getenv("WORKER_WATERMARK_FONT", "Montserrat")
WATERMARK_FONTFILE = os.getenv("WORKER_WATERMARK_FONTFILE", "")  # optional absolute path in container

# Bigger by default (was 36)
WATERMARK_FONT_SIZE = int(os.getenv("WORKER_WATERMARK_FONT_SIZE", "54"))

# Base alpha (we still pulse it via expression)
WATERMARK_ALPHA = float(os.getenv("WORKER_WATERMARK_ALPHA", "0.70"))

# Stronger presence
WATERMARK_OUTLINE = int(os.getenv("WORKER_WATERMARK_OUTLINE", "3"))
WATERMARK_SHADOW = int(os.getenv("WORKER_WATERMARK_SHADOW", "2"))

WATERMARK_SAFE_PAD = int(os.getenv("WORKER_WATERMARK_SAFE_PAD", "32"))
WATERMARK_SPEED = float(os.getenv("WORKER_WATERMARK_SPEED", "1.35"))  # motion speed

# “Alive” tuning
WATERMARK_PULSE_HZ = float(os.getenv("WORKER_WATERMARK_PULSE_HZ", "0.12"))  # slow
WATERMARK_DRIFT_PX = int(os.getenv("WORKER_WATERMARK_DRIFT_PX", "22"))
WATERMARK_BOX = int(os.getenv("WORKER_WATERMARK_BOX", "1"))  # 1 = on
WATERMARK_BOX_PAD = int(os.getenv("WORKER_WATERMARK_BOX_PAD", "10"))
WATERMARK_BOX_BORDER = int(os.getenv("WORKER_WATERMARK_BOX_BORDER", "2"))

# -----------------------------------------------------
# Aspect helpers
# -----------------------------------------------------

def aspect_to_target(aspect_ratio: str) -> Tuple[int, int]:
    """
    Returns render output WxH for known aspect labels.
    """
    a = (aspect_ratio or "").strip()
    if a == "1:1":
        return 1080, 1080
    if a == "4:5":
        return 1080, 1350
    if a == "16:9":
        return 1920, 1080
    if a == "4:3":
        return 1440, 1080
    # default 9:16
    return 1080, 1920

def compute_crop_size(
    *,
    src_w: int,
    src_h: int,
    target_w: int,
    target_h: int,
) -> Tuple[int, int]:
    """
    Compute crop WxH inside source such that crop matches target aspect.
    (No letterbox; we crop then scale.)
    """
    if src_w <= 0 or src_h <= 0:
        # conservative fallback
        w = max(2, int(target_w))
        h = max(2, int(target_h))
        w -= w % 2
        h -= h % 2
        return w, h

    target_aspect = float(target_w) / float(target_h)
    src_aspect = float(src_w) / float(src_h)

    if src_aspect > target_aspect:
        # source wider -> crop width
        crop_h = int(src_h)
        crop_w = int(round(crop_h * target_aspect))
    else:
        # source taller -> crop height
        crop_w = int(src_w)
        crop_h = int(round(crop_w / target_aspect))

    crop_w = max(2, min(int(src_w), int(crop_w)))
    crop_h = max(2, min(int(src_h), int(crop_h)))

    # keep even dims for encoder stability
    crop_w -= crop_w % 2
    crop_h -= crop_h % 2
    return crop_w, crop_h

def _clamp_int(v: float, lo: int, hi: int) -> int:
    return int(max(lo, min(hi, int(round(v)))))

def _median(vals: list) -> float:
    if not vals:
        return 0.0
    s = sorted(vals)
    mid = len(s) // 2
    if len(s) % 2 == 1:
        return float(s[mid])
    return 0.5 * (float(s[mid - 1]) + float(s[mid]))

def estimate_clip_centers_from_samples(
    *,
    camera_samples: list,
    clip_start: float,
    clip_end: float,
    fallback_x: float,
    fallback_y: float,
) -> Tuple[Tuple[float, float], Tuple[float, float]]:
    """
    Returns ((cx0, cy0), (cx1, cy1)) for a safe linear pan.
    If we have no samples in range, return fallback for both.
    """
    if not camera_samples:
        return (fallback_x, fallback_y), (fallback_x, fallback_y)

    in_range = [s for s in camera_samples if clip_start <= float(s[0]) <= clip_end]
    if len(in_range) < 2:
        return (fallback_x, fallback_y), (fallback_x, fallback_y)

    # Choose early and late windows
    n = len(in_range)
    w = max(1, min(6, n // 6))

    early = in_range[:w]
    late = in_range[-w:]

    cx0 = _median([float(x) for (_t, x, _y) in early])
    cy0 = _median([float(y) for (_t, _x, y) in early])

    cx1 = _median([float(x) for (_t, x, _y) in late])
    cy1 = _median([float(y) for (_t, _x, y) in late])

    return (cx0, cy0), (cx1, cy1)

def build_crop_pan_expressions(
    *,
    src_w: int,
    src_h: int,
    crop_w: int,
    crop_h: int,
    clip_duration: float,
    center0: Tuple[float, float],
    center1: Tuple[float, float],
) -> Tuple[str, str]:
    """
    Builds ffmpeg crop x,y expressions that linearly pan from center0->center1.
    Uses 't' in seconds.
    """
    cx0, cy0 = center0
    cx1, cy1 = center1

    # convert to top-left positions
    x0 = float(cx0) - float(crop_w) / 2.0
    y0 = float(cy0) - float(crop_h) / 2.0
    x1 = float(cx1) - float(crop_w) / 2.0
    y1 = float(cy1) - float(crop_h) / 2.0

    # Clamp endpoints in python so expressions stay stable
    x0i = _clamp_int(x0, 0, max(0, int(src_w - crop_w)))
    y0i = _clamp_int(y0, 0, max(0, int(src_h - crop_h)))
    x1i = _clamp_int(x1, 0, max(0, int(src_w - crop_w)))
    y1i = _clamp_int(y1, 0, max(0, int(src_h - crop_h)))

    if clip_duration <= 0.05:
        return str(x0i), str(y0i)

    d = float(clip_duration)
    x_expr = f"{x0i}+({x1i}-{x0i})*min(max(t/{d:.6f},0),1)"
    y_expr = f"{y0i}+({y1i}-{y0i})*min(max(t/{d:.6f},0),1)"
    return x_expr, y_expr

# -----------------------------------------------------
# Subtitles + watermark filters
# -----------------------------------------------------

def _escape_ffmpeg_filter_path(p: str) -> str:
    """
    Escape a path for use inside ffmpeg filter args.
    We escape:
      - backslash
      - colon (Windows drive letters / filter parsing)
      - apostrophe (since we single-quote)
    """
    s = (p or "").replace("\\", "/")
    s = s.replace(":", r"\:")
    s = s.replace("'", r"\'")
    return s

def build_subtitles_filter(ass_path: "Path") -> str:
    # subtitles filter wants a path; safest is single-quoted with escaping
    return f"subtitles='{_escape_ffmpeg_filter_path(str(ass_path))}'"

def _escape_drawtext_text(s: str) -> str:
    # drawtext uses ':' as separator, and also parses quotes
    t = (s or "")
    t = t.replace("\\", r"\\")
    t = t.replace(":", r"\:")
    t = t.replace("'", r"\'")
    t = t.replace("\n", " ")
    return t

def build_watermark_filter(
    *,
    out_w: int,
    out_h: int,
) -> str:
    """
    Moving “alive” watermark using drawtext:
      - Bigger default size, and scales slightly with output height
      - Gentle drift (sin/cos)
      - Alpha pulse (subtle)
      - Soft box behind text (optional) for premium presence
    """
    base_alpha = max(0.05, min(0.95, float(WATERMARK_ALPHA)))
    pad = max(0, int(WATERMARK_SAFE_PAD))

    # Scale font size with output height (keeps 1:1 / 16:9 feeling consistent)
    # Example targets:
    #  - 1080x1920: ~52-64
    #  - 1920x1080: ~44-52
    scaled = int(round(float(out_h) * 0.030))  # 3% of height
    fontsize = int(max(int(WATERMARK_FONT_SIZE), scaled))

    # Drift amplitude
    drift = int(max(0, WATERMARK_DRIFT_PX))

    # Keep it in a safe area and move it with sin/cos (alive, not distracting)
    x_expr = (
        f"{pad}+"
        f"(w-text_w-{2*pad})*(0.5+0.5*sin({float(WATERMARK_SPEED):.4f}*t))"
        f"+{drift}*sin({float(WATERMARK_SPEED):.4f}*0.7*t)"
    )
    y_expr = (
        f"{pad}+"
        f"(h-text_h-{2*pad})*(0.5+0.5*cos({float(WATERMARK_SPEED):.4f}*t))"
        f"+{drift}*cos({float(WATERMARK_SPEED):.4f}*0.6*t)"
    )

    # Alpha pulse (FFmpeg drawtext supports expression alpha)
    # Keep it subtle: +/- ~0.08 around base
    # NOTE: use PI constant (ffmpeg expr supports PI)
    pulse = max(0.02, min(0.30, 0.14 * base_alpha))
    alpha_expr = f"min(max({base_alpha:.4f}+{pulse:.4f}*sin(2*PI*{float(WATERMARK_PULSE_HZ):.4f}*t),0.08),0.92)"

    # Prefer fontfile if provided; more reliable across containers
    if WATERMARK_FONTFILE and os.path.isabs(WATERMARK_FONTFILE):
        font_part = f":fontfile='{_escape_ffmpeg_filter_path(WATERMARK_FONTFILE)}'"
    else:
        font_part = f":font='{_escape_drawtext_text(WATERMARK_FONT)}'"

    # Soft premium box behind text (optional)
    box_part = ""
    if int(WATERMARK_BOX) == 1:
        # boxcolor uses @alpha; keep very subtle
        # boxborderw gives a bit of glass-like padding
        box_part = (
            f":box=1"
            f":boxcolor=black@0.18"
            f":boxborderw={int(max(0, WATERMARK_BOX_PAD))}"
        )

    return (
        "drawtext="
        f"text='{_escape_drawtext_text(WATERMARK_TEXT)}'"
        f"{font_part}"
        f":fontsize={fontsize}"
        f":fontcolor=white@({alpha:.3f}*(0.72+0.28*sin(2.2*t)))"
        f":alpha='{alpha_expr}'"
        f":x={x_expr}"
        f":y={y_expr}"
        f":borderw={int(max(0, WATERMARK_OUTLINE))}"
        f":shadowx={int(max(0, WATERMARK_SHADOW))}"
        f":shadowy={int(max(0, WATERMARK_SHADOW))}"
        f"{box_part}"
    )

# -----------------------------------------------------
# Render function
# -----------------------------------------------------

def render_clip_mp4(
    *,
    source_video: "Path",
    clip_start: float,
    clip_end: float,
    src_w: int,
    src_h: int,
    aspect_ratio: str,
    camera_samples: Optional[list],
    captions_enabled: bool,
    caption_style_json: Any,
    words_all: list,
    watermark_enabled: bool,
    job_id: int,
) -> Dict[str, Any]:
    """
    Renders a single clip to a temp MP4 and returns:
      { "path": Path, "duration": float, "out_w": int, "out_h": int }
    """
    if clip_end <= clip_start:
        raise RuntimeError("Invalid clip timing")

    clip_dur = float(clip_end - clip_start)

    out_w, out_h = aspect_to_target(aspect_ratio)
    out_w = int(out_w); out_h = int(out_h)

    crop_w, crop_h = compute_crop_size(
        src_w=int(src_w),
        src_h=int(src_h),
        target_w=int(out_w),
        target_h=int(out_h),
    )

    # Camera center estimation
    fallback_x = float(src_w) / 2.0
    fallback_y = float(src_h) * 0.62  # mild speaker bias

    (cx0, cy0), (cx1, cy1) = estimate_clip_centers_from_samples(
        camera_samples=camera_samples or [],
        clip_start=float(clip_start),
        clip_end=float(clip_end),
        fallback_x=fallback_x,
        fallback_y=fallback_y,
    )

    x_expr, y_expr = build_crop_pan_expressions(
        src_w=int(src_w),
        src_h=int(src_h),
        crop_w=int(crop_w),
        crop_h=int(crop_h),
        clip_duration=float(clip_dur),
        center0=(float(cx0), float(cy0)),
        center1=(float(cx1), float(cy1)),
    )

    # Build filter chain:
    #   crop -> scale -> fps -> (subs) -> (watermark)
    vf_parts = [
        f"crop={int(crop_w)}:{int(crop_h)}:{x_expr}:{y_expr}",
        f"scale={int(out_w)}:{int(out_h)}",
        f"fps={int(RENDER_FPS)}",
    ]

    ass_path = None
    if captions_enabled:
        # expects these helpers to exist in the worker:
        # build_ass_subtitles_for_clip, write_ass_file
        ass_text = build_ass_subtitles_for_clip(
            words_all=words_all,
            source_h=float(src_h),
            clip_start=float(clip_start),
            clip_end=float(clip_end),
            target_w=int(out_w),
            target_h=int(out_h),
            camera_samples=camera_samples or [],
            caption_style_json=caption_style_json,
        )
        ass_path = write_ass_file(ass_text=ass_text, job_id=job_id, suffix=".ass")
        vf_parts.append(build_subtitles_filter(ass_path))

    if watermark_enabled:
        vf_parts.append(build_watermark_filter(out_w=int(out_w), out_h=int(out_h)))

    vf = ",".join(vf_parts)

    out_path = make_tmp_file(".mp4")

    log(
        f"Rendering clip {clip_start:.2f}-{clip_end:.2f}s -> {out_w}x{out_h}",
        job_id=job_id,
    )

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-ss", f"{float(clip_start):.6f}",
        "-t", f"{float(clip_dur):.6f}",
        "-i", str(source_video),
        "-vf", vf,
        "-c:v", "libx264",
        "-profile:v", str(RENDER_VIDEO_PROFILE),
        "-pix_fmt", str(RENDER_PIX_FMT),
        "-preset", str(RENDER_PRESET),
        "-crf", str(int(RENDER_CRF)),
        "-r", str(int(RENDER_FPS)),
        "-c:a", "aac",
        "-b:a", str(RENDER_AUDIO_BITRATE),
        "-movflags", "+faststart",
        str(out_path),
    ]

    try:
        run_subprocess(cmd, timeout=int(RENDER_TIMEOUT), desc="ffmpeg render clip")
    except Exception as e:
        safe_unlink(out_path)
        raise RuntimeError(f"Render failed: {e}")
    finally:
        if ass_path is not None:
            safe_unlink(ass_path)

    if not out_path.exists() or out_path.stat().st_size <= 0:
        safe_unlink(out_path)
        raise RuntimeError("Render produced empty output file")

    return {
        "path": out_path,
        "duration": float(clip_dur),
        "out_w": int(out_w),
        "out_h": int(out_h),
    }

# -----------------------------------------------------
# Upload rendered artifact back to storage
# -----------------------------------------------------

def upload_rendered_clip(
    *,
    local_path: "Path",
    dest_storage_key: str,
    job_id: int,
) -> None:
    storage = get_storage()
    log(f"Uploading rendered clip -> {dest_storage_key}", job_id=job_id)

    try:
        with open(local_path, "rb") as f:
            storage.save(dest_storage_key, f)
    except Exception as e:
        raise RuntimeError(f"Failed to upload rendered clip: {e}")

# =====================================================
# END SECTION 8 / 10
# =====================================================

# =====================================================
# Clipforge Worker — FINAL (Section 9 / 10)
# DB Persistence + Credits + Job Finalization (SCHEMA-CORRECT for your DB)
#
# Matches your ACTUAL SQLite schema:
# jobs:
#  - id, upload_id, status, error, created_at, updated_at,
#    aspect_ratio, captions_enabled, watermark_enabled, caption_style_json
# uploads (expected):
#  - id, user_id, storage_key, original_filename, created_at, ...
# clips:
#  - id, upload_id (NOT NULL), job_id, storage_key,
#    start_time, end_time, duration, title
#
# Key fixes:
# - NO jobs.storage_key usage (it does NOT exist)
# - Always JOIN jobs.upload_id -> uploads.storage_key + uploads.user_id
# - Insert clips with upload_id + start_time/end_time/duration (NOT start/end)
# - No user_id/rank/quality_score columns assumed on clips table
# - Watermark forced ON for free users (conservative, launch-safe)
# =====================================================

import math
from typing import Any, Optional, Dict, List, Tuple

# -----------------------------------------------------
# Credits policy
# -----------------------------------------------------

# 1 credit per started minute of SOURCE video (ceil(duration/60)). Minimum 1.
CREDITS_PER_MINUTE = float(os.getenv("WORKER_CREDITS_PER_MINUTE", "1.0"))
MIN_CREDITS_PER_JOB = int(os.getenv("WORKER_MIN_CREDITS_PER_JOB", "1"))

# -----------------------------------------------------
# DB helpers (schema-correct)
# -----------------------------------------------------

def fetch_job_and_upload_row(db, job_id: int) -> Dict[str, Any]:
    """
    Returns a dict with:
      - job.* fields (from jobs table)
      - upload.user_id, upload.storage_key, upload.original_filename
    """
    sql = """
        SELECT
            j.id                  AS job_id,
            j.upload_id           AS upload_id,
            j.status              AS status,
            j.error               AS error,
            j.created_at          AS created_at,
            j.updated_at          AS updated_at,
            j.aspect_ratio        AS aspect_ratio,
            j.captions_enabled    AS captions_enabled,
            j.watermark_enabled   AS watermark_enabled,
            j.caption_style_json  AS caption_style_json,

            u.user_id             AS user_id,
            u.storage_key         AS source_storage_key,
            u.original_filename   AS original_filename
        FROM jobs j
        JOIN uploads u ON u.id = j.upload_id
        WHERE j.id = :job_id
        LIMIT 1
    """
    row = db.execute(text(sql), {"job_id": int(job_id)}).mappings().fetchone()
    if not row:
        raise RuntimeError("Job not found or missing upload row (jobs.upload_id join failed)")
    d = dict(row)

    # Defensive defaults
    d["aspect_ratio"] = (d.get("aspect_ratio") or "9:16")
    d["captions_enabled"] = bool(d.get("captions_enabled", True))
    d["watermark_enabled"] = bool(d.get("watermark_enabled", True))
    return d

def fetch_user_plan_and_credits(db, user_id: int) -> Tuple[str, int]:
    row = db.execute(
        text("SELECT plan, credits FROM users WHERE id = :uid LIMIT 1"),
        {"uid": int(user_id)},
    ).fetchone()
    if not row:
        raise RuntimeError("User not found")
    plan = str(row[0] or "free")
    credits = int(row[1] or 0)
    return plan, credits

def update_user_credits(db, user_id: int, new_credits: int) -> None:
    db.execute(
        text("UPDATE users SET credits = :c WHERE id = :uid"),
        {"c": int(new_credits), "uid": int(user_id)},
    )

def compute_required_credits(source_duration_seconds: float) -> int:
    minutes = max(0.0, float(source_duration_seconds) / 60.0)
    raw = int(math.ceil(minutes * CREDITS_PER_MINUTE))
    return max(MIN_CREDITS_PER_JOB, raw)

def is_paid_plan(plan: str) -> bool:
    """
    Conservative: only explicit paid-like strings count as paid.
    Everything else is treated as free (watermark forced on).
    """
    p = (plan or "").strip().lower()
    return p in {"paid", "pro", "creator", "studio", "premium"}

def charge_credits_or_fail(
    *,
    db,
    user_id: Optional[int],
    required_credits: int,
    job_id: int,
) -> bool:
    """
    Deduct credits (launch-safe single-writer).
    Returns True if charged, False if user_id missing (skip charging).
    Raises if insufficient credits.
    """
    if user_id is None:
        log("No user_id for job; skipping credits charge", job_id=job_id)
        return False

    _plan, credits = fetch_user_plan_and_credits(db, int(user_id))
    if credits < int(required_credits):
        raise RuntimeError(f"Insufficient credits. Need {required_credits}, have {credits}.")

    update_user_credits(db, int(user_id), int(credits) - int(required_credits))
    return True

def refund_credits_best_effort(
    *,
    user_id: Optional[int],
    credits: int,
    job_id: int,
) -> None:
    if user_id is None or int(credits) <= 0:
        return
    try:
        with SessionLocal() as db:
            plan, cur = fetch_user_plan_and_credits(db, int(user_id))
            update_user_credits(db, int(user_id), int(cur) + int(credits))
            db.commit()
        log(f"Refunded {credits} credits (best-effort)", job_id=job_id)
    except Exception:
        log("Credit refund failed (best-effort)", job_id=job_id)

# -----------------------------------------------------
# Clip persistence (schema-correct)
# -----------------------------------------------------

def delete_existing_clips_for_job_best_effort(db, job_id: int) -> None:
    try:
        db.execute(text("DELETE FROM clips WHERE job_id = :jid"), {"jid": int(job_id)})
    except Exception:
        pass

def insert_clip_row_schema_correct(
    *,
    db,
    job_id: int,
    upload_id: int,
    storage_key: str,
    start_time: float,
    end_time: float,
    duration: float,
    title: str,
) -> None:
    """
    Inserts into your clips schema exactly:
      (upload_id NOT NULL, job_id, storage_key, start_time, end_time, duration, title)
    """
    sql = """
        INSERT INTO clips
            (upload_id, job_id, storage_key, start_time, end_time, duration, title)
        VALUES
            (:upload_id, :job_id, :storage_key, :start_time, :end_time, :duration, :title)
    """
    db.execute(
        text(sql),
        {
            "upload_id": int(upload_id),
            "job_id": int(job_id),
            "storage_key": str(storage_key),
            "start_time": float(start_time),
            "end_time": float(end_time),
            "duration": float(duration),
            "title": str(title or ""),
        },
    )

# -----------------------------------------------------
# Job status updates (granular)
# -----------------------------------------------------

def set_job_running_stage(db, job_id: int, stage: str) -> None:
    update_job_status(db, job_id, f"running:{stage}", None)

def set_job_done(db, job_id: int) -> None:
    update_job_status(db, job_id, "done", None)

def set_job_failed(db, job_id: int, error: str) -> None:
    update_job_status(db, job_id, "failed", error)

# -----------------------------------------------------
# Render + upload + persist clips
# -----------------------------------------------------

def render_upload_and_persist_top_clips(
    *,
    job_id: int,
    upload_id: int,
    user_id: int,
    source_path: Path,
    src_w: int,
    src_h: int,
    source_duration: float,
    aspect_ratio: str,
    captions_enabled: bool,
    watermark_enabled: bool,
    caption_style_json: Any,
    words_all: list,
    camera_samples: list,
    selected_clips: list,
) -> List[Dict[str, Any]]:
    """
    For each selected clip plan:
      - render mp4
      - upload to storage
      - insert clip row (schema-correct)
    Returns persisted clip metadata list.
    """
    persisted: List[Dict[str, Any]] = []

    storage_prefix = f"users/{int(user_id)}/clips/{int(job_id)}"

    with SessionLocal() as db:
        delete_existing_clips_for_job_best_effort(db, job_id)

        for idx, clip in enumerate(selected_clips):
            s = float(clip["start"])
            e = float(clip["end"])
            dur = max(0.01, e - s)

            title = str(clip.get("title") or "")
            if not title:
                title = "New clip"

            rendered = render_clip_mp4(
                source_video=source_path,
                clip_start=s,
                clip_end=e,
                src_w=int(src_w),
                src_h=int(src_h),
                aspect_ratio=str(aspect_ratio or "9:16"),
                camera_samples=camera_samples,
                captions_enabled=bool(captions_enabled),
                caption_style_json=caption_style_json,
                words_all=words_all,
                watermark_enabled=bool(watermark_enabled),
                job_id=job_id,
            )

            local_mp4: Path = rendered["path"]
            clip_uuid = uuid.uuid4().hex[:10]
            dest_key = f"{storage_prefix}/{idx+1:02d}_{clip_uuid}.mp4"

            try:
                upload_rendered_clip(
                    local_path=local_mp4,
                    dest_storage_key=dest_key,
                    job_id=job_id,
                )
            finally:
                safe_unlink(local_mp4)

            insert_clip_row_schema_correct(
                db=db,
                job_id=int(job_id),
                upload_id=int(upload_id),
                storage_key=dest_key,
                start_time=float(s),
                end_time=float(e),
                duration=float(dur),
                title=str(title),
            )

            persisted.append(
                {
                    "start_time": float(s),
                    "end_time": float(e),
                    "duration": float(dur),
                    "title": str(title),
                    "storage_key": str(dest_key),
                }
            )

        db.commit()

    return persisted

# -----------------------------------------------------
# Main job runner (updated to schema)
# -----------------------------------------------------

def run_job(job_id: int) -> None:
    """
    Full launch-safe execution for one job:
      - load job + upload config (JOIN)
      - download + preflight
      - compute credits + deduct
      - run pipeline: audio -> whisper -> segmentation -> reframing -> scoring -> topK
      - render topK -> upload -> persist clips (schema-correct)
      - mark done
      - refund credits if failure
    """
    credits_charged = False
    credits_amount = 0

    job_user_id: Optional[int] = None
    upload_id: Optional[int] = None
    storage_key: Optional[str] = None

    aspect_ratio = "9:16"
    captions_enabled = True
    watermark_enabled = True
    caption_style_json = None

    # -----------------------------
    # Load job + upload config (JOIN)
    # -----------------------------
    with SessionLocal() as db:
        jr = fetch_job_and_upload_row(db, int(job_id))

        upload_id = int(jr["upload_id"])
        job_user_id = int(jr["user_id"])
        storage_key = str(jr["source_storage_key"] or "").strip()
        if not storage_key:
            raise RuntimeError("Upload missing storage_key (uploads.storage_key empty)")

        aspect_ratio = str(jr.get("aspect_ratio") or "9:16")
        captions_enabled = bool(jr.get("captions_enabled", True))
        watermark_enabled = bool(jr.get("watermark_enabled", True))
        caption_style_json = jr.get("caption_style_json", None)

        # Force watermark ON for free users (launch policy)
        plan, _credits = fetch_user_plan_and_credits(db, int(job_user_id))
        if not is_paid_plan(plan):
            watermark_enabled = True

        set_job_running_stage(db, int(job_id), "download")
        db.commit()

    # -----------------------------
    # Download + preflight
    # -----------------------------
    source_path = download_source_video(storage_key=str(storage_key), job_id=int(job_id))

    try:
        with SessionLocal() as db:
            set_job_running_stage(db, int(job_id), "preflight")
            db.commit()

        src_w, src_h, source_duration = preflight_source_video(
            source_path=source_path,
            job_id=int(job_id),
        )

        # -----------------------------
        # Credits charge (based on source duration)
        # -----------------------------
        credits_amount = compute_required_credits(source_duration)

        with SessionLocal() as db:
            set_job_running_stage(db, int(job_id), "billing")
            credits_charged = charge_credits_or_fail(
                db=db,
                user_id=job_user_id,
                required_credits=credits_amount,
                job_id=int(job_id),
            )
            db.commit()

        # -----------------------------
        # Audio
        # -----------------------------
        with SessionLocal() as db:
            set_job_running_stage(db, int(job_id), "audio")
            db.commit()

        audio = run_audio_pipeline(source_video=source_path, job_id=int(job_id))
        wav_path: Path = audio["wav_path"]

        try:
            # -----------------------------
            # Transcription
            # -----------------------------
            with SessionLocal() as db:
                set_job_running_stage(db, int(job_id), "transcribe")
                db.commit()

            transcript = normalize_transcript(
                transcribe_audio(wav_path=wav_path, job_id=int(job_id))
            )
            words_all = extract_words(transcript)

            # -----------------------------
            # Segmentation
            # -----------------------------
            with SessionLocal() as db:
                set_job_running_stage(db, int(job_id), "segment")
                db.commit()

            utterances = build_utterances(words_all)
            clip_plans = generate_clip_plans(
                utterances=utterances,
                silences=audio["silences"],
                video_duration=float(source_duration),
            )

            # -----------------------------
            # Reframing samples
            # -----------------------------
            with SessionLocal() as db:
                set_job_running_stage(db, int(job_id), "reframe")
                db.commit()

            target_w, target_h = aspect_to_target(str(aspect_ratio or "9:16"))
            _cam_x, _cam_y, cam_samples, _cam_meta = build_camera_path(
                source_video=source_path,
                job_id=int(job_id),
                target_w=int(target_w),
                target_h=int(target_h),
            )
            motion_metrics = compute_motion_metrics(cam_samples)

            # -----------------------------
            # Scoring + titles + topK
            # -----------------------------
            with SessionLocal() as db:
                set_job_running_stage(db, int(job_id), "score")
                db.commit()

            enriched = []
            for clip in clip_plans:
                clip = compute_clip_quality_score(
                    clip=clip,
                    words=words_all,
                    silences=audio["silences"],
                    audio_energy=float(audio["energy"]),
                    motion_metrics=motion_metrics,
                )

                cw = words_in_range(words_all, float(clip["start"]), float(clip["end"]))
                snippet = clean_text(" ".join(w["word"] for w in cw[:28]))
                title, conf = generate_title_heuristic(snippet)

                if conf < HOOK_CONF_THRESHOLD:
                    llm_title = generate_title_llm(snippet)
                    if llm_title:
                        title, conf = llm_title, 0.8

                clip["title"] = title
                clip["hook_confidence"] = float(conf)
                enriched.append(clip)

            selected = select_top_k_clips(enriched)
            if not selected:
                raise RuntimeError("No clips selected after scoring")

            # -----------------------------
            # Render + upload + persist (schema-correct)
            # -----------------------------
            with SessionLocal() as db:
                set_job_running_stage(db, int(job_id), "render")
                db.commit()

            persisted = render_upload_and_persist_top_clips(
                job_id=int(job_id),
                upload_id=int(upload_id),
                user_id=int(job_user_id),
                source_path=source_path,
                src_w=int(src_w),
                src_h=int(src_h),
                source_duration=float(source_duration),
                aspect_ratio=str(aspect_ratio),
                captions_enabled=bool(captions_enabled),
                watermark_enabled=bool(watermark_enabled),
                caption_style_json=caption_style_json,
                words_all=words_all,
                camera_samples=cam_samples,
                selected_clips=selected,
            )

            with SessionLocal() as db:
                set_job_done(db, int(job_id))
                db.commit()

            log(f"Job done. Persisted {len(persisted)} clips.", job_id=int(job_id))

        finally:
            try:
                safe_unlink(wav_path)
            except Exception:
                pass

    except Exception as e:
        err = str(e) or "Job failed"
        log(err, job_id=int(job_id))

        try:
            with SessionLocal() as db:
                set_job_failed(db, int(job_id), err[:2000])
                db.commit()
        except Exception:
            pass

        if credits_charged and credits_amount > 0:
            refund_credits_best_effort(
                user_id=job_user_id,
                credits=credits_amount,
                job_id=int(job_id),
            )

        raise

    finally:
        try:
            safe_unlink(source_path)
        except Exception:
            pass

# =====================================================
# END SECTION 9 / 10
# =====================================================


# =====================================================
# Clipforge Worker — FINAL (Section 10 / 10)
# Main Loop Glue + Heartbeat + Stale Recovery (LAUNCH-READY)
#
# Fixes vs your current Section 10:
# - Heartbeat runs in a small background thread while a job is running,
#   so updated_at stays fresh during long steps (render/transcribe/etc).
# - Prevents stale reclaim from re-queuing an actively-running job.
# - Best-effort resilience: thread stops cleanly; no crash if heartbeat fails.
# =====================================================

import threading

def _job_heartbeat_loop(job_id: int, stop_evt: "threading.Event") -> None:
    """
    Sends periodic heartbeats for a single job until stop_evt is set.
    Runs in a daemon thread while run_job(job_id) is executing.
    """
    # jitter a little so multiple workers don't thump DB in lockstep (harmless even with 1)
    next_sleep = max(1.0, float(HEARTBEAT_INTERVAL))

    while not stop_evt.is_set():
        try:
            with SessionLocal() as db:
                heartbeat(db, job_id=job_id)
        except Exception:
            # best-effort: don't kill worker if heartbeat fails
            pass

        # Wait with stop awareness
        stop_evt.wait(timeout=next_sleep)

def main_loop() -> None:
    log("Worker starting")

    last_reclaim = 0.0

    while True:
        started = time.time()
        job_id: Optional[int] = None

        hb_stop: Optional["threading.Event"] = None
        hb_thread: Optional["threading.Thread"] = None

        try:
            # Periodic stale recovery (best-effort)
            now = time.time()
            if now - last_reclaim > 30:
                try:
                    with SessionLocal() as db:
                        reclaim_stale_jobs(db)
                    last_reclaim = now
                except Exception:
                    log("Stale reclaim failed (best-effort)")

            # Claim next job
            with SessionLocal() as db:
                job_id = claim_next_job(db)

            if job_id is None:
                time.sleep(POLL_INTERVAL)
                continue

            log("Job claimed", job_id=job_id)

            # Start per-job heartbeat thread so long run_job() phases don't go stale
            hb_stop = threading.Event()
            hb_thread = threading.Thread(
                target=_job_heartbeat_loop,
                args=(int(job_id), hb_stop),
                daemon=True,
            )
            hb_thread.start()

            # Run the actual job pipeline (Sections 2–9)
            run_job(int(job_id))

        except Exception as e:
            err = str(e) or "Unhandled worker exception"
            log(err, job_id=job_id, level="ERROR")
            try:
                log(traceback.format_exc(), job_id=job_id, level="ERROR")
            except Exception:
                pass

            # If run_job already marked failed, this is redundant but harmless.
            if job_id is not None:
                try:
                    with SessionLocal() as db:
                        update_job_status(db, int(job_id), "failed", err[:1000])
                except Exception:
                    pass

            time.sleep(min(2.0, POLL_INTERVAL))

        finally:
            # Stop heartbeat thread if it was started
            if hb_stop is not None:
                try:
                    hb_stop.set()
                except Exception:
                    pass
            if hb_thread is not None:
                try:
                    hb_thread.join(timeout=1.0)
                except Exception:
                    pass

            # Small floor to prevent busy spin
            elapsed = time.time() - started
            if elapsed < 0.10:
                time.sleep(0.10 - elapsed)

# -----------------------------------------------------
# Entrypoint
# -----------------------------------------------------

if __name__ == "__main__":
    main_loop()

# =====================================================
# END SECTION 10 / 10
# =====================================================
