"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

/* =========================================================
   Orbito — Clips (LAUNCH-READY)
   Fixes / polish (this pass):
   - Removes all ?dev=1 links
   - Mobile-safe: 100svh, safe-area padding, Drawer safe-area + no background scroll
   - Small UI correctness: ButtonPill hover class, focus rings, a11y bits
   - Keeps your key behaviors:
     * True aspect ratio previews
     * Auto titles
     * Direct download with fallback
     * Grouped mode + focused mode
========================================================= */

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

/* ---------- Errors ---------- */
function toErrorText(e: any): string {
  try {
    if (!e) return "Unknown error";
    if (typeof e === "string") return e;
    if (typeof e?.message === "string" && e.message.trim()) return e.message;
    if (typeof e?.detail === "string" && e.detail.trim()) return e.detail;
    if (typeof e?.error === "string" && e.error.trim()) return e.error;
    const s = JSON.stringify(e);
    if (s && s !== "{}") return s;
    return "Request failed";
  } catch {
    return "Request failed";
  }
}

/* ---------- Types ---------- */
type ViewMode = "grid" | "list";
type SortKey = "newest" | "oldest" | "duration";

/**
 * Backend should ideally send:
 * - title: string
 * - aspect_ratio: "9:16" | "4:3" | "1:1" etc
 * - width/height: integers (actual output dimensions)
 */
type ClipDTO = {
  id: number;
  upload_id: number;
  storage_key: string;
  url: string;
  start_time: number;
  end_time: number;
  duration: number;

  // Optional
  title?: string | null;
  aspect_ratio?: string | null;
  width?: number | null;
  height?: number | null;
};

type UploadDTO = {
  id: number;
  original_filename: string;
  storage_key: string;
};

type GroupDTO = {
  upload: UploadDTO;
  clips: ClipDTO[];
};

/* ---------- Formatting helpers ---------- */
function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function safeNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ---------- Aspect ratio helpers ---------- */
function aspectStringToCss(ar?: string | null) {
  if (!ar) return undefined;
  const m = ar.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return undefined;
  return `${a} / ${b}`;
}

function whToCss(w?: number | null, h?: number | null) {
  const ww = typeof w === "number" ? w : Number(w);
  const hh = typeof h === "number" ? h : Number(h);
  if (!Number.isFinite(ww) || !Number.isFinite(hh) || ww <= 0 || hh <= 0) return undefined;
  return `${ww} / ${hh}`;
}

/* ---------- Titles ---------- */
function autoTitle(clip: ClipDTO) {
  const t = (clip.title || "").trim();
  if (t) return t;

  const a = formatTime(clip.start_time);
  const b = formatTime(clip.end_time);
  return `Clip #${clip.id} — ${a}–${b}`;
}

/* ---------- Download helpers ---------- */
function sanitizeFilename(name: string) {
  const s = (name || "clip")
    .replace(/[\/\\:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s || "clip";
}

function downloadNameFromKey(storageKey: string, fallbackName?: string) {
  const base = (storageKey || "").split("/").pop() || "";
  const derived = base ? base : sanitizeFilename(fallbackName || "clip") + ".mp4";
  return derived.endsWith(".mp4") ? derived : `${derived}.mp4`;
}

/**
 * Direct download:
 * - Fetch the video as a Blob and trigger a save dialog.
 * - If fetch is blocked by CORS (common on some S3 configs), caller should fall back.
 */
async function downloadDirect(url: string, filename: string) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();

  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
/* ---------- Icons ---------- */
function Icon({
  name,
  className = "",
}: {
  name:
    | "search"
    | "grid"
    | "list"
    | "spark"
    | "download"
    | "play"
    | "filter"
    | "chev"
    | "x"
    | "sort"
    | "info"
    | "folder"
    | "collapse"
    | "sliders";
  className?: string;
}) {
  const common = `inline-block ${className}`;

  if (name === "search") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M10.5 18.2a7.7 7.7 0 1 1 0-15.4 7.7 7.7 0 0 1 0 15.4Z"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.7"
        />
        <path
          d="M16.6 16.6 21 21"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "grid") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  if (name === "list") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M6 7h15M6 12h15M6 17h15"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M3.5 7h.01M3.5 12h.01M3.5 17h.01"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "spark") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M12 2l1.2 4.2L17.5 8l-4.3 1.8L12 14l-1.2-4.2L6.5 8l4.3-1.8L12 2Z"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M18.5 13.2l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z"
          fill="rgba(255,255,255,0.55)"
        />
      </svg>
    );
  }

  if (name === "download") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M12 3v10m0 0 4-4m-4 4-4-4"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 17.5c2.5 1.2 5.2 1.8 8 1.8s5.5-.6 8-1.8"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "play") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M10 8.2v7.6a1 1 0 0 0 1.5.86l6-3.8a1 1 0 0 0 0-1.72l-6-3.8A1 1 0 0 0 10 8.2Z"
          fill="rgba(255,255,255,0.78)"
        />
        <path
          d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.4"
        />
      </svg>
    );
  }

  if (name === "filter") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M4 6h16M7 12h10M10 18h4"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "sliders") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M4 7h10M18 7h2"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M4 12h2M8 12h12"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M4 17h8M16 17h4"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12 7v0M6 12v0M14 17v0"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "sort") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M7 6h10M9 12h6M11 18h2"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M17 6l2 2 2-2"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "info") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.6"
        />
        <path
          d="M12 10.5v6"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12 7.5h.01"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "folder") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M3.5 7.5c0-1.1.9-2 2-2h4.2c.6 0 1.1.25 1.5.7l.9 1c.3.35.75.55 1.2.55H18.5c1.1 0 2 .9 2 2v8.7c0 1.1-.9 2-2 2H5.5c-1.1 0-2-.9-2-2V7.5Z"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "collapse") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M8 10l4 4 4-4"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "chev") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M9 6l6 6-6 6"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // x (fallback)
  return (
    <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="rgba(255,255,255,0.62)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------- UI bits ---------- */
function TinyPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  const t =
    tone === "good"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100/85"
      : tone === "warn"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-100/85"
      : "border-white/10 bg-white/[0.02] text-white/55";

  return <span className={cx("rounded-full border px-3 py-1 text-[12px]", t)}>{children}</span>;
}

function ViewToggle({
  view,
  setView,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.02] p-1">
      <button
        type="button"
        onClick={() => setView("grid")}
        className={cx(
          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
          view === "grid" ? "bg-white/[0.10] text-white/90" : "text-white/60 hover:bg-white/[0.04] hover:text-white/80"
        )}
        aria-label="Grid view"
      >
        <Icon name="grid" />
        Grid
      </button>
      <button
        type="button"
        onClick={() => setView("list")}
        className={cx(
          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
          view === "list" ? "bg-white/[0.10] text-white/90" : "text-white/60 hover:bg-white/[0.04] hover:text-white/80"
        )}
        aria-label="List view"
      >
        <Icon name="list" />
        List
      </button>
    </div>
  );
}

function ButtonPill({
  children,
  onClick,
  tone = "neutral",
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "neutral" | "primary";
  disabled?: boolean;
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20";
  const t =
    tone === "primary"
      ? "border-white/10 bg-white/10 text-white/90 hover:bg-white/[0.12]"
      : "border-white/10 bg-white/[0.02] text-white/75 hover:bg-white/[0.05] hover:text-white/90";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(base, t, disabled && "opacity-60 cursor-not-allowed", className)}
    >
      {children}
    </button>
  );
}

/* ---------- Clip components ---------- */
function ClipPreview({
  clip,
  variant,
}: {
  clip: ClipDTO;
  variant: "grid" | "thumb";
}) {
  const cssAR =
    aspectStringToCss(clip.aspect_ratio) ??
    whToCss(clip.width, clip.height) ??
    "9 / 16";

  const wrapper =
    variant === "grid"
      ? "relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]"
      : "relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] w-14";

  return (
    <div className={wrapper} style={{ aspectRatio: cssAR }}>
      <video
        src={clip.url}
        controls={variant === "grid"}
        muted={variant !== "grid"}
        playsInline
        preload="metadata"
        className="h-full w-full object-contain bg-black cf-video rounded-xl"
      />
    </div>
  );
}

function ClipMeta({
  clip,
  compact,
}: {
  clip: ClipDTO;
  compact?: boolean;
}) {
  const title = autoTitle(clip);
  return (
    <div className="min-w-0">
      <div className={cx("font-semibold text-white/85 truncate", compact ? "text-sm" : "text-sm")}>{title}</div>
      <div className="mt-1 text-[12px] text-white/55">
        {formatTime(clip.start_time)} → {formatTime(clip.end_time)} • {Math.round(clip.duration)}s
      </div>
      <div className={cx("mt-2 text-[12px] text-white/45 truncate", compact && "mt-1")}>{clip.storage_key}</div>
    </div>
  );
}

function ClipActions({
  clip,
  onOpenSettings,
}: {
  clip: ClipDTO;
  onOpenSettings: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const title = autoTitle(clip);
  const filename = downloadNameFromKey(clip.storage_key, `${title}.mp4`);

  async function onDownload() {
    if (downloading) return;
    try {
      setDownloading(true);
      await downloadDirect(clip.url, filename);
    } catch {
      // If blob download fails (often CORS), fall back to a normal navigation download.
      window.location.href = clip.url;
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenSettings();
        }}
        className="btn-ghost text-[12px] px-4 py-2 inline-flex items-center gap-2"
        aria-label="Output settings"
      >
        <Icon name="sliders" />
        Output
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void onDownload();
        }}
        disabled={downloading}
        className={cx(
          "btn-solid-dark text-[12px] px-4 py-2 inline-flex items-center gap-2",
          downloading && "opacity-70 cursor-not-allowed"
        )}
        aria-label="Download"
      >
        <Icon name="download" />
        {downloading ? "Downloading…" : "Download"}
      </button>

      <a
        href={clip.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="btn-ghost text-[12px] px-4 py-2 inline-flex items-center gap-2"
        aria-label="Open"
      >
        <Icon name="play" />
        Open
      </a>
    </div>
  );
}
/* ---------- Normalizers ---------- */
function normalizeClipDTO(x: any): ClipDTO | null {
  if (!x || typeof x !== "object") return null;

  const id = safeNum(x.id, NaN);
  const upload_id = safeNum(x.upload_id, NaN);

  const url = typeof x.url === "string" ? x.url : "";
  const storage_key = typeof x.storage_key === "string" ? x.storage_key : "";

  const start_time = safeNum(x.start_time, 0);
  const end_time = safeNum(x.end_time, 0);
  const duration = safeNum(x.duration, Math.max(0, end_time - start_time));

  const title = typeof x.title === "string" ? x.title : null;
  const aspect_ratio = typeof x.aspect_ratio === "string" ? x.aspect_ratio : null;
  const width = Number.isFinite(Number(x.width)) ? Number(x.width) : null;
  const height = Number.isFinite(Number(x.height)) ? Number(x.height) : null;

  if (!Number.isFinite(id) || !Number.isFinite(upload_id) || !url) return null;

  return {
    id,
    upload_id,
    url,
    storage_key,
    start_time,
    end_time,
    duration,
    title,
    aspect_ratio,
    width,
    height,
  };
}

function normalizeGroupDTO(x: any): GroupDTO | null {
  if (!x || typeof x !== "object") return null;
  const up = x.upload;
  const clips = x.clips;

  if (!up || typeof up !== "object") return null;

  const id = safeNum(up.id, NaN);
  const original_filename = typeof up.original_filename === "string" ? up.original_filename : "upload";
  const storage_key = typeof up.storage_key === "string" ? up.storage_key : "";

  if (!Number.isFinite(id)) return null;

  const arr = Array.isArray(clips) ? clips : [];
  const normClips = arr.map(normalizeClipDTO).filter(Boolean) as ClipDTO[];

  return {
    upload: { id, original_filename, storage_key },
    clips: normClips,
  };
}

function buildClipsUrl(uploadId: number) {
  return `/app/clips?upload_id=${uploadId}`;
}

/* ---------- Per-clip UI-only settings ---------- */
type ClipOutputSettings = {
  captions_on: boolean;
  caption_font: "Inter" | "Bold" | "Mono";
  caption_size: "S" | "M" | "L";
  caption_pos: "Bottom" | "Middle" | "Top";
};

const DEFAULT_CLIP_SETTINGS: ClipOutputSettings = {
  captions_on: true,
  caption_font: "Bold",
  caption_size: "L",
  caption_pos: "Bottom",
};

/* =========================================================
   ClipsPage
========================================================= */
export default function ClipsPage() {
  const sp = useSearchParams();
  const router = useRouter();

  const uploadIdParam = sp.get("upload_id");
  const uploadId = uploadIdParam ? Number(uploadIdParam) : null;

  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortKey>("newest");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [clips, setClips] = useState<ClipDTO[]>([]);

  const focused = !!(uploadId && Number.isFinite(uploadId));
  const isGroupedMode = !uploadId;

  function goToUpload(id: number) {
    if (!Number.isFinite(id) || id <= 0) return;
    router.push(buildClipsUrl(id));
  }

  function clearUploadFocus() {
    router.push("/app/clips");
  }

  // Drawer state (UI-only)
  const [settingsClipId, setSettingsClipId] = useState<number | null>(null);
  const [clipSettings, setClipSettings] = useState<Record<number, ClipOutputSettings>>({});

  function getSettingsFor(id: number): ClipOutputSettings {
    return clipSettings[id] || DEFAULT_CLIP_SETTINGS;
  }

  function updateSettingsFor(id: number, patch: Partial<ClipOutputSettings>) {
    setClipSettings((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || DEFAULT_CLIP_SETTINGS), ...patch },
    }));
  }

  // Fetch
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);

      try {
        if (uploadId && Number.isFinite(uploadId)) {
          const data = await apiFetch<any>(`/clips?upload_id=${uploadId}`);
          if (cancelled) return;

          const arr = Array.isArray(data) ? data : [];
          const normalized = arr.map(normalizeClipDTO).filter(Boolean) as ClipDTO[];

          setClips(normalized);
          setGroups([]);
          return;
        }

        const data = await apiFetch<any>(`/clips?grouped=true`);
        if (cancelled) return;

        const arr = Array.isArray(data) ? data : [];
        const normalized = arr.map(normalizeGroupDTO).filter(Boolean) as GroupDTO[];

        setGroups(normalized.filter((g) => g.clips.length > 0));
        setClips([]);
      } catch (e: any) {
        if (cancelled) return;
        setErr(toErrorText(e));
        setGroups([]);
        setClips([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [uploadId]);

  // Filters
  const activeFilterCount = (query ? 1 : 0) + (sort !== "newest" ? 1 : 0);

  function clearAllUiFilters() {
    setQuery("");
    setSort("newest");
  }

  // Expand/collapse groups
  const [openUploads, setOpenUploads] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!groups.length) return;
    setOpenUploads((prev) => {
      const next = { ...prev };
      for (let i = 0; i < Math.min(3, groups.length); i++) {
        const id = groups[i].upload.id;
        if (typeof next[id] !== "boolean") next[id] = true;
      }
      return next;
    });
  }, [groups]);

  // Visible groups
  const visibleGroups = useMemo(() => {
    let out = [...groups];

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out
        .map((g) => {
          const filename = (g.upload.original_filename || "").toLowerCase();
          const uploadMatches = filename.includes(q) || String(g.upload.id).includes(q);
          if (uploadMatches) return g;

          const filteredClips = g.clips.filter((c) => {
            const key = (c.storage_key || "").toLowerCase();
            const title = (c.title || "").toLowerCase();
            return key.includes(q) || title.includes(q) || String(c.id).includes(q);
          });

          return { ...g, clips: filteredClips };
        })
        .filter((g) => g.clips.length > 0);
    }

    // uploads: newest first by id
    out.sort((a, b) => (b.upload.id ?? 0) - (a.upload.id ?? 0));
    return out;
  }, [groups, query]);

  // Visible clips (focused mode)
  const visibleClips = useMemo(() => {
    let out = [...clips];

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((c) => {
        const key = (c.storage_key || "").toLowerCase();
        const title = (c.title || "").toLowerCase();
        return key.includes(q) || title.includes(q) || String(c.id).includes(q);
      });
    }

    if (sort === "duration") out.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
    else if (sort === "oldest") out.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    else out.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));

    return out;
  }, [clips, query, sort]);

  const hasAny = isGroupedMode ? visibleGroups.length > 0 : visibleClips.length > 0;

  return (
    <div className="relative grid gap-6 min-h-[100svh] pb-[max(16px,env(safe-area-inset-bottom))]">
      <style jsx global>{`
        video.cf-video:fullscreen {
          object-fit: contain !important;
          background: #000 !important;
        }
        video.cf-video:-webkit-full-screen {
          object-fit: contain !important;
          background: #000 !important;
        }
      `}</style>

      {/* HEADER */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(900px_460px_at_50%_0%,rgba(255,255,255,0.06),transparent_65%)]" />
          <div className="absolute inset-0 opacity-[0.55]">
            <div className="aurora" />
          </div>
          <div className="absolute -top-28 left-[-18%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.20),transparent_62%)] blur-3xl" />
          <div className="absolute top-10 right-[-18%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.16),transparent_64%)] blur-3xl" />
          <div className="absolute bottom-[-22%] left-[10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.12),transparent_65%)] blur-3xl" />
          <div className="absolute inset-0 opacity-[0.06] mix-blend-overlay [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
        </div>

        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="text-xs text-white/50">• Library</div>
            <div className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-white/92">
              Clips <span className="grad-text">workspace</span>
            </div>
            <div className="mt-2 max-w-2xl text-sm text-white/65">
              {focused ? (
                <>
                  Focused view for <span className="text-white/85 font-semibold">upload_id={uploadId}</span>.
                </>
              ) : (
                <>All clips grouped by upload — newest uploads first.</>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <TinyPill>Grouped</TinyPill>
              <TinyPill>Aspect-aware</TinyPill>
              <TinyPill>Export-ready</TinyPill>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            {focused ? (
              <ButtonPill onClick={clearUploadFocus} className="w-full sm:w-auto justify-center">
                <Icon name="x" />
                Clear focus
              </ButtonPill>
            ) : null}

            <Link href="/app/upload" className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto text-center">
              New upload
            </Link>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="surface-soft p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle view={view} setView={setView} />

            <span className="hidden lg:inline-block h-6 w-px bg-white/10" />

            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="appearance-none rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 pr-9 text-[12px] font-semibold text-white/80 outline-none hover:bg-white/[0.04] transition"
                aria-label="Sort"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="duration">Duration</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-80">
                <Icon name="chev" />
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-[360px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-90">
                <Icon name="search" />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="field !pl-11 w-full"
                placeholder={isGroupedMode ? "Search uploads or clips…" : "Search clips…"}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/[0.03] p-1.5 text-white/70 hover:bg-white/[0.06] hover:text-white/90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                  aria-label="Clear search"
                >
                  <Icon name="x" />
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={clearAllUiFilters}
              className={cx(
                "btn-ghost text-[12px] px-4 py-2 inline-flex items-center justify-center gap-2 w-full sm:w-auto",
                activeFilterCount === 0 && "opacity-60"
              )}
              aria-label="Clear filters"
              disabled={activeFilterCount === 0}
            >
              <Icon name="x" />
              Clear
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-white/50">
          {loading ? (
            <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1">Loading…</span>
          ) : null}
          {err ? (
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-amber-100/85">
              {err}
            </span>
          ) : null}
          {!loading && !err ? (
            <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1">
              {isGroupedMode
                ? `${groups.reduce((sum, g) => sum + (g.clips?.length ?? 0), 0)} clip(s) across ${groups.length} upload(s)`
                : `${clips.length} clip(s)`}
            </span>
          ) : null}
        </div>
      </div>

      {/* CONTENT */}
      {loading ? (
        <div className="surface-soft p-6">
          <div className="text-sm font-semibold text-white/85">Loading clips…</div>
          <div className="mt-2 text-sm text-white/60">Fetching from your backend.</div>
        </div>
      ) : err ? (
        <div className="surface-soft p-6">
          <div className="text-sm font-semibold text-white/85">Couldn’t load clips</div>
          <div className="mt-2 text-sm text-white/60">{err}</div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto"
            >
              Retry
            </button>
            <Link href="/app/upload" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto text-center">
              New upload
            </Link>
          </div>
        </div>
      ) : !hasAny ? (
        <div className="surface-soft p-6">
          <div className="text-sm font-semibold text-white/85">No clips found</div>
          <div className="mt-2 text-sm text-white/60">
            If a job is still running, wait a moment — clips will appear here automatically.
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Link href="/app/upload" className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto text-center">
              New upload
            </Link>
            <Link href="/app" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto text-center">
              Back to overview
            </Link>
          </div>
        </div>
      ) : isGroupedMode ? (
        <div className="grid gap-4">
          {visibleGroups.map((g) => {
            const open = !!openUploads[g.upload.id];
            const clipCount = g.clips.length;

            return (
              <div key={g.upload.id} className="surface-soft overflow-hidden">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setOpenUploads((p) => ({
                      ...p,
                      [g.upload.id]: !open,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenUploads((p) => ({
                        ...p,
                        [g.upload.id]: !open,
                      }));
                    }
                  }}
                  className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                  aria-label={`Toggle upload ${g.upload.id}`}
                  aria-expanded={open}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-[12px] font-semibold text-white/75">
                        <Icon name="folder" />
                        Upload #{g.upload.id}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-[12px] text-white/60">
                        {clipCount} clip(s)
                      </span>
                    </div>
                    <div className="mt-2 truncate text-sm font-semibold text-white/85">{g.upload.original_filename || "upload"}</div>
                    <div className="mt-1 truncate text-[12px] text-white/45">{g.upload.storage_key}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToUpload(g.upload.id);
                      }}
                      className="btn-ghost text-[12px] px-3 py-2 inline-flex items-center justify-center"
                      aria-label="Focus this upload"
                    >
                      Focus
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenUploads((p) => ({
                          ...p,
                          [g.upload.id]: !open,
                        }));
                      }}
                      className={cx(
                        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                        open ? "rotate-180" : "rotate-0"
                      )}
                      aria-label={open ? "Collapse" : "Expand"}
                      aria-expanded={open}
                    >
                      <Icon name="collapse" />
                    </button>
                  </div>
                </div>

                {open ? (
                  <div className="border-t border-white/10 p-4 pt-4">
                    {view === "grid" ? (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 auto-rows-min">
                        {g.clips
                          .slice()
                          .sort((a, b) => {
                            if (sort === "duration") return (b.duration ?? 0) - (a.duration ?? 0);
                            if (sort === "oldest") return (a.id ?? 0) - (b.id ?? 0);
                            return (b.id ?? 0) - (a.id ?? 0);
                          })
                          .map((c) => (
                            <div key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                              <ClipPreview clip={c} variant="grid" />
                              <div className="mt-4 flex items-start justify-between gap-3">
                                <ClipMeta clip={c} />
                              </div>
                              <div className="mt-4">
                                <ClipActions clip={c} onOpenSettings={() => setSettingsClipId(c.id)} />
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {g.clips
                          .slice()
                          .sort((a, b) => {
                            if (sort === "duration") return (b.duration ?? 0) - (a.duration ?? 0);
                            if (sort === "oldest") return (a.id ?? 0) - (b.id ?? 0);
                            return (b.id ?? 0) - (a.id ?? 0);
                          })
                          .map((c) => (
                            <div key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                  <ClipPreview clip={c} variant="thumb" />
                                  <ClipMeta clip={c} compact />
                                </div>
                                <ClipActions clip={c} onOpenSettings={() => setSettingsClipId(c.id)} />
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleClips.map((c) => (
            <div key={c.id} className="surface-soft overflow-hidden p-4">
              <ClipPreview clip={c} variant="grid" />
              <div className="mt-4 flex items-start justify-between gap-3">
                <ClipMeta clip={c} />
              </div>
              <div className="mt-4">
                <ClipActions clip={c} onOpenSettings={() => setSettingsClipId(c.id)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {visibleClips.map((c) => (
            <div key={c.id} className="surface-soft p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <ClipPreview clip={c} variant="thumb" />
                  <ClipMeta clip={c} compact />
                </div>
                <ClipActions clip={c} onOpenSettings={() => setSettingsClipId(c.id)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SETTINGS DRAWER (UI-only) */}
      <Drawer
        open={settingsClipId !== null}
        onClose={() => setSettingsClipId(null)}
        title={settingsClipId ? `Output settings — Clip #${settingsClipId}` : "Output settings"}
      >
        {settingsClipId ? (
          <PerClipSettings
            clipId={settingsClipId}
            settings={getSettingsFor(settingsClipId)}
            onChange={(patch) => updateSettingsFor(settingsClipId, patch)}
            onDone={() => setSettingsClipId(null)}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
/* =========================================================
   PerClipSettings (UI-only)
========================================================= */
function PerClipSettings({
  clipId,
  settings,
  onChange,
  onDone,
}: {
  clipId: number;
  settings: ClipOutputSettings;
  onChange: (patch: Partial<ClipOutputSettings>) => void;
  onDone: () => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/85">Captions</div>
            <div className="mt-1 text-[12px] text-white/55">
              UI-only for now. This will require backend fields + re-rendering.
            </div>
          </div>

          <button
            type="button"
            onClick={() => onChange({ captions_on: !settings.captions_on })}
            className={cx(
              "inline-flex h-8 w-14 items-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
              settings.captions_on ? "border-emerald-400/20 bg-emerald-400/10" : "border-white/10 bg-white/[0.02]"
            )}
            aria-label="Toggle captions"
          >
            <span
              className={cx(
                "ml-1 h-6 w-6 rounded-full transition",
                settings.captions_on ? "translate-x-6 bg-emerald-200/80" : "bg-white/35"
              )}
            />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="grid gap-2">
            <label className="text-[12px] font-medium text-white/70">Font</label>
            <select
              value={settings.caption_font}
              onChange={(e) => onChange({ caption_font: e.target.value as ClipOutputSettings["caption_font"] })}
              className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[12px] font-semibold text-white/80 outline-none hover:bg-white/[0.04] transition"
            >
              <option value="Bold">Bold</option>
              <option value="Inter">Inter</option>
              <option value="Mono">Mono</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-[12px] font-medium text-white/70">Size</label>
            <select
              value={settings.caption_size}
              onChange={(e) => onChange({ caption_size: e.target.value as ClipOutputSettings["caption_size"] })}
              className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[12px] font-semibold text-white/80 outline-none hover:bg-white/[0.04] transition"
            >
              <option value="S">S</option>
              <option value="M">M</option>
              <option value="L">L</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-[12px] font-medium text-white/70">Position</label>
            <select
              value={settings.caption_pos}
              onChange={(e) => onChange({ caption_pos: e.target.value as ClipOutputSettings["caption_pos"] })}
              className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[12px] font-semibold text-white/80 outline-none hover:bg-white/[0.04] transition"
            >
              <option value="Bottom">Bottom</option>
              <option value="Middle">Middle</option>
              <option value="Top">Top</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/55">
        <div className="inline-flex items-center gap-2 text-white/70">
          <Icon name="info" />
          Note
        </div>
        <div className="mt-2 leading-relaxed">
          Aspect ratio is selected <span className="text-white/75 font-semibold">before processing</span> (upload/job
          config), not per clip. Per-clip styling changes require re-rendering.
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={onDone}
          className="btn-solid-dark text-[12px] px-4 py-2 inline-flex items-center gap-2 w-full sm:w-auto justify-center"
        >
          <Icon name="spark" />
          Done
        </button>

        <span className="text-[12px] text-white/45">Clip #{clipId} settings are stored client-side for now.</span>
      </div>
    </div>
  );
}

/* =========================================================
   Drawer (production-safe, safe-area + scroll lock)
========================================================= */
function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;

    const prevOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div
        aria-label="Close overlay"
        role="button"
        tabIndex={0}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] focus:outline-none"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClose();
          }
        }}
      />

      <div className="absolute right-0 top-0 h-full w-full max-w-md border-l border-white/10 bg-black/70 backdrop-blur p-4 sm:p-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white/90">{title}</div>
            <div className="mt-1 text-sm text-white/55">Per-clip preferences (wiring next).</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            aria-label="Close"
          >
            <Icon name="x" />
          </button>
        </div>

        <div className="mt-5 pr-1">{children}</div>
      </div>
    </div>
  );
}
