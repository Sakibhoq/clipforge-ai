"use client";

import Link from "next/link";
import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type AssetType = "video" | "image" | "audio";
type TrackKey = "visual" | "voiceover" | "music" | "captions";
type FrameRatio = "9:16" | "1:1" | "16:9";
type ToolTab = "media" | "audio" | "text" | "export" | "project";
type CropRect = { x: number; y: number; w: number; h: number };
type TimelineHoverLens = {
  track: TrackKey;
  x: number;
  y: number;
  laneWidth: number;
  laneHeight: number;
};
type TimelineDragState = {
  track: TrackKey;
  itemId: string;
  laneWidth: number;
  pointerStartX: number;
  itemStart: number;
  itemDuration: number;
  moved: boolean;
};

type ClipRow = {
  id: number;
  upload_id: number;
  storage_key: string;
  url: string;
  asset_type?: string;
  mime_type?: string;
  duration: number;
  title?: string | null;
  hook?: string | null;
};

type TimelineItem = {
  id: string;
  clipId?: number;
  type: AssetType | "caption";
  title: string;
  url?: string;
  start: number;
  duration: number;
  volume: number;
  text?: string;
  motion?: "none" | "kenburns";
  crop?: CropRect;
};

type ProjectState = {
  name: string;
  frame: FrameRatio;
  targetDuration: number;
  musicBedLevel: number;
  safeAreaOn: boolean;
  visual: TimelineItem[];
  voiceover: TimelineItem[];
  music: TimelineItem[];
  captions: TimelineItem[];
};

type LocalMusicAsset = {
  id: string;
  name: string;
  url: string;
  duration: number;
  size: number;
};

const PROJECT_STORAGE_KEY = "clipforge-editor-project-v3";

const EXPORT_PROFILES: Array<{
  id: string;
  label: string;
  frame: FrameRatio;
  safeTop: number;
  safeBottom: number;
}> = [
  { id: "social_vertical", label: "Social Vertical 9:16", frame: "9:16", safeTop: 0.12, safeBottom: 0.16 },
  { id: "social_square", label: "Social Square 1:1", frame: "1:1", safeTop: 0.1, safeBottom: 0.1 },
  { id: "youtube_wide", label: "YouTube Landscape 16:9", frame: "16:9", safeTop: 0.08, safeBottom: 0.08 },
];

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function normalizeCropRect(rect: CropRect, minSize = 0.02): CropRect {
  const x = clamp(rect.x, 0, 0.98);
  const y = clamp(rect.y, 0, 0.98);
  const maxW = Math.max(minSize, 1 - x);
  const maxH = Math.max(minSize, 1 - y);
  const w = clamp(rect.w, minSize, maxW);
  const h = clamp(rect.h, minSize, maxH);
  return { x, y, w, h };
}

function cropMediaStyle(crop?: CropRect): React.CSSProperties {
  if (!crop) {
    return {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "contain",
    };
  }

  const safe = normalizeCropRect(crop, 0.02);
  return {
    position: "absolute",
    width: `${100 / safe.w}%`,
    height: `${100 / safe.h}%`,
    left: `${(-safe.x / safe.w) * 100}%`,
    top: `${(-safe.y / safe.h) * 100}%`,
    objectFit: "cover",
  };
}

function formatSeconds(value: number) {
  const sec = Math.max(0, Number.isFinite(value) ? value : 0);
  const mm = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${ms}`;
}

function formatSecondsMs(value: number) {
  const sec = Math.max(0, Number.isFinite(value) ? value : 0);
  const mm = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function formatPercent(value: number) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function formatBytes(value: number) {
  const n = Math.max(0, Number(value || 0));
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function extFromStorageKey(key: string): string {
  const match = String(key || "").toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : "";
}

function detectAssetType(row: ClipRow): AssetType {
  const explicit = String(row.asset_type || "").toLowerCase();
  if (explicit === "image" || explicit === "audio" || explicit === "video") return explicit;
  const ext = extFromStorageKey(row.storage_key || "");
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  if ([".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac"].includes(ext)) return "audio";
  return "video";
}

function readAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(Number(el.duration) || 0);
    el.onerror = () => resolve(0);
    el.src = url;
  });
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneProject(project: ProjectState): ProjectState {
  return JSON.parse(JSON.stringify(project)) as ProjectState;
}

function buildDefaultProject(): ProjectState {
  return {
    name: "Untitled AI Post",
    frame: "9:16",
    targetDuration: 60,
    musicBedLevel: 0.35,
    safeAreaOn: true,
    visual: [],
    voiceover: [],
    music: [],
    captions: [],
  };
}

function normalizeLoadedProject(raw: any): ProjectState {
  const base = buildDefaultProject();
  const safeArray = (value: unknown) => (Array.isArray(value) ? (value as TimelineItem[]) : []);

  const frame = raw?.frame;
  const target = Number(raw?.targetDuration);

  return {
    ...base,
    ...raw,
    name: String(raw?.name || base.name),
    frame: frame === "9:16" || frame === "1:1" || frame === "16:9" ? frame : base.frame,
    targetDuration: target === 60 || target === 120 ? target : base.targetDuration,
    musicBedLevel: clamp01(Number(raw?.musicBedLevel ?? base.musicBedLevel)),
    safeAreaOn: Boolean(raw?.safeAreaOn ?? base.safeAreaOn),
    visual: safeArray(raw?.visual),
    voiceover: safeArray(raw?.voiceover),
    music: safeArray(raw?.music),
    captions: safeArray(raw?.captions),
  };
}

function sanitizeForPersistence(project: ProjectState): ProjectState {
  const next = cloneProject(project);
  next.music = next.music.filter((item) => !String(item.url || "").startsWith("blob:"));
  return next;
}

function trackLabel(track: TrackKey) {
  if (track === "visual") return "Visual";
  if (track === "voiceover") return "Voiceover";
  if (track === "music") return "Music";
  return "Captions";
}

function trackTone(track: TrackKey) {
  if (track === "visual") return "border-cyan-300/40 bg-cyan-400/14 text-cyan-100";
  if (track === "voiceover") return "border-emerald-300/40 bg-emerald-400/14 text-emerald-100";
  if (track === "music") return "border-amber-300/40 bg-amber-400/14 text-amber-100";
  return "border-fuchsia-300/40 bg-fuchsia-400/14 text-fuchsia-100";
}

function toolLabel(tab: ToolTab) {
  if (tab === "media") return "Media";
  if (tab === "audio") return "Audio";
  if (tab === "text") return "Text";
  if (tab === "export") return "Export";
  return "Project";
}

function profileForFrame(frame: FrameRatio) {
  return EXPORT_PROFILES.find((profile) => profile.frame === frame) || EXPORT_PROFILES[0];
}

function frameAspectRatio(frame: FrameRatio) {
  if (frame === "1:1") return 1;
  if (frame === "16:9") return 16 / 9;
  return 9 / 16;
}

function isEditableEventTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

function computeIsDesktop() {
  if (typeof window === "undefined") return true;
  const wide = window.matchMedia("(min-width: 1024px)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  return wide && !coarsePointer;
}

function ToolbarIcon({ tab }: { tab: ToolTab }) {
  if (tab === "media") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="15" rx="2" />
        <path d="m8 13 2.8-2.8a1.2 1.2 0 0 1 1.7 0l2.3 2.3" />
        <circle cx="9" cy="8" r="1.2" />
      </svg>
    );
  }
  if (tab === "audio") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v9" />
        <circle cx="8" cy="16" r="2.5" />
        <circle cx="16" cy="14" r="2.5" />
        <path d="M12 7.5 18 6v8" />
      </svg>
    );
  }
  if (tab === "text") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 6h16" />
        <path d="M12 6v12" />
        <path d="M8 18h8" />
      </svg>
    );
  }
  if (tab === "export") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M4 20h16" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
      <path d="M12 12v9" />
      <path d="M4 7.5 12 12l8-4.5" />
    </svg>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/[0.05] text-white/85 transition hover:border-white/30 hover:bg-white/[0.12]"
    >
      {children}
    </button>
  );
}

type EditorWorkspaceProps = {
  mode?: "page" | "card";
  onClose?: () => void;
};

export default function EditorWorkspace({ mode = "page", onClose }: EditorWorkspaceProps) {
  const cardMode = mode === "card";
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<ClipRow[]>([]);

  const [toolTab, setToolTab] = useState<ToolTab | null>(null);
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [project, setProject] = useState<ProjectState>(buildDefaultProject());
  const [selected, setSelected] = useState<{ track: TrackKey; itemId: string } | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastExportClipId, setLastExportClipId] = useState<number | null>(null);
  const [timelineHoverLens, setTimelineHoverLens] = useState<TimelineHoverLens | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(1.35);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [cropMode, setCropMode] = useState(false);
  const [cropTargetItemId, setCropTargetItemId] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<CropRect | null>(null);

  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [localMusicAssets, setLocalMusicAssets] = useState<LocalMusicAsset[]>([]);
  const localMusicInputRef = useRef<HTMLInputElement | null>(null);
  const localMusicObjectUrlsRef = useRef<string[]>([]);
  const cropDragRef = useRef<{ active: boolean; startX: number; startY: number; targetItemId: string | null }>({
    active: false,
    startX: 0,
    startY: 0,
    targetItemId: null,
  });
  const cropDraftRef = useRef<CropRect | null>(null);
  const timelineDragRef = useRef<TimelineDragState | null>(null);
  const clearTimelineDragListenersRef = useRef<(() => void) | null>(null);
  const suppressClickKeyRef = useRef<string | null>(null);

  const profile = useMemo(() => profileForFrame(project.frame), [project.frame]);
  const activeFrameAspect = useMemo(() => frameAspectRatio(project.frame), [project.frame]);
  const timelineWidthPct = useMemo(() => clamp(timelineZoom * 100, 100, 360), [timelineZoom]);

  const videos = useMemo(() => clips.filter((clip) => detectAssetType(clip) === "video"), [clips]);
  const images = useMemo(() => clips.filter((clip) => detectAssetType(clip) === "image"), [clips]);
  const audios = useMemo(() => clips.filter((clip) => detectAssetType(clip) === "audio"), [clips]);

  const timelineSeconds = useMemo(() => {
    const maxEnd = (items: TimelineItem[]) =>
      items.reduce((largest, item) => Math.max(largest, item.start + item.duration), 0);
    const trackEnd = Math.max(
      maxEnd(project.visual),
      maxEnd(project.voiceover),
      maxEnd(project.music),
      maxEnd(project.captions)
    );
    return Math.max(project.targetDuration, Math.ceil(trackEnd), 1);
  }, [project]);

  const selectedItem = useMemo(() => {
    if (!selected) return null;
    return project[selected.track].find((item) => item.id === selected.itemId) || null;
  }, [selected, project]);

  const selectedVisualItem = useMemo(() => {
    if (!selected || selected.track !== "visual") return null;
    return project.visual.find((item) => item.id === selected.itemId) || null;
  }, [selected, project.visual]);

  const activeVisual = useMemo(() => {
    const active = project.visual.find(
      (item) => playhead >= item.start && playhead < item.start + item.duration
    );
    return active || project.visual[0] || null;
  }, [project.visual, playhead]);

  const previewVisual = useMemo(() => activeVisual, [activeVisual]);

  const previewCrop = useMemo(() => {
    return previewVisual?.crop;
  }, [previewVisual]);

  const activeCaption = useMemo(() => {
    const active = project.captions.find(
      (item) => playhead >= item.start && playhead < item.start + item.duration
    );
    return active || null;
  }, [project.captions, playhead]);

  function setTrackItems(track: TrackKey, updater: (items: TimelineItem[]) => TimelineItem[]) {
    setProject((prev) => ({ ...prev, [track]: updater(prev[track]) }));
  }

  function sortTrack(items: TimelineItem[]) {
    return items.slice().sort((a, b) => a.start - b.start);
  }

  function nextTrackStart(items: TimelineItem[]) {
    return items.reduce((max, item) => Math.max(max, item.start + item.duration), 0);
  }

  function addClipToTrack(track: TrackKey, clip: ClipRow) {
    const type = detectAssetType(clip);
    const lane = project[track];
    const duration = Math.max(1, Number(clip.duration || (type === "image" ? 6 : 4)));

    const item: TimelineItem = {
      id: newId(),
      clipId: clip.id,
      type,
      title: clip.title || `${type.toUpperCase()} #${clip.id}`,
      url: clip.url,
      start: nextTrackStart(lane),
      duration,
      volume: track === "music" ? 0.6 : 1,
      motion: type === "image" ? "kenburns" : "none",
    };

    setTrackItems(track, (items) => [...items, item]);
    setSelected({ track, itemId: item.id });
    setPlayhead(item.start);
  }

  function addCaptionBlock() {
    const lane = project.captions;
    const item: TimelineItem = {
      id: newId(),
      type: "caption",
      title: "Caption",
      start: nextTrackStart(lane),
      duration: 4,
      volume: 1,
      text: "Type caption text",
      motion: "none",
    };
    setTrackItems("captions", (items) => [...items, item]);
    setSelected({ track: "captions", itemId: item.id });
    setPlayhead(item.start);
  }

  function addUploadedMusic(asset: LocalMusicAsset) {
    const lane = project.music;
    const duration = Math.max(1, Number(asset.duration || project.targetDuration));
    const item: TimelineItem = {
      id: newId(),
      type: "audio",
      title: `${asset.name} (Uploaded)`,
      url: asset.url,
      start: nextTrackStart(lane),
      duration,
      volume: 0.6,
      motion: "none",
    };
    setTrackItems("music", (items) => [...items, item]);
    setSelected({ track: "music", itemId: item.id });
    setPlayhead(item.start);
  }

  function updateSelected(patch: Partial<TimelineItem>) {
    if (!selected) return;
    setTrackItems(selected.track, (items) =>
      items.map((item) => (item.id === selected.itemId ? { ...item, ...patch } : item))
    );
  }

  function duplicateSelected() {
    if (!selected || !selectedItem) return;
    const copy: TimelineItem = {
      ...selectedItem,
      id: newId(),
      start: selectedItem.start + selectedItem.duration,
    };
    setTrackItems(selected.track, (items) => [...items, copy]);
    setSelected({ track: selected.track, itemId: copy.id });
    setPlayhead(copy.start);
  }

  function deleteSelected() {
    if (!selected) return;
    setTrackItems(selected.track, (items) => items.filter((item) => item.id !== selected.itemId));
    setSelected(null);
  }

  function snapTimeValue(value: number) {
    if (!snapToGrid) return value;
    return Math.round(value * 4) / 4;
  }

  function startTimelineItemDrag(track: TrackKey, item: TimelineItem, event: React.MouseEvent<HTMLButtonElement>) {
    if (event.button !== 0 || item.type === "caption") return;
    const laneEl = event.currentTarget.closest("[data-track-lane]") as HTMLElement | null;
    if (!laneEl) return;
    const laneRect = laneEl.getBoundingClientRect();
    if (laneRect.width < 2) return;

    event.preventDefault();
    event.stopPropagation();

    setSelected({ track, itemId: item.id });
    setPlayhead(item.start);

    clearTimelineDragListenersRef.current?.();

    timelineDragRef.current = {
      track,
      itemId: item.id,
      laneWidth: laneRect.width,
      pointerStartX: event.clientX,
      itemStart: item.start,
      itemDuration: item.duration,
      moved: false,
    };

    const onMove = (moveEvent: MouseEvent) => {
      const drag = timelineDragRef.current;
      if (!drag) return;
      const deltaPx = moveEvent.clientX - drag.pointerStartX;
      if (Math.abs(deltaPx) > 2) drag.moved = true;
      const deltaSec = (deltaPx / Math.max(1, drag.laneWidth)) * timelineSeconds;
      const maxStart = Math.max(0, timelineSeconds - drag.itemDuration);
      const nextStart = clamp(snapTimeValue(drag.itemStart + deltaSec), 0, maxStart);

      setTrackItems(drag.track, (items) =>
        items.map((laneItem) =>
          laneItem.id === drag.itemId ? { ...laneItem, start: nextStart } : laneItem
        )
      );
      setPlayhead(nextStart);
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      clearTimelineDragListenersRef.current = null;
      timelineDragRef.current = null;
    };

    const onUp = () => {
      const drag = timelineDragRef.current;
      if (drag?.moved) {
        suppressClickKeyRef.current = `${drag.track}:${drag.itemId}`;
      }
      cleanup();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    clearTimelineDragListenersRef.current = cleanup;
  }

  function resetSelectedVisualCrop() {
    if (!selectedVisualItem) return;
    setTrackItems("visual", (items) =>
      items.map((item) => (item.id === selectedVisualItem.id ? { ...item, crop: undefined } : item))
    );
    setCropTargetItemId(null);
    setCropDraft(null);
    cropDraftRef.current = null;
    cropDragRef.current.active = false;
    cropDragRef.current.targetItemId = null;
  }

  function startCropMode() {
    const source = selectedVisualItem || previewVisual;
    if (!source || source.type === "audio" || source.type === "caption") {
      setError("Select a visual clip in the timeline before cropping.");
      return;
    }
    setError(null);
    setCropMode(true);
    setCropTargetItemId(source.id);
    const base = source.crop ? normalizeCropRect(source.crop, 0.02) : { x: 0, y: 0, w: 1, h: 1 };
    cropDraftRef.current = base;
    setCropDraft(base);
  }

  function cancelCropMode() {
    setCropMode(false);
    setCropTargetItemId(null);
    setCropDraft(null);
    cropDraftRef.current = null;
    cropDragRef.current.active = false;
    cropDragRef.current.targetItemId = null;
  }

  function applyCropDraft() {
    if (!cropTargetItemId || !cropDraft) {
      cancelCropMode();
      return;
    }
    const nextCrop = normalizeCropRect(cropDraft, 0.02);
    setTrackItems("visual", (items) =>
      items.map((item) => (item.id === cropTargetItemId ? { ...item, crop: nextCrop } : item))
    );
    cancelCropMode();
  }

  function cropPointFromEvent(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    return { x, y };
  }

  function beginCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropMode) return;
    if (!previewVisual || previewVisual.type === "audio" || previewVisual.type === "caption") return;
    if (!cropTargetItemId || previewVisual.id !== cropTargetItemId) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = cropPointFromEvent(event);
    cropDragRef.current = { active: true, startX: p.x, startY: p.y, targetItemId: cropTargetItemId };
    const seedHeight = 0.02;
    const seedWidth = Math.max(0.02, seedHeight * activeFrameAspect);
    const initialDraft = normalizeCropRect({ x: p.x, y: p.y, w: seedWidth, h: seedHeight }, 0.005);
    cropDraftRef.current = initialDraft;
    setCropDraft(initialDraft);
  }

  function moveCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropDragRef.current.active) return;
    event.preventDefault();
    const p = cropPointFromEvent(event);
    const s = cropDragRef.current;
    const dirX = p.x >= s.startX ? 1 : -1;
    const dirY = p.y >= s.startY ? 1 : -1;
    let w = Math.max(0.0001, Math.abs(s.startX - p.x));
    let h = Math.max(0.0001, Math.abs(s.startY - p.y));
    if (w / h > activeFrameAspect) {
      h = w / activeFrameAspect;
    } else {
      w = h * activeFrameAspect;
    }
    const x = dirX > 0 ? s.startX : s.startX - w;
    const y = dirY > 0 ? s.startY : s.startY - h;
    const nextDraft = normalizeCropRect({ x, y, w, h }, 0.01);
    cropDraftRef.current = nextDraft;
    setCropDraft(nextDraft);
  }

  function endCropDrag(event?: React.PointerEvent<HTMLDivElement>) {
    if (event?.currentTarget && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!cropDragRef.current.active) return;
    cropDragRef.current.active = false;
    cropDragRef.current.targetItemId = cropTargetItemId;
  }

  function exportTargetVisualItem() {
    if (selected?.track === "visual" && selectedItem) return selectedItem;
    return activeVisual;
  }

  async function exportCurrentVisual({ download }: { download: boolean }) {
    if (exporting) return;
    setError(null);
    setLastExportClipId(null);

    const target = exportTargetVisualItem();
    if (!target || target.type !== "video" || !target.clipId) {
      setError("Select a video block in the visual track to export.");
      return;
    }

    const crop = normalizeCropRect(target.crop || { x: 0, y: 0, w: 1, h: 1 }, 0.02);
    const trimEnd = Math.max(0.35, Number(target.duration || 0.35));

    setExporting(true);
    try {
      const created = await apiFetch<ClipRow>(`/clips/${target.clipId}/crop`, {
        method: "POST",
        body: {
          x: crop.x,
          y: crop.y,
          w: crop.w,
          h: crop.h,
          trim_start: 0,
          trim_end: trimEnd,
        },
      });
      setLastExportClipId(Number(created?.id || 0) || null);
      await loadAssets();
      if (download && created?.id) {
        window.open(`/api/clips/${created.id}/download`, "_blank", "noopener,noreferrer");
      }
    } catch (err: any) {
      setError(err?.detail || err?.message || "Could not export clip.");
    } finally {
      setExporting(false);
    }
  }

  async function uploadLocalMusic(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setUploadingMusic(true);
    setError(null);

    try {
      const built = await Promise.all(
        files.map(async (file): Promise<LocalMusicAsset | null> => {
          if (!file.type.startsWith("audio/")) return null;
          const url = URL.createObjectURL(file);
          localMusicObjectUrlsRef.current.push(url);
          const duration = await readAudioDuration(url);
          return {
            id: newId(),
            name: file.name,
            url,
            duration,
            size: file.size,
          };
        })
      );

      const assets = built.filter((asset): asset is LocalMusicAsset => Boolean(asset));
      if (!assets.length) {
        setError("Only audio files are supported for music upload.");
      } else {
        setLocalMusicAssets((prev) => [...assets, ...prev].slice(0, 24));
      }
    } finally {
      setUploadingMusic(false);
      if (localMusicInputRef.current) localMusicInputRef.current.value = "";
    }
  }

  function removeLocalMusic(assetId: string) {
    const found = localMusicAssets.find((asset) => asset.id === assetId);
    if (!found) return;

    const inUse = project.music.some((item) => item.url === found.url);
    if (inUse) {
      setError("Remove this uploaded music from the timeline before deleting it.");
      return;
    }

    URL.revokeObjectURL(found.url);
    localMusicObjectUrlsRef.current = localMusicObjectUrlsRef.current.filter((url) => url !== found.url);
    setLocalMusicAssets((prev) => prev.filter((asset) => asset.id !== assetId));
  }

  async function loadAssets() {
    setLoading(true);
    setError(null);
    try {
      const rows = (await apiFetch<ClipRow[]>("/clips?grouped=false", { method: "GET" })) || [];
      setClips(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      setClips([]);
      setError(err?.detail || "Could not load assets for editor.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const syncDesktop = () => setIsDesktop(computeIsDesktop());
    syncDesktop();
    window.addEventListener("resize", syncDesktop);
    return () => window.removeEventListener("resize", syncDesktop);
  }, []);

  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    try {
      const rawProject = window.localStorage.getItem(PROJECT_STORAGE_KEY);
      if (rawProject) {
        setProject(normalizeLoadedProject(JSON.parse(rawProject)));
      }
    } catch {
      // ignore malformed local state
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(sanitizeForPersistence(project)));
    } catch {
      // ignore
    }
  }, [project]);

  useEffect(() => {
    if (!selected) return;
    const exists = project[selected.track].some((item) => item.id === selected.itemId);
    if (!exists) setSelected(null);
  }, [selected, project]);

  useEffect(() => {
    if (!cropTargetItemId) return;
    const exists = project.visual.some((item) => item.id === cropTargetItemId);
    if (exists) return;
    setCropMode(false);
    setCropTargetItemId(null);
    setCropDraft(null);
    cropDraftRef.current = null;
    cropDragRef.current.active = false;
    cropDragRef.current.targetItemId = null;
  }, [cropTargetItemId, project.visual]);

  useEffect(() => {
    if (cropMode) return;
    setCropDraft(null);
    setCropTargetItemId(null);
    cropDraftRef.current = null;
    cropDragRef.current.active = false;
    cropDragRef.current.targetItemId = null;
  }, [cropMode]);

  useEffect(() => {
    if (!cropMode) return;
    const source = selectedVisualItem || previewVisual;
    if (!source || source.type === "audio" || source.type === "caption") return;
    if (cropTargetItemId === source.id) return;
    const base = source.crop ? normalizeCropRect(source.crop, 0.02) : { x: 0, y: 0, w: 1, h: 1 };
    setCropTargetItemId(source.id);
    setCropDraft(base);
    cropDraftRef.current = base;
  }, [cropMode, cropTargetItemId, selectedVisualItem, previewVisual]);

  useEffect(() => {
    if (toolTab !== "media" && mediaMenuOpen) setMediaMenuOpen(false);
  }, [toolTab, mediaMenuOpen]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setPlayhead((prev) => {
        const next = prev + 0.1;
        if (next >= timelineSeconds) {
          setPlaying(false);
          return timelineSeconds;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, timelineSeconds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) return;

      if (event.key === " ") {
        event.preventDefault();
        setPlaying((prev) => !prev);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selected) return;
        event.preventDefault();
        deleteSelected();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const step = event.shiftKey ? 2 : 0.5;
        setPlayhead((prev) => clamp(prev - step, 0, timelineSeconds));
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        const step = event.shiftKey ? 2 : 0.5;
        setPlayhead((prev) => clamp(prev + step, 0, timelineSeconds));
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        if (cropMode) {
          cancelCropMode();
        } else {
          startCropMode();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Intentionally avoid function deps here; state deps keep handlers fresh without recreating callbacks across every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedItem, timelineSeconds, cropMode, selectedVisualItem, previewVisual]);

  useEffect(() => {
    if (!cropMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) return;
      if (event.key === "Enter") {
        event.preventDefault();
        applyCropDraft();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelCropMode();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Intentionally avoid function deps here; crop state deps keep handler logic in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropMode, cropTargetItemId, cropDraft]);

  useEffect(() => {
    return () => {
      clearTimelineDragListenersRef.current?.();
      localMusicObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localMusicObjectUrlsRef.current = [];
    };
  }, []);

  function renderTrackLane(track: TrackKey) {
    const items = sortTrack(project[track]);
    const laneHeight = 68;
    const lensSize = 120;
    const lensScale = 2.25;
    const playheadPct = clamp((playhead / Math.max(1, timelineSeconds)) * 100, 0, 100);
    const lensActive = Boolean(timelineHoverLens && timelineHoverLens.track === track);

    function renderItem(item: TimelineItem, interactive: boolean) {
      const leftPct = clamp((item.start / Math.max(1, timelineSeconds)) * 100, 0, 100);
      const widthPct = clamp((item.duration / Math.max(1, timelineSeconds)) * 100, 1.1, 100 - leftPct);
      const active = selected?.track === track && selected?.itemId === item.id;
      const className = cx(
        "absolute top-1/2 h-9 -translate-y-1/2 rounded-md border px-2 py-1 text-left transition",
        trackTone(track),
        item.type !== "caption" && "cursor-grab active:cursor-grabbing",
        active && "ring-2 ring-white/70"
      );
      const itemBody = (
        <>
          <div className="truncate text-[10px] font-semibold">{item.title}</div>
          <div className="text-[9px] tabular-nums opacity-90">
            {formatSeconds(item.start)} - {formatSeconds(item.start + item.duration)}
          </div>
        </>
      );

      if (!interactive) {
        return (
          <div key={item.id} className={className} style={{ left: `${leftPct}%`, width: `${widthPct}%` }}>
            {itemBody}
          </div>
        );
      }

      return (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            const key = `${track}:${item.id}`;
            if (suppressClickKeyRef.current === key) {
              suppressClickKeyRef.current = null;
              return;
            }
            setSelected({ track, itemId: item.id });
            setPlayhead(item.start);
          }}
          onMouseDown={(event) => startTimelineItemDrag(track, item, event)}
          className={className}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        >
          {itemBody}
        </button>
      );
    }

    return (
      <div className="border border-white/10 bg-[#121726] px-3 py-2" key={track}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="text-[11px] font-semibold tracking-[0.05em] text-white/82">{trackLabel(track)} Track</div>
          <div className="text-[10px] text-white/52">{items.length} items</div>
        </div>

        <div className="pb-0.5">
          <div className="clipforge-scrollbar overflow-x-auto overflow-y-visible pb-2">
            <div className="relative min-w-[720px]" style={{ width: `${timelineWidthPct}%` }}>
              <div className="grid h-3.5 grid-cols-12 text-[9px] text-white/38">
                {Array.from({ length: 13 }).map((_, index) => (
                  <span key={`${track}-tick-${index}`} className={cx("tabular-nums", index === 12 && "text-right")}>
                    {formatSeconds((timelineSeconds / 12) * index)}
                  </span>
                ))}
              </div>

              <div
                data-track-lane={track}
                className="relative mt-1 overflow-visible border border-white/10 bg-[#0b1020]/90 cursor-crosshair"
                style={{ height: laneHeight }}
                onMouseMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const x = clamp(event.clientX - rect.left, 0, rect.width);
                  const y = clamp(event.clientY - rect.top, 0, laneHeight);
                  setTimelineHoverLens({ track, x, y, laneWidth: rect.width, laneHeight });
                }}
                onMouseLeave={() => {
                  setTimelineHoverLens((prev) => (prev?.track === track ? null : prev));
                }}
              >
              <div
                className="pointer-events-none absolute inset-y-1 w-[2px] rounded-full bg-white/85"
                style={{ left: `${playheadPct}%` }}
              />

              {items.length ? (
                items.map((item) => renderItem(item, true))
              ) : (
                <div className="flex h-full items-center justify-center text-[12px] text-white/45">No items yet.</div>
              )}

              {lensActive && timelineHoverLens ? (
                <div
                  className="pointer-events-none absolute z-30 -translate-x-1/2 overflow-hidden rounded-full border border-cyan-300/75 bg-[#020914]/95 shadow-[0_20px_40px_rgba(0,0,0,0.58)]"
                  style={{
                    width: lensSize,
                    height: lensSize,
                    left: clamp(timelineHoverLens.x, lensSize / 2, Math.max(lensSize / 2, timelineHoverLens.laneWidth - lensSize / 2)),
                    top: timelineHoverLens.y - lensSize - 12,
                  }}
                >
                  <div
                    className="absolute left-0 top-0"
                    style={{
                      width: timelineHoverLens.laneWidth,
                      height: timelineHoverLens.laneHeight,
                      transformOrigin: "top left",
                      transform: `translate(${lensSize / 2 - timelineHoverLens.x * lensScale}px, ${lensSize / 2 - timelineHoverLens.y * lensScale}px) scale(${lensScale})`,
                    }}
                  >
                    <div
                      className="pointer-events-none absolute inset-y-1 w-[2px] rounded-full bg-white/90"
                      style={{ left: `${playheadPct}%` }}
                    />
                    {items.map((item) => renderItem(item, false))}
                  </div>
                  <div className="pointer-events-none absolute left-1/2 top-1.5 z-40 -translate-x-1/2 rounded-full border border-cyan-300/60 bg-[#020914]/95 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-cyan-100">
                    {formatSecondsMs((timelineHoverLens.x / Math.max(1, timelineHoverLens.laneWidth)) * timelineSeconds)}
                  </div>
                  <div className="pointer-events-none absolute inset-0 rounded-full border border-white/45" />
                  <div className="pointer-events-none absolute -bottom-2 right-2 h-5 w-1 rotate-[-36deg] rounded-full bg-cyan-200/80" />
                </div>
              ) : null}

              {lensActive ? (
                <div className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-cyan-100/80">
                  Magnifier on
                </div>
              ) : null}

              {!lensActive ? (
                <div className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-white/40">
                  Hover to magnify timeline edits
                </div>
              ) : null}

              {items.length ? null : (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-white/45">
                  No items yet.
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (isDesktop === null) {
    return (
      <div className={cx("text-sm text-white/65", cardMode ? "px-4 py-6" : "mx-auto max-w-5xl px-6 py-12")}>
        Loading editor...
      </div>
    );
  }

  if (!isDesktop) {
    return (
      <main className={cx(cardMode ? "px-2 py-2" : "mx-auto max-w-lg px-5 pb-16 pt-10 sm:px-6")}>
        <section className="surface-soft rounded-3xl border border-[#fb56074f] p-6 sm:p-7">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04] text-white/85">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8" />
              <path d="M12 16v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white/92">Editor Is Desktop-Only</h1>
          <p className="mt-2 text-sm text-white/68">
            Clipforge Editor is available only on desktop browser for timeline precision and stable preview controls.
            Open this page from a laptop or desktop browser.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {cardMode ? (
              <button type="button" onClick={onClose} className="btn-aurora px-4 py-2 text-[12px]">
                Close editor
              </button>
            ) : (
              <Link href="/app/clips" className="btn-aurora px-4 py-2 text-[12px]">
                Back to Clips
              </Link>
            )}
            <Link href="/app/generate" className="btn-ghost px-4 py-2 text-[12px]">
              Open Generator
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className={cx("relative overflow-x-hidden [max-width:100vw]", cardMode && "h-full")}>
      <main
        className={cx(
          "relative",
          cardMode ? "px-3 pb-4 pt-3 sm:px-4 sm:pt-4" : "mx-auto max-w-[1820px] px-4 pb-16 pt-8 sm:px-6 sm:pt-10"
        )}
      >
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-white/55">{cardMode ? "• Editor Card" : "• Full Page Editor"}</div>
            <h1 className={cx("mt-2 font-semibold tracking-tight text-white/95", cardMode ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl")}>
              Clipforge <span className="grad-text">Master Editor</span>
            </h1>
            <p className="mt-2 text-sm text-white/66">
              Production timeline workspace for 1-2 minute AI posts with precise visual, voiceover, music, and captions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/app/generate" className="btn-ghost px-4 py-2 text-[12px]">Open Generator</Link>
            {cardMode ? (
              <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-[12px]">
                Close Editor
              </button>
            ) : (
              <Link href="/app/clips" className="btn-ghost px-4 py-2 text-[12px]">Open Library</Link>
            )}
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-white/12 bg-[#0f1320] shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
          <div className="relative grid gap-0 xl:grid-cols-[58px_minmax(0,1fr)] xl:grid-rows-[minmax(560px,auto)_auto]">
            <nav className="border-r border-white/10 bg-[#0b0f1a] p-2 xl:row-span-2">
              <div className="flex flex-row gap-2 xl:flex-col">
                {(["media", "audio", "text", "export", "project"] as ToolTab[]).map((tab) => {
                  const active = toolTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setToolTab((prev) => (prev === tab ? null : tab))}
                      className={cx(
                        "inline-flex h-11 w-11 items-center justify-center rounded-xl border text-white/78 transition",
                        active
                          ? "border-[#fb560786] bg-[linear-gradient(140deg,rgba(255,183,3,0.18),rgba(251,86,7,0.24),rgba(58,134,255,0.18))] text-white"
                          : "border-white/12 bg-black/35 hover:border-white/28 hover:bg-white/[0.08]"
                      )}
                      title={toolLabel(tab)}
                      aria-label={toolLabel(tab)}
                    >
                      <ToolbarIcon tab={tab} />
                    </button>
                  );
                })}
              </div>
            </nav>

            {toolTab ? (
              <aside className="clipforge-scrollbar pointer-events-auto absolute left-[70px] top-3 z-30 w-[320px] max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border border-white/12 bg-[#10192b]/98 p-3 shadow-[0_25px_50px_rgba(0,0,0,0.55)]">
                <div className="mb-3 text-xs text-white/55">• {toolLabel(toolTab)}</div>

                {toolTab === "project" ? (
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Project name</label>
                      <input
                        value={project.name}
                        onChange={(event) => setProject((prev) => ({ ...prev, name: event.target.value }))}
                        className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Export profile</label>
                      <select
                        value={project.frame}
                        onChange={(event) => setProject((prev) => ({ ...prev, frame: event.target.value as FrameRatio }))}
                        className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                      >
                        {EXPORT_PROFILES.map((option) => (
                          <option key={option.id} value={option.frame}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Target duration</label>
                      <select
                        value={project.targetDuration}
                        onChange={(event) =>
                          setProject((prev) => ({
                            ...prev,
                            targetDuration: Number(event.target.value || 60),
                          }))
                        }
                        className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                      >
                        <option value={60}>1 minute</option>
                        <option value={120}>2 minutes</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProject((prev) => ({ ...prev, safeAreaOn: !prev.safeAreaOn }))}
                      className="btn-ghost px-3 py-2 text-[12px]"
                    >
                      {project.safeAreaOn ? "Hide Safe Area" : "Show Safe Area"}
                    </button>
                  </div>
                ) : null}

                {toolTab === "media" ? (
                  <div className="grid gap-3">
                    <button
                      type="button"
                      onClick={() => setMediaMenuOpen((prev) => !prev)}
                      className="inline-flex w-full items-center justify-between rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[12px] font-semibold text-white/90 transition hover:bg-white/[0.1]"
                    >
                      <span>Add Video / Image</span>
                      <span className={cx("text-white/70 transition", mediaMenuOpen && "rotate-180")}>▾</span>
                    </button>

                    {mediaMenuOpen ? (
                      <div className="rounded-2xl border border-white/10 bg-black/35 p-2.5">
                        <div>
                          <div className="mb-2 text-[12px] font-semibold text-white/85">Videos ({videos.length})</div>
                          <div className="clipforge-scrollbar grid max-h-36 gap-2 overflow-auto pr-1">
                            {videos.map((clip) => (
                              <button
                                key={clip.id}
                                type="button"
                                onClick={() => {
                                  addClipToTrack("visual", clip);
                                  setMediaMenuOpen(false);
                                }}
                                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[12px] text-white/84 hover:bg-white/[0.08]"
                              >
                                <div className="truncate font-semibold text-white/92">{clip.title || `Video #${clip.id}`}</div>
                                <div className="text-white/50">{formatSeconds(clip.duration)}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="mb-2 text-[12px] font-semibold text-white/85">Images ({images.length})</div>
                          <div className="clipforge-scrollbar grid max-h-36 gap-2 overflow-auto pr-1">
                            {images.map((clip) => (
                              <button
                                key={clip.id}
                                type="button"
                                onClick={() => {
                                  addClipToTrack("visual", clip);
                                  setMediaMenuOpen(false);
                                }}
                                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[12px] text-white/84 hover:bg-white/[0.08]"
                              >
                                <div className="truncate font-semibold text-white/92">{clip.title || `Image #${clip.id}`}</div>
                                <div className="text-white/50">Adds motion scene</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-[12px] text-white/55">
                        Click to open your media menu.
                      </div>
                    )}
                  </div>
                ) : null}

                {toolTab === "audio" ? (
                  <div className="grid gap-3">
                    <div>
                      <div className="mb-2 text-[12px] font-semibold text-white/85">Library Audio ({audios.length})</div>
                      <div className="clipforge-scrollbar grid max-h-40 gap-2 overflow-auto pr-1">
                        {audios.map((clip) => (
                          <div key={clip.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                            <div className="truncate text-[11px] font-semibold text-white/88">{clip.title || `Audio #${clip.id}`}</div>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => addClipToTrack("voiceover", clip)}
                                className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/84 hover:bg-white/[0.08]"
                              >
                                To Voice
                              </button>
                              <button
                                type="button"
                                onClick={() => addClipToTrack("music", clip)}
                                className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/84 hover:bg-white/[0.08]"
                              >
                                To Music
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="mb-2 text-[12px] font-semibold text-white/85">Upload music</div>
                      <input
                        ref={localMusicInputRef}
                        type="file"
                        accept="audio/*"
                        multiple
                        onChange={uploadLocalMusic}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => localMusicInputRef.current?.click()}
                        disabled={uploadingMusic}
                        className={cx("btn-ghost w-full px-3 py-2 text-[12px]", uploadingMusic && "cursor-not-allowed opacity-60")}
                      >
                        {uploadingMusic ? "Uploading..." : "Upload local audio"}
                      </button>
                      {localMusicAssets.length ? (
                        <div className="clipforge-scrollbar mt-3 grid max-h-36 gap-2 overflow-auto pr-1">
                          {localMusicAssets.map((asset) => (
                            <div key={asset.id} className="rounded-xl border border-white/10 bg-black/45 px-3 py-2">
                              <div className="truncate text-[11px] font-semibold text-white/90">{asset.name}</div>
                              <div className="text-[10px] text-white/52">
                                {formatSeconds(asset.duration)} • {formatBytes(asset.size)}
                              </div>
                              <div className="mt-1 grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => addUploadedMusic(asset)}
                                  className="rounded-lg border border-white/10 bg-white/[0.08] px-2 py-1.5 text-[10px] text-white/90"
                                >
                                  Add
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeLocalMusic(asset.id)}
                                  className="rounded-lg border border-white/10 bg-black/45 px-2 py-1.5 text-[10px] text-white/76"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {toolTab === "text" ? (
                  <div className="grid gap-3">
                    <button type="button" onClick={addCaptionBlock} className="btn-aurora px-3 py-2 text-[12px]">
                      Add Caption Block
                    </button>
                    {project.captions.length ? (
                      <div className="clipforge-scrollbar grid max-h-44 gap-2 overflow-auto pr-1">
                        {sortTrack(project.captions).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelected({ track: "captions", itemId: item.id });
                              setPlayhead(item.start);
                            }}
                            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left"
                          >
                            <div className="truncate text-[12px] font-semibold text-white/90">{item.title}</div>
                            <div className="text-[10px] text-white/52">
                              {formatSeconds(item.start)} • {formatSeconds(item.duration)}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {toolTab === "export" ? (
                  <div className="grid gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/72">
                      Export saves the selected visual video block as a new clip in your library. Use the Clips page to download or post it.
                    </div>
                    <button
                      type="button"
                      onClick={() => exportCurrentVisual({ download: false })}
                      disabled={exporting}
                      className={cx("btn-aurora px-3 py-2 text-[12px]", exporting && "cursor-not-allowed opacity-70")}
                    >
                      {exporting ? "Exporting..." : "Save To Clips"}
                    </button>
                    <button
                      type="button"
                      onClick={() => exportCurrentVisual({ download: true })}
                      disabled={exporting}
                      className={cx("btn-ghost px-3 py-2 text-[12px]", exporting && "cursor-not-allowed opacity-70")}
                    >
                      Save + Download
                    </button>
                    {lastExportClipId ? (
                      <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-[12px] text-emerald-100">
                        Clip exported to library (ID #{lastExportClipId}).
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link href="/app/clips" className="btn-ghost px-3 py-1.5 text-[11px]">
                            Open Clips
                          </Link>
                          <a
                            href={`/api/clips/${lastExportClipId}/download`}
                            className="btn-ghost px-3 py-1.5 text-[11px]"
                          >
                            Download Clip
                          </a>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </aside>
            ) : null}

            <section className="border-b border-white/10 bg-[#121726] p-4 xl:col-start-2">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-xs text-white/55">• Preview Stage</div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (cropMode) cancelCropMode();
                      else startCropMode();
                    }}
                    className={cx(
                      "border px-3 py-1 text-[11px] transition",
                      cropMode
                        ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-100"
                        : "border-white/10 bg-white/[0.03] text-white/72"
                    )}
                  >
                    {cropMode ? "Crop mode on" : "Crop"}
                  </button>
                  {cropMode ? (
                    <>
                      <button type="button" onClick={applyCropDraft} className="border border-emerald-300/35 bg-emerald-400/12 px-3 py-1 text-[11px] text-emerald-100 transition">
                        Apply crop
                      </button>
                      <button type="button" onClick={cancelCropMode} className="border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/72 transition">
                        Cancel
                      </button>
                    </>
                  ) : null}
                  <div className="border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/72">
                    {profile.label}
                  </div>
                </div>
              </div>
              <div className="border border-white/10 bg-black/45 p-4">
                <div className="relative h-[500px] overflow-hidden border border-white/10 bg-[#060b16]">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(58,134,255,0.18),transparent_50%),radial-gradient(circle_at_78%_72%,rgba(251,86,7,0.16),transparent_56%)]" />
                  <div className="absolute inset-0 overflow-hidden">
                    {previewVisual?.type === "image" && previewVisual.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewVisual.url} alt={previewVisual.title} className="absolute" style={cropMediaStyle(previewCrop)} />
                    ) : previewVisual?.url ? (
                      <video src={previewVisual.url} muted autoPlay loop playsInline preload="metadata" className="absolute" style={cropMediaStyle(previewCrop)} />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/52">
                        Open sidepanel media button and add video/image assets to the timeline.
                      </div>
                    )}
                  </div>

                  {activeCaption?.text ? (
                    <div className="pointer-events-none absolute bottom-[8%] left-1/2 -translate-x-1/2 bg-black/45 px-3 py-1.5 text-center text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,0.5)]">
                      {activeCaption.text}
                    </div>
                  ) : null}

                  {previewVisual?.crop && !cropMode ? (
                    <div
                      className="pointer-events-none absolute z-10 border border-cyan-200/45"
                      style={{
                        left: `${previewVisual.crop.x * 100}%`,
                        top: `${previewVisual.crop.y * 100}%`,
                        width: `${previewVisual.crop.w * 100}%`,
                        height: `${previewVisual.crop.h * 100}%`,
                        boxShadow: "0 0 0 9999px rgba(0,0,0,0.2)",
                      }}
                    />
                  ) : null}

                  {previewVisual && cropMode ? (
                    <div
                      className={cx(
                        "absolute inset-0 z-20 touch-none",
                        cropTargetItemId === previewVisual.id ? "cursor-crosshair" : "cursor-not-allowed"
                      )}
                      onPointerDown={beginCropDrag}
                      onPointerMove={moveCropDrag}
                      onPointerUp={endCropDrag}
                      onPointerCancel={endCropDrag}
                    >
                      {cropDraft && cropTargetItemId === previewVisual.id ? (
                        <div
                          className="pointer-events-none absolute border-2 border-cyan-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                          style={{
                            left: `${cropDraft.x * 100}%`,
                            top: `${cropDraft.y * 100}%`,
                            width: `${cropDraft.w * 100}%`,
                            height: `${cropDraft.h * 100}%`,
                          }}
                        />
                      ) : null}
                      <div className="pointer-events-none absolute left-3 top-3 bg-black/70 px-2 py-1 text-[10px] font-semibold text-cyan-100">
                        Drag to draw crop frame ({project.frame} lock). Press Enter to apply, Esc to cancel.
                      </div>
                      {cropTargetItemId !== previewVisual.id ? (
                        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-[10px] text-amber-100">
                          Move playhead to the selected visual clip to continue cropping.
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {project.safeAreaOn ? (
                    <>
                      <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-white/35" style={{ height: `${profile.safeTop * 100}%` }} />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-white/35" style={{ height: `${profile.safeBottom * 100}%` }} />
                    </>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <IconButton label="Back 1 second" onClick={() => setPlayhead((prev) => clamp(prev - 1, 0, timelineSeconds))}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M11 6 5 12l6 6" />
                      <path d="M19 6v12" />
                    </svg>
                  </IconButton>
                  <IconButton label={playing ? "Pause" : "Play"} onClick={() => setPlaying((prev) => !prev)}>
                    {playing ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                        <rect x="7" y="5" width="3.8" height="14" rx="1" />
                        <rect x="13.2" y="5" width="3.8" height="14" rx="1" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                        <path d="M8 6.5c0-1.02 1.1-1.66 1.98-1.13l8.24 4.95a1.31 1.31 0 0 1 0 2.26l-8.24 4.95A1.32 1.32 0 0 1 8 16.39V6.5Z" />
                      </svg>
                    )}
                  </IconButton>
                  <IconButton label="Forward 1 second" onClick={() => setPlayhead((prev) => clamp(prev + 1, 0, timelineSeconds))}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m13 6 6 6-6 6" />
                      <path d="M5 6v12" />
                    </svg>
                  </IconButton>
                </div>
              </div>
            </section>

            <section className="bg-[#121726] p-3.5 xl:col-start-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-white/55">• Timeline</div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/70">
                    Length {formatSeconds(timelineSeconds)}
                  </div>
                  <label className="flex items-center gap-2 border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70">
                    Zoom {timelineZoom.toFixed(2)}x
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.05}
                      value={timelineZoom}
                      onChange={(event) => setTimelineZoom(clamp(Number(event.target.value || 1), 1, 3))}
                      className="w-24 accent-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setSnapToGrid((prev) => !prev)}
                    className={cx(
                      "border px-3 py-1 text-[11px] transition",
                      snapToGrid
                        ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-100"
                        : "border-white/10 bg-white/[0.03] text-white/70"
                    )}
                  >
                    Snap {snapToGrid ? "on" : "off"}
                  </button>
                  <label className="flex items-center gap-2 border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70">
                    Music {formatPercent(project.musicBedLevel)}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={project.musicBedLevel}
                      onChange={(event) =>
                        setProject((prev) => ({
                          ...prev,
                          musicBedLevel: clamp01(Number(event.target.value || prev.musicBedLevel)),
                        }))
                      }
                      className="w-24 accent-white"
                    />
                  </label>
                  <label className="flex items-center gap-2 border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70">
                    Playhead {formatSeconds(playhead)}
                    <input
                      type="range"
                      min={0}
                      max={timelineSeconds}
                      step={0.01}
                      value={playhead}
                      onChange={(event) => setPlayhead(clamp(Number(event.target.value || 0), 0, timelineSeconds))}
                      className="w-40 accent-white"
                    />
                  </label>
                </div>
              </div>

              <div className="mb-3 text-[10px] text-white/45">
                Shortcuts: Space play/pause, Arrows nudge playhead, Shift+Arrows jump 2s, Ctrl/Cmd+D duplicate, Delete remove, C crop mode.
              </div>

              {selectedItem && selected ? (
                <div className="mb-3 grid gap-2 border border-white/10 bg-white/[0.03] p-3 lg:grid-cols-[minmax(0,1fr)_120px_120px_auto_auto]">
                  <input
                    value={selectedItem.title}
                    onChange={(event) => updateSelected({ title: event.target.value })}
                    className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={selectedItem.start}
                    onChange={(event) => updateSelected({ start: clamp(snapTimeValue(Number(event.target.value || 0)), 0, 600) })}
                    className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                  />
                  <input
                    type="number"
                    min={0.2}
                    step={0.01}
                    value={selectedItem.duration}
                    onChange={(event) => updateSelected({ duration: clamp(Number(event.target.value || 1), 0.2, 600) })}
                    className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                  />
                  <button type="button" onClick={duplicateSelected} className="btn-ghost px-3 py-2 text-[12px]">
                    Duplicate
                  </button>
                  <button type="button" onClick={deleteSelected} className="btn-ghost px-3 py-2 text-[12px]">
                    Delete
                  </button>
                  {selected.track === "visual" && selectedItem.crop ? (
                    <div className="flex flex-wrap gap-2 lg:col-span-5">
                      <button type="button" onClick={resetSelectedVisualCrop} className="btn-ghost px-3 py-2 text-[12px]">
                        Reset Crop
                      </button>
                    </div>
                  ) : null}
                  {selectedItem.type === "caption" ? (
                    <textarea
                      rows={2}
                      value={selectedItem.text || ""}
                      onChange={(event) => updateSelected({ text: event.target.value })}
                      className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm text-white/92 outline-none focus:border-white/25 lg:col-span-5"
                    />
                  ) : null}
                </div>
              ) : (
                <div className="mb-3 border border-dashed border-white/15 bg-white/[0.02] p-3 text-[12px] text-white/55">
                  Select a timeline block to edit timing in milliseconds.
                </div>
              )}

              <div className="grid gap-2.5">
                {(["visual", "voiceover", "music", "captions"] as TrackKey[]).map((track) =>
                  renderTrackLane(track)
                )}
              </div>
            </section>
          </div>
        </section>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {loading ? <div className="mt-3 text-xs text-white/60">Refreshing assets...</div> : null}
      </main>
    </div>
  );
}
