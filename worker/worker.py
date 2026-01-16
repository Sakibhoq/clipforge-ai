import os
import time
import json
import uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, List, Dict, Any

from dotenv import load_dotenv

# Load root .env
load_dotenv(
    dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"),
    override=False,
)

from sqlalchemy import text
from core.database import SessionLocal
from models.user import User  # ensure models register
from models.upload import Upload
from models.job import Job
from models.clip import Clip
from storage import get_storage

POLL_INTERVAL = int(os.getenv("WORKER_POLL_INTERVAL", "2"))
TMP_DIR = Path("/tmp")

# Stale running-job recovery (seconds)
STALE_RUNNING_AFTER = int(os.getenv("WORKER_STALE_RUNNING_AFTER", "1800"))  # 30 min default

# Heartbeat interval while running (seconds)
HEARTBEAT_EVERY = int(os.getenv("WORKER_HEARTBEAT_EVERY", "10"))

# -----------------------------
# Output defaults (until UI/DB wiring exists)
# -----------------------------
# Aspect ratios supported now:
#   9:16 (default) -> 1080x1920
#   1:1            -> 1080x1080
#   4:3            -> 1440x1080
DEFAULT_ASPECT_RATIO = (os.getenv("CLIPFORGE_DEFAULT_ASPECT_RATIO", "9:16") or "9:16").strip()
DEFAULT_CAPTIONS_ON = (os.getenv("CLIPFORGE_DEFAULT_CAPTIONS_ON", "1") or "1").strip() not in (
    "0",
    "false",
    "False",
)

# Watermark (text) settings
WATERMARK_TEXT = os.getenv("CLIPFORGE_WATERMARK_TEXT", "Clipforge")
WATERMARK_FONTFILE = os.getenv(
    "CLIPFORGE_WATERMARK_FONTFILE",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)
WATERMARK_FONTSIZE = int(os.getenv("CLIPFORGE_WATERMARK_FONTSIZE", "34"))
WATERMARK_MARGIN = int(os.getenv("CLIPFORGE_WATERMARK_MARGIN", "28"))
WATERMARK_ALPHA = float(os.getenv("CLIPFORGE_WATERMARK_ALPHA", "0.70"))
WATERMARK_MOVE_EVERY = float(os.getenv("CLIPFORGE_WATERMARK_MOVE_EVERY", "5.0"))

# -----------------------------
# Caption styling (burned-in via libass)
# IMPORTANT: we generate ASS with PlayRes = target output size
# so captions look consistent (no “giant blown-up” captions).
# -----------------------------
CAPTION_FONTNAME = os.getenv("CLIPFORGE_CAPTION_FONTNAME", "DejaVu Sans")
CAPTION_FONTSIZE = int(os.getenv("CLIPFORGE_CAPTION_FONTSIZE", "56"))  # tuned for 1080x1920
CAPTION_OUTLINE = int(os.getenv("CLIPFORGE_CAPTION_OUTLINE", "5"))
CAPTION_SHADOW = int(os.getenv("CLIPFORGE_CAPTION_SHADOW", "2"))
CAPTION_MARGIN_V = int(os.getenv("CLIPFORGE_CAPTION_MARGIN_V", "140"))  # bottom safe area
CAPTION_MARGIN_H = int(os.getenv("CLIPFORGE_CAPTION_MARGIN_H", "90"))   # left/right safe area
CAPTION_BOLD = int(os.getenv("CLIPFORGE_CAPTION_BOLD", "1"))
CAPTION_MAX_CHARS_PER_LINE = int(os.getenv("CLIPFORGE_CAPTION_MAX_CHARS_PER_LINE", "22"))
CAPTION_MAX_LINES = int(os.getenv("CLIPFORGE_CAPTION_MAX_LINES", "2"))
CAPTION_MAX_WORDS_PER_CHUNK = int(os.getenv("CLIPFORGE_CAPTION_MAX_WORDS_PER_CHUNK", "10"))

# Caption pacing (tries to feel more like TikTok/Reels)
CAPTION_TARGET_CHUNK_SECONDS = float(os.getenv("CLIPFORGE_CAPTION_TARGET_CHUNK_SECONDS", "1.25"))
CAPTION_MAX_CHUNK_SECONDS = float(os.getenv("CLIPFORGE_CAPTION_MAX_CHUNK_SECONDS", "2.00"))
CAPTION_MIN_CHUNK_SECONDS = float(os.getenv("CLIPFORGE_CAPTION_MIN_CHUNK_SECONDS", "0.85"))

# -----------------------------
# Smart reframing (CPU) settings
# -----------------------------
REFRAME_ENABLED = (os.getenv("CLIPFORGE_REFRAME_ENABLED", "1") or "1").strip() not in (
    "0",
    "false",
    "False",
)

# Samples across clip
REFRAME_SAMPLES = int(os.getenv("CLIPFORGE_REFRAME_SAMPLES", "11"))
REFRAME_FACE_MIN_CONF = float(os.getenv("CLIPFORGE_REFRAME_FACE_MIN_CONF", "0.55"))

# Fallback pose detection settings
REFRAME_POSE_ENABLED = (os.getenv("CLIPFORGE_REFRAME_POSE_ENABLED", "1") or "1").strip() not in (
    "0",
    "false",
    "False",
)

# Bias and zoom controls
# Down bias keeps torso/hands more often
REFRAME_DOWN_BIAS_FACE_H = float(os.getenv("CLIPFORGE_REFRAME_DOWN_BIAS_FACE_H", "0.30"))
REFRAME_DOWN_BIAS_POSE_H = float(os.getenv("CLIPFORGE_REFRAME_DOWN_BIAS_POSE_H", "0.16"))

# Zoom controls:
# Desired face height fraction in the crop (smaller -> zoom OUT; larger -> zoom IN)
# NOTE: for native 16:9 -> 9:16, over-zoom is the #1 “looks bad” failure.
REFRAME_FACE_TARGET_FRACTION = float(os.getenv("CLIPFORGE_REFRAME_FACE_TARGET_FRACTION", "0.18"))
# Desired shoulder width fraction in crop width (pose fallback)
REFRAME_SHOULDERS_TARGET_FRACTION = float(os.getenv("CLIPFORGE_REFRAME_SHOULDERS_TARGET_FRACTION", "0.58"))

# Clamp crop size as a fraction of the source dimension (prevents extreme zoom)
REFRAME_MIN_CROP_H_FRAC = float(os.getenv("CLIPFORGE_REFRAME_MIN_CROP_H_FRAC", "0.62"))
REFRAME_MAX_CROP_H_FRAC = float(os.getenv("CLIPFORGE_REFRAME_MAX_CROP_H_FRAC", "1.00"))

# Smooth pan / v1.5 tracking (still CPU):
REFRAME_SMOOTH_PAN = (os.getenv("CLIPFORGE_REFRAME_SMOOTH_PAN", "1") or "1").strip() not in (
    "0",
    "false",
    "False",
)
REFRAME_PAN_MIN_PX = int(os.getenv("CLIPFORGE_REFRAME_PAN_MIN_PX", "80"))  # ignore tiny jitter

# MediaPipe detector reuse (avoid re-creating for every sampled frame)
_FACE_DET = None
_POSE_DET = None


def log(msg: str):
    print(msg, flush=True)


def claim_job(db):
    """
    Claim exactly one queued job atomically.

    Primary strategy:
      UPDATE ... RETURNING id
    Fallback strategy:
      SELECT queued id -> UPDATE if still queued
    """
    try:
        row = db.execute(
            text(
                """
                UPDATE jobs
                SET status = 'running'
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
        return row[0] if row else None
    except Exception:
        db.rollback()

    # Fallback (portable)
    try:
        job_id_row = db.execute(
            text(
                """
                SELECT id FROM jobs
                WHERE status = 'queued'
                ORDER BY id ASC
                LIMIT 1
                """
            )
        ).fetchone()
        if not job_id_row:
            db.commit()
            return None

        job_id = int(job_id_row[0])
        updated = db.execute(
            text(
                """
                UPDATE jobs
                SET status = 'running'
                WHERE id = :id AND status = 'queued'
                """
            ),
            {"id": job_id},
        )
        db.commit()
        if getattr(updated, "rowcount", 0) == 1:
            return job_id
        return None
    except Exception:
        db.rollback()
        return None


def heartbeat(db, job_id: int):
    """
    Best-effort heartbeat: explicitly bump updated_at.
    Works on SQLite/Postgres.
    """
    try:
        db.execute(
            text(
                """
                UPDATE jobs
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = :id
                """
            ),
            {"id": job_id},
        )
        db.commit()
    except Exception:
        db.rollback()


def reclaim_stale_running_jobs(db):
    """
    Requeue jobs that have been 'running' too long (crashed worker, killed container, etc.)
    Uses a Python-side timestamp cutoff (portable SQL).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=STALE_RUNNING_AFTER)
    try:
        db.execute(
            text(
                """
                UPDATE jobs
                SET status = 'queued',
                    error = 'Requeued stale running job'
                WHERE status = 'running'
                  AND updated_at IS NOT NULL
                  AND updated_at < :cutoff
                """
            ),
            {"cutoff": cutoff},
        )
        db.commit()
    except Exception:
        db.rollback()


def generate_clip_segments(transcript: dict):
    # TODO: upgrade to “interestingness / hook detection” later.
    MIN_CLIP = 30.0
    MAX_CLIP = 60.0

    segs = transcript.get("segments", []) or []
    clips = []
    if not segs:
        return clips

    clip_start = None
    clip_end = None

    for seg in segs:
        s = float(seg["start"])
        e = float(seg["end"])

        if clip_start is None:
            clip_start = s
            clip_end = e
            continue

        if (e - clip_start) > MAX_CLIP:
            dur = clip_end - clip_start
            if dur >= MIN_CLIP:
                clips.append({"start": clip_start, "end": clip_end, "duration": dur})
            clip_start = s
            clip_end = e
        else:
            clip_end = e

    if clip_start is not None and clip_end is not None:
        dur = clip_end - clip_start
        if dur >= MIN_CLIP:
            clips.append({"start": clip_start, "end": clip_end, "duration": dur})

    return clips


def _get_watermark_effective(db, upload: Upload) -> bool:
    """
    Policy:
      - Watermark ON by default for everyone (including paid)
      - Free users: forced ON
      - Paid users: can toggle OFF later via user.watermark_enabled (if/when added)
        (If field doesn't exist, default to ON.)
    """
    user = None
    try:
        user = db.query(User).filter(User.id == upload.user_id).first()
    except Exception:
        user = None

    plan = (getattr(user, "plan", None) or "free").lower()
    if plan == "free":
        return True

    pref = getattr(user, "watermark_enabled", True)
    return bool(pref)


def _normalize_aspect(v: str) -> str:
    v = (v or "").strip()
    if v in ("9:16", "1:1", "4:3"):
        return v
    return "9:16"


def _target_dimensions(aspect: str) -> tuple[int, int]:
    if aspect == "1:1":
        return (1080, 1080)
    if aspect == "4:3":
        return (1440, 1080)
    return (1080, 1920)  # 9:16


def _srt_time(t: float) -> str:
    if t < 0:
        t = 0.0
    ms = int(round(t * 1000.0))
    hh = ms // 3600000
    ms -= hh * 3600000
    mm = ms // 60000
    ms -= mm * 60000
    ss = ms // 1000
    ms -= ss * 1000
    return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"


def _ass_time(t: float) -> str:
    # ASS uses H:MM:SS.cc (centiseconds)
    if t < 0:
        t = 0.0
    cs = int(round(t * 100.0))
    hh = cs // 360000
    cs -= hh * 360000
    mm = cs // 6000
    cs -= mm * 6000
    ss = cs // 100
    cs -= ss * 100
    return f"{hh:d}:{mm:02d}:{ss:02d}.{cs:02d}"


def _wrap_caption_text(text_in: str, max_chars: int, max_lines: int) -> str:
    """
    Hard-wrap by words into <= max_lines, <= max_chars per line.
    """
    text_in = (text_in or "").strip()
    if not text_in:
        return ""

    words = text_in.split()
    lines: List[str] = []
    cur = ""

    for w in words:
        if not cur:
            cur = w
            continue
        if len(cur) + 1 + len(w) <= max_chars:
            cur += " " + w
        else:
            lines.append(cur)
            cur = w

    if cur:
        lines.append(cur)

    if len(lines) > max_lines:
        kept = lines[: max_lines - 1]
        last = " ".join(lines[max_lines - 1 :])
        kept.append(last)
        lines = kept

    return "\n".join(lines)


def _safe_float(x, default=0.0) -> float:
    try:
        return float(x)
    except Exception:
        return float(default)


def _escape_filter_path(p: Path) -> str:
    s = str(p)
    s = s.replace("\\", "\\\\")
    s = s.replace(":", "\\:")
    s = s.replace("'", "\\'")
    return s


def _build_subtitles_filter(ass_path: Path) -> str:
    ass_escaped = _escape_filter_path(ass_path)
    return f"subtitles='{ass_escaped}'"


def _build_watermark_filter() -> str:
    """
    Watermark:
      - text only (no box)
      - moves every N seconds between corners
    """
    text_escaped = WATERMARK_TEXT.replace(":", "\\:").replace("'", "\\'")
    margin = WATERMARK_MARGIN
    move = max(1.0, float(WATERMARK_MOVE_EVERY))

    # Cycle corners: 0 TL, 1 TR, 2 BR, 3 BL
    idx = f"mod(floor(t/{move}),4)"

    x_expr = (
        f"if(eq({idx},0),{margin},"
        f"if(eq({idx},1),w-tw-{margin},"
        f"if(eq({idx},2),w-tw-{margin},{margin})))"
    )
    y_expr = (
        f"if(eq({idx},0),{margin},"
        f"if(eq({idx},1),{margin},"
        f"if(eq({idx},2),h-th-{margin},h-th-{margin})))"
    )

    return (
        f"drawtext=fontfile='{WATERMARK_FONTFILE}':"
        f"text='{text_escaped}':"
        f"fontsize={WATERMARK_FONTSIZE}:"
        f"fontcolor=white@{WATERMARK_ALPHA}:"
        f"x='{x_expr}':y='{y_expr}'"
    )


def _probe_video_size_and_rotation(path: Path) -> tuple[int, int, int]:
    """
    Returns (w, h, rotation_degrees).
    We use this to avoid “wrong aspect” issues due to rotate metadata.
    """
    import subprocess

    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:stream_tags=rotate:side_data_list",
        "-of",
        "json",
        str(path),
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.decode(errors="ignore"))
    data = json.loads(res.stdout.decode("utf-8", errors="ignore") or "{}")
    streams = data.get("streams") or []
    if not streams:
        raise RuntimeError("ffprobe: no video stream found")

    s0 = streams[0]
    w = int(s0.get("width") or 0)
    h = int(s0.get("height") or 0)
    if w <= 0 or h <= 0:
        raise RuntimeError("ffprobe: invalid dimensions")

    rot = 0
    try:
        tags = s0.get("tags") or {}
        if "rotate" in tags:
            rot = int(float(tags["rotate"]))
    except Exception:
        rot = 0

    # Some ffprobe builds put rotation in side_data_list
    if rot == 0:
        try:
            sdl = s0.get("side_data_list") or []
            for sd in sdl:
                if isinstance(sd, dict) and sd.get("side_data_type") in (
                    "Display Matrix",
                    "Display Matrix Side Data",
                ):
                    r = sd.get("rotation")
                    if r is not None:
                        rot = int(float(r))
                        break
        except Exception:
            rot = 0

    rot = rot % 360
    return w, h, rot


def _display_dims(w: int, h: int, rot: int) -> tuple[int, int]:
    if rot in (90, 270):
        return h, w
    return w, h


def _clamp(v: float, lo: float, hi: float) -> float:
    if v < lo:
        return lo
    if v > hi:
        return hi
    return v


def _median(vals: List[float]) -> Optional[float]:
    if not vals:
        return None
    vs = sorted(vals)
    n = len(vs)
    mid = n // 2
    if n % 2 == 1:
        return float(vs[mid])
    return float((vs[mid - 1] + vs[mid]) / 2.0)


def _mad(vals: List[float], med: float) -> float:
    if not vals:
        return 0.0
    dev = [abs(v - med) for v in vals]
    m = _median(dev)
    return float(m or 0.0)


def _robust_center(points: List[Tuple[float, float, float]]) -> Optional[Tuple[float, float, float]]:
    """
    points: list of (cx, cy, scale_hint) where scale_hint ~ face_h or shoulder_w
    Returns robust (cx, cy, scale_hint) after outlier rejection.
    """
    if not points:
        return None

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    ss = [p[2] for p in points]

    mx = _median(xs)
    my = _median(ys)
    ms = _median(ss)

    if mx is None or my is None:
        return None

    madx = _mad(xs, mx)
    mady = _mad(ys, my)

    keep: List[Tuple[float, float, float]] = []
    for (x, y, s) in points:
        okx = True if madx < 1e-6 else (abs(x - mx) <= 3.5 * madx)
        oky = True if mady < 1e-6 else (abs(y - my) <= 3.5 * mady)
        if okx and oky:
            keep.append((x, y, s))

    if not keep:
        keep = points

    xs2 = [p[0] for p in keep]
    ys2 = [p[1] for p in keep]
    ss2 = [p[2] for p in keep]

    mx2 = _median(xs2)
    my2 = _median(ys2)
    ms2 = _median(ss2) if ss2 else None

    if mx2 is None or my2 is None:
        return None

    return (float(mx2), float(my2), float(ms2 or 0.0))


def _iter_sample_frame_indices(total_frames: int, start_f: int, end_f: int, n: int) -> List[int]:
    if total_frames <= 0:
        return []
    start_f = int(_clamp(start_f, 0, total_frames - 1))
    end_f = int(_clamp(end_f, 0, total_frames - 1))
    if end_f <= start_f:
        end_f = min(total_frames - 1, start_f + 1)

    n = max(3, min(int(n), 25))
    span = max(1, end_f - start_f)
    idxs = [start_f + int(i * span / float(n - 1)) for i in range(n)]
    out: List[int] = []
    seen = set()
    for i in idxs:
        i2 = int(_clamp(i, 0, total_frames - 1))
        if i2 not in seen:
            out.append(i2)
            seen.add(i2)
    return out


def _ensure_detectors():
    """
    Lazily initialize MediaPipe detectors to reduce per-frame overhead.
    """
    global _FACE_DET, _POSE_DET
    if _FACE_DET is None:
        import mediapipe as mp

        mp_face = mp.solutions.face_detection
        # model_selection=1 is broader range (works better on general footage)
        _FACE_DET = mp_face.FaceDetection(model_selection=1, min_detection_confidence=REFRAME_FACE_MIN_CONF)

    if _POSE_DET is None and REFRAME_POSE_ENABLED:
        import mediapipe as mp

        mp_pose = mp.solutions.pose
        _POSE_DET = mp_pose.Pose(
            static_image_mode=True,
            model_complexity=1,
            enable_segmentation=False,
        )


def _detect_face_points(frame_bgr, src_w: int, src_h: int):
    """
    Returns list of candidates: (cx, cy, face_h_px, confidence)
    """
    import cv2

    _ensure_detectors()
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    res = None
    try:
        res = _FACE_DET.process(rgb)
    except Exception:
        res = None

    out = []
    if not res or not getattr(res, "detections", None):
        return out

    for d in res.detections:
        score = float(d.score[0]) if getattr(d, "score", None) else 0.0
        loc = getattr(d, "location_data", None)
        if not loc or not getattr(loc, "relative_bounding_box", None):
            continue
        rb = loc.relative_bounding_box
        x = float(getattr(rb, "xmin", 0.0) or 0.0) * src_w
        y = float(getattr(rb, "ymin", 0.0) or 0.0) * src_h
        w = float(getattr(rb, "width", 0.0) or 0.0) * src_w
        h = float(getattr(rb, "height", 0.0) or 0.0) * src_h
        if w <= 2 or h <= 2:
            continue
        cx = x + w / 2.0
        cy = y + h / 2.0
        out.append((cx, cy, h, score))

    return out


def _detect_pose_point(frame_bgr, src_w: int, src_h: int):
    """
    Pose fallback:
      - Uses MediaPipe Pose landmarks
      - Returns a candidate center (cx, cy, shoulder_width_px, confidence-ish)
    """
    if not REFRAME_POSE_ENABLED:
        return None

    import cv2

    _ensure_detectors()
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    res = None
    try:
        res = _POSE_DET.process(rgb)
    except Exception:
        res = None

    if not res or not getattr(res, "pose_landmarks", None):
        return None

    lm = res.pose_landmarks.landmark

    def L(i):
        try:
            return lm[i]
        except Exception:
            return None

    nose = L(0)
    ls = L(11)
    rs = L(12)
    lh = L(23)
    rh = L(24)

    if not nose or not ls or not rs:
        return None

    vis = float(getattr(nose, "visibility", 0.0) or 0.0)
    vis = min(vis, float(getattr(ls, "visibility", 0.0) or 0.0))
    vis = min(vis, float(getattr(rs, "visibility", 0.0) or 0.0))

    cx = ((ls.x + rs.x) / 2.0) * src_w
    cy = ((ls.y + rs.y) / 2.0) * src_h

    sw = abs(ls.x - rs.x) * src_w
    if sw <= 2:
        return None

    if lh and rh:
        hips_y = ((lh.y + rh.y) / 2.0) * src_h
        body_h = abs(hips_y - cy)
        if body_h > 2:
            cy += REFRAME_DOWN_BIAS_POSE_H * body_h

    return (float(cx), float(cy), float(sw), float(vis))


def _compute_subject_for_window(
    input_path: Path,
    start: float,
    end: float,
    src_w: int,
    src_h: int,
    samples: int,
) -> Optional[Tuple[float, float, float, str]]:
    """
    Returns (cx, cy, scale_hint, kind)
      - kind="face": scale_hint ~ face_h_px
      - kind="pose": scale_hint ~ shoulder_w_px
    """
    if not REFRAME_ENABLED:
        return None

    try:
        import cv2
    except Exception:
        return None

    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        return None

    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    if fps <= 0.01 or total_frames <= 0:
        cap.release()
        return None

    start_f = int(max(0, min(total_frames - 1, round(start * fps))))
    end_f = int(max(0, min(total_frames - 1, round(end * fps))))
    idxs = _iter_sample_frame_indices(total_frames, start_f, end_f, samples)

    face_points: List[Tuple[float, float, float]] = []
    pose_points: List[Tuple[float, float, float]] = []

    cx0 = src_w / 2.0
    cy0 = src_h / 2.0

    for fi in idxs:
        cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue

        faces = []
        try:
            faces = _detect_face_points(frame, src_w, src_h)
        except Exception:
            faces = []

        if faces:
            best = None
            best_score = -1e9
            for (cx, cy, fh, conf) in faces:
                # prefer large, confident, near center face (avoid background faces)
                dist = abs(cx - cx0) + 0.7 * abs(cy - cy0)
                score = (fh * 1.25) + (conf * 120.0) - (dist * 0.02)
                if score > best_score:
                    best_score = score
                    best = (cx, cy, fh)
            if best is not None:
                cx, cy, fh = best
                cy += REFRAME_DOWN_BIAS_FACE_H * float(fh)
                face_points.append((float(cx), float(cy), float(fh)))
            continue

        p = None
        try:
            p = _detect_pose_point(frame, src_w, src_h)
        except Exception:
            p = None

        if p is not None:
            pcx, pcy, sw, _vis = p
            pose_points.append((float(pcx), float(pcy), float(sw)))

    cap.release()

    if face_points:
        rc = _robust_center(face_points)
        if rc:
            return (rc[0], rc[1], rc[2], "face")

    if pose_points:
        rc = _robust_center(pose_points)
        if rc:
            return (rc[0], rc[1], rc[2], "pose")

    return None


def _compute_crop_from_subject(
    src_w: int,
    src_h: int,
    tgt_w: int,
    tgt_h: int,
    cx: float,
    cy: float,
    scale_hint: float,
    hint_kind: str,
) -> Tuple[int, int, int, int]:
    """
    Compute crop box with smarter zoom based on face height / shoulder width.
    """
    tgt_aspect = tgt_w / float(tgt_h)

    # base crop: maximal crop that preserves aspect
    base_crop_h = src_h
    base_crop_w = int(round(base_crop_h * tgt_aspect))
    if base_crop_w > src_w:
        base_crop_w = src_w
        base_crop_h = int(round(base_crop_w / tgt_aspect))

    crop_h = float(base_crop_h)
    crop_w = float(base_crop_w)

    # smart zoom
    if scale_hint and scale_hint > 2:
        if hint_kind == "face":
            desired_crop_h = float(scale_hint) / max(0.05, REFRAME_FACE_TARGET_FRACTION)
            crop_h = desired_crop_h
            crop_w = crop_h * tgt_aspect
        elif hint_kind == "pose":
            desired_crop_w = float(scale_hint) / max(0.10, REFRAME_SHOULDERS_TARGET_FRACTION)
            crop_w = desired_crop_w
            crop_h = crop_w / tgt_aspect

    # clamp to prevent over-zoom
    min_h = max(40.0, REFRAME_MIN_CROP_H_FRAC * float(src_h))
    max_h = min(float(src_h), REFRAME_MAX_CROP_H_FRAC * float(src_h))
    crop_h = _clamp(crop_h, min_h, max_h)

    crop_w = crop_h * tgt_aspect
    if crop_w > src_w:
        crop_w = float(src_w)
        crop_h = crop_w / tgt_aspect

    crop_w = _clamp(crop_w, 40.0, float(src_w))
    crop_h = _clamp(crop_h, 40.0, float(src_h))

    cw = int(round(crop_w))
    ch = int(round(crop_h))

    if cw % 2 == 1:
        cw -= 1
    if ch % 2 == 1:
        ch -= 1
    cw = max(2, min(cw, src_w))
    ch = max(2, min(ch, src_h))

    x = int(round(cx - cw / 2.0))
    y = int(round(cy - ch / 2.0))

    x = int(_clamp(x, 0, max(0, src_w - cw)))
    y = int(_clamp(y, 0, max(0, src_h - ch)))

    return (x, y, cw, ch)


def _build_reframe_filter(
    input_path: Path,
    start: float,
    end: float,
    dur: float,
    src_w: int,
    src_h: int,
    tgt_w: int,
    tgt_h: int,
) -> str:
    """
    Smart reframing (best effort):
      - Compute robust subject for whole window and for halves
      - Choose smart crop box size (zoom)
      - If movement is meaningful, pan smoothly
      - Always scale to final target dims and setsar=1
    """
    subj_all = _compute_subject_for_window(input_path, start, end, src_w, src_h, REFRAME_SAMPLES)

    # fallback: scale-to-cover center crop
    if not subj_all:
        src_aspect = src_w / float(src_h)
        tgt_aspect = tgt_w / float(tgt_h)
        if src_aspect >= tgt_aspect:
            scale = f"scale=-2:{tgt_h}"
        else:
            scale = f"scale={tgt_w}:-2"
        crop = f"crop={tgt_w}:{tgt_h}:(in_w-{tgt_w})/2:(in_h-{tgt_h})/2"
        return f"{scale},{crop},setsar=1"

    cx_all, cy_all, scale_all, kind_all = subj_all

    x_all, y_all, cw, ch = _compute_crop_from_subject(
        src_w, src_h, tgt_w, tgt_h, cx_all, cy_all, scale_all, kind_all
    )

    if REFRAME_SMOOTH_PAN and dur > 0.8:
        mid = (start + end) / 2.0
        subj_a = _compute_subject_for_window(input_path, start, mid, src_w, src_h, max(5, REFRAME_SAMPLES // 2))
        subj_b = _compute_subject_for_window(input_path, mid, end, src_w, src_h, max(5, REFRAME_SAMPLES // 2))

        if subj_a and subj_b:
            cx1, cy1, _s1, _k1 = subj_a
            cx2, cy2, _s2, _k2 = subj_b

            x1 = int(_clamp(round(cx1 - cw / 2.0), 0, max(0, src_w - cw)))
            y1 = int(_clamp(round(cy1 - ch / 2.0), 0, max(0, src_h - ch)))
            x2 = int(_clamp(round(cx2 - cw / 2.0), 0, max(0, src_w - cw)))
            y2 = int(_clamp(round(cy2 - ch / 2.0), 0, max(0, src_h - ch)))

            dx = abs(x2 - x1)
            dy = abs(y2 - y1)

            if dx >= REFRAME_PAN_MIN_PX or dy >= REFRAME_PAN_MIN_PX:
                d = max(0.01, float(dur))
                x_expr = f"({x1}) + ({x2 - x1})*min(max(t,0),{d})/{d}"
                y_expr = f"({y1}) + ({y2 - y1})*min(max(t,0),{d})/{d}"
                crop = f"crop={cw}:{ch}:x='{x_expr}':y='{y_expr}'"
                return f"{crop},scale={tgt_w}:{tgt_h},setsar=1"

    crop = f"crop={cw}:{ch}:{x_all}:{y_all}"
    return f"{crop},scale={tgt_w}:{tgt_h},setsar=1"


def _extract_words_from_whisper(transcript: dict) -> Optional[List[Dict[str, Any]]]:
    """
    If Whisper returns word timestamps, normalize them into a flat list:
      [{ "start":..., "end":..., "word":... }, ...]
    """
    segs = transcript.get("segments") or []
    if not isinstance(segs, list) or not segs:
        return None

    words_out: List[Dict[str, Any]] = []

    for seg in segs:
        ws = seg.get("words")
        if not ws or not isinstance(ws, list):
            continue
        for w in ws:
            st = w.get("start")
            en = w.get("end")
            wd = w.get("word")
            if st is None or en is None or wd is None:
                continue
            words_out.append({"start": _safe_float(st), "end": _safe_float(en), "word": str(wd)})

    if not words_out:
        return None

    words_out.sort(key=lambda x: float(x.get("start", 0.0)))
    return words_out


def _chunk_words_to_captions(
    words: List[Dict[str, Any]],
    clip_start: float,
    clip_end: float,
) -> List[Dict[str, Any]]:
    """
    Turn word-level timestamps into better-paced caption blocks.
    Returns: [{start, end, text}]
    """
    if not words:
        return []

    out: List[Dict[str, Any]] = []
    w2 = [w for w in words if float(w["end"]) > clip_start and float(w["start"]) < clip_end]
    if not w2:
        return []

    i = 0
    n = len(w2)

    while i < n:
        i0 = i
        st = max(clip_start, float(w2[i]["start"]))
        text_parts: List[str] = []
        last_end = st

        while i < n:
            w = w2[i]
            ws = float(w["start"])
            we = float(w["end"])
            word = str(w["word"]).strip()
            if word.startswith(" "):
                word = word.strip()

            if we <= clip_start:
                i += 1
                continue
            if ws >= clip_end:
                break

            if word:
                text_parts.append(word)
            last_end = min(clip_end, we)

            dur = last_end - st
            raw_len = len(" ".join(text_parts))
            if len(text_parts) >= CAPTION_MAX_WORDS_PER_CHUNK:
                i += 1
                break
            if dur >= CAPTION_TARGET_CHUNK_SECONDS and raw_len >= int(CAPTION_MAX_CHARS_PER_LINE * 1.1):
                i += 1
                break
            if dur >= CAPTION_MAX_CHUNK_SECONDS:
                i += 1
                break

            i += 1

        # Ensure progress
        if i == i0:
            i += 1

        en = max(st + CAPTION_MIN_CHUNK_SECONDS, last_end)
        en = min(en, clip_end)

        raw = " ".join([p for p in text_parts if p]).strip()
        raw = raw.replace("  ", " ")
        if raw:
            out.append({"start": st, "end": en, "text": raw})

    return out


def _segments_to_captions(transcript: dict, clip_start: float, clip_end: float) -> List[Dict[str, Any]]:
    """
    Fallback captions from Whisper segments if word timestamps aren't present.
    """
    segs = transcript.get("segments", []) or []
    out: List[Dict[str, Any]] = []
    for seg in segs:
        s = _safe_float(seg.get("start", 0.0))
        e = _safe_float(seg.get("end", 0.0))
        txt = (seg.get("text") or "").strip()
        if not txt:
            continue
        if e <= clip_start or s >= clip_end:
            continue
        st = max(clip_start, s)
        en = min(clip_end, e)
        if en <= st + 0.05:
            continue
        out.append({"start": st, "end": en, "text": txt})
    return out


def _write_ass_captions(
    transcript: dict,
    clip_start: float,
    clip_end: float,
    ass_path: Path,
    play_w: int,
    play_h: int,
):
    """
    Writes ASS subtitles with PlayRes == final output size.
    This fixes “captions blown up / weird scaling” and gives consistent bottom-safe placement.
    """
    if clip_end <= clip_start + 0.05:
        ass_path.write_text("", encoding="utf-8")
        return

    words = _extract_words_from_whisper(transcript)
    if words:
        chunks = _chunk_words_to_captions(words, clip_start, clip_end)
    else:
        chunks = _segments_to_captions(transcript, clip_start, clip_end)

    if not chunks:
        ass_path.write_text("", encoding="utf-8")
        return

    # ASS header
    bold_val = -1 if CAPTION_BOLD else 0

    # PrimaryColour: &HAABBGGRR (AA ignored by libass in many cases; keep opaque)
    # OutlineColour: black, BackColour: black for shadow
    # Alignment=2 => bottom-center
    header = []
    header.append("[Script Info]")
    header.append("ScriptType: v4.00+")
    header.append("WrapStyle: 2")
    header.append(f"PlayResX: {int(play_w)}")
    header.append(f"PlayResY: {int(play_h)}")
    header.append("ScaledBorderAndShadow: yes")
    header.append("")
    header.append("[V4+ Styles]")
    header.append(
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding"
    )
    header.append(
        f"Style: Default,{CAPTION_FONTNAME},{CAPTION_FONTSIZE},&H00FFFFFF&,&H00FFFFFF&,&H00000000&,&H00000000&,"
        f"{bold_val},0,0,0,100,100,0,0,1,{CAPTION_OUTLINE},{CAPTION_SHADOW},2,{CAPTION_MARGIN_H},{CAPTION_MARGIN_H},{CAPTION_MARGIN_V},1"
    )
    header.append("")
    header.append("[Events]")
    header.append("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text")

    lines = header[:]

    for c in chunks:
        st = float(c["start"])
        en = float(c["end"])
        txt = (c.get("text") or "").strip()
        if not txt:
            continue

        # Convert into clip-local times
        ss = max(0.0, st - clip_start)
        ee = max(ss + 0.05, min(clip_end - clip_start, en - clip_start))

        wrapped = _wrap_caption_text(txt, CAPTION_MAX_CHARS_PER_LINE, CAPTION_MAX_LINES)
        if not wrapped:
            continue

        # ASS line breaks use \N
        wrapped = wrapped.replace("\n", r"\N")
        # Escape braces (ASS override tags)
        wrapped = wrapped.replace("{", r"\{").replace("}", r"\}")

        lines.append(
            f"Dialogue: 0,{_ass_time(ss)},{_ass_time(ee)},Default,,0,0,0,,{wrapped}"
        )

    ass_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def render_clip(
    input_path: Path,
    output_path: Path,
    start: float,
    end: float,
    transcript: dict,
    aspect_ratio: str,
    captions_on: bool,
    watermark_on: bool,
):
    """
    Shorts-ready render:
      - smart reframing crop (face -> pose -> fallback) + optional smooth pan
      - burned captions via ASS (PlayRes==target) => consistent sizing/placement
      - moving watermark text-only
      - h264+aac re-encode for compatibility
    """
    import subprocess

    if end <= start:
        raise RuntimeError("Invalid clip times (end <= start)")

    aspect_ratio = _normalize_aspect(aspect_ratio)
    tgt_w, tgt_h = _target_dimensions(aspect_ratio)

    w_coded, h_coded, rot = _probe_video_size_and_rotation(input_path)
    src_w_disp, src_h_disp = _display_dims(w_coded, h_coded, rot)
    dur = max(0.01, end - start)

    vf_parts: List[str] = []

    # If rotation metadata indicates 90/270, ffmpeg *usually* auto-rotates.
    # But our detection uses display dims, and our filter graph should still be safe.
    vf_parts.append(
        _build_reframe_filter(
            input_path=input_path,
            start=start,
            end=end,
            dur=dur,
            src_w=src_w_disp,
            src_h=src_h_disp,
            tgt_w=tgt_w,
            tgt_h=tgt_h,
        )
    )

    tmp_ass = None
    if captions_on:
        tmp_ass = TMP_DIR / f"clipforge_{uuid.uuid4().hex}.ass"
        _write_ass_captions(
            transcript=transcript,
            clip_start=start,
            clip_end=end,
            ass_path=tmp_ass,
            play_w=tgt_w,
            play_h=tgt_h,
        )
        if tmp_ass.exists() and tmp_ass.stat().st_size > 0:
            vf_parts.append(_build_subtitles_filter(tmp_ass))
        else:
            tmp_ass.unlink(missing_ok=True)
            tmp_ass = None

    if watermark_on:
        vf_parts.append(_build_watermark_filter())

    vf = ",".join(vf_parts)

    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        str(start),
        "-t",
        str(dur),
        "-i",
        str(input_path),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-shortest",
        str(output_path),
    ]

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.decode(errors="ignore"))

    if tmp_ass is not None:
        tmp_ass.unlink(missing_ok=True)


def extract_audio_to_wav(video_path: Path, wav_path: Path):
    import subprocess

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        str(wav_path),
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.decode(errors="ignore"))


def _user_id_from_upload_key(storage_key: str):
    key = (storage_key or "").strip()
    if not key.startswith("users/"):
        return None
    parts = key.split("/", 3)
    if len(parts) < 2:
        return None
    try:
        return int(parts[1])
    except Exception:
        return None


def generate_and_store_clips(db, storage, job: Job, upload: Upload, source_path: Path):
    transcript = json.loads(upload.transcript)
    plans = generate_clip_segments(transcript)

    if not plans:
        log("No clip segments generated (transcript has no segments).")
        return 0

    inferred_user_id = _user_id_from_upload_key(upload.storage_key) or upload.user_id
    created = 0

    # Settings (defaults until we wire UI/DB)
    aspect_ratio = _normalize_aspect(getattr(upload, "aspect_ratio", None) or DEFAULT_ASPECT_RATIO)
    captions_on = bool(getattr(upload, "captions_on", DEFAULT_CAPTIONS_ON))
    watermark_effective = _get_watermark_effective(db, upload)

    log(
        f"Output settings: aspect={aspect_ratio}, "
        f"captions={'ON' if captions_on else 'OFF'}, "
        f"watermark={'ON' if watermark_effective else 'OFF'}, "
        f"reframe={'ON' if REFRAME_ENABLED else 'OFF'}, "
        f"smooth_pan={'ON' if REFRAME_SMOOTH_PAN else 'OFF'}"
    )

    for plan in plans:
        clip_id = uuid.uuid4().hex
        clip_path = TMP_DIR / f"clip-{clip_id}.mp4"

        log(f"Rendering clip {plan['start']:.2f}-{plan['end']:.2f}s")
        render_clip(
            input_path=source_path,
            output_path=clip_path,
            start=plan["start"],
            end=plan["end"],
            transcript=transcript,
            aspect_ratio=aspect_ratio,
            captions_on=captions_on,
            watermark_on=watermark_effective,
        )

        clip_key = f"users/{inferred_user_id}/clips/{upload.id}/{clip_id}.mp4"
        storage.upload(str(clip_path), clip_key, content_type="video/mp4")

        clip = Clip(
            upload_id=upload.id,
            job_id=job.id,
            storage_key=clip_key,
            start_time=plan["start"],
            end_time=plan["end"],
            duration=plan["duration"],
        )
        db.add(clip)
        created += 1

        clip_path.unlink(missing_ok=True)

        if created % 2 == 0:
            heartbeat(db, job.id)

    db.commit()
    return created


def main():
    log("Clipforge worker starting...")
    storage = get_storage()
    log(f"Storage backend ready: {storage.__class__.__name__}")

    import whisper

    log("Loading Whisper model...")
    model = whisper.load_model("base")
    log("Whisper model loaded. Polling for queued jobs...")

    last_reclaim = 0.0

    while True:
        db = SessionLocal()
        job = None
        tmp_video = None
        tmp_wav = None
        started = time.time()
        last_hb = time.time()

        try:
            if time.time() - last_reclaim > 30:
                reclaim_stale_running_jobs(db)
                last_reclaim = time.time()

            job_id = claim_job(db)
            if not job_id:
                time.sleep(POLL_INTERVAL)
                continue

            log(f"Claimed job {job_id}")

            job = db.query(Job).filter(Job.id == job_id).first()
            if not job:
                time.sleep(POLL_INTERVAL)
                continue

            upload = db.query(Upload).filter(Upload.id == job.upload_id).first()
            if not upload:
                job.status = "failed"
                job.error = "Upload not found for job"
                db.commit()
                continue

            heartbeat(db, job_id)

            # Download video from storage
            body = storage.open(upload.storage_key)
            tmp_video = TMP_DIR / f"clipforge_job_{job_id}.mp4"
            with open(tmp_video, "wb") as f:
                f.write(body.read())

            # Extract audio
            tmp_wav = TMP_DIR / f"clipforge_job_{job_id}.wav"
            log("Extracting audio...")
            extract_audio_to_wav(tmp_video, tmp_wav)

            if time.time() - last_hb >= HEARTBEAT_EVERY:
                heartbeat(db, job_id)
                last_hb = time.time()

            # Transcribe
            log("Transcribing...")
            try:
                result = model.transcribe(
                    str(tmp_wav),
                    verbose=False,
                    fp16=False,
                    task="transcribe",
                    temperature=0.0,
                    condition_on_previous_text=False,
                    word_timestamps=True,
                )
            except TypeError:
                result = model.transcribe(
                    str(tmp_wav),
                    verbose=False,
                    fp16=False,
                    task="transcribe",
                    temperature=0.0,
                    condition_on_previous_text=False,
                )

            # Debug visibility: are word timestamps actually present?
            try:
                seg0 = (result.get("segments") or [None])[0]
                has_words = bool(seg0 and isinstance(seg0, dict) and seg0.get("words"))
                log(f"Whisper word timestamps: {'YES' if has_words else 'NO'}")
            except Exception:
                pass

            upload.transcript = json.dumps(result)
            db.commit()
            heartbeat(db, job_id)

            created = generate_and_store_clips(db, storage, job, upload, tmp_video)

            job.status = "done"
            job.error = None
            heartbeat(db, job_id)
            db.commit()

            elapsed = time.time() - started
            log(f"Finished job {job_id} (clips={created}, elapsed={elapsed:.1f}s)")

        except Exception as e:
            db.rollback()
            try:
                if job is not None:
                    job.status = "failed"
                    job.error = str(e)
                    heartbeat(db, job.id)
                    db.commit()
            except Exception:
                db.rollback()
            log(f"Worker error: {e}")

        finally:
            if tmp_wav:
                Path(tmp_wav).unlink(missing_ok=True)
            if tmp_video:
                Path(tmp_video).unlink(missing_ok=True)
            db.close()


if __name__ == "__main__":
    main()
