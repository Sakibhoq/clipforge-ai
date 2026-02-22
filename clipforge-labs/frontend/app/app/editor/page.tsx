"use client";

import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type AssetType = "video" | "image" | "audio";
type TrackKey = "visual" | "voiceover" | "music" | "captions";
type FrameRatio = "9:16" | "1:1" | "16:9";

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
  trimStart: number;
  trimEnd: number;
  volume: number;
  motion: "none" | "kenburns";
  text?: string;
};

type ProjectState = {
  name: string;
  frame: FrameRatio;
  targetDuration: number;
  musicBedLevel: number;
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

const PROJECT_STORAGE_KEY = "clipforge-editor-project-v2";
const VERSION_STORAGE_KEY = "clipforge-editor-versions-v2";

const EXPORT_PROFILES: Array<{ id: string; label: string; frame: FrameRatio; safeTop: number; safeBottom: number }> = [
  { id: "social_vertical", label: "Social Vertical 9:16", frame: "9:16", safeTop: 0.12, safeBottom: 0.16 },
  { id: "social_square", label: "Square 1:1", frame: "1:1", safeTop: 0.1, safeBottom: 0.1 },
  { id: "youtube_wide", label: "Landscape 16:9", frame: "16:9", safeTop: 0.08, safeBottom: 0.08 },
];

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function extFromStorageKey(key: string): string {
  const m = String(key || "").toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m ? m[1] : "";
}

function detectAssetType(row: ClipRow): AssetType {
  const t = String(row.asset_type || "").toLowerCase();
  if (t === "image" || t === "audio" || t === "video") return t;
  const ext = extFromStorageKey(row.storage_key || "");
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  if ([".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac"].includes(ext)) return "audio";
  return "video";
}

function formatSeconds(n: number) {
  const s = Math.max(0, Number.isFinite(n) ? n : 0);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${ms}`;
}

function formatPercent(n: number) {
  return `${Math.round(clamp01(n) * 100)}%`;
}

function aspectValue(frame: FrameRatio) {
  if (frame === "1:1") return "1 / 1";
  if (frame === "16:9") return "16 / 9";
  return "9 / 16";
}

function previewMaxWidth(frame: FrameRatio): number {
  if (frame === "9:16") return 360;
  if (frame === "1:1") return 620;
  return 860;
}

function newItemId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneProject(state: ProjectState): ProjectState {
  return JSON.parse(JSON.stringify(state)) as ProjectState;
}

function buildDefaultProject(): ProjectState {
  return {
    name: "Untitled AI Post",
    frame: "9:16",
    targetDuration: 60,
    musicBedLevel: 0.35,
    visual: [],
    voiceover: [],
    music: [],
    captions: [],
  };
}

function formatBytes(n: number): string {
  const v = Math.max(0, Number(n || 0));
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeForPersistence(state: ProjectState): ProjectState {
  const copy = cloneProject(state);
  copy.music = copy.music.filter((item) => !String(item.url || "").startsWith("blob:"));
  return copy;
}

function normalizeLoadedProject(raw: any): ProjectState {
  const base = buildDefaultProject();
  const safeArray = (value: unknown) => (Array.isArray(value) ? (value as TimelineItem[]) : []);

  return {
    ...base,
    ...raw,
    name: String(raw?.name || base.name),
    frame: ["9:16", "1:1", "16:9"].includes(raw?.frame) ? raw.frame : base.frame,
    targetDuration: [60, 120].includes(Number(raw?.targetDuration)) ? Number(raw?.targetDuration) : base.targetDuration,
    musicBedLevel: clamp01(Number(raw?.musicBedLevel ?? base.musicBedLevel)),
    visual: safeArray(raw?.visual),
    voiceover: safeArray(raw?.voiceover),
    music: safeArray(raw?.music),
    captions: safeArray(raw?.captions),
  };
}

function laneTone(track: TrackKey) {
  if (track === "visual") return "border-cyan-300/35 bg-cyan-400/14 text-cyan-100";
  if (track === "voiceover") return "border-emerald-300/35 bg-emerald-400/14 text-emerald-100";
  if (track === "music") return "border-amber-300/35 bg-amber-400/14 text-amber-100";
  return "border-fuchsia-300/35 bg-fuchsia-400/14 text-fuchsia-100";
}

function laneLabel(track: TrackKey) {
  if (track === "visual") return "Visual";
  if (track === "voiceover") return "Voiceover";
  if (track === "music") return "Music";
  return "Captions";
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

export default function EditorPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<ClipRow[]>([]);

  const [project, setProject] = useState<ProjectState>(buildDefaultProject());
  const [profileId, setProfileId] = useState<string>(EXPORT_PROFILES[0].id);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [versions, setVersions] = useState<SavedVersion[]>([]);
  const [selected, setSelected] = useState<{ track: TrackKey; itemId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [localMusicAssets, setLocalMusicAssets] = useState<LocalMusicAsset[]>([]);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const localMusicInputRef = useRef<HTMLInputElement | null>(null);
  const localMusicObjectUrlsRef = useRef<string[]>([]);

  const videos = useMemo(() => clips.filter((c) => detectAssetType(c) === "video"), [clips]);
  const images = useMemo(() => clips.filter((c) => detectAssetType(c) === "image"), [clips]);
  const audios = useMemo(() => clips.filter((c) => detectAssetType(c) === "audio"), [clips]);

  const profile = useMemo(
    () => EXPORT_PROFILES.find((p) => p.id === profileId) || EXPORT_PROFILES[0],
    [profileId]
  );

  useEffect(() => {
    setProject((prev) => ({ ...prev, frame: profile.frame }));
  }, [profile.frame]);

  const selectedItem = useMemo(() => {
    if (!selected) return null;
    const items = project[selected.track];
    return items.find((x) => x.id === selected.itemId) || null;
  }, [selected, project]);

  const previewVisual = useMemo(() => {
    if (selected && selectedItem && selected.track === "visual" && (selectedItem.type === "video" || selectedItem.type === "image")) {
      return selectedItem;
    }
    return project.visual[0] || null;
  }, [selected, selectedItem, project.visual]);

  const previewAudio = useMemo(() => {
    if (selected && selectedItem && (selected.track === "voiceover" || selected.track === "music") && selectedItem.type === "audio") {
      return selectedItem;
    }
    return project.voiceover[0] || project.music[0] || null;
  }, [selected, selectedItem, project.voiceover, project.music]);

  const timelineDuration = useMemo(() => {
    const end = (items: TimelineItem[]) => items.reduce((max, item) => Math.max(max, item.start + item.duration), 0);
    const maxTrackEnd = Math.max(end(project.visual), end(project.voiceover), end(project.music), end(project.captions));
    return Math.max(project.targetDuration, Math.ceil(maxTrackEnd));
  }, [project]);

  const exportRecipe = useMemo(
    () => ({
      project_name: project.name,
      profile: profile.label,
      frame: project.frame,
      target_duration_seconds: project.targetDuration,
      timeline_duration_seconds: timelineDuration,
      music_bed_level: Number(project.musicBedLevel.toFixed(2)),
      safe_area: {
        enabled: showSafeArea,
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
    [project, profile, showSafeArea, timelineDuration]
  );

  function setTrackItems(track: TrackKey, updater: (items: TimelineItem[]) => TimelineItem[]) {
    setProject((prev) => ({ ...prev, [track]: updater(prev[track]) }));
  }

  function nextTrackStart(items: TimelineItem[]) {
    return items.reduce((max, item) => Math.max(max, item.start + item.duration), 0);
  }

  function addClipToTrack(track: TrackKey, clip: ClipRow) {
    const type = detectAssetType(clip);
    const current = project[track];
    const itemDuration = Math.max(1, Number(clip.duration || (type === "image" ? 6 : 4)));

    const item: TimelineItem = {
      id: newItemId(),
      clipId: clip.id,
      type,
      title: clip.title || `${type.toUpperCase()} #${clip.id}`,
      url: clip.url,
      start: nextTrackStart(current),
      duration: itemDuration,
      trimStart: 0,
      trimEnd: itemDuration,
      volume: track === "music" ? 0.6 : 1,
      motion: type === "image" ? "kenburns" : "none",
    };

    setTrackItems(track, (items) => [...items, item]);
    setSelected({ track, itemId: item.id });
  }

  function addCaptionBlock() {
    const current = project.captions;
    const item: TimelineItem = {
      id: newItemId(),
      type: "caption",
      title: "Caption block",
      start: nextTrackStart(current),
      duration: 4,
      trimStart: 0,
      trimEnd: 4,
      volume: 1,
      motion: "none",
      text: "Add caption text here",
    };
    setTrackItems("captions", (items) => [...items, item]);
    setSelected({ track: "captions", itemId: item.id });
  }

  function addLocalMusicToTrack(asset: LocalMusicAsset) {
    const current = project.music;
    const fallbackDuration = Math.max(8, Number(project.targetDuration) || 60);

    const item: TimelineItem = {
      id: newItemId(),
      type: "audio",
      title: `${asset.name} (Uploaded)`,
      url: asset.url,
      start: nextTrackStart(current),
      duration: Math.max(1, Number(asset.duration || fallbackDuration)),
      trimStart: 0,
      trimEnd: Math.max(1, Number(asset.duration || fallbackDuration)),
      volume: 0.6,
      motion: "none",
    };

    setTrackItems("music", (items) => [...items, item]);
    setSelected({ track: "music", itemId: item.id });
  }

  function updateSelected(patch: Partial<TimelineItem>) {
    if (!selected) return;
    setTrackItems(selected.track, (items) =>
      items.map((item) => (item.id === selected.itemId ? { ...item, ...patch } : item))
    );
  }

  function removeSelected() {
    if (!selected) return;
    setTrackItems(selected.track, (items) => items.filter((item) => item.id !== selected.itemId));
    setSelected(null);
  }

  function duplicateSelected() {
    if (!selected || !selectedItem) return;
    const next = {
      ...selectedItem,
      id: newItemId(),
      start: selectedItem.start + selectedItem.duration,
    };
    setTrackItems(selected.track, (items) => [...items, next]);
    setSelected({ track: selected.track, itemId: next.id });
  }

  function saveVersion() {
    const label = `${project.name} • ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const version: SavedVersion = {
      id: newItemId(),
      label,
      createdAt: new Date().toISOString(),
      project: cloneProject(project),
    };
    setVersions((prev) => [version, ...prev].slice(0, 20));
  }

  function restoreVersion(id: string) {
    const found = versions.find((v) => v.id === id);
    if (!found) return;
    setProject(normalizeLoadedProject(cloneProject(found.project)));
    setSelected(null);
  }

  async function copyRecipe() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportRecipe, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Could not copy export JSON.");
    }
  }

  async function handleLocalMusicUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setError(null);
    setUploadingMusic(true);

    try {
      const built = await Promise.all(
        files.map(async (file): Promise<LocalMusicAsset | null> => {
          if (!file.type.startsWith("audio/")) return null;
          const url = URL.createObjectURL(file);
          localMusicObjectUrlsRef.current.push(url);
          const duration = await readAudioDuration(url);
          return {
            id: newItemId(),
            name: file.name,
            url,
            duration,
            size: file.size,
          };
        })
      );

      const next = built.filter((asset): asset is LocalMusicAsset => Boolean(asset));
      if (!next.length) {
        setError("Only audio files are supported for music upload.");
      } else {
        setLocalMusicAssets((prev) => [...next, ...prev].slice(0, 24));
      }
    } finally {
      setUploadingMusic(false);
      if (localMusicInputRef.current) localMusicInputRef.current.value = "";
    }
  }

  function removeLocalMusicAsset(assetId: string) {
    const found = localMusicAssets.find((asset) => asset.id === assetId);
    if (!found) return;

    const inUse = project.music.some((item) => item.url === found.url);
    if (inUse) {
      setError("Remove this track from Music before deleting the uploaded file.");
      return;
    }

    URL.revokeObjectURL(found.url);
    localMusicObjectUrlsRef.current = localMusicObjectUrlsRef.current.filter((u) => u !== found.url);
    setLocalMusicAssets((prev) => prev.filter((asset) => asset.id !== assetId));
  }

  async function loadClips() {
    setLoading(true);
    setError(null);
    try {
      const rows = (await apiFetch<ClipRow[]>("/clips?grouped=false", { method: "GET" })) || [];
      setClips(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      setError(err?.detail || "Could not load assets for editor.");
      setClips([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClips();
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
      if (raw) setProject(normalizeLoadedProject(JSON.parse(raw)));
      const versionsRaw = window.localStorage.getItem(VERSION_STORAGE_KEY);
      if (versionsRaw) {
        const parsed = JSON.parse(versionsRaw);
        if (Array.isArray(parsed)) setVersions(parsed.slice(0, 20));
      }
    } catch {
      // ignore
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
  }, [project, selected]);

  useEffect(() => {
    return () => {
      localMusicObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localMusicObjectUrlsRef.current = [];
    };
  }, []);

  function trackItems(track: TrackKey): TimelineItem[] {
    return project[track].slice().sort((a, b) => a.start - b.start);
  }

  function renderTrackLane(track: TrackKey) {
    const items = trackItems(track);
    return (
      <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold tracking-[0.05em] text-white/78">{laneLabel(track)} Track</div>
          <div className="text-[11px] text-white/48">{items.length} items</div>
        </div>

        {items.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map((item) => {
              const active = selected?.track === track && selected?.itemId === item.id;
              const width = Math.max(132, Math.min(280, 120 + Math.round(item.duration * 8)));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected({ track, itemId: item.id })}
                  className={cx(
                    "shrink-0 rounded-xl border px-3 py-2 text-left transition",
                    laneTone(track),
                    active && "ring-2 ring-white/55"
                  )}
                  style={{ width }}
                >
                  <div className="truncate text-[12px] font-semibold">{item.title}</div>
                  <div className="mt-1 text-[10px] opacity-85">
                    {formatSeconds(item.start)} → {formatSeconds(item.start + item.duration)}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 text-[12px] text-white/50">
            No items yet.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-[1700px] px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs text-white/55">• Clipforge Editor</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Professional <span className="grad-text">Timeline Workspace</span>
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-white/68 sm:text-[15px]">
              Full-screen editing console built for final assembly: visual track, voiceover, music bed, and captions.
            </p>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <Link href="/app/generate" className="btn-aurora px-4 py-2 text-center text-[12px]">
              Open Generator
            </Link>
            <Link href="/app/clips" className="btn-orbito px-4 py-2 text-center text-[12px]">
              Open Library
            </Link>
            <Link href="/app/connections" className="btn-ghost col-span-2 px-4 py-2 text-center text-[12px] sm:col-auto">
              Connections
            </Link>
          </div>
        </header>

        <section className="mt-5 grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          <aside className="grid min-w-0 gap-4">
            <div className="surface-soft rounded-3xl p-5">
              <div className="text-xs text-white/55">• Project Setup</div>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-2">
                  <label className="text-[12px] text-white/65">Project name</label>
                  <input
                    value={project.name}
                    onChange={(e) => setProject((prev) => ({ ...prev, name: e.target.value }))}
                    className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-[12px] text-white/65">Export profile</label>
                  <select
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value)}
                    className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                  >
                    {EXPORT_PROFILES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-[12px] text-white/65">Target duration</label>
                  <select
                    value={project.targetDuration}
                    onChange={(e) => setProject((prev) => ({ ...prev, targetDuration: Number(e.target.value || 60) }))}
                    className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                  >
                    <option value={60}>1 minute</option>
                    <option value={120}>2 minutes</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-3 text-[12px] text-white/68">
                  Frame: <span className="font-semibold text-white/92">{project.frame}</span>
                  <br />
                  Timeline: <span className="font-semibold text-white/92">{formatSeconds(timelineDuration)}</span>
                  <br />
                  Safe area: <span className="font-semibold text-white/92">{showSafeArea ? "Visible" : "Hidden"}</span>
                </div>

                <div className="grid gap-2">
                  <button type="button" onClick={() => setShowSafeArea((v) => !v)} className="btn-ghost px-3 py-2 text-[12px]">
                    {showSafeArea ? "Hide safe area" : "Show safe area"}
                  </button>
                  <button type="button" onClick={copyRecipe} className="btn-ghost px-3 py-2 text-[12px]">
                    {copied ? "Copied" : "Copy export JSON"}
                  </button>
                  <button type="button" onClick={saveVersion} className="btn-solid-dark px-3 py-2 text-[12px]">
                    Save version
                  </button>
                </div>
              </div>
            </div>

            <div className="surface-soft rounded-3xl p-5">
              <div className="text-xs text-white/55">• Asset Library</div>
              <div className="mt-3 grid gap-3">
                <div>
                  <div className="mb-2 text-[12px] font-semibold text-white/80">Videos ({videos.length})</div>
                  <div className="grid max-h-40 gap-2 overflow-auto pr-1">
                    {videos.map((clip) => (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => addClipToTrack("visual", clip)}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[12px] text-white/83 hover:bg-white/[0.07]"
                      >
                        <div className="truncate font-semibold text-white/92">{clip.title || `Video #${clip.id}`}</div>
                        <div className="text-white/52">{formatSeconds(clip.duration || 0)}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[12px] font-semibold text-white/80">Images ({images.length})</div>
                  <div className="grid max-h-40 gap-2 overflow-auto pr-1">
                    {images.map((clip) => (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => addClipToTrack("visual", clip)}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[12px] text-white/83 hover:bg-white/[0.07]"
                      >
                        <div className="truncate font-semibold text-white/92">{clip.title || `Image #${clip.id}`}</div>
                        <div className="text-white/52">Adds as motion scene</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[12px] font-semibold text-white/80">Audio ({audios.length})</div>
                  <div className="grid max-h-40 gap-2 overflow-auto pr-1">
                    {audios.map((clip) => (
                      <div key={clip.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2">
                        <div className="truncate px-1 text-[11px] font-semibold text-white/84">{clip.title || `Audio #${clip.id}`}</div>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => addClipToTrack("voiceover", clip)}
                            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/82 hover:bg-white/[0.08]"
                          >
                            To Voice
                          </button>
                          <button
                            type="button"
                            onClick={() => addClipToTrack("music", clip)}
                            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/82 hover:bg-white/[0.08]"
                          >
                            To Music
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-3">
                  <div className="mb-2 text-[12px] font-semibold text-white/82">Upload your own music</div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      ref={localMusicInputRef}
                      type="file"
                      accept="audio/*"
                      multiple
                      onChange={handleLocalMusicUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => localMusicInputRef.current?.click()}
                      disabled={uploadingMusic}
                      className={cx("btn-ghost w-full px-3 py-2 text-[12px] sm:w-auto", uploadingMusic && "cursor-not-allowed opacity-60")}
                    >
                      {uploadingMusic ? "Uploading…" : "Upload music"}
                    </button>
                    <button type="button" onClick={addCaptionBlock} className="btn-ghost w-full px-3 py-2 text-[12px] sm:w-auto">
                      Add caption
                    </button>
                  </div>

                  {localMusicAssets.length ? (
                    <div className="mt-3 grid max-h-40 gap-2 overflow-auto pr-1">
                      {localMusicAssets.map((asset) => (
                        <div key={asset.id} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                          <div className="truncate text-[12px] font-semibold text-white/88">{asset.name}</div>
                          <div className="text-[11px] text-white/52">
                            {formatSeconds(asset.duration)} • {formatBytes(asset.size)}
                          </div>
                          <div className="mt-1.5 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => addLocalMusicToTrack(asset)}
                              className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1.5 text-[11px] text-white/86 hover:bg-white/[0.1]"
                            >
                              Add to Music
                            </button>
                            <button
                              type="button"
                              onClick={() => removeLocalMusicAsset(asset.id)}
                              className="rounded-lg border border-white/10 bg-black/45 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/[0.08]"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-white/50">MP3, WAV, M4A, OGG and more are supported.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="surface-soft rounded-3xl p-5">
              <div className="text-xs text-white/55">• Versions</div>
              {versions.length ? (
                <div className="mt-3 grid max-h-44 gap-2 overflow-auto pr-1">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => restoreVersion(v.id)}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[12px] text-white/80 hover:bg-white/[0.06]"
                    >
                      <div className="truncate font-semibold text-white/92">{v.label}</div>
                      <div className="text-white/55">{new Date(v.createdAt).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-[12px] text-white/55">
                  No saved versions yet.
                </div>
              )}
            </div>
          </aside>

          <section className="grid min-w-0 gap-4">
            <div className="surface rounded-3xl p-4 sm:p-5">
              <div className="text-xs text-white/55">• Preview Stage</div>
              <div className="mt-3 rounded-3xl border border-white/10 bg-black/45 p-3 sm:p-4">
                <div
                  className="relative mx-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-black"
                  style={{
                    aspectRatio: aspectValue(project.frame),
                    maxWidth: `${previewMaxWidth(project.frame)}px`,
                  }}
                >
                  {previewVisual?.type === "image" && previewVisual.url ? (
                    <img src={previewVisual.url} alt={previewVisual.title} className="h-full w-full object-cover" />
                  ) : previewVisual?.url ? (
                    <video src={previewVisual.url} controls playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-white/55">
                      Add image or video assets to the visual track to start previewing.
                    </div>
                  )}

                  {showSafeArea ? (
                    <>
                      <div
                        className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-white/35"
                        style={{ height: `${profile.safeTop * 100}%` }}
                      />
                      <div
                        className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-white/35"
                        style={{ height: `${profile.safeBottom * 100}%` }}
                      />
                    </>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-[12px] text-white/66">
                    Visual
                    <br />
                    <span className="font-semibold text-white/92">{previewVisual?.title || "None"}</span>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-[12px] text-white/66">
                    Audio
                    <br />
                    <span className="font-semibold text-white/92">{previewAudio?.title || "None"}</span>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-[12px] text-white/66">
                    Music bed
                    <br />
                    <span className="font-semibold text-white/92">{formatPercent(project.musicBedLevel)}</span>
                  </div>
                </div>

                {previewAudio?.url ? (
                  <div className="mt-3">
                    <div className="mb-1 text-[11px] text-white/58">Audio preview</div>
                    <audio src={previewAudio.url} controls className="w-full" preload="metadata" />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="surface rounded-3xl p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-white/55">• Timeline</div>
                <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/68">
                  Total length {formatSeconds(timelineDuration)}
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                {renderTrackLane("visual")}
                {renderTrackLane("voiceover")}
                {renderTrackLane("music")}
                {renderTrackLane("captions")}
              </div>
            </div>
          </section>

          <aside className="grid min-w-0 gap-4 xl:col-span-2 2xl:col-span-1">
            <div className="surface-soft rounded-3xl p-5">
              <div className="text-xs text-white/55">• Inspector</div>
              {selectedItem && selected ? (
                <div className="mt-3 grid gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/70">
                    <div className="truncate font-semibold text-white/92">{selectedItem.title}</div>
                    <div className="text-white/55">Track: {selected.track}</div>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-[12px] text-white/65">Title</label>
                    <input
                      value={selectedItem.title}
                      onChange={(e) => updateSelected({ title: e.target.value })}
                      className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Start</label>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        value={selectedItem.start}
                        onChange={(e) => updateSelected({ start: Number(e.target.value || 0) })}
                        className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Duration</label>
                      <input
                        type="number"
                        step={0.1}
                        min={0.2}
                        value={selectedItem.duration}
                        onChange={(e) => updateSelected({ duration: Number(e.target.value || 1) })}
                        className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                      />
                    </div>
                  </div>

                  {selectedItem.type === "video" ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <label className="text-[12px] text-white/65">Trim start</label>
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          value={selectedItem.trimStart}
                          onChange={(e) => updateSelected({ trimStart: Number(e.target.value || 0) })}
                          className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-[12px] text-white/65">Trim end</label>
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          value={selectedItem.trimEnd}
                          onChange={(e) => updateSelected({ trimEnd: Number(e.target.value || 0) })}
                          className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/92 outline-none focus:border-white/25"
                        />
                      </div>
                    </div>
                  ) : null}

                  {(selectedItem.type === "audio" || selected.track === "music") ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="mb-2 flex items-center justify-between text-[12px] text-white/70">
                        <span>Clip volume</span>
                        <span className="font-semibold text-white/92">{formatPercent(selectedItem.volume)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={selectedItem.volume}
                        onChange={(e) => updateSelected({ volume: Number(e.target.value || 1) })}
                        className="w-full accent-white"
                      />
                    </div>
                  ) : null}

                  {selectedItem.type === "image" ? (
                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Motion</label>
                      <select
                        value={selectedItem.motion}
                        onChange={(e) => updateSelected({ motion: e.target.value as "none" | "kenburns" })}
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
                        onChange={(e) => updateSelected({ text: e.target.value })}
                        className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm text-white/92 outline-none focus:border-white/25"
                      />
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={duplicateSelected} className="btn-ghost px-3 py-2 text-[12px]">
                      Duplicate
                    </button>
                    <button type="button" onClick={removeSelected} className="btn-ghost px-3 py-2 text-[12px]">
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-[12px] text-white/55">
                  Select a timeline item to edit timing, trims, caption text, and levels.
                </div>
              )}
            </div>

            <div className="surface-soft rounded-3xl p-5">
              <div className="text-xs text-white/55">• Audio Mix</div>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-1 flex items-center justify-between text-[12px] text-white/70">
                  <span>Background music level</span>
                  <span className="font-semibold text-white/92">{formatPercent(project.musicBedLevel)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={project.musicBedLevel}
                  onChange={(e) => setProject((prev) => ({ ...prev, musicBedLevel: clamp01(Number(e.target.value || prev.musicBedLevel)) }))}
                  className="w-full accent-white"
                />
              </div>

              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/65">
                Visual items: <span className="font-semibold text-white/92">{project.visual.length}</span>
                <br />
                Voiceover items: <span className="font-semibold text-white/92">{project.voiceover.length}</span>
                <br />
                Music items: <span className="font-semibold text-white/92">{project.music.length}</span>
                <br />
                Captions: <span className="font-semibold text-white/92">{project.captions.length}</span>
              </div>
            </div>
          </aside>
        </section>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
        ) : null}

        {loading ? (
          <div className="mt-4 text-xs text-white/60">Refreshing assets...</div>
        ) : null}
      </main>
    </div>
  );
}
