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
  clientX: number;
  clientY: number;
};
type CropDragMode =
  | "draw"
  | "move"
  | "resize-se"
  | "resize-sw"
  | "resize-ne"
  | "resize-nw"
  | "resize-n"
  | "resize-s"
  | "resize-e"
  | "resize-w";
type CropDragState = {
  mode: CropDragMode;
  startX: number;
  startY: number;
  stageW: number;
  stageH: number;
  stageLeft: number;
  stageTop: number;
  startRect: CropRect;
  ratio: number;
};
type TimelineDragState = {
  track: TrackKey;
  itemId: string;
  mode: "move" | "resize-start" | "resize-end";
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
      imageRendering: "auto",
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
    imageRendering: "auto",
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
    targetDuration: target === 60 || target === 120 || target === 180 ? target : base.targetDuration,
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
  if (tab === "project") return "Canvas";
  if (tab === "audio") return "Audio";
  if (tab === "text") return "Text";
  if (tab === "export") return "Videos";
  return "Tool";
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
        <path d="M7 16a4 4 0 0 1 .5-8 5.2 5.2 0 0 1 10 1.8A3.2 3.2 0 1 1 18 16H7Z" />
        <path d="M12 8v7" />
        <path d="m9.5 10.5 2.5-2.5 2.5 2.5" />
      </svg>
    );
  }
  if (tab === "project") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4.5" y="5" width="15" height="14" rx="2" />
        <path d="M8 9h8" />
        <path d="M8 13h8" />
      </svg>
    );
  }
  if (tab === "audio") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v9" />
        <circle cx="8" cy="16.5" r="2.5" />
        <circle cx="16" cy="14.5" r="2.5" />
        <path d="m12 7 6-1v8.5" />
      </svg>
    );
  }
  if (tab === "text") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 6h14" />
        <path d="M12 6v12" />
        <path d="M8.5 18h7" />
      </svg>
    );
  }
  if (tab === "export") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="2.2" />
        <path d="m11 10 4 2.2-4 2.2V10Z" />
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

const TOOL_TABS: ToolTab[] = ["media", "project", "text", "audio", "export"];

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
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [cropMode, setCropMode] = useState(false);
  const [cropTargetItemId, setCropTargetItemId] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<CropRect | null>(null);
  const [showCropGrid, setShowCropGrid] = useState(true);
  const [cropSnapGuides, setCropSnapGuides] = useState(true);
  const [lockCropAspect, setLockCropAspect] = useState(true);

  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [localMusicAssets, setLocalMusicAssets] = useState<LocalMusicAsset[]>([]);
  const localMusicInputRef = useRef<HTMLInputElement | null>(null);
  const localMusicObjectUrlsRef = useRef<string[]>([]);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const cropDragRef = useRef<CropDragState | null>(null);
  const clearCropDragListenersRef = useRef<(() => void) | null>(null);
  const cropDraftRef = useRef<CropRect | null>(null);
  const timelineDragRef = useRef<TimelineDragState | null>(null);
  const clearTimelineDragListenersRef = useRef<(() => void) | null>(null);
  const suppressClickKeyRef = useRef<string | null>(null);

  const profile = useMemo(() => profileForFrame(project.frame), [project.frame]);
  const activeFrameAspect = useMemo(() => frameAspectRatio(project.frame), [project.frame]);
  const timelineWidthPct = useMemo(() => clamp(timelineZoom * 100, 100, 260), [timelineZoom]);

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

  const playbackEndSeconds = useMemo(() => {
    const maxEnd = (items: TimelineItem[]) =>
      items.reduce((largest, item) => Math.max(largest, item.start + item.duration), 0);
    const contentEnd = Math.max(
      maxEnd(project.visual),
      maxEnd(project.voiceover),
      maxEnd(project.music),
      maxEnd(project.captions)
    );
    if (contentEnd > 0.01) return Math.max(0.01, contentEnd);
    return Math.max(0.01, timelineSeconds);
  }, [project.visual, project.voiceover, project.music, project.captions, timelineSeconds]);

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

  const previewStageHeight = useMemo(() => (cardMode ? 420 : 500), [cardMode]);

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

  function togglePlayback() {
    setPlaying((prev) => {
      if (prev) return false;
      setPlayhead((current) => (current >= playbackEndSeconds - 0.05 ? 0 : current));
      return true;
    });
  }

  function snapTimeValue(value: number) {
    if (!snapToGrid) return value;
    return Math.round(value * 4) / 4;
  }

  function startTimelineItemDrag(
    track: TrackKey,
    item: TimelineItem,
    event: React.MouseEvent<HTMLElement>,
    mode: "move" | "resize-start" | "resize-end" = "move"
  ) {
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
      mode,
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
      if (drag.mode === "move") {
        const maxStart = Math.max(0, timelineSeconds - drag.itemDuration);
        const nextStart = clamp(snapTimeValue(drag.itemStart + deltaSec), 0, maxStart);
        setTrackItems(drag.track, (items) =>
          items.map((laneItem) =>
            laneItem.id === drag.itemId ? { ...laneItem, start: nextStart } : laneItem
          )
        );
        setPlayhead(nextStart);
        return;
      }

      const minDuration = 0.2;
      const itemEnd = drag.itemStart + drag.itemDuration;
      if (drag.mode === "resize-start") {
        const nextStart = clamp(snapTimeValue(drag.itemStart + deltaSec), 0, itemEnd - minDuration);
        const nextDuration = Math.max(minDuration, itemEnd - nextStart);
        setTrackItems(drag.track, (items) =>
          items.map((laneItem) =>
            laneItem.id === drag.itemId
              ? { ...laneItem, start: nextStart, duration: nextDuration }
              : laneItem
          )
        );
        setPlayhead(nextStart);
        return;
      }

      const maxDuration = Math.max(minDuration, 600 - drag.itemStart);
      const nextDuration = clamp(snapTimeValue(drag.itemDuration + deltaSec), minDuration, maxDuration);
      setTrackItems(drag.track, (items) =>
        items.map((laneItem) =>
          laneItem.id === drag.itemId ? { ...laneItem, duration: nextDuration } : laneItem
        )
      );
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
    clearCropDragListenersRef.current?.();
    cropDragRef.current = null;
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
    clearCropDragListenersRef.current?.();
    cropDragRef.current = null;
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

  function applyCropRectDraft(nextRect: CropRect) {
    const minSize = 0.08;
    const clamped = normalizeCropRect(nextRect, minSize);

    if (cropSnapGuides) {
      const snap = 0.012;
      const centerX = clamped.x + clamped.w / 2;
      const centerY = clamped.y + clamped.h / 2;
      if (Math.abs(clamped.x) <= snap) clamped.x = 0;
      if (Math.abs(clamped.y) <= snap) clamped.y = 0;
      if (Math.abs(1 - (clamped.x + clamped.w)) <= snap) clamped.x = Math.max(0, 1 - clamped.w);
      if (Math.abs(1 - (clamped.y + clamped.h)) <= snap) clamped.y = Math.max(0, 1 - clamped.h);
      if (Math.abs(centerX - 0.5) <= snap) clamped.x = clamp01(0.5 - clamped.w / 2);
      if (Math.abs(centerY - 0.5) <= snap) clamped.y = clamp01(0.5 - clamped.h / 2);
      if (clamped.x + clamped.w > 1) clamped.x = Math.max(0, 1 - clamped.w);
      if (clamped.y + clamped.h > 1) clamped.y = Math.max(0, 1 - clamped.h);
    }

    cropDraftRef.current = clamped;
    setCropDraft(clamped);
  }

  function stopCropDrag() {
    cropDragRef.current = null;
    window.removeEventListener("pointermove", onCropPointerMove);
    window.removeEventListener("pointerup", stopCropDrag);
    clearCropDragListenersRef.current = null;
  }

  function onCropPointerMove(event: PointerEvent) {
    const state = cropDragRef.current;
    if (!state) return;

    const dx = (event.clientX - state.startX) / Math.max(1, state.stageW);
    const dy = (event.clientY - state.startY) / Math.max(1, state.stageH);

    if (state.mode === "draw") {
      const curX = clamp01((event.clientX - state.stageLeft) / Math.max(1, state.stageW));
      const curY = clamp01((event.clientY - state.stageTop) / Math.max(1, state.stageH));
      const sx = clamp01(state.startRect.x);
      const sy = clamp01(state.startRect.y);
      let w = Math.max(0.08, Math.abs(curX - sx));
      let h = Math.max(0.08, Math.abs(curY - sy));
      let x = Math.min(sx, curX);
      let y = Math.min(sy, curY);
      if (lockCropAspect) {
        const ratio = Math.max(0.2, state.ratio || activeFrameAspect);
        if (w / Math.max(0.001, h) > ratio) h = w / ratio;
        else w = h * ratio;
      }
      if (x + w > 1) x = Math.max(0, 1 - w);
      if (y + h > 1) y = Math.max(0, 1 - h);
      applyCropRectDraft({ x, y, w, h });
      return;
    }

    if (state.mode === "move") {
      applyCropRectDraft({
        ...state.startRect,
        x: state.startRect.x + dx,
        y: state.startRect.y + dy,
      });
      return;
    }

    let x = state.startRect.x;
    let y = state.startRect.y;
    let w = state.startRect.w;
    let h = state.startRect.h;

    if (state.mode === "resize-se") {
      w = state.startRect.w + dx;
      h = state.startRect.h + dy;
      if (lockCropAspect) {
        if (Math.abs(dx) >= Math.abs(dy)) h = w / state.ratio;
        else w = h * state.ratio;
      }
    } else if (state.mode === "resize-e") {
      w = state.startRect.w + dx;
      if (lockCropAspect) {
        h = Math.max(0.08, w / state.ratio);
        y = state.startRect.y + (state.startRect.h - h) / 2;
      }
    } else if (state.mode === "resize-sw") {
      x = state.startRect.x + dx;
      w = state.startRect.w - dx;
      h = state.startRect.h + dy;
      if (lockCropAspect) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          w = Math.max(0.08, w);
          h = w / state.ratio;
          x = state.startRect.x + (state.startRect.w - w);
        } else {
          h = Math.max(0.08, h);
          w = h * state.ratio;
          x = state.startRect.x + (state.startRect.w - w);
        }
      }
    } else if (state.mode === "resize-w") {
      x = state.startRect.x + dx;
      w = state.startRect.w - dx;
      if (lockCropAspect) {
        w = Math.max(0.08, w);
        h = w / state.ratio;
        x = state.startRect.x + (state.startRect.w - w);
        y = state.startRect.y + (state.startRect.h - h) / 2;
      }
    } else if (state.mode === "resize-ne") {
      y = state.startRect.y + dy;
      h = state.startRect.h - dy;
      w = state.startRect.w + dx;
      if (lockCropAspect) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          w = Math.max(0.08, w);
          h = w / state.ratio;
          y = state.startRect.y + (state.startRect.h - h);
        } else {
          h = Math.max(0.08, h);
          w = h * state.ratio;
          y = state.startRect.y + (state.startRect.h - h);
        }
      }
    } else if (state.mode === "resize-n") {
      y = state.startRect.y + dy;
      h = state.startRect.h - dy;
      if (lockCropAspect) {
        h = Math.max(0.08, h);
        w = h * state.ratio;
        y = state.startRect.y + (state.startRect.h - h);
        x = state.startRect.x + (state.startRect.w - w) / 2;
      }
    } else if (state.mode === "resize-s") {
      h = state.startRect.h + dy;
      if (lockCropAspect) {
        h = Math.max(0.08, h);
        w = h * state.ratio;
        x = state.startRect.x + (state.startRect.w - w) / 2;
      }
    } else {
      x = state.startRect.x + dx;
      y = state.startRect.y + dy;
      w = state.startRect.w - dx;
      h = state.startRect.h - dy;
      if (lockCropAspect) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          w = Math.max(0.08, w);
          h = w / state.ratio;
          x = state.startRect.x + (state.startRect.w - w);
          y = state.startRect.y + (state.startRect.h - h);
        } else {
          h = Math.max(0.08, h);
          w = h * state.ratio;
          x = state.startRect.x + (state.startRect.w - w);
          y = state.startRect.y + (state.startRect.h - h);
        }
      }
    }

    applyCropRectDraft({ x, y, w, h });
  }

  function beginCropDrag(event: React.PointerEvent<HTMLElement>, mode: CropDragMode) {
    if (!cropMode) return;
    if (!previewVisual || previewVisual.type === "audio" || previewVisual.type === "caption") return;
    if (!cropTargetItemId || previewVisual.id !== cropTargetItemId) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const stage = previewStageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const startRect = cropDraftRef.current || cropDraft || { x: 0, y: 0, w: 1, h: 1 };
    cropDragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      stageW: bounds.width,
      stageH: bounds.height,
      stageLeft: bounds.left,
      stageTop: bounds.top,
      startRect: { ...startRect },
      ratio: startRect.w / Math.max(0.0001, startRect.h),
    };

    clearCropDragListenersRef.current?.();
    window.addEventListener("pointermove", onCropPointerMove, { passive: true });
    window.addEventListener("pointerup", stopCropDrag, { once: true });
    clearCropDragListenersRef.current = stopCropDrag;
  }

  function beginCropDraw(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropMode) return;
    if (!previewVisual || previewVisual.type === "audio" || previewVisual.type === "caption") return;
    if (!cropTargetItemId || previewVisual.id !== cropTargetItemId) return;
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();

    const stage = previewStageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const x = clamp01((event.clientX - bounds.left) / Math.max(1, bounds.width));
    const y = clamp01((event.clientY - bounds.top) / Math.max(1, bounds.height));
    const seedHeight = 0.1;
    const seedWidth = lockCropAspect ? Math.max(0.1, seedHeight * activeFrameAspect) : 0.1;
    const seedRect = normalizeCropRect({ x, y, w: seedWidth, h: seedHeight }, 0.08);
    applyCropRectDraft(seedRect);

    cropDragRef.current = {
      mode: "draw",
      startX: event.clientX,
      startY: event.clientY,
      stageW: bounds.width,
      stageH: bounds.height,
      stageLeft: bounds.left,
      stageTop: bounds.top,
      startRect: { x, y, w: seedWidth, h: seedHeight },
      ratio: activeFrameAspect,
    };

    clearCropDragListenersRef.current?.();
    window.addEventListener("pointermove", onCropPointerMove, { passive: true });
    window.addEventListener("pointerup", stopCropDrag, { once: true });
    clearCropDragListenersRef.current = stopCropDrag;
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
    clearCropDragListenersRef.current?.();
    cropDragRef.current = null;
  }, [cropTargetItemId, project.visual]);

  useEffect(() => {
    if (cropMode) return;
    setCropDraft(null);
    setCropTargetItemId(null);
    cropDraftRef.current = null;
    clearCropDragListenersRef.current?.();
    cropDragRef.current = null;
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
        if (next >= playbackEndSeconds) {
          setPlaying(false);
          return playbackEndSeconds;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, playbackEndSeconds]);

  useEffect(() => {
    const el = previewVideoRef.current;
    if (!el) return;
    if (previewVisual?.type !== "video") {
      el.pause();
      return;
    }

    const localOffset = clamp(playhead - previewVisual.start, 0, Math.max(0, previewVisual.duration));
    const mediaDuration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : previewVisual.duration;
    const targetTime = clamp(localOffset, 0, Math.max(0, mediaDuration - 0.05));
    const drift = Math.abs((el.currentTime || 0) - targetTime);
    if (drift > 0.25) {
      try {
        el.currentTime = targetTime;
      } catch {
        // ignore seek errors while metadata is still loading
      }
    }

    if (playing && playhead < playbackEndSeconds - 0.05) {
      void el.play().catch(() => {
        // ignore autoplay rejection in locked browser contexts
      });
    } else {
      el.pause();
    }
  }, [playhead, playing, playbackEndSeconds, previewVisual]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) return;

      if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
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
  }, [selected, selectedItem, timelineSeconds, playbackEndSeconds, cropMode, selectedVisualItem, previewVisual]);

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
      clearCropDragListenersRef.current?.();
      localMusicObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localMusicObjectUrlsRef.current = [];
    };
  }, []);

  function renderTrackLane(track: TrackKey) {
    const items = sortTrack(project[track]);
    const laneHeight = track === "visual" ? 96 : 44;
    const lensSize = 104;
    const lensScale = 2.35;
    const playheadPct = clamp((playhead / Math.max(1, timelineSeconds)) * 100, 0, 100);
    const lensActive = Boolean(timelineHoverLens && timelineHoverLens.track === track);

    function renderItem(item: TimelineItem, interactive: boolean) {
      const leftPct = clamp((item.start / Math.max(1, timelineSeconds)) * 100, 0, 100);
      const widthPct = clamp(
        (item.duration / Math.max(1, timelineSeconds)) * 100,
        track === "visual" ? 2.2 : 1.1,
        100 - leftPct
      );
      const active = selected?.track === track && selected?.itemId === item.id;
      const visualItem = track === "visual" && (item.type === "video" || item.type === "image");
      const className = cx(
        "absolute rounded-lg border text-left transition",
        track === "visual" ? "inset-y-1 px-1 py-1" : "top-1/2 h-7 -translate-y-1/2 px-2 py-1.5",
        trackTone(track),
        item.type !== "caption" && "cursor-grab active:cursor-grabbing",
        active && "ring-2 ring-white/75 shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
      );
      const itemBody = (
        <div className="relative h-full">
          {visualItem && item.url ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md border border-white/15 bg-black/70">
              {item.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={item.title} className="h-full w-full object-contain" />
              ) : (
                <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-contain" />
              )}
            </div>
          ) : null}
          {!visualItem ? <div className="relative z-10 truncate text-[10px] font-semibold tracking-[0.01em]">{item.title}</div> : null}
          {visualItem && interactive ? (
            <>
              <span
                data-resize-handle="start"
                aria-hidden="true"
                className="absolute -left-1 top-1/2 h-5 w-2.5 -translate-y-1/2 rounded bg-white/90"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  startTimelineItemDrag(track, item, event, "resize-start");
                }}
              />
              <span
                data-resize-handle="end"
                aria-hidden="true"
                className="absolute -right-1 top-1/2 h-5 w-2.5 -translate-y-1/2 rounded bg-white/90"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  startTimelineItemDrag(track, item, event, "resize-end");
                }}
              />
            </>
          ) : null}
        </div>
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
          onMouseDown={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest("[data-resize-handle]")) return;
            startTimelineItemDrag(track, item, event, "move");
          }}
          className={className}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        >
          {itemBody}
        </button>
      );
    }

    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1440;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 900;
    const lensLeft =
      lensActive && timelineHoverLens
        ? clamp(timelineHoverLens.clientX, lensSize / 2 + 10, Math.max(lensSize / 2 + 10, viewportW - lensSize / 2 - 10))
        : 0;
    const lensTop =
      lensActive && timelineHoverLens
        ? (() => {
            const above = timelineHoverLens.clientY - lensSize - 22;
            if (above >= 10) return above;
            return Math.min(viewportH - lensSize - 10, timelineHoverLens.clientY + 22);
          })()
        : 0;

    return (
      <div className={cx("grid gap-2.5 px-3 lg:grid-cols-[132px_minmax(0,1fr)]", track === "visual" ? "py-3" : "py-1.5")}>
        <div className="flex items-center justify-between gap-2 lg:block">
          <div className={cx("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]", trackTone(track))}>
            {trackLabel(track)}
          </div>
          <div className="mt-0 text-[10px] text-white/50 lg:mt-2">{items.length} items</div>
        </div>

        <div>
          <div className="clipforge-scrollbar overflow-x-auto overflow-y-visible pb-2">
            <div className="relative min-w-[560px]" style={{ width: `${timelineWidthPct}%` }}>
              {track === "visual" ? (
                <div className="grid h-4 grid-cols-12 text-[9px] text-white/38">
                  {Array.from({ length: 13 }).map((_, index) => (
                    <span key={`${track}-tick-${index}`} className={cx("tabular-nums", index === 12 && "text-right")}>
                      {formatSeconds((timelineSeconds / 12) * index)}
                    </span>
                  ))}
                </div>
              ) : null}

              <div
                data-track-lane={track}
                className={cx("relative overflow-visible rounded-xl border border-white/12 bg-[#0b1020]/92", track === "visual" ? "mt-1" : "mt-0")}
                style={{ height: laneHeight }}
                onMouseMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const x = clamp(event.clientX - rect.left, 0, rect.width);
                  const y = clamp(event.clientY - rect.top, 0, laneHeight);
                  setTimelineHoverLens({
                    track,
                    x,
                    y,
                    laneWidth: rect.width,
                    laneHeight,
                    clientX: event.clientX,
                    clientY: event.clientY,
                  });
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
                    className="pointer-events-none fixed z-[120] -translate-x-1/2 overflow-hidden rounded-2xl border border-cyan-300/75 bg-[#020914]/95 shadow-[0_20px_40px_rgba(0,0,0,0.58)]"
                    style={{
                      width: lensSize,
                      height: lensSize,
                      left: lensLeft,
                      top: lensTop,
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
                      <div className="pointer-events-none absolute inset-y-1 w-[2px] rounded-full bg-white/90" style={{ left: `${playheadPct}%` }} />
                      {items.map((item) => renderItem(item, false))}
                    </div>
                    <div className="pointer-events-none absolute left-1/2 top-1.5 z-40 -translate-x-1/2 rounded-full border border-cyan-300/60 bg-[#020914]/95 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-cyan-100">
                      {formatSecondsMs((timelineHoverLens.x / Math.max(1, timelineHoverLens.laneWidth)) * timelineSeconds)}
                    </div>
                    <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/45" />
                  </div>
                ) : null}

                {lensActive && track === "visual" ? (
                  <div className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-cyan-100/80">
                    Magnifier on
                  </div>
                ) : null}

                {!lensActive && track === "visual" ? (
                  <div className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-white/40">
                    Hover to magnify timeline edits
                  </div>
                ) : null}
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
          cardMode
            ? "h-full px-3 pb-2 pt-2 sm:px-4 sm:pt-3"
            : "mx-auto h-[calc(100vh-78px)] max-w-[1820px] px-3 py-2 sm:px-4"
        )}
      >
        <header className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h1 className={cx("font-semibold tracking-tight text-white/95", cardMode ? "text-lg" : "text-2xl sm:text-3xl")}>
              Clipforge <span className="grad-text">Master Editor</span>
            </h1>
            {!cardMode ? <p className="mt-1 text-xs text-white/66 sm:text-sm">Timeline workspace for visual, voiceover, music, and captions.</p> : null}
          </div>

          {cardMode ? (
            <button type="button" onClick={onClose} className="btn-ghost px-3 py-1.5 text-[11px]">
              Close
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/app/generate" className="btn-ghost px-4 py-2 text-[12px]">Open Generator</Link>
              <Link href="/app/clips" className="btn-ghost px-4 py-2 text-[12px]">Open Library</Link>
            </div>
          )}
        </header>

        <section
          className={cx(
            "overflow-hidden rounded-2xl border border-white/12 bg-[#0f1320] shadow-[0_30px_90px_rgba(0,0,0,0.5)]",
            cardMode ? "h-[calc(100%-44px)]" : "h-[calc(100%-92px)]"
          )}
        >
          <div className="relative grid h-full gap-0 xl:grid-cols-[60px_minmax(0,1fr)] xl:grid-rows-[auto_minmax(0,1fr)]">
            <nav className="border-r border-white/10 bg-[#0b0f1a] p-2 xl:row-span-2">
              <div className="flex flex-row gap-2 xl:flex-col">
                {TOOL_TABS.map((tab) => {
                  const active = toolTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setToolTab((prev) => (prev === tab ? null : tab))}
                      className={cx(
                        "inline-flex h-12 w-12 items-center justify-center rounded-xl border text-white/78 transition",
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
              <aside
                className={cx(
                  "clipforge-scrollbar pointer-events-auto absolute left-[72px] top-3 z-30 overflow-y-auto rounded-xl border border-white/12 bg-[#10192b]/98 p-3 shadow-[0_25px_50px_rgba(0,0,0,0.55)]",
                  toolTab === "audio" ? "w-[360px] max-h-[calc(100%-0.75rem)]" : "w-[320px] max-h-[calc(100%-1.5rem)]"
                )}
              >
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
                        <option value={180}>3 minutes</option>
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
                      <div className="grid gap-2">
                        {audios.map((clip) => (
                          <div key={clip.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                            <div className="truncate text-[11px] font-semibold text-white/88">{clip.title || `Audio #${clip.id}`}</div>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => addClipToTrack("voiceover", clip)}
                                className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/84 hover:bg-white/[0.08]"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="9" y="4" width="6" height="10" rx="3" />
                                    <path d="M6 10a6 6 0 1 0 12 0" />
                                    <path d="M12 17v3" />
                                  </svg>
                                  Voice
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => addClipToTrack("music", clip)}
                                className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/84 hover:bg-white/[0.08]"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 4v9" />
                                    <circle cx="8" cy="16.5" r="2.5" />
                                    <circle cx="16" cy="14.5" r="2.5" />
                                    <path d="m12 7 6-1v8.5" />
                                  </svg>
                                  Music
                                </span>
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
                        <span className="inline-flex items-center gap-1.5">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 15V5" />
                            <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
                            <path d="M4 19h16" />
                          </svg>
                          {uploadingMusic ? "Uploading..." : "Upload music file"}
                        </span>
                      </button>
                      {localMusicAssets.length ? (
                        <div className="mt-3 grid gap-2">
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

            <section className="min-h-0 border-b border-white/10 bg-[#121726] p-2.5 xl:col-start-2">
              <div className="grid items-start gap-2.5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-white/10 bg-black/45 p-2.5">
                  <div
                    ref={previewStageRef}
                    className="relative mx-auto w-full overflow-hidden rounded-2xl border border-white/12 bg-[#060b16]"
                    style={{ height: `${previewStageHeight}px` }}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(58,134,255,0.18),transparent_50%),radial-gradient(circle_at_78%_72%,rgba(251,86,7,0.16),transparent_56%)]" />
                    <div className="absolute inset-0 overflow-hidden">
                      {previewVisual?.type === "image" && previewVisual.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewVisual.url} alt={previewVisual.title} className="absolute" style={cropMediaStyle(previewCrop)} />
                      ) : previewVisual?.url ? (
                        <video
                          ref={previewVideoRef}
                          src={previewVisual.url}
                          muted
                          playsInline
                          preload="metadata"
                          className="absolute"
                          style={cropMediaStyle(previewCrop)}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/52">
                          Open sidepanel media button and add video/image assets to the timeline.
                        </div>
                      )}
                    </div>

                    {activeCaption?.text ? (
                      <div className="pointer-events-none absolute bottom-[8%] left-1/2 -translate-x-1/2 rounded-lg bg-black/50 px-3 py-1.5 text-center text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,0.5)]">
                        {activeCaption.text}
                      </div>
                    ) : null}

                    {previewVisual?.crop && !cropMode ? (
                      <div
                        className="pointer-events-none absolute z-10 rounded-sm border border-cyan-200/45"
                        style={{
                          left: `${previewVisual.crop.x * 100}%`,
                          top: `${previewVisual.crop.y * 100}%`,
                          width: `${previewVisual.crop.w * 100}%`,
                          height: `${previewVisual.crop.h * 100}%`,
                          boxShadow: "0 0 0 9999px rgba(0,0,0,0.24)",
                        }}
                      />
                    ) : null}

                    {previewVisual && cropMode ? (
                      <div
                        className={cx(
                          "absolute inset-0 z-20 touch-none",
                          cropTargetItemId === previewVisual.id ? "cursor-crosshair" : "cursor-not-allowed"
                        )}
                        onPointerDown={beginCropDraw}
                      >
                        {cropDraft && cropTargetItemId === previewVisual.id ? (
                          <>
                            <div className="pointer-events-none absolute left-0 right-0 top-0 bg-black/50" style={{ height: `${cropDraft.y * 100}%` }} />
                            <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-black/50" style={{ height: `${(1 - (cropDraft.y + cropDraft.h)) * 100}%` }} />
                            <div
                              className="pointer-events-none absolute left-0 bg-black/50"
                              style={{ top: `${cropDraft.y * 100}%`, width: `${cropDraft.x * 100}%`, height: `${cropDraft.h * 100}%` }}
                            />
                            <div
                              className="pointer-events-none absolute right-0 bg-black/50"
                              style={{ top: `${cropDraft.y * 100}%`, width: `${(1 - (cropDraft.x + cropDraft.w)) * 100}%`, height: `${cropDraft.h * 100}%` }}
                            />

                            <div
                              className="absolute border-2 border-cyan-300/90 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(255,255,255,0.24)] cursor-move"
                              style={{
                                left: `${cropDraft.x * 100}%`,
                                top: `${cropDraft.y * 100}%`,
                                width: `${cropDraft.w * 100}%`,
                                height: `${cropDraft.h * 100}%`,
                              }}
                              onPointerDown={(event) => beginCropDrag(event, "move")}
                            >
                              {showCropGrid ? (
                                <>
                                  <div className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-cyan-100/40" />
                                  <div className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-cyan-100/40" />
                                  <div className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-cyan-100/40" />
                                  <div className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-cyan-100/40" />
                                </>
                              ) : null}

                              <button
                                type="button"
                                aria-label="Resize top left"
                                className="absolute -left-2 -top-2 h-4 w-4 rounded-full border border-white/80 bg-cyan-200 shadow cursor-nwse-resize"
                                onPointerDown={(event) => beginCropDrag(event, "resize-nw")}
                              />
                              <button
                                type="button"
                                aria-label="Resize top edge"
                                className="absolute left-1/2 top-[-7px] h-3.5 w-6 -translate-x-1/2 rounded border border-white/80 bg-cyan-200 shadow cursor-ns-resize"
                                onPointerDown={(event) => beginCropDrag(event, "resize-n")}
                              />
                              <button
                                type="button"
                                aria-label="Resize top right"
                                className="absolute -right-2 -top-2 h-4 w-4 rounded-full border border-white/80 bg-cyan-200 shadow cursor-nesw-resize"
                                onPointerDown={(event) => beginCropDrag(event, "resize-ne")}
                              />
                              <button
                                type="button"
                                aria-label="Resize left edge"
                                className="absolute left-[-7px] top-1/2 h-6 w-3.5 -translate-y-1/2 rounded border border-white/80 bg-cyan-200 shadow cursor-ew-resize"
                                onPointerDown={(event) => beginCropDrag(event, "resize-w")}
                              />
                              <button
                                type="button"
                                aria-label="Resize right edge"
                                className="absolute right-[-7px] top-1/2 h-6 w-3.5 -translate-y-1/2 rounded border border-white/80 bg-cyan-200 shadow cursor-ew-resize"
                                onPointerDown={(event) => beginCropDrag(event, "resize-e")}
                              />
                              <button
                                type="button"
                                aria-label="Resize bottom left"
                                className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full border border-white/80 bg-cyan-200 shadow cursor-nesw-resize"
                                onPointerDown={(event) => beginCropDrag(event, "resize-sw")}
                              />
                              <button
                                type="button"
                                aria-label="Resize bottom edge"
                                className="absolute bottom-[-7px] left-1/2 h-3.5 w-6 -translate-x-1/2 rounded border border-white/80 bg-cyan-200 shadow cursor-ns-resize"
                                onPointerDown={(event) => beginCropDrag(event, "resize-s")}
                              />
                              <button
                                type="button"
                                aria-label="Resize bottom right"
                                className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border border-white/80 bg-cyan-200 shadow cursor-nwse-resize"
                                onPointerDown={(event) => beginCropDrag(event, "resize-se")}
                              />
                            </div>
                          </>
                        ) : null}
                        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold text-cyan-100">
                          Draw, drag, or resize crop. Enter apply, Esc cancel.
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

                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    <IconButton label="Back 1 second" onClick={() => setPlayhead((prev) => clamp(prev - 1, 0, timelineSeconds))}>
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M11 6 5 12l6 6" />
                        <path d="M19 6v12" />
                      </svg>
                    </IconButton>
                    <IconButton label={playing ? "Pause" : "Play"} onClick={togglePlayback}>
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

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-[11px] font-semibold text-white/88">
                      {previewVisual?.title || "No visual clip selected"}
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/35 px-2 py-1 text-[10px] text-white/68">
                      {profile.label}
                    </div>
                  </div>

                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (cropMode) cancelCropMode();
                          else startCropMode();
                        }}
                        className={cx(
                          "rounded-lg border px-3 py-1 text-[11px] transition",
                          cropMode
                            ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-100"
                            : "border-white/10 bg-white/[0.03] text-white/72"
                        )}
                      >
                        {cropMode ? "Crop mode on" : "Crop"}
                      </button>
                      {cropMode ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setLockCropAspect((prev) => !prev)}
                            className={cx(
                              "rounded-lg border px-3 py-1 text-[11px] transition",
                              lockCropAspect
                                ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-100"
                                : "border-white/10 bg-white/[0.03] text-white/72"
                            )}
                          >
                            Aspect {lockCropAspect ? "lock" : "free"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCropGrid((prev) => !prev)}
                            className={cx(
                              "rounded-lg border px-3 py-1 text-[11px] transition",
                              showCropGrid
                                ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-100"
                                : "border-white/10 bg-white/[0.03] text-white/72"
                            )}
                          >
                            Grid {showCropGrid ? "on" : "off"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCropSnapGuides((prev) => !prev)}
                            className={cx(
                              "rounded-lg border px-3 py-1 text-[11px] transition",
                              cropSnapGuides
                                ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-100"
                                : "border-white/10 bg-white/[0.03] text-white/72"
                            )}
                          >
                            Snap {cropSnapGuides ? "on" : "off"}
                          </button>
                          <button type="button" onClick={applyCropDraft} className="rounded-lg border border-emerald-300/35 bg-emerald-400/12 px-3 py-1 text-[11px] text-emerald-100 transition">
                            Apply crop
                          </button>
                          <button type="button" onClick={cancelCropMode} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/72 transition">
                            Cancel
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="grid gap-2">
                      <div className="border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-white/70">
                        Length {formatSeconds(timelineSeconds)}
                      </div>
                      <label className="flex items-center justify-between gap-2 border border-white/10 bg-black/35 px-2.5 py-1 text-[11px] text-white/70">
                        <span>Zoom {timelineZoom.toFixed(2)}x</span>
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
                            : "border-white/10 bg-black/35 text-white/70"
                        )}
                      >
                        Snap {snapToGrid ? "on" : "off"}
                      </button>
                      <label className="flex items-center justify-between gap-2 border border-white/10 bg-black/35 px-2.5 py-1 text-[11px] text-white/70">
                        <span>Music {formatPercent(project.musicBedLevel)}</span>
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
                      <label className="flex items-center justify-between gap-2 border border-white/10 bg-black/35 px-2.5 py-1 text-[11px] text-white/70">
                        <span>Playhead {formatSeconds(playhead)}</span>
                        <input
                          type="range"
                          min={0}
                          max={timelineSeconds}
                          step={0.01}
                          value={playhead}
                          onChange={(event) => setPlayhead(clamp(Number(event.target.value || 0), 0, timelineSeconds))}
                          className="w-24"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-white/10 bg-black/35 px-2.5 py-2 text-[10px] text-white/55">
                    Shortcuts: Space play/pause, Arrows nudge, Shift+Arrows jump 2s, Ctrl/Cmd+D duplicate, Delete remove, C crop.
                  </div>
                </div>
              </div>
            </section>

            <section className="min-h-0 bg-[#121726] p-3 xl:col-start-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs text-white/60">Timeline</div>
                <div className="text-[11px] text-white/55">Length {formatSeconds(timelineSeconds)}</div>
              </div>

              {selectedItem && selected ? (
                <div className="mb-2 grid gap-1.5 border border-white/10 bg-white/[0.03] p-2 lg:grid-cols-[minmax(0,1fr)_100px_100px_auto_auto]">
                  <input
                    value={selectedItem.title}
                    onChange={(event) => updateSelected({ title: event.target.value })}
                    className="h-9 rounded-xl border border-white/10 bg-black/45 px-3 text-xs text-white/92 outline-none focus:border-white/25"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={selectedItem.start}
                    onChange={(event) => updateSelected({ start: clamp(snapTimeValue(Number(event.target.value || 0)), 0, 600) })}
                    className="h-9 rounded-xl border border-white/10 bg-black/45 px-3 text-xs text-white/92 outline-none focus:border-white/25"
                  />
                  <input
                    type="number"
                    min={0.2}
                    step={0.01}
                    value={selectedItem.duration}
                    onChange={(event) => updateSelected({ duration: clamp(Number(event.target.value || 1), 0.2, 600) })}
                    className="h-9 rounded-xl border border-white/10 bg-black/45 px-3 text-xs text-white/92 outline-none focus:border-white/25"
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
                      className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-xs text-white/92 outline-none focus:border-white/25 lg:col-span-5"
                    />
                  ) : null}
                </div>
              ) : (
                <div className="mb-2 border border-dashed border-white/15 bg-white/[0.02] p-2 text-[11px] text-white/55">
                  Select a timeline block to edit timing in milliseconds.
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#0d1425]/88">
                <div className="clipforge-scrollbar overflow-y-auto">
                  {(["visual", "voiceover", "music", "captions"] as TrackKey[]).map((track, index) => (
                    <div key={track} className={cx(index > 0 && "border-t border-white/10")}>
                      {renderTrackLane(track)}
                    </div>
                  ))}
                </div>
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
