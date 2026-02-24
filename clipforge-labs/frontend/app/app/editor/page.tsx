"use client";

import Link from "next/link";
import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type AssetType = "video" | "image" | "audio";
type TrackKey = "visual" | "voiceover" | "music" | "captions";
type FrameRatio = "9:16" | "1:1" | "16:9";
type ToolTab = "media" | "audio" | "text" | "versions" | "project";
type TimelineHoverLens = {
  track: TrackKey;
  x: number;
  y: number;
  timelineWidth: number;
  laneHeight: number;
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

type SavedVersion = {
  id: string;
  label: string;
  createdAt: string;
  project: ProjectState;
};

type LocalMusicAsset = {
  id: string;
  name: string;
  url: string;
  duration: number;
  size: number;
};

const PROJECT_STORAGE_KEY = "clipforge-editor-project-v3";
const VERSION_STORAGE_KEY = "clipforge-editor-versions-v3";

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

function formatSeconds(value: number) {
  const sec = Math.max(0, Number.isFinite(value) ? value : 0);
  const mm = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${ms}`;
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

function aspectValue(frame: FrameRatio) {
  if (frame === "1:1") return "1 / 1";
  if (frame === "16:9") return "16 / 9";
  return "9 / 16";
}

function stageMaxWidth(frame: FrameRatio) {
  if (frame === "9:16") return 420;
  if (frame === "1:1") return 680;
  return 980;
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
  if (tab === "versions") return "Versions";
  return "Project";
}

function profileForFrame(frame: FrameRatio) {
  return EXPORT_PROFILES.find((profile) => profile.frame === frame) || EXPORT_PROFILES[0];
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
  if (tab === "versions") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 2.6-6.4" />
        <path d="M3 4v4h4" />
        <path d="M12 7v5l3 2" />
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

export default function EditorPage() {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<ClipRow[]>([]);

  const [toolTab, setToolTab] = useState<ToolTab>("media");
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [project, setProject] = useState<ProjectState>(buildDefaultProject());
  const [versions, setVersions] = useState<SavedVersion[]>([]);
  const [selected, setSelected] = useState<{ track: TrackKey; itemId: string } | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timelineHoverLens, setTimelineHoverLens] = useState<TimelineHoverLens | null>(null);

  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [localMusicAssets, setLocalMusicAssets] = useState<LocalMusicAsset[]>([]);
  const localMusicInputRef = useRef<HTMLInputElement | null>(null);
  const localMusicObjectUrlsRef = useRef<string[]>([]);

  const profile = useMemo(() => profileForFrame(project.frame), [project.frame]);

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

  const activeVisual = useMemo(() => {
    const active = project.visual.find(
      (item) => playhead >= item.start && playhead < item.start + item.duration
    );
    return active || project.visual[0] || null;
  }, [project.visual, playhead]);

  const activeCaption = useMemo(() => {
    const active = project.captions.find(
      (item) => playhead >= item.start && playhead < item.start + item.duration
    );
    return active || null;
  }, [project.captions, playhead]);

  const activeAudio = useMemo(() => {
    const voice = project.voiceover.find(
      (item) => playhead >= item.start && playhead < item.start + item.duration
    );
    if (voice) return voice;
    const music = project.music.find(
      (item) => playhead >= item.start && playhead < item.start + item.duration
    );
    return music || null;
  }, [project.voiceover, project.music, playhead]);

  const exportPayload = useMemo(
    () => ({
      project_name: project.name,
      profile: profile.label,
      frame: project.frame,
      target_duration_seconds: project.targetDuration,
      timeline_duration_seconds: timelineSeconds,
      safe_area: {
        enabled: project.safeAreaOn,
        top: profile.safeTop,
        bottom: profile.safeBottom,
      },
      tracks: {
        visual: project.visual,
        voiceover: project.voiceover,
        music: project.music.map((item) => ({
          ...item,
          effective_volume: Number((item.volume * project.musicBedLevel).toFixed(2)),
        })),
        captions: project.captions,
      },
    }),
    [project, profile, timelineSeconds]
  );

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

  function saveVersion() {
    const next: SavedVersion = {
      id: newId(),
      label: `${project.name} • ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      createdAt: new Date().toISOString(),
      project: cloneProject(project),
    };
    setVersions((prev) => [next, ...prev].slice(0, 20));
  }

  function restoreVersion(versionId: string) {
    const found = versions.find((version) => version.id === versionId);
    if (!found) return;
    setProject(normalizeLoadedProject(cloneProject(found.project)));
    setSelected(null);
    setPlayhead(0);
    setToolTab("project");
  }

  async function copyExportJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setError("Could not copy export JSON.");
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

      const rawVersions = window.localStorage.getItem(VERSION_STORAGE_KEY);
      if (rawVersions) {
        const parsed = JSON.parse(rawVersions);
        if (Array.isArray(parsed)) {
          setVersions(parsed.slice(0, 20));
        }
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
    try {
      window.localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(versions));
    } catch {
      // ignore
    }
  }, [versions]);

  useEffect(() => {
    if (!selected) return;
    const exists = project[selected.track].some((item) => item.id === selected.itemId);
    if (!exists) setSelected(null);
  }, [selected, project]);

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
    return () => {
      localMusicObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localMusicObjectUrlsRef.current = [];
    };
  }, []);

  function renderTrackLane(track: TrackKey) {
    const items = sortTrack(project[track]);
    const pxPerSecond = 22;
    const timelineWidth = Math.max(780, timelineSeconds * pxPerSecond);
    const laneHeight = 56;
    const lensSize = 146;
    const lensScale = 2.2;
    const playheadLeft = clamp(playhead * pxPerSecond, 0, timelineWidth);
    const lensActive = Boolean(timelineHoverLens && timelineHoverLens.track === track);

    function renderItem(item: TimelineItem, interactive: boolean) {
      const left = clamp(item.start * pxPerSecond, 0, timelineWidth - 16);
      const width = clamp(item.duration * pxPerSecond, 34, timelineWidth - left);
      const active = selected?.track === track && selected?.itemId === item.id;
      const className = cx(
        "absolute top-1/2 h-9 -translate-y-1/2 rounded-md border px-2 py-1 text-left transition",
        trackTone(track),
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
          <div key={item.id} className={className} style={{ left, width }}>
            {itemBody}
          </div>
        );
      }

      return (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            setSelected({ track, itemId: item.id });
            setPlayhead(item.start);
          }}
          className={className}
          style={{ left, width }}
        >
          {itemBody}
        </button>
      );
    }

    return (
      <div className="rounded-2xl border border-white/10 bg-black/40 p-3" key={track}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold tracking-[0.05em] text-white/80">{trackLabel(track)} Track</div>
          <div className="text-[11px] text-white/52">{items.length} items</div>
        </div>

        <div className="overflow-x-auto overflow-y-visible pb-1">
          <div className="relative" style={{ width: timelineWidth }}>
            <div className="grid h-4 grid-cols-12 text-[9px] text-white/45">
              {Array.from({ length: 13 }).map((_, index) => (
                <span key={`${track}-tick-${index}`} className={cx("tabular-nums", index === 12 && "text-right")}> 
                  {formatSeconds((timelineSeconds / 12) * index)}
                </span>
              ))}
            </div>

            <div
              className="relative mt-1.5 rounded-xl border border-white/10 bg-black/55"
              style={{ height: laneHeight }}
              onMouseMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = clamp(event.clientX - rect.left, 0, timelineWidth);
                const y = clamp(event.clientY - rect.top, 0, laneHeight);
                setTimelineHoverLens({ track, x, y, timelineWidth, laneHeight });
              }}
              onMouseLeave={() => {
                setTimelineHoverLens((prev) => (prev?.track === track ? null : prev));
              }}
            >
              <div
                className="pointer-events-none absolute inset-y-1 w-[2px] rounded-full bg-white/85"
                style={{ left: `${playheadLeft}px` }}
              />

              {items.length ? (
                items.map((item) => renderItem(item, true))
              ) : (
                <div className="flex h-full items-center justify-center text-[12px] text-white/45">No items yet.</div>
              )}

              {lensActive && timelineHoverLens ? (
                <div
                  className="pointer-events-none absolute bottom-[calc(100%+8px)] z-20 overflow-hidden rounded-xl border border-cyan-300/55 bg-[#020914]/95 shadow-[0_24px_45px_rgba(0,0,0,0.55)]"
                  style={{
                    width: lensSize,
                    height: lensSize,
                    left: clamp(timelineHoverLens.x - lensSize / 2, 8, timelineWidth - lensSize - 8),
                  }}
                >
                  <div
                    className="absolute left-0 top-0"
                    style={{
                      width: timelineHoverLens.timelineWidth,
                      height: timelineHoverLens.laneHeight,
                      transformOrigin: "top left",
                      transform: `translate(${lensSize / 2 - timelineHoverLens.x * lensScale}px, ${lensSize / 2 - timelineHoverLens.y * lensScale}px) scale(${lensScale})`,
                    }}
                  >
                    <div
                      className="pointer-events-none absolute inset-y-1 w-[2px] rounded-full bg-white/90"
                      style={{ left: `${playheadLeft}px` }}
                    />
                    {items.map((item) => renderItem(item, false))}
                  </div>
                  <div className="pointer-events-none absolute inset-0 border border-white/35" />
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-cyan-200/90" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-center text-[10px] font-semibold tabular-nums text-cyan-100">
                    {formatSeconds((timelineHoverLens.x / timelineWidth) * timelineSeconds)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isDesktop === null) {
    return <div className="mx-auto max-w-5xl px-6 py-12 text-sm text-white/65">Loading editor...</div>;
  }

  if (!isDesktop) {
    return (
      <main className="mx-auto max-w-lg px-5 pb-16 pt-10 sm:px-6">
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
            <Link href="/app/clips" className="btn-aurora px-4 py-2 text-[12px]">
              Back to Clips
            </Link>
            <Link href="/app/generate" className="btn-ghost px-4 py-2 text-[12px]">
              Open Generator
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-[1820px] px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-white/55">• Full Page Editor</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Clipforge <span className="grad-text">Master Editor</span>
            </h1>
            <p className="mt-2 text-sm text-white/66">
              Production timeline workspace for 1-2 minute AI posts with precise visual, voiceover, music, and captions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/app/generate" className="btn-ghost px-4 py-2 text-[12px]">Open Generator</Link>
            <Link href="/app/clips" className="btn-ghost px-4 py-2 text-[12px]">Open Library</Link>
            <button type="button" onClick={saveVersion} className="btn-aurora px-4 py-2 text-[12px]">Save Version</button>
            <button type="button" onClick={copyExportJson} className="btn-aurora px-4 py-2 text-[12px]">{copied ? "Copied" : "Copy Export JSON"}</button>
          </div>
        </header>

        <section className="rounded-[30px] border border-[#fb560744] bg-[linear-gradient(180deg,rgba(7,10,18,0.96),rgba(5,8,14,0.94))] p-3 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
          <div className="grid gap-3 xl:grid-cols-[58px_280px_minmax(0,1.45fr)_250px] xl:grid-rows-[minmax(520px,1fr)_minmax(230px,auto)] xl:h-[calc(100svh-8.5rem)]">
            <nav className="rounded-2xl border border-white/10 bg-[#060d19] p-2 xl:row-span-2">
              <div className="flex flex-row gap-2 xl:flex-col">
                {(["media", "audio", "text", "versions", "project"] as ToolTab[]).map((tab) => {
                  const active = toolTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setToolTab(tab)}
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

            <aside className="rounded-2xl border border-white/10 bg-[#081121] p-4 xl:min-h-0 xl:overflow-y-auto">
              <div className="mb-3 text-xs text-white/55">• {toolLabel(toolTab)}</div>

              {toolTab === "project" ? (
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <label className="text-[12px] text-white/65">Project name</label>
                    <input
                      value={project.name}
                      onChange={(event) => setProject((prev) => ({ ...prev, name: event.target.value }))}
                      className="h-11 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-[12px] text-white/65">Export profile</label>
                    <select
                      value={project.frame}
                      onChange={(event) => setProject((prev) => ({ ...prev, frame: event.target.value as FrameRatio }))}
                      className="h-11 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
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
                      className="h-11 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                    >
                      <option value={60}>1 minute</option>
                      <option value={120}>2 minutes</option>
                    </select>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/68">
                    Frame: <span className="font-semibold text-white/92">{project.frame}</span>
                    <br />
                    Timeline: <span className="font-semibold text-white/92">{formatSeconds(timelineSeconds)}</span>
                    <br />
                    Safe area: <span className="font-semibold text-white/92">{project.safeAreaOn ? "Visible" : "Hidden"}</span>
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
                        <div className="grid max-h-36 gap-2 overflow-auto pr-1">
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
                        <div className="grid max-h-36 gap-2 overflow-auto pr-1">
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
                      Use the button above to open your media picker.
                    </div>
                  )}
                </div>
              ) : null}

              {toolTab === "audio" ? (
                <div className="grid gap-3">
                  <div>
                    <div className="mb-2 text-[12px] font-semibold text-white/85">Library Audio ({audios.length})</div>
                    <div className="grid max-h-44 gap-2 overflow-auto pr-1">
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
                      <div className="mt-3 grid max-h-40 gap-2 overflow-auto pr-1">
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
                    ) : (
                      <div className="mt-2 text-[11px] text-white/55">MP3, WAV, M4A, AAC, OGG supported.</div>
                    )}
                  </div>
                </div>
              ) : null}

              {toolTab === "text" ? (
                <div className="grid gap-3">
                  <button type="button" onClick={addCaptionBlock} className="btn-aurora px-3 py-2 text-[12px]">
                    Add Caption Block
                  </button>
                  {project.captions.length ? (
                    <div className="grid max-h-52 gap-2 overflow-auto pr-1">
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
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-[12px] text-white/55">
                      No captions on timeline yet.
                    </div>
                  )}
                </div>
              ) : null}

              {toolTab === "versions" ? (
                <div className="grid gap-3">
                  <button type="button" onClick={saveVersion} className="btn-aurora px-3 py-2 text-[12px]">
                    Save Snapshot
                  </button>
                  {versions.length ? (
                    <div className="grid max-h-60 gap-2 overflow-auto pr-1">
                      {versions.map((version) => (
                        <button
                          key={version.id}
                          type="button"
                          onClick={() => restoreVersion(version.id)}
                          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:bg-white/[0.08]"
                        >
                          <div className="truncate text-[12px] font-semibold text-white/92">{version.label}</div>
                          <div className="text-[10px] text-white/52">{new Date(version.createdAt).toLocaleString()}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-[12px] text-white/55">
                      No saved versions yet.
                    </div>
                  )}
                </div>
              ) : null}
            </aside>

            <section className="rounded-2xl border border-white/10 bg-[#081120] p-4 xl:min-h-0 xl:overflow-hidden">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-xs text-white/55">• Preview Stage</div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/72">
                  {profile.label}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                <div className="relative h-[430px] overflow-hidden rounded-xl border border-white/10 bg-[#030712]">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(58,134,255,0.18),transparent_50%),radial-gradient(circle_at_78%_72%,rgba(251,86,7,0.16),transparent_56%)]" />
                  <div className="absolute inset-5 flex items-center justify-center">
                    <div
                      className="relative h-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_20px_45px_rgba(0,0,0,0.55)]"
                      style={{
                        aspectRatio: aspectValue(project.frame),
                        width:
                          project.frame === "9:16"
                            ? "min(36%, 380px)"
                            : project.frame === "1:1"
                              ? "min(58%, 560px)"
                              : "min(92%, 1040px)",
                        maxWidth: stageMaxWidth(project.frame),
                      }}
                    >
                      {activeVisual?.type === "image" && activeVisual.url ? (
                        <img src={activeVisual.url} alt={activeVisual.title} className="h-full w-full object-cover" />
                      ) : activeVisual?.url ? (
                        <video src={activeVisual.url} muted autoPlay loop playsInline preload="metadata" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/52">
                          Add visual assets from Media button to build your timeline.
                        </div>
                      )}

                      {activeCaption?.text ? (
                        <div className="pointer-events-none absolute bottom-[10%] left-1/2 -translate-x-1/2 rounded-xl bg-black/45 px-3 py-1.5 text-center text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,0.5)]">
                          {activeCaption.text}
                        </div>
                      ) : null}

                      {project.safeAreaOn ? (
                        <>
                          <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-white/35" style={{ height: `${profile.safeTop * 100}%` }} />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-white/35" style={{ height: `${profile.safeBottom * 100}%` }} />
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <IconButton
                    label="Back 1 second"
                    onClick={() => setPlayhead((prev) => clamp(prev - 1, 0, timelineSeconds))}
                  >
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

                  <IconButton
                    label="Forward 1 second"
                    onClick={() => setPlayhead((prev) => clamp(prev + 1, 0, timelineSeconds))}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m13 6 6 6-6 6" />
                      <path d="M5 6v12" />
                    </svg>
                  </IconButton>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/66">
                    Playhead
                    <br />
                    <span className="font-semibold text-white/92">{formatSeconds(playhead)}</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/66">
                    Active Visual
                    <br />
                    <span className="font-semibold text-white/92">{activeVisual?.title || "None"}</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/66">
                    Active Audio
                    <br />
                    <span className="font-semibold text-white/92">{activeAudio?.title || "None"}</span>
                  </div>
                </div>
              </div>
            </section>

            <aside className="rounded-2xl border border-white/10 bg-[#081121] p-3.5 xl:min-h-0 xl:overflow-y-auto">
              <div className="mb-3 text-xs text-white/55">• Inspector</div>

              {selectedItem && selected ? (
                <div className="grid gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/66">
                    Track: <span className="font-semibold text-white/92">{trackLabel(selected.track)}</span>
                    <br />
                    Type: <span className="font-semibold text-white/92">{selectedItem.type}</span>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-[12px] text-white/65">Title</label>
                    <input
                      value={selectedItem.title}
                      onChange={(event) => updateSelected({ title: event.target.value })}
                      className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Start</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={selectedItem.start}
                        onChange={(event) => updateSelected({ start: clamp(Number(event.target.value || 0), 0, 600) })}
                        className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                      />
                    </div>

                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Duration</label>
                      <input
                        type="number"
                        min={0.2}
                        step={0.1}
                        value={selectedItem.duration}
                        onChange={(event) => updateSelected({ duration: clamp(Number(event.target.value || 1), 0.2, 600) })}
                        className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                      />
                    </div>
                  </div>

                  {(selectedItem.type === "audio" || selected.track === "music") ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="mb-1 flex items-center justify-between text-[12px] text-white/66">
                        <span>Clip volume</span>
                        <span className="font-semibold text-white/92">{formatPercent(selectedItem.volume)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={selectedItem.volume}
                        onChange={(event) => updateSelected({ volume: clamp01(Number(event.target.value || 1)) })}
                        className="w-full accent-white"
                      />
                    </div>
                  ) : null}

                  {selectedItem.type === "image" ? (
                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Image motion</label>
                      <select
                        value={selectedItem.motion || "kenburns"}
                        onChange={(event) => updateSelected({ motion: event.target.value as "none" | "kenburns" })}
                        className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                      >
                        <option value="kenburns">Ken Burns</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                  ) : null}

                  {selectedItem.type === "caption" ? (
                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Caption text</label>
                      <textarea
                        rows={4}
                        value={selectedItem.text || ""}
                        onChange={(event) => updateSelected({ text: event.target.value })}
                        className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm text-white/92 outline-none focus:border-white/25"
                      />
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={duplicateSelected} className="btn-ghost px-3 py-2 text-[12px]">
                      Duplicate
                    </button>
                    <button type="button" onClick={deleteSelected} className="btn-ghost px-3 py-2 text-[12px]">
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-[12px] text-white/55">
                  Select a timeline block to edit timing, labels, volume, and caption text.
                </div>
              )}

              <div className="my-4 h-px bg-white/10" />

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-1 flex items-center justify-between text-[12px] text-white/66">
                  <span>Background music mix</span>
                  <span className="font-semibold text-white/92">{formatPercent(project.musicBedLevel)}</span>
                </div>
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
                  className="w-full accent-white"
                />
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/66">
                Visual: <span className="font-semibold text-white/92">{project.visual.length}</span>
                <br />
                Voiceover: <span className="font-semibold text-white/92">{project.voiceover.length}</span>
                <br />
                Music: <span className="font-semibold text-white/92">{project.music.length}</span>
                <br />
                Captions: <span className="font-semibold text-white/92">{project.captions.length}</span>
              </div>
            </aside>

            <section className="rounded-2xl border border-white/10 bg-[#081120] p-3.5 xl:col-start-2 xl:col-end-5 xl:min-h-0 xl:overflow-hidden">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-white/55">• Timeline</div>
                <div className="flex items-center gap-2">
                  <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/70">
                    Length {formatSeconds(timelineSeconds)}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={timelineSeconds}
                    step={0.1}
                    value={playhead}
                    onChange={(event) => setPlayhead(clamp(Number(event.target.value || 0), 0, timelineSeconds))}
                    className="w-52 accent-white"
                  />
                </div>
              </div>

              <div className="grid max-h-[calc(100%-2rem)] gap-2.5 overflow-y-auto pr-1">
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
