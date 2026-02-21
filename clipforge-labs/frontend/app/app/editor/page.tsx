"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

const PROJECT_STORAGE_KEY = "clipforge-editor-project-v1";
const VERSION_STORAGE_KEY = "clipforge-editor-versions-v1";

const EXPORT_PROFILES: Array<{ id: string; label: string; frame: FrameRatio; safeTop: number; safeBottom: number }> = [
  { id: "social_vertical", label: "Social Vertical 9:16", frame: "9:16", safeTop: 0.12, safeBottom: 0.16 },
  { id: "social_square", label: "Square 1:1", frame: "1:1", safeTop: 0.1, safeBottom: 0.1 },
  { id: "youtube_wide", label: "Landscape 16:9", frame: "16:9", safeTop: 0.08, safeBottom: 0.08 },
];

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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
  if ([".mp3", ".wav", ".m4a", ".ogg"].includes(ext)) return "audio";
  return "video";
}

function formatSeconds(n: number) {
  const s = Math.max(0, Number.isFinite(n) ? n : 0);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${ms}`;
}

function aspectValue(frame: FrameRatio) {
  if (frame === "1:1") return "1 / 1";
  if (frame === "16:9") return "16 / 9";
  return "9 / 16";
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
    visual: [],
    voiceover: [],
    music: [],
    captions: [],
  };
}

function laneColor(track: TrackKey) {
  if (track === "visual") return "bg-cyan-400/20 border-cyan-300/30 text-cyan-100";
  if (track === "voiceover") return "bg-emerald-400/20 border-emerald-300/30 text-emerald-100";
  if (track === "music") return "bg-amber-400/20 border-amber-300/30 text-amber-100";
  return "bg-fuchsia-400/20 border-fuchsia-300/30 text-fuchsia-100";
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const allTimelineItems = useMemo(
    () => [
      ...project.visual.map((x) => ({ track: "visual" as TrackKey, item: x })),
      ...project.voiceover.map((x) => ({ track: "voiceover" as TrackKey, item: x })),
      ...project.music.map((x) => ({ track: "music" as TrackKey, item: x })),
      ...project.captions.map((x) => ({ track: "captions" as TrackKey, item: x })),
    ],
    [project]
  );

  const selectedItem = useMemo(() => {
    if (!selected) return null;
    const items = project[selected.track];
    return items.find((x) => x.id === selected.itemId) || null;
  }, [selected, project]);

  const previewVisual = useMemo(() => {
    if (selectedItem && (selectedItem.type === "video" || selectedItem.type === "image")) return selectedItem;
    return project.visual[0] || null;
  }, [selectedItem, project.visual]);

  const previewAudio = useMemo(() => {
    if (selectedItem && selectedItem.type === "audio") return selectedItem;
    return project.voiceover[0] || project.music[0] || null;
  }, [selectedItem, project.voiceover, project.music]);

  const timelineDuration = useMemo(() => {
    const maxTrackEnd = allTimelineItems.reduce((max, row) => Math.max(max, row.item.start + row.item.duration), 0);
    return Math.max(project.targetDuration, Math.ceil(maxTrackEnd));
  }, [allTimelineItems, project.targetDuration]);

  const exportRecipe = useMemo(() => {
    return {
      project_name: project.name,
      profile: profile.label,
      frame: project.frame,
      target_duration_seconds: project.targetDuration,
      timeline_duration_seconds: timelineDuration,
      safe_area: {
        enabled: showSafeArea,
        top: profile.safeTop,
        bottom: profile.safeBottom,
      },
      tracks: {
        visual: project.visual,
        voiceover: project.voiceover,
        music: project.music,
        captions: project.captions,
      },
    };
  }, [project, profile, showSafeArea, timelineDuration]);

  function setTrackItems(track: TrackKey, updater: (items: TimelineItem[]) => TimelineItem[]) {
    setProject((prev) => ({
      ...prev,
      [track]: updater(prev[track]),
    }));
  }

  function addClipToTrack(track: TrackKey, clip: ClipRow) {
    const type = detectAssetType(clip);
    const current = project[track];
    const nextStart = current.reduce((max, item) => Math.max(max, item.start + item.duration), 0);
    const itemDuration = Math.max(1, Number(clip.duration || (type === "image" ? 5 : 4)));

    const item: TimelineItem = {
      id: newItemId(),
      clipId: clip.id,
      type,
      title: clip.title || `${type.toUpperCase()} #${clip.id}`,
      url: clip.url,
      start: nextStart,
      duration: itemDuration,
      trimStart: 0,
      trimEnd: itemDuration,
      volume: track === "music" ? 0.25 : 1,
      motion: type === "image" ? "kenburns" : "none",
    };

    setTrackItems(track, (items) => [...items, item]);
    setSelected({ track, itemId: item.id });
  }

  function addCaptionBlock() {
    const current = project.captions;
    const nextStart = current.reduce((max, item) => Math.max(max, item.start + item.duration), 0);
    const item: TimelineItem = {
      id: newItemId(),
      type: "caption",
      title: "Caption block",
      start: nextStart,
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

  function removeSelected() {
    if (!selected) return;
    setTrackItems(selected.track, (items) => items.filter((item) => item.id !== selected.itemId));
    setSelected(null);
  }

  function updateSelected(patch: Partial<TimelineItem>) {
    if (!selected) return;
    setTrackItems(selected.track, (items) =>
      items.map((item) => {
        if (item.id !== selected.itemId) return item;
        const next = { ...item, ...patch };
        const clampedDuration = Math.max(0.2, Number(next.duration || 0));
        return {
          ...next,
          duration: clampedDuration,
          trimEnd: Math.max(Number(next.trimStart || 0), Number(next.trimEnd || clampedDuration)),
          start: Math.max(0, Number(next.start || 0)),
          volume: Math.max(0, Math.min(1, Number(next.volume ?? 1))),
        };
      })
    );
  }

  function duplicateSelected() {
    if (!selected || !selectedItem) return;
    const dup: TimelineItem = {
      ...selectedItem,
      id: newItemId(),
      start: Math.max(0, selectedItem.start + selectedItem.duration),
      title: `${selectedItem.title} (Copy)`,
    };
    setTrackItems(selected.track, (items) => [...items, dup]);
    setSelected({ track: selected.track, itemId: dup.id });
  }

  async function copyRecipe() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportRecipe, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      setCopied(false);
    }
  }

  function saveVersion() {
    const next: SavedVersion = {
      id: newItemId(),
      label: project.name || "Untitled project",
      createdAt: new Date().toISOString(),
      project: cloneProject(project),
    };
    setVersions((prev) => [next, ...prev].slice(0, 8));
  }

  function restoreVersion(id: string) {
    const found = versions.find((v) => v.id === id);
    if (!found) return;
    setProject(cloneProject(found.project));
    setSelected(null);
  }

  function createQuickCropFromSelection() {
    if (!selectedItem || !selectedItem.clipId || selectedItem.type !== "video") {
      setError("Select a video clip on the visual track to create a quick trimmed render.");
      return;
    }

    setError(null);
    apiFetch(`/clips/${selectedItem.clipId}/crop`, {
      method: "POST",
      body: {
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        trim_start: Number(selectedItem.trimStart || 0),
        trim_end: Number(selectedItem.trimEnd || selectedItem.duration),
      },
    })
      .then(() => loadClips())
      .catch((err: any) => setError(err?.detail || "Could not render quick crop."));
  }

  function buildTrackRow(track: TrackKey, label: string, items: TimelineItem[]) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs font-semibold tracking-[0.08em] text-white/60">{label}</div>
          <div className="text-[11px] text-white/45">{items.length} item{items.length === 1 ? "" : "s"}</div>
        </div>

        <div className="relative h-16 overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
          {items.map((item) => {
            const left = (item.start / timelineDuration) * 100;
            const width = Math.max(2, (item.duration / timelineDuration) * 100);
            const active = selected?.track === track && selected?.itemId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected({ track, itemId: item.id })}
                className={cx(
                  "absolute top-2 h-12 min-w-[36px] rounded-lg border px-2 text-left text-[11px] transition",
                  laneColor(track),
                  active && "ring-2 ring-white/50"
                )}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${item.title} • ${formatSeconds(item.start)} - ${formatSeconds(item.start + item.duration)}`}
              >
                <div className="truncate font-semibold">{item.title}</div>
                <div className="truncate text-[10px] opacity-80">{formatSeconds(item.duration)}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
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
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setProject({ ...buildDefaultProject(), ...parsed });
        }
      }

      const versionsRaw = window.localStorage.getItem(VERSION_STORAGE_KEY);
      if (versionsRaw) {
        const parsed = JSON.parse(versionsRaw);
        if (Array.isArray(parsed)) {
          setVersions(parsed.slice(0, 8));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
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

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-[1320px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <section className="surface relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-45 blur-3xl"
            style={{
              background:
                "radial-gradient(240px 160px at 16% 28%, rgba(255,183,3,0.22), transparent 70%), radial-gradient(280px 200px at 80% 34%, rgba(58,134,255,0.18), transparent 72%), radial-gradient(260px 180px at 58% 90%, rgba(251,86,7,0.14), transparent 72%)",
            }}
          />

          <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Post Editor</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/92">
                Production <span className="grad-text">timeline studio</span>
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-white/65">
                Professional editing surface with layered tracks, autosave, version snapshots, and export presets for
                social-safe publishing.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href="/app/generate" className="btn-ghost text-[12px] px-4 py-2">
                Generate
              </Link>
              <Link href="/app/clips" className="btn-ghost text-[12px] px-4 py-2">
                Clips
              </Link>
              <button
                type="button"
                onClick={loadClips}
                disabled={loading}
                className={cx("btn-solid-dark text-[12px] px-4 py-2", loading && "opacity-60 cursor-not-allowed")}
              >
                {loading ? "Refreshing…" : "Refresh assets"}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-12">
          <aside className="xl:col-span-3 grid gap-4">
            <div className="surface-soft rounded-3xl p-5">
              <div className="text-xs text-white/55">• Project</div>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-2">
                  <label className="text-[12px] text-white/65">Name</label>
                  <input
                    value={project.name}
                    onChange={(e) => setProject((prev) => ({ ...prev, name: e.target.value }))}
                    className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm text-white/90 outline-none focus:border-white/25"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-[12px] text-white/65">Export profile</label>
                  <select
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value)}
                    className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm text-white/90 outline-none focus:border-white/25"
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
                    className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm text-white/90 outline-none focus:border-white/25"
                  >
                    <option value={60}>1 minute</option>
                    <option value={120}>2 minutes</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/65">
                  Frame: <span className="font-semibold text-white/90">{project.frame}</span>
                  <br />
                  Safe area: <span className="font-semibold text-white/90">{showSafeArea ? "Visible" : "Hidden"}</span>
                  <br />
                  Timeline: <span className="font-semibold text-white/90">{formatSeconds(timelineDuration)}</span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <button type="button" onClick={() => setShowSafeArea((v) => !v)} className="btn-ghost text-[12px] px-3 py-2">
                    {showSafeArea ? "Hide safe area" : "Show safe area"}
                  </button>
                  <button type="button" onClick={copyRecipe} className="btn-ghost text-[12px] px-3 py-2">
                    {copied ? "Copied" : "Copy export JSON"}
                  </button>
                  <button type="button" onClick={saveVersion} className="btn-solid-dark text-[12px] px-3 py-2">
                    Save version
                  </button>
                </div>
              </div>
            </div>

            <div className="surface-soft rounded-3xl p-5">
              <div className="text-xs text-white/55">• Versions</div>
              {versions.length ? (
                <div className="mt-3 grid gap-2">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => restoreVersion(v.id)}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[12px] text-white/80 hover:bg-white/[0.06]"
                    >
                      <div className="font-semibold text-white/90">{v.label}</div>
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

          <section className="xl:col-span-6 grid gap-4">
            <div className="surface rounded-3xl p-5">
              <div className="text-xs text-white/55">• Preview</div>
              <div className="mt-3 rounded-3xl border border-white/10 bg-black/35 p-3">
                <div className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/10 bg-black" style={{ aspectRatio: aspectValue(project.frame) }}>
                  {previewVisual?.type === "image" && previewVisual.url ? (
                    <img src={previewVisual.url} alt={previewVisual.title} className="h-full w-full object-cover" />
                  ) : previewVisual?.url ? (
                    <video
                      ref={videoRef}
                      src={previewVisual.url}
                      controls
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-white/55">Add visual assets to start previewing.</div>
                  )}

                  {showSafeArea ? (
                    <>
                      <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-white/30" style={{ height: `${profile.safeTop * 100}%` }} />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-white/30" style={{ height: `${profile.safeBottom * 100}%` }} />
                    </>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-[12px] text-white/65">
                    Visual: <span className="text-white/90">{previewVisual?.title || "None"}</span>
                    <br />
                    Type: <span className="text-white/90">{previewVisual?.type || "N/A"}</span>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-[12px] text-white/65">
                    Audio: <span className="text-white/90">{previewAudio?.title || "None"}</span>
                    <br />
                    Duration: <span className="text-white/90">{formatSeconds(previewAudio?.duration || 0)}</span>
                  </div>
                </div>

                {previewAudio?.url ? (
                  <audio ref={audioRef} src={previewAudio.url} controls className="mt-3 w-full" preload="metadata" />
                ) : null}
              </div>
            </div>

            <div className="surface rounded-3xl p-5">
              <div className="text-xs text-white/55">• Timeline</div>
              <div className="mt-3 grid gap-3">
                {buildTrackRow("visual", "Visual Track (Video + Image)", project.visual)}
                {buildTrackRow("voiceover", "Voiceover Track", project.voiceover)}
                {buildTrackRow("music", "Music Track", project.music)}
                {buildTrackRow("captions", "Captions Track", project.captions)}
              </div>
            </div>
          </section>

          <aside className="xl:col-span-3 grid gap-4">
            <div className="surface-soft rounded-3xl p-5">
              <div className="text-xs text-white/55">• Asset Library</div>

              <div className="mt-3 grid gap-3">
                <div>
                  <div className="mb-2 text-[12px] font-semibold text-white/75">Videos ({videos.length})</div>
                  <div className="grid gap-2 max-h-44 overflow-auto pr-1">
                    {videos.map((clip) => (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => addClipToTrack("visual", clip)}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[12px] text-white/80 hover:bg-white/[0.06]"
                      >
                        <div className="truncate font-semibold text-white/90">{clip.title || `Video #${clip.id}`}</div>
                        <div className="text-white/50">{formatSeconds(clip.duration || 0)}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[12px] font-semibold text-white/75">Images ({images.length})</div>
                  <div className="grid gap-2 max-h-44 overflow-auto pr-1">
                    {images.map((clip) => (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => addClipToTrack("visual", clip)}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[12px] text-white/80 hover:bg-white/[0.06]"
                      >
                        <div className="truncate font-semibold text-white/90">{clip.title || `Image #${clip.id}`}</div>
                        <div className="text-white/50">Adds as motion scene</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[12px] font-semibold text-white/75">Audio ({audios.length})</div>
                  <div className="grid gap-2 max-h-44 overflow-auto pr-1">
                    {audios.map((clip) => (
                      <div key={clip.id} className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => addClipToTrack("voiceover", clip)}
                          className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 text-[11px] text-white/80 hover:bg-white/[0.06]"
                        >
                          Voice
                        </button>
                        <button
                          type="button"
                          onClick={() => addClipToTrack("music", clip)}
                          className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 text-[11px] text-white/80 hover:bg-white/[0.06]"
                        >
                          Music
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <button type="button" onClick={addCaptionBlock} className="btn-ghost text-[12px] px-3 py-2">
                  Add caption block
                </button>
              </div>
            </div>

            <div className="surface-soft rounded-3xl p-5">
              <div className="text-xs text-white/55">• Inspector</div>
              {selectedItem && selected ? (
                <div className="mt-3 grid gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-[12px] text-white/70">
                    <div className="font-semibold text-white/90">{selectedItem.title}</div>
                    <div className="text-white/55">Track: {selected.track}</div>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-[12px] text-white/65">Title</label>
                    <input
                      value={selectedItem.title}
                      onChange={(e) => updateSelected({ title: e.target.value })}
                      className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/90 outline-none focus:border-white/25"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Start</label>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        value={selectedItem.start}
                        onChange={(e) => updateSelected({ start: Number(e.target.value || 0) })}
                        className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/90 outline-none focus:border-white/25"
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
                        className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/90 outline-none focus:border-white/25"
                      />
                    </div>
                  </div>

                  {selectedItem.type === "video" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-2">
                        <label className="text-[12px] text-white/65">Trim start</label>
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          value={selectedItem.trimStart}
                          onChange={(e) => updateSelected({ trimStart: Number(e.target.value || 0) })}
                          className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/90 outline-none focus:border-white/25"
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
                          className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/90 outline-none focus:border-white/25"
                        />
                      </div>
                    </div>
                  ) : null}

                  {(selectedItem.type === "audio" || selected.track === "music") ? (
                    <div className="grid gap-2">
                      <label className="text-[12px] text-white/65">Volume</label>
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
                        className="h-10 rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white/90 outline-none focus:border-white/25"
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
                        className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/25"
                      />
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={duplicateSelected} className="btn-ghost text-[12px] px-3 py-2">
                      Duplicate
                    </button>
                    <button type="button" onClick={removeSelected} className="btn-ghost text-[12px] px-3 py-2">
                      Remove
                    </button>
                  </div>

                  <button type="button" onClick={createQuickCropFromSelection} className="btn-solid-dark text-[12px] px-3 py-2">
                    Quick render trimmed video
                  </button>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-[12px] text-white/55">
                  Select any timeline item to inspect and edit timing, trims, motion, captions, and levels.
                </div>
              )}
            </div>
          </aside>
        </section>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
        ) : null}
      </main>
    </div>
  );
}
