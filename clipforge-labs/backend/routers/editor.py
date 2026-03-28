from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.database import get_db
from models.clip import Clip
from models.editor_project import EditorProject
from models.job import Job
from models.upload import Upload
from models.user import User
from routers.auth import get_current_user
from routers.clips import _clip_dict, _clip_url, _ffmpeg_drawtext_escape, _slugify_filename_base
from storage import get_storage

router = APIRouter(prefix="/editor", tags=["editor"])

FRAME_DIMENSIONS: dict[str, tuple[int, int]] = {
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "16:9": (1920, 1080),
}


def _frame_dimensions(frame: str) -> tuple[int, int]:
    return FRAME_DIMENSIONS.get(str(frame or "").strip(), FRAME_DIMENSIONS["9:16"])


def _clean_project_name(raw: str | None) -> str:
    value = str(raw or "").strip()
    return value[:160] or "Untitled Project"


def _clip_storage_exists(storage, key: str) -> bool:
    try:
        if hasattr(storage, "exists"):
            return bool(storage.exists(key))
    except Exception:
        return False
    return True


def _copy_stream_to_path(body, dest_path: str, chunk_size: int = 1024 * 1024) -> None:
    try:
        with open(dest_path, "wb") as out:
            while True:
                chunk = body.read(chunk_size)
                if not chunk:
                    break
                out.write(chunk)
    finally:
        try:
            body.close()
        except Exception:
            pass


def _ffprobe_streams(path: str) -> dict[str, Any]:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            path,
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "ffprobe failed")
    try:
        data = json.loads(proc.stdout or "{}")
    except Exception as exc:
        raise RuntimeError("Invalid ffprobe output") from exc
    return data if isinstance(data, dict) else {}


def _media_duration_seconds(path: str) -> float:
    data = _ffprobe_streams(path)
    fmt = data.get("format") or {}
    raw_duration = fmt.get("duration")
    try:
        duration = float(raw_duration)
    except Exception:
        duration = 0.0
    if duration > 0:
        return duration
    for stream in data.get("streams") or []:
        try:
            stream_duration = float(stream.get("duration") or 0.0)
        except Exception:
            stream_duration = 0.0
        if stream_duration > 0:
            return stream_duration
    return 0.0


def _has_audio_stream(path: str) -> bool:
    data = _ffprobe_streams(path)
    for stream in data.get("streams") or []:
        if str(stream.get("codec_type") or "").lower() == "audio":
            return True
    return False


def _even_floor(value: int) -> int:
    ivalue = int(value)
    if ivalue % 2:
        ivalue -= 1
    return max(2, ivalue)


def _crop_filter(crop: dict[str, Any] | None) -> str | None:
    if not isinstance(crop, dict):
        return None
    try:
        x = max(0.0, min(1.0, float(crop.get("x") or 0.0)))
        y = max(0.0, min(1.0, float(crop.get("y") or 0.0)))
        w = max(0.02, min(1.0, float(crop.get("w") or 1.0)))
        h = max(0.02, min(1.0, float(crop.get("h") or 1.0)))
    except Exception:
        return None
    if x + w > 1.0:
        w = max(0.02, 1.0 - x)
    if y + h > 1.0:
        h = max(0.02, 1.0 - y)
    return (
        f"crop="
        f"trunc(iw*{w:.6f}/2)*2:"
        f"trunc(ih*{h:.6f}/2)*2:"
        f"trunc(iw*{x:.6f}/2)*2:"
        f"trunc(ih*{y:.6f}/2)*2"
    )


def _scale_pad_filter(out_w: int, out_h: int) -> str:
    return (
        f"scale={out_w}:{out_h}:force_original_aspect_ratio=decrease,"
        f"pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:color=black"
    )


def _escape_concat_path(path: str) -> str:
    return path.replace("'", r"'\''")


def _project_summary(project: dict[str, Any]) -> dict[str, Any]:
    visual = list(project.get("visual") or [])
    voiceover = list(project.get("voiceover") or [])
    music = list(project.get("music") or [])
    captions = list(project.get("captions") or [])
    return {
        "visual_count": len(visual),
        "voiceover_count": len(voiceover),
        "music_count": len(music),
        "caption_count": len(captions),
        "target_duration": int(project.get("targetDuration") or 0),
    }


class EditorProjectPayload(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    frame: str = Field(default="9:16", max_length=16)
    project: dict[str, Any]


class EditorProjectResponse(BaseModel):
    id: int
    name: str
    frame: str
    project: dict[str, Any]
    summary: dict[str, Any]
    created_at: Any
    updated_at: Any


class TimelineCrop(BaseModel):
    x: float = Field(default=0.0, ge=0.0, le=1.0)
    y: float = Field(default=0.0, ge=0.0, le=1.0)
    w: float = Field(default=1.0, gt=0.0, le=1.0)
    h: float = Field(default=1.0, gt=0.0, le=1.0)


class TimelineTextOverlay(BaseModel):
    text: str = Field(min_length=1, max_length=240)
    start: float = Field(default=0.0, ge=0.0)
    end: float = Field(default=0.0, ge=0.0)
    x: float = Field(default=0.5, ge=0.0, le=1.0)
    y: float = Field(default=0.82, ge=0.0, le=1.0)
    font_scale: float = Field(default=1.0, ge=0.5, le=2.5)


class TimelineVisualItem(BaseModel):
    clip_id: int = Field(ge=1)
    type: str = Field(default="video", max_length=16)
    start: float = Field(default=0.0, ge=0.0)
    duration: float = Field(default=0.25, gt=0.0, le=600.0)
    motion: str | None = Field(default=None, max_length=32)
    crop: TimelineCrop | None = None
    title: str | None = Field(default=None, max_length=160)


class TimelineAudioItem(BaseModel):
    clip_id: int = Field(ge=1)
    start: float = Field(default=0.0, ge=0.0)
    duration: float = Field(default=0.25, gt=0.0, le=600.0)
    volume: float = Field(default=1.0, ge=0.0, le=2.0)


class EditorRenderRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    frame: str = Field(default="9:16", max_length=16)
    target_duration: float = Field(default=60.0, gt=0.0, le=600.0)
    music_bed_level: float = Field(default=0.35, ge=0.0, le=1.0)
    visual: list[TimelineVisualItem] = Field(default_factory=list)
    voiceover: list[TimelineAudioItem] = Field(default_factory=list)
    music: list[TimelineAudioItem] = Field(default_factory=list)
    captions: list[TimelineTextOverlay] = Field(default_factory=list)


def _serialize_project_row(row: EditorProject) -> dict[str, Any]:
    try:
        parsed = json.loads(str(row.project_json or "{}"))
    except Exception:
        parsed = {}
    if not isinstance(parsed, dict):
        parsed = {}
    return {
        "id": int(row.id),
        "name": _clean_project_name(getattr(row, "name", None)),
        "frame": str(getattr(row, "frame", "9:16") or "9:16"),
        "project": parsed,
        "summary": _project_summary(parsed),
        "created_at": getattr(row, "created_at", None),
        "updated_at": getattr(row, "updated_at", None),
    }


@router.get("/projects", response_model=list[EditorProjectResponse])
def list_editor_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Keep the project list intentionally short and recent for the editor picker.
    rows = (
        db.query(EditorProject)
        .filter(EditorProject.user_id == current_user.id)
        .order_by(EditorProject.updated_at.desc(), EditorProject.id.desc())
        .limit(24)
        .all()
    )
    return [_serialize_project_row(row) for row in rows]


@router.get("/projects/{project_id}", response_model=EditorProjectResponse)
def get_editor_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(EditorProject)
        .filter(EditorProject.id == project_id, EditorProject.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return _serialize_project_row(row)


@router.post("/projects", response_model=EditorProjectResponse)
def create_editor_project(
    payload: EditorProjectPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    frame = str(payload.frame or "9:16").strip()
    if frame not in FRAME_DIMENSIONS:
        frame = "9:16"
    project_json = json.dumps(payload.project or {})
    row = EditorProject(
        user_id=current_user.id,
        name=_clean_project_name(payload.name),
        frame=frame,
        project_json=project_json,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_project_row(row)


@router.put("/projects/{project_id}", response_model=EditorProjectResponse)
def update_editor_project(
    project_id: int,
    payload: EditorProjectPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(EditorProject)
        .filter(EditorProject.id == project_id, EditorProject.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    frame = str(payload.frame or "9:16").strip()
    if frame not in FRAME_DIMENSIONS:
        frame = "9:16"
    row.name = _clean_project_name(payload.name)
    row.frame = frame
    row.project_json = json.dumps(payload.project or {})
    db.commit()
    db.refresh(row)
    return _serialize_project_row(row)


@router.delete("/projects/{project_id}")
def delete_editor_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(EditorProject)
        .filter(EditorProject.id == project_id, EditorProject.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/render")
def render_editor_project(
    payload: EditorRenderRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Render the current timeline into one exported clip while preserving server-owned assets only.
    if not payload.visual:
        raise HTTPException(status_code=422, detail="Add at least one visual item before exporting.")

    frame = str(payload.frame or "9:16").strip()
    if frame not in FRAME_DIMENSIONS:
        frame = "9:16"
    out_w, out_h = _frame_dimensions(frame)
    storage = get_storage()

    clip_ids = {
        int(item.clip_id)
        for item in payload.visual
        + payload.voiceover
        + payload.music
    }
    clips = (
        db.query(Clip)
        .join(Upload, Clip.upload_id == Upload.id)
        .filter(Clip.id.in_(clip_ids), Upload.user_id == current_user.id)
        .all()
    )
    clip_by_id = {int(clip.id): clip for clip in clips}
    missing = sorted(clip_id for clip_id in clip_ids if clip_id not in clip_by_id)
    if missing:
        raise HTTPException(status_code=404, detail=f"Missing clip assets: {', '.join(str(v) for v in missing[:5])}")

    workdir = tempfile.mkdtemp(prefix=f"cflabs-editor-render-{current_user.id}-")
    src_paths: dict[int, str] = {}
    media_duration: dict[int, float] = {}
    audio_presence: dict[int, bool] = {}
    segment_paths: list[str] = []
    cleanup_paths: list[str] = []
    final_visual_path = os.path.join(workdir, "visual-timeline.mp4")
    mixed_output_path = os.path.join(workdir, "editor-render.mp4")

    try:
        for clip_id, clip in clip_by_id.items():
            if not _clip_storage_exists(storage, clip.storage_key):
                raise HTTPException(status_code=404, detail=f"Clip file missing for clip #{clip_id}")
            body = storage.open(clip.storage_key)
            src_path = os.path.join(workdir, f"src-{clip_id}{os.path.splitext(str(clip.storage_key or ''))[1] or '.bin'}")
            _copy_stream_to_path(body, src_path)
            src_paths[clip_id] = src_path
            try:
                media_duration[clip_id] = max(0.0, _media_duration_seconds(src_path))
            except Exception:
                media_duration[clip_id] = max(0.0, float(getattr(clip, "duration", 0.0) or 0.0))
            try:
                audio_presence[clip_id] = _has_audio_stream(src_path)
            except Exception:
                audio_presence[clip_id] = False

        visual_items = sorted(payload.visual, key=lambda item: (float(item.start or 0.0), int(item.clip_id)))
        timeline_cursor = 0.0
        list_path = os.path.join(workdir, "segments.txt")

        with open(list_path, "w", encoding="utf-8") as concat_file:
            for idx, item in enumerate(visual_items):
                start_at = max(0.0, float(item.start or 0.0))
                if start_at > timeline_cursor + 0.02:
                    gap_duration = round(start_at - timeline_cursor, 3)
                    gap_path = os.path.join(workdir, f"gap-{idx}.mp4")
                    gap_cmd = [
                        "ffmpeg",
                        "-y",
                        "-f",
                        "lavfi",
                        "-i",
                        f"color=c=black:s={out_w}x{out_h}:d={gap_duration:.3f}",
                        "-vf",
                        "format=yuv420p",
                        "-c:v",
                        "libx264",
                        "-preset",
                        "veryfast",
                        "-crf",
                        "20",
                        gap_path,
                    ]
                    gap_proc = subprocess.run(gap_cmd, capture_output=True, text=True)
                    if gap_proc.returncode != 0:
                        detail = (gap_proc.stderr or gap_proc.stdout or "ffmpeg gap render failed").strip()
                        raise HTTPException(status_code=500, detail=detail[-400:])
                    segment_paths.append(gap_path)
                    concat_file.write(f"file '{_escape_concat_path(gap_path)}'\n")
                    timeline_cursor = start_at

                clip = clip_by_id[int(item.clip_id)]
                src_path = src_paths[int(item.clip_id)]
                requested_duration = max(0.25, float(item.duration or 0.25))
                available_duration = max(0.0, media_duration.get(int(item.clip_id), 0.0))
                effective_duration = requested_duration
                if available_duration > 0:
                    effective_duration = max(0.25, min(requested_duration, available_duration))

                filters: list[str] = []
                crop_filter = _crop_filter(item.crop.model_dump() if item.crop else None)
                if crop_filter:
                    filters.append(crop_filter)

                if str(item.type or "").lower() == "image":
                    if str(item.motion or "").lower() == "kenburns":
                        zoom_frames = max(1, int(round(effective_duration * 30)))
                        filters.append(
                            f"scale={out_w * 2}:{out_h * 2},"
                            f"zoompan=z='min(1.18,zoom+0.0009)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
                            f"d={zoom_frames}:s={out_w}x{out_h}:fps=30"
                        )
                    else:
                        filters.append(_scale_pad_filter(out_w, out_h))
                    filters.append("format=yuv420p")
                    segment_cmd = [
                        "ffmpeg",
                        "-y",
                        "-loop",
                        "1",
                        "-t",
                        f"{effective_duration:.3f}",
                        "-i",
                        src_path,
                        "-vf",
                        ",".join(filters),
                        "-r",
                        "30",
                        "-c:v",
                        "libx264",
                        "-preset",
                        "veryfast",
                        "-crf",
                        "20",
                        os.path.join(workdir, f"segment-{idx}.mp4"),
                    ]
                else:
                    filters.append(_scale_pad_filter(out_w, out_h))
                    filters.append("format=yuv420p")
                    segment_cmd = [
                        "ffmpeg",
                        "-y",
                        "-t",
                        f"{effective_duration:.3f}",
                        "-i",
                        src_path,
                        "-vf",
                        ",".join(filters),
                        "-an",
                        "-r",
                        "30",
                        "-c:v",
                        "libx264",
                        "-preset",
                        "veryfast",
                        "-crf",
                        "20",
                        os.path.join(workdir, f"segment-{idx}.mp4"),
                    ]

                segment_path = segment_cmd[-1]
                proc = subprocess.run(segment_cmd, capture_output=True, text=True)
                if proc.returncode != 0:
                    detail = (proc.stderr or proc.stdout or "ffmpeg segment render failed").strip()
                    raise HTTPException(status_code=500, detail=detail[-400:])
                segment_paths.append(segment_path)
                concat_file.write(f"file '{_escape_concat_path(segment_path)}'\n")
                timeline_cursor = max(timeline_cursor, start_at + effective_duration)

        concat_cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list_path,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            final_visual_path,
        ]
        concat_proc = subprocess.run(concat_cmd, capture_output=True, text=True)
        if concat_proc.returncode != 0:
            detail = (concat_proc.stderr or concat_proc.stdout or "ffmpeg concat failed").strip()
            raise HTTPException(status_code=500, detail=detail[-400:])

        total_duration = max(
            float(payload.target_duration or 0.0),
            timeline_cursor,
            max((float(item.end or 0.0) for item in payload.captions), default=0.0),
            max((float(item.start or 0.0) + float(item.duration or 0.0) for item in payload.voiceover), default=0.0),
            max((float(item.start or 0.0) + float(item.duration or 0.0) for item in payload.music), default=0.0),
        )
        total_duration = max(1.0, min(600.0, total_duration))

        ffmpeg_cmd = ["ffmpeg", "-y", "-i", final_visual_path]
        input_index = 1
        audio_inputs: list[tuple[int, TimelineAudioItem, float]] = []

        def _append_audio_items(items: list[TimelineAudioItem], *, gain_multiplier: float = 1.0, allow_missing_audio: bool = False):
            nonlocal input_index
            for audio_item in items:
                clip_id = int(audio_item.clip_id)
                if allow_missing_audio and not audio_presence.get(clip_id, False):
                    continue
                ffmpeg_cmd.extend(["-i", src_paths[clip_id]])
                audio_inputs.append((input_index, audio_item, gain_multiplier))
                input_index += 1

        visual_audio_items = [
            TimelineAudioItem(
                clip_id=int(item.clip_id),
                start=max(0.0, float(item.start or 0.0)),
                duration=max(0.25, float(item.duration or 0.25)),
                volume=1.0,
            )
            for item in visual_items
            if str(item.type or "").lower() == "video"
        ]
        _append_audio_items(visual_audio_items, allow_missing_audio=True)
        _append_audio_items(payload.voiceover, gain_multiplier=1.0)
        _append_audio_items(payload.music, gain_multiplier=max(0.0, float(payload.music_bed_level or 0.0)))

        filter_parts: list[str] = []
        audio_labels: list[str] = []
        for idx, (source_index, audio_item, gain_multiplier) in enumerate(audio_inputs):
            delay_ms = max(0, int(round(float(audio_item.start or 0.0) * 1000.0)))
            duration = max(0.25, float(audio_item.duration or 0.25))
            volume = max(0.0, min(2.0, float(audio_item.volume or 1.0) * gain_multiplier))
            label = f"a{idx}"
            filter_parts.append(
                f"[{source_index}:a]atrim=0:{duration:.3f},asetpts=PTS-STARTPTS,"
                f"volume={volume:.3f},adelay={delay_ms}|{delay_ms}[{label}]"
            )
            audio_labels.append(f"[{label}]")

        if audio_labels:
            mix_label = "amixout"
            filter_parts.append(
                f"{''.join(audio_labels)}amix=inputs={len(audio_labels)}:duration=longest:dropout_transition=0,volume=1.0[{mix_label}]"
            )

        caption_filters: list[str] = []
        font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        font_prefix = f"fontfile='{font_path}':" if os.path.exists(font_path) else ""
        for overlay in list(payload.captions or [])[:48]:
            text_value = str(overlay.text or "").strip()
            if not text_value:
                continue
            start_at = max(0.0, float(overlay.start or 0.0))
            end_at = max(0.0, float(overlay.end or 0.0))
            if end_at <= start_at:
                continue
            safe_x = max(0.08, min(0.92, float(overlay.x or 0.5)))
            safe_y = max(0.08, min(0.92, float(overlay.y or 0.82)))
            safe_scale = max(0.7, min(1.8, float(overlay.font_scale or 1.0)))
            font_size = max(24, min(96, int(round(float(out_h) * 0.042 * safe_scale))))
            margin = max(18, int(round(float(out_w) * 0.04)))
            text_escaped = _ffmpeg_drawtext_escape(text_value)
            x_expr = f"min(max(w*{safe_x:.4f}-text_w/2,{margin}),w-text_w-{margin})"
            y_expr = f"min(max(h*{safe_y:.4f}-text_h/2,{margin}),h-text_h-{margin})"
            caption_filters.append(
                "drawtext="
                f"{font_prefix}"
                f"text='{text_escaped}':"
                f"x={x_expr}:"
                f"y={y_expr}:"
                f"fontsize={font_size}:"
                "fontcolor=white:"
                "line_spacing=6:"
                "borderw=2:"
                "bordercolor=black@0.85:"
                "box=1:"
                "boxcolor=black@0.34:"
                "boxborderw=18:"
                f"enable='between(t,{start_at:.3f},{end_at:.3f})'"
            )

        if caption_filters:
            filter_parts.append(f"[0:v]{','.join(caption_filters)}[vout]")

        if filter_parts:
            ffmpeg_cmd.extend(["-filter_complex", ";".join(filter_parts)])
        ffmpeg_cmd.extend(["-map", "[vout]" if caption_filters else "0:v:0"])
        if audio_labels:
            ffmpeg_cmd.extend(["-map", "[amixout]"])
        else:
            ffmpeg_cmd.extend(["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-shortest"])
            ffmpeg_cmd.extend(["-map", "0:v:0", "-map", f"{input_index}:a:0"])
        ffmpeg_cmd.extend(
            [
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                "-pix_fmt",
                "yuv420p",
                mixed_output_path,
            ]
        )

        render_proc = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
        if render_proc.returncode != 0:
            detail = (render_proc.stderr or render_proc.stdout or "ffmpeg editor render failed").strip()
            raise HTTPException(status_code=500, detail=detail[-400:])

        output_duration = max(0.0, _media_duration_seconds(mixed_output_path))
        key_base = _slugify_filename_base(_clean_project_name(payload.name), fallback=f"editor-{current_user.id}")
        storage_key = f"clips/generated/editor/{current_user.id}/{key_base}-{uuid.uuid4().hex[:8]}.mp4"
        if hasattr(storage, "upload"):
            storage.upload(mixed_output_path, storage_key, content_type="video/mp4")  # type: ignore[attr-defined]
        else:
            with open(mixed_output_path, "rb") as file_obj:
                storage.save(file_obj, storage_key, content_type="video/mp4")

        upload = Upload(
            user_id=current_user.id,
            original_filename=f"{key_base}.mp4",
            storage_key=storage_key,
            source_type="labs_generated",
            source_url=None,
            source_id=None,
        )
        db.add(upload)
        db.flush()

        job = Job(
            upload_id=upload.id,
            kind="editor_render",
            status="done",
            error=None,
            credits_reserved=0,
            credits_refunded=False,
            aspect_ratio=frame,
            captions_enabled=bool(payload.captions),
            watermark_enabled=False,
            caption_style_json=json.dumps(
                {
                    "mode": "editor_render",
                    "project_name": _clean_project_name(payload.name),
                    "frame": frame,
                    "target_duration": total_duration,
                    "caption_count": len(payload.captions or []),
                }
            ),
            prompt=_clean_project_name(payload.name),
            negative_prompt=None,
            model="ffmpeg-editor",
            duration_seconds=int(round(total_duration)),
        )
        db.add(job)
        db.flush()

        clip = Clip(
            upload_id=upload.id,
            job_id=job.id,
            storage_key=storage_key,
            start_time=0.0,
            end_time=max(0.0, output_duration),
            duration=max(0.0, output_duration),
            title=f"{_clean_project_name(payload.name)} (Rendered)",
            hook="Rendered from Studio Editor",
        )
        db.add(clip)
        db.commit()
        db.refresh(clip)

        return _clip_dict(clip, storage, request)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
