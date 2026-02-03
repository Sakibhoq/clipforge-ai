from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Literal, Any, Dict, List
from urllib.parse import urlparse, parse_qs, quote
import os
import json
import math
import urllib.request
import re
import tempfile
import subprocess
import glob
import uuid
from datetime import datetime, timezone

from models.user import User
from models.youtube_channel import YouTubeChannel
from models.youtube_ingest import YouTubeIngestItem
from routers.auth import get_current_user
from core.database import get_db
from sqlalchemy.orm import Session
from storage import get_storage
from services.upload_service import register_upload_for_user

router = APIRouter(prefix="/youtube", tags=["youtube"])

AspectRatio = Literal["9:16", "1:1", "4:5", "16:9", "4:3"]

_DURATION_RE = re.compile(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$")

# ======================================================
# Schemas
# ======================================================

class YouTubePreviewRequest(BaseModel):
    url: str = Field(..., min_length=8)


class YouTubePreviewResponse(BaseModel):
    video_id: str
    normalized_url: str
    title: str
    channel: Optional[str] = None
    duration_seconds: int
    minutes_rounded: int
    thumbnail_url: Optional[str] = None
    credits_required: int


# Server-side ingest
class YouTubeIngestRequest(BaseModel):
    url: str = Field(..., min_length=8)
    aspect_ratio: AspectRatio = Field(default="9:16")
    captions_enabled: bool = Field(default=True)
    watermark_enabled: bool = Field(default=True)
    caption_style_json: Optional[Any] = Field(default=None)
    caption_style: Optional[Dict[str, Any]] = Field(default=None)
    create_new_job: bool = Field(default=False)


class YouTubeChannelSubscribeRequest(BaseModel):
    channel_id: Optional[str] = None
    handle: Optional[str] = None  # @handle


class YouTubeChannelResponse(BaseModel):
    id: int
    channel_id: str
    channel_title: Optional[str] = None
    active: bool
    last_polled_at: Optional[str] = None


class YouTubeIngestQueueResponse(BaseModel):
    id: int
    video_id: str
    video_url: str
    title: Optional[str]
    duration_seconds: Optional[int]
    status: str
    last_error: Optional[str]


# ======================================================
# Helpers
# ======================================================

def _extract_youtube_video_id(raw: str) -> Optional[str]:
    raw = (raw or "").strip()
    if not raw:
        return None

    if "://" not in raw:
        raw = "https://" + raw

    try:
        u = urlparse(raw)
    except Exception:
        return None

    host = (u.netloc or "").lower().replace("www.", "")
    path = u.path or ""

    if host == "youtu.be":
        return path.lstrip("/").split("/")[0] or None

    if host in ("youtube.com", "m.youtube.com", "music.youtube.com"):
        if path.startswith("/watch"):
            qs = parse_qs(u.query or "")
            return (qs.get("v") or [None])[0]

        if path.startswith("/shorts/"):
            return path.split("/shorts/", 1)[1].split("/", 1)[0]

        if path.startswith("/embed/"):
            return path.split("/embed/", 1)[1].split("/", 1)[0]

    return None


def _normalize_youtube_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def _youtube_api_key() -> str:
    key = (os.getenv("YOUTUBE_API_KEY") or "").strip()
    if not key:
        raise HTTPException(500, "YOUTUBE_API_KEY is not set")
    return key


def _http_get_json(url: str, timeout_sec: int = 12) -> dict:
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "OrbitoBackend/1.0",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except Exception as e:
        raise HTTPException(502, f"YouTube API request failed: {e}")


def _parse_iso8601_duration_to_seconds(d: str) -> int:
    m = _DURATION_RE.match((d or "").strip())
    if not m:
        return 0
    h = int(m.group(1) or 0)
    mm = int(m.group(2) or 0)
    s = int(m.group(3) or 0)
    return h * 3600 + mm * 60 + s


def _youtube_api_preview(video_id: str) -> dict:
    key = _youtube_api_key()
    url = (
        "https://www.googleapis.com/youtube/v3/videos"
        f"?part=snippet,contentDetails&id={video_id}&key={key}"
    )

    data = _http_get_json(url)
    items = data.get("items") or []

    if not items:
        raise HTTPException(404, "Video not found or unavailable")

    it = items[0]
    snippet = it.get("snippet") or {}
    content = it.get("contentDetails") or {}

    title = (snippet.get("title") or "").strip()
    channel = (snippet.get("channelTitle") or "").strip() or None

    thumbs = snippet.get("thumbnails") or {}
    thumb_url = None
    for k in ("maxres", "standard", "high", "medium", "default"):
        if k in thumbs and thumbs[k].get("url"):
            thumb_url = thumbs[k]["url"]
            break

    duration_seconds = _parse_iso8601_duration_to_seconds(content.get("duration"))

    if not title or duration_seconds <= 0:
        raise HTTPException(502, "Invalid YouTube metadata")

    return {
        "title": title,
        "channel": channel,
        "duration_seconds": int(duration_seconds),
        "thumbnail_url": thumb_url,
    }


def _minutes_rounded(duration_seconds: int) -> int:
    return max(1, int(math.ceil(max(0, int(duration_seconds)) / 60.0)))


def _credits_required_2_per_min(duration_seconds: int) -> int:
    return _minutes_rounded(duration_seconds) * 2


def _resolve_channel_id(query: str) -> Optional[str]:
    """
    Accepts:
      - channel ID (UCxxxx)
      - @handle
    Returns channel_id or None.
    """
    q = (query or "").strip()
    if not q:
        return None
    if q.startswith("UC") and len(q) > 6:
        return q
    if q.startswith("@"):
        # search by handle
        key = _youtube_api_key()
        url = (
            "https://www.googleapis.com/youtube/v3/search"
            f"?part=snippet&type=channel&q={quote(q)}&maxResults=1&key={key}"
        )
        data = _http_get_json(url)
        items = data.get("items") or []
        if items:
            return (items[0].get("snippet") or {}).get("channelId") or items[0].get("id", {}).get("channelId")
    return None


def _channel_metadata(channel_id: str) -> dict:
    key = _youtube_api_key()
    url = (
        "https://www.googleapis.com/youtube/v3/channels"
        f"?part=snippet&id={channel_id}&key={key}"
    )
    data = _http_get_json(url)
    items = data.get("items") or []
    if not items:
        raise HTTPException(404, "Channel not found")
    snippet = items[0].get("snippet") or {}
    return {
        "channel_id": channel_id,
        "title": snippet.get("title") or None,
    }


def _list_channel_uploads(channel_id: str, max_results: int = 10) -> List[dict]:
    key = _youtube_api_key()
    url = (
        "https://www.googleapis.com/youtube/v3/search"
        f"?part=snippet&channelId={channel_id}&order=date&maxResults={max_results}&type=video&key={key}"
    )
    data = _http_get_json(url)
    items = data.get("items") or []
    out: List[dict] = []
    for it in items:
        vid = (it.get("id") or {}).get("videoId")
        if not vid:
            continue
        snippet = it.get("snippet") or {}
        out.append(
            {
                "video_id": vid,
                "title": snippet.get("title"),
                "video_url": _normalize_youtube_url(vid),
            }
        )
    return out


def _download_youtube_video(url: str, video_id: str) -> str:
    """
    Download YouTube video to a temp mp4. Returns file path.
    """
    tmp_dir = tempfile.mkdtemp(prefix="yt-ingest-")
    outtmpl = os.path.join(tmp_dir, f"{video_id}.%(ext)s")
    cmd = [
        "yt-dlp",
        "-f",
        "bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "-o",
        outtmpl,
        url,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise HTTPException(502, f"yt-dlp failed: {proc.stderr.strip() or proc.stdout.strip()}")

    files = glob.glob(os.path.join(tmp_dir, f"{video_id}.*"))
    if not files:
        raise HTTPException(502, "yt-dlp produced no output file")
    return files[0]


# ======================================================
# Routes
# ======================================================

@router.post("/preview", response_model=YouTubePreviewResponse)
def preview_youtube(
    req: YouTubePreviewRequest,
    current_user: User = Depends(get_current_user),
):
    video_id = _extract_youtube_video_id(req.url)
    if not video_id:
        raise HTTPException(422, "Invalid YouTube URL")

    meta = _youtube_api_preview(video_id)
    mins = _minutes_rounded(meta["duration_seconds"])
    credits = mins * 2
    normalized = _normalize_youtube_url(video_id)

    return {
        "video_id": video_id,
        "normalized_url": normalized,
        "title": meta["title"],
        "channel": meta["channel"],
        "duration_seconds": meta["duration_seconds"],
        "minutes_rounded": mins,
        "thumbnail_url": meta["thumbnail_url"],
        "credits_required": credits,
    }


# ======================================================
# Channel subscriptions (polling)
# ======================================================

@router.post("/channels/subscribe", response_model=YouTubeChannelResponse)
def subscribe_channel(
    req: YouTubeChannelSubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channel_id = req.channel_id or _resolve_channel_id(req.handle or "")
    if not channel_id:
        raise HTTPException(422, "channel_id or handle is required")

    meta = _channel_metadata(channel_id)

    existing = (
        db.query(YouTubeChannel)
        .filter(YouTubeChannel.user_id == current_user.id, YouTubeChannel.channel_id == channel_id)
        .first()
    )
    if existing:
        existing.active = True
        existing.channel_title = meta.get("title") or existing.channel_title
        db.commit()
        return {
            "id": existing.id,
            "channel_id": existing.channel_id,
            "channel_title": existing.channel_title,
            "active": existing.active,
            "last_polled_at": existing.last_polled_at.isoformat() if existing.last_polled_at else None,
        }

    row = YouTubeChannel(
        user_id=current_user.id,
        channel_id=channel_id,
        channel_title=meta.get("title"),
        active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "id": row.id,
        "channel_id": row.channel_id,
        "channel_title": row.channel_title,
        "active": row.active,
        "last_polled_at": row.last_polled_at.isoformat() if row.last_polled_at else None,
    }


@router.get("/channels", response_model=List[YouTubeChannelResponse])
def list_channels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(YouTubeChannel)
        .filter(YouTubeChannel.user_id == current_user.id)
        .order_by(YouTubeChannel.id.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "channel_id": r.channel_id,
            "channel_title": r.channel_title,
            "active": r.active,
            "last_polled_at": r.last_polled_at.isoformat() if r.last_polled_at else None,
        }
        for r in rows
    ]


def _queue_video(
    db: Session,
    *,
    user_id: int,
    channel_db_id: Optional[int],
    video_id: str,
    title: Optional[str],
    duration_seconds: Optional[int],
):
    exists = (
        db.query(YouTubeIngestItem)
        .filter(YouTubeIngestItem.user_id == user_id, YouTubeIngestItem.video_id == video_id)
        .first()
    )
    if exists:
        return

    db.add(
        YouTubeIngestItem(
            user_id=user_id,
            channel_id=channel_db_id,
            video_id=video_id,
            video_url=_normalize_youtube_url(video_id),
            title=title,
            duration_seconds=duration_seconds,
            status="queued",
        )
    )


@router.post("/channels/{channel_row_id}/poll")
def poll_channel(
    channel_row_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channel = (
        db.query(YouTubeChannel)
        .filter(YouTubeChannel.id == channel_row_id, YouTubeChannel.user_id == current_user.id)
        .first()
    )
    if not channel:
        raise HTTPException(404, "Channel not found")

    uploads = _list_channel_uploads(channel.channel_id, max_results=8)
    if not uploads:
        return {"queued": 0}

    queued = 0
    for item in uploads:
        vid = item["video_id"]
        try:
            meta = _youtube_api_preview(vid)
            _queue_video(
                db,
                user_id=current_user.id,
                channel_db_id=channel.id,
                video_id=vid,
                title=meta.get("title"),
                duration_seconds=meta.get("duration_seconds"),
            )
            queued += 1
        except Exception:
            continue

    channel.last_polled_at = datetime.now(timezone.utc)
    if uploads:
        channel.last_video_id = uploads[0]["video_id"]
    db.commit()

    return {"queued": queued}


@router.post("/channels/poll")
def poll_all_channels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channels = (
        db.query(YouTubeChannel)
        .filter(YouTubeChannel.user_id == current_user.id, YouTubeChannel.active == True)
        .all()
    )
    total = 0
    for ch in channels:
        try:
            res = poll_channel(ch.id, db, current_user)
            total += int(res.get("queued", 0))
        except Exception:
            continue
    return {"queued": total}


# ======================================================
# Server-side ingest + queue dispatch
# ======================================================

def _ingest_video_for_user(
    *,
    db: Session,
    user: User,
    video_url: str,
    video_id: str,
    aspect_ratio: str,
    captions_enabled: bool,
    watermark_enabled: bool,
    caption_style_json: Optional[Any],
    caption_style: Optional[Dict[str, Any]],
    create_new_job: bool,
) -> dict:
    storage = get_storage()

    tmp_path = _download_youtube_video(video_url, video_id)
    try:
        ext = os.path.splitext(tmp_path)[1] or ".mp4"
        storage_key = f"users/{user.id}/videos/{uuid.uuid4().hex}{ext}"

        storage.upload(tmp_path, storage_key, content_type="video/mp4")

        return register_upload_for_user(
            db=db,
            user=user,
            storage_key=storage_key,
            original_filename=f"{video_id}{ext}",
            source_type="youtube",
            source_url=video_url,
            source_id=video_id,
            aspect_ratio=aspect_ratio,
            captions_enabled=captions_enabled,
            watermark_enabled=watermark_enabled,
            caption_style_json=caption_style_json,
            caption_style=caption_style,
            create_new_job=create_new_job,
        )
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@router.post("/ingest")
def server_side_ingest(
    req: YouTubeIngestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video_id = _extract_youtube_video_id(req.url)
    if not video_id:
        raise HTTPException(422, "Invalid YouTube URL")

    return _ingest_video_for_user(
        db=db,
        user=current_user,
        video_url=_normalize_youtube_url(video_id),
        video_id=video_id,
        aspect_ratio=req.aspect_ratio,
        captions_enabled=req.captions_enabled,
        watermark_enabled=req.watermark_enabled,
        caption_style_json=req.caption_style_json,
        caption_style=req.caption_style,
        create_new_job=req.create_new_job,
    )


@router.get("/ingest/queue", response_model=List[YouTubeIngestQueueResponse])
def list_ingest_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(YouTubeIngestItem)
        .filter(YouTubeIngestItem.user_id == current_user.id)
        .order_by(YouTubeIngestItem.id.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": r.id,
            "video_id": r.video_id,
            "video_url": r.video_url,
            "title": r.title,
            "duration_seconds": r.duration_seconds,
            "status": r.status,
            "last_error": r.last_error,
        }
        for r in rows
    ]


@router.post("/ingest/dispatch")
def dispatch_ingest_queue(
    limit: int = 2,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = (
        db.query(YouTubeIngestItem)
        .filter(YouTubeIngestItem.user_id == current_user.id, YouTubeIngestItem.status == "queued")
        .order_by(YouTubeIngestItem.id.asc())
        .limit(max(1, min(5, int(limit))))
        .all()
    )
    if not items:
        return {"processed": 0}

    processed = 0
    for item in items:
        try:
            item.status = "downloaded"
            db.commit()

            _ingest_video_for_user(
                db=db,
                user=current_user,
                video_url=item.video_url,
                video_id=item.video_id,
                aspect_ratio="9:16",
                captions_enabled=True,
                watermark_enabled=True,
                caption_style_json=None,
                caption_style=None,
                create_new_job=False,
            )
            item.status = "registered"
            item.last_error = None
        except Exception as e:
            item.status = "failed"
            item.last_error = str(e)[:1000]
        finally:
            db.commit()
            processed += 1

    return {"processed": processed}
