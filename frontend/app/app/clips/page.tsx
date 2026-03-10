"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { AppPlan, normalizeAppPlan } from "@/lib/plans";

export const dynamic = "force-dynamic";

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

function computeEditorIsDesktop() {
  if (typeof window === "undefined") return true;
  const wide = window.matchMedia("(min-width: 1024px)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  return wide && !coarsePointer;
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
  hook?: string | null;
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

type SocialAccountDTO = {
  id: number;
  provider: string;
  account_id?: string | null;
  account_name?: string | null;
  status: string;
};

type SocialPostDTO = {
  id: number;
  provider: string;
  status: string;
  scheduled_at?: string | null;
  posted_at?: string | null;
  last_error?: string | null;
  platform_options?: Record<string, any>;
};

type ProviderPublishOptionsDTO = {
  provider: string;
  account_name?: string | null;
  last_caption?: string | null;
  post_blocked?: boolean;
  post_block_reason?: string | null;
  options?: Record<string, any>;
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

function socialLabel(p: string) {
  const s = (p || "").toLowerCase();
  if (s === "youtube") return "YouTube";
  if (s === "tiktok") return "TikTok";
  if (s === "instagram") return "Instagram";
  if (s === "facebook") return "Facebook";
  return p || "Social";
}

const SUPPORTED_SOCIAL_PROVIDERS = ["youtube", "tiktok", "instagram", "facebook"] as const;
type SupportedSocialProvider = (typeof SUPPORTED_SOCIAL_PROVIDERS)[number];

const TIKTOK_PRIVACY_CHOICES = ["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];

function extractOptionDefaults(options: Record<string, any> | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(options || {})) {
    if (value && typeof value === "object" && "value" in (value as Record<string, any>)) {
      out[key] = (value as Record<string, any>).value;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function fallbackPublishOptions(provider: SupportedSocialProvider): ProviderPublishOptionsDTO {
  if (provider === "youtube") {
    return {
      provider,
      options: {
        privacy_status: { value: "public", choices: ["public", "unlisted", "private"] },
      },
    };
  }
  if (provider === "tiktok") {
    return {
      provider,
      options: {
        publish_mode: { value: "DIRECT_POST", choices: ["DIRECT_POST", "MEDIA_UPLOAD"] },
        privacy_level: { value: "", choices: TIKTOK_PRIVACY_CHOICES, required: true },
        allow_comments: { value: false },
        allow_duet: { value: false },
        allow_stitch: { value: false },
        commercial_content_disclosure: { value: false },
        branded_content: { value: false },
        brand_organic: { value: false },
        is_aigc: { value: false },
        confirm_music_usage: { value: false, required: true },
        confirm_branded_content: { value: false, required_if_branded: true },
      },
    };
  }
  if (provider === "instagram") {
    return {
      provider,
      options: {
        share_to_feed: { value: true },
      },
    };
  }
  return { provider, options: {} };
}

type SocialPlan = AppPlan;

function socialPlanLabel(plan: SocialPlan): string {
  if (plan === "starter") return "Starter";
  if (plan === "creator") return "Creator";
  if (plan === "studio") return "Studio";
  return "Free";
}

function socialPlanAllowedProviders(plan: SocialPlan): SupportedSocialProvider[] {
  if (plan === "starter") return ["instagram", "facebook"];
  if (plan === "creator" || plan === "studio") return [...SUPPORTED_SOCIAL_PROVIDERS];
  return [];
}

function socialPlanPlatformLimit(plan: SocialPlan): number | null {
  if (plan === "creator" || plan === "studio") return null;
  return socialPlanAllowedProviders(plan).length;
}

function shortenErrorText(v: string, max = 240): string {
  const s = String(v || "").trim();
  if (!s) return "Failed";
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function socialPublishErrorHint(provider: string, raw: string): string {
  const msg = String(raw || "").trim();
  const low = msg.toLowerCase();
  const p = String(provider || "").toLowerCase();

  if (p === "tiktok") {
    if (low.includes("unaudited_client_can_only_post_to_private_accounts")) {
      return "TikTok app is unaudited. It can only post private videos for approved testers. Add this account as tester or complete TikTok app audit.";
    }
    if (low.includes("scope_not_authorized")) {
      return "TikTok permissions are missing. Reconnect TikTok in Studio and approve all scopes.";
    }
  }

  if (p === "facebook") {
    if (low.includes("no permission to publish the video") || low.includes("\"code\":100")) {
      return "Facebook Page publish permission is missing. Reconnect Facebook in Studio and approve Page posting permissions.";
    }
  }

  if (p === "instagram") {
    if (low.includes("no instagram professional account linked")) {
      return "No Instagram Professional account linked to a Facebook Page. Link it in Meta Business Suite, then reconnect.";
    }
    if (low.includes("no permission to publish") || low.includes("\"code\":100")) {
      return "Instagram publish permission is missing. Reconnect Instagram/Facebook in Studio and approve publishing permissions.";
    }
  }

  return shortenErrorText(msg);
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

function looksMachineFilename(base: string) {
  const b = (base || "").toLowerCase();
  return (
    /^\d+_\d+\.mp4$/.test(b) ||
    /^\d+_crop_[a-f0-9]+\.mp4$/.test(b) ||
    /^clip-\d+(-cropped)?\.mp4$/.test(b)
  );
}

function downloadNameFromKey(storageKey: string, fallbackName?: string) {
  const fallbackRaw = (fallbackName || "").trim();
  if (fallbackRaw) {
    const fallbackBase = sanitizeFilename(fallbackRaw.replace(/\.mp4$/i, ""));
    return `${fallbackBase}.mp4`;
  }

  const base = (storageKey || "").split("/").pop() || "";
  const derived = base && !looksMachineFilename(base) ? base : "clip.mp4";
  return derived.endsWith(".mp4") ? derived : `${derived}.mp4`;
}

async function triggerDownload(url: string, filename: string) {
  const resp = await fetch(url, { credentials: "include" });
  if (!resp.ok) {
    const raw = await resp.text();
    let detail = `Download failed (${resp.status})`;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const d = parsed?.detail || parsed?.message || parsed?.error;
        if (typeof d === "string" && d.trim()) {
          detail = d.trim();
        } else if (typeof raw === "string" && raw.trim()) {
          detail = raw.trim();
        }
      } catch {
        detail = raw.trim() || detail;
      }
    }
    throw { status: resp.status, detail };
  }

  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
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
    | "crop"
    | "download"
    | "play"
    | "filter"
    | "chev"
    | "x"
    | "sort"
    | "info"
    | "folder"
    | "collapse"
    | "sliders"
    | "calendar";
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

  if (name === "calendar") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" />
        <path d="M7 3v4M17 3v4M3.5 9h17" stroke="rgba(255,255,255,0.6)" strokeWidth="1.6" />
      </svg>
    );
  }

  if (name === "crop") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M7 3v14.5a2.5 2.5 0 0 0 2.5 2.5H21M3 7h11.5A2.5 2.5 0 0 1 17 9.5V21"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
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
  autoPlayEnabled,
}: {
  clip: ClipDTO;
  variant: "grid" | "thumb";
  autoPlayEnabled: boolean;
}) {
  const clipAR =
    aspectStringToCss(clip.aspect_ratio) ??
    whToCss(clip.width, clip.height) ??
    "9 / 16";
  const [resolvedAR, setResolvedAR] = useState<{ url: string; value: string } | null>(null);
  const resolvedARForClip = resolvedAR?.url === clip.url ? resolvedAR.value : null;
  const displayAR =
    aspectStringToCss(clip.aspect_ratio) ??
    whToCss(clip.width, clip.height) ??
    resolvedARForClip ??
    clipAR;

  function ratioToNumber(ar: string): number {
    const m = String(ar || "").match(/^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/);
    if (!m) return 1;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return 1;
    return a / b;
  }
  const displayRatio = ratioToNumber(displayAR);
  const gridFrameStyle =
    displayRatio >= 1
      ? { width: "100%", maxWidth: "100%", maxHeight: "100%", aspectRatio: displayAR as any }
      : { height: "100%", maxWidth: "100%", maxHeight: "100%", aspectRatio: displayAR as any };

  const wrapper =
    variant === "grid"
      ? "relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]"
      : "relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] w-14";

  return (
    <div className={wrapper} style={{ aspectRatio: variant === "grid" ? "1 / 1" : displayAR }}>
      {variant === "grid" ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black" style={gridFrameStyle}>
            <video
              src={clip.url}
              controls
              muted={false}
              autoPlay={false}
              loop={false}
              playsInline
              preload="metadata"
              className="h-full w-full object-contain bg-black cf-video"
              onLoadedMetadata={(e) => {
                const video = e.currentTarget;
                const vw = Number(video.videoWidth || 0);
                const vh = Number(video.videoHeight || 0);
                if (vw > 0 && vh > 0) {
                  setResolvedAR({ url: clip.url, value: `${vw} / ${vh}` });
                }
              }}
            />
          </div>
        </div>
      ) : (
        <video
          src={clip.url}
          controls={false}
          muted
          autoPlay={autoPlayEnabled}
          loop={autoPlayEnabled}
          playsInline
          preload="metadata"
          className="h-full w-full object-contain bg-black cf-video rounded-xl"
          onLoadedMetadata={(e) => {
            const video = e.currentTarget;
            const vw = Number(video.videoWidth || 0);
            const vh = Number(video.videoHeight || 0);
            if (vw > 0 && vh > 0) {
              setResolvedAR({ url: clip.url, value: `${vw} / ${vh}` });
            }
          }}
        />
      )}
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
  const hook = (clip.hook || "").trim();
  return (
    <div className="min-w-0">
      <div className={cx("font-semibold text-white/85 truncate", compact ? "text-sm" : "text-sm")}>{title}</div>
      {hook && (
        <div className={cx("mt-0.5 text-[11px] text-white/55 line-clamp-1", compact && "text-[10px]")}>
          {hook}
        </div>
      )}
      <div className="mt-1 text-[12px] text-white/55">
        {formatTime(clip.start_time)} → {formatTime(clip.end_time)} • {Math.round(clip.duration)}s
      </div>
      <div className={cx("mt-2 text-[12px] text-white/45 truncate", compact && "mt-1")}>
        {downloadNameFromKey(clip.storage_key, autoTitle(clip))}
      </div>
    </div>
  );
}

function ClipActions({
  clip,
  onSchedule,
  onEdit,
  canEdit,
  editErrorMessage,
  onActionError,
}: {
  clip: ClipDTO;
  onSchedule: () => void;
  onEdit: () => void;
  canEdit: boolean;
  editErrorMessage: string;
  onActionError: (msg: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const title = autoTitle(clip);
  const filename = downloadNameFromKey(clip.storage_key, title);

  async function onDownload() {
    if (downloading) return;
    try {
      setDownloading(true);
      const dlUrl = `/api/clips/${clip.id}/download?filename=${encodeURIComponent(filename)}`;
      await triggerDownload(dlUrl, filename);
      onActionError("");
    } catch (e: any) {
      const msg =
        (typeof e?.detail === "string" && e.detail.trim()) ||
        (typeof e?.message === "string" && e.message.trim()) ||
        "Download failed. Please try again.";
      onActionError(msg);
    } finally {
      window.setTimeout(() => setDownloading(false), 400);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSchedule();
        }}
        className="btn-ghost text-[12px] px-4 py-2 inline-flex items-center gap-2"
        aria-label="Schedule"
      >
        <Icon name="calendar" />
        Schedule
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!canEdit) {
            onActionError(editErrorMessage);
            return;
          }
          onEdit();
        }}
        className={cx(
          "btn-ghost text-[12px] px-4 py-2 inline-flex items-center gap-2",
          !canEdit && "opacity-70"
        )}
        aria-label="Edit"
        title={canEdit ? "Edit" : editErrorMessage}
      >
        <Icon name="crop" />
        Edit
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

type ClipCropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const DEFAULT_CROP_RECT: ClipCropRect = {
  x: 0,
  y: 0,
  w: 1,
  h: 1,
};

/* =========================================================
   ClipsPage
========================================================= */
function ClipsWorkspace() {
  const sp = useSearchParams();
  const router = useRouter();

  const uploadIdParam = sp.get("upload_id");
  const uploadId = uploadIdParam ? Number(uploadIdParam) : null;
  const openScheduleParam = String(sp.get("openSchedule") || "").trim().toLowerCase();
  const scheduleRequested = openScheduleParam === "1" || openScheduleParam === "true" || openScheduleParam === "yes";
  const scheduleClipParam = Number(sp.get("clipId") || 0);
  const scheduleClipKeyParam = String(sp.get("clipKey") || "").trim();
  const [scheduleIntentHandled, setScheduleIntentHandled] = useState(false);

  useEffect(() => {
    setScheduleIntentHandled(false);
  }, [scheduleRequested, scheduleClipParam, scheduleClipKeyParam]);

  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortKey>("newest");
  const [autoPlayPreviews, setAutoPlayPreviews] = useState(true);

  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

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

  // Schedule drawer state
  const [scheduleClipId, setScheduleClipId] = useState<number | null>(null);
  const [scheduleSelectedProviders, setScheduleSelectedProviders] = useState<SupportedSocialProvider[]>([]);
  const [scheduleCaption, setScheduleCaption] = useState("");
  const [scheduleWhen, setScheduleWhen] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [providerOptionCatalog, setProviderOptionCatalog] = useState<
    Partial<Record<SupportedSocialProvider, ProviderPublishOptionsDTO>>
  >({});
  const [providerOptionValues, setProviderOptionValues] = useState<
    Partial<Record<SupportedSocialProvider, Record<string, any>>>
  >({});
  const [providerOptionLoading, setProviderOptionLoading] = useState<
    Partial<Record<SupportedSocialProvider, boolean>>
  >({});
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountDTO[]>([]);
  const [socialPlan, setSocialPlan] = useState<SocialPlan>("free");
  const [editorDesktopOnly, setEditorDesktopOnly] = useState<boolean>(computeEditorIsDesktop);
  const editorEnabled = useMemo(() => socialPlan !== "free", [socialPlan]);
  const canOpenEditor = editorEnabled && editorDesktopOnly;
  const editorBlockedMessage = editorDesktopOnly
    ? "Editor is available on Starter and above."
    : "Editor is desktop-only. Open Clips from a laptop or desktop browser.";

  useEffect(() => {
    const onChange = () => setEditorDesktopOnly(computeEditorIsDesktop());

    onChange();
    const widthQuery = window.matchMedia("(min-width: 1024px)");
    const pointerQuery = window.matchMedia("(pointer: coarse)");
    widthQuery.addEventListener("change", onChange);
    pointerQuery.addEventListener("change", onChange);
    window.addEventListener("resize", onChange);

    return () => {
      widthQuery.removeEventListener("change", onChange);
      pointerQuery.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);

  const allowedScheduleProviders = useMemo(
    () => socialPlanAllowedProviders(socialPlan),
    [socialPlan]
  );

  const allowedScheduleSet = useMemo(
    () => new Set<SupportedSocialProvider>(allowedScheduleProviders),
    [allowedScheduleProviders]
  );

  // Crop drawer state (backend-wired)
  const [cropClip, setCropClip] = useState<ClipDTO | null>(null);
  const [cropRect, setCropRect] = useState<ClipCropRect>(DEFAULT_CROP_RECT);
  const [cropTrimStart, setCropTrimStart] = useState(0);
  const [cropTrimEnd, setCropTrimEnd] = useState(0);
  const [cropBusy, setCropBusy] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);

  const connectedScheduleProviders = useMemo(() => {
    const connected = new Set(
      socialAccounts
        .filter((a) => String(a.status || "").toLowerCase() === "connected")
        .map((a) => String(a.provider || "").toLowerCase())
        .filter((p): p is SupportedSocialProvider =>
          (SUPPORTED_SOCIAL_PROVIDERS as readonly string[]).includes(p) &&
          allowedScheduleSet.has(p as SupportedSocialProvider)
        )
    );
    return SUPPORTED_SOCIAL_PROVIDERS.filter((p) => connected.has(p));
  }, [socialAccounts, allowedScheduleSet]);

  const schedulePlatformLimit = useMemo(() => socialPlanPlatformLimit(socialPlan), [socialPlan]);
  const schedulePlanLabel = useMemo(() => socialPlanLabel(socialPlan), [socialPlan]);

  const limitSelectedProviders = useCallback(
    (v: SupportedSocialProvider[]): SupportedSocialProvider[] => {
      const connectedOrdered = SUPPORTED_SOCIAL_PROVIDERS.filter(
        (p) => connectedScheduleProviders.includes(p) && v.includes(p)
      );
      if (schedulePlatformLimit === null) return connectedOrdered;
      return connectedOrdered.slice(0, schedulePlatformLimit);
    },
    [connectedScheduleProviders, schedulePlatformLimit]
  );

  const defaultSelectedProviders = useCallback((): SupportedSocialProvider[] => {
    return [];
  }, []);

  useEffect(() => {
    setScheduleSelectedProviders((prev) => {
      const next = limitSelectedProviders(prev);
      if (next.length > 0) return next;
      const fallback = defaultSelectedProviders();
      if (fallback.length > 0) return fallback;
      return [];
    });
  }, [connectedScheduleProviders, schedulePlatformLimit, defaultSelectedProviders, limitSelectedProviders]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<SocialAccountDTO[]>("/social/accounts", { method: "GET" })
      .then((rows) => {
        if (cancelled) return;
        setSocialAccounts(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setSocialAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ plan?: string }>("/auth/me", { method: "GET" })
      .then((me) => {
        if (cancelled) return;
        setSocialPlan(normalizeAppPlan(me?.plan));
      })
      .catch(() => {
        if (cancelled) return;
        setSocialPlan("free");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ auto_play_previews?: boolean }>("/settings/preferences", { method: "GET" })
      .then((prefs) => {
        if (cancelled) return;
        setAutoPlayPreviews(prefs?.auto_play_previews !== false);
      })
      .catch(() => {
        if (cancelled) return;
        setAutoPlayPreviews(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function getSettingsFor(id: number): ClipOutputSettings {
    return clipSettings[id] || DEFAULT_CLIP_SETTINGS;
  }

  function updateSettingsFor(id: number, patch: Partial<ClipOutputSettings>) {
    setClipSettings((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || DEFAULT_CLIP_SETTINGS), ...patch },
    }));
  }

  function openSchedule(clip: ClipDTO) {
    setScheduleClipId(clip.id);
    setScheduleSelectedProviders(defaultSelectedProviders());
    setScheduleCaption(autoTitle(clip));
    setScheduleWhen("");
    setScheduleError(null);
    setScheduleNotice(null);
    setProviderOptionCatalog({});
    setProviderOptionValues({});
    setProviderOptionLoading({});
  }

  useEffect(() => {
    if (!scheduleRequested || scheduleIntentHandled) return;
    if (!Number.isFinite(scheduleClipParam) || scheduleClipParam <= 0) return;
    if (!loadedOnce || loading) return;

    const allVisibleClips =
      clips.length > 0 ? clips : groups.flatMap((group) => (Array.isArray(group.clips) ? group.clips : []));
    const normalizedClipKey = scheduleClipKeyParam.trim().toLowerCase();
    const target =
      allVisibleClips.find((c) => Number(c.id) === scheduleClipParam) ||
      (normalizedClipKey
        ? allVisibleClips.find((c) => String(c.storage_key || "").trim().toLowerCase() === normalizedClipKey)
        : null) ||
      null;
    if (target) {
      openSchedule(target);
    } else {
      const hint = scheduleClipParam > 0 ? `Clip #${scheduleClipParam}` : "Requested clip";
      setActionError(`${hint} is not available in Orbito Clips. Pick a clip and use Schedule.`);
    }

    const next = new URLSearchParams(sp.toString());
    next.delete("openSchedule");
    next.delete("clipId");
    next.delete("clipKey");
    if (String(next.get("source") || "").toLowerCase() === "labs") {
      next.set("source", "orbito");
    }
    const qs = next.toString();
    router.replace(qs ? `/app/clips?${qs}` : "/app/clips", { scroll: false });
    setScheduleIntentHandled(true);
  }, [clips, groups, loadedOnce, loading, router, scheduleClipKeyParam, scheduleClipParam, scheduleIntentHandled, scheduleRequested, sp]);

  async function loadProviderOptions(provider: SupportedSocialProvider) {
    if (providerOptionLoading[provider]) return;
    if (providerOptionCatalog[provider]) return;

    setProviderOptionLoading((prev) => ({ ...prev, [provider]: true }));
    try {
      const fetched = await apiFetch<ProviderPublishOptionsDTO>(`/social/providers/${provider}/publish-options`, {
        method: "GET",
      });
      const normalized = fetched && typeof fetched === "object" ? fetched : fallbackPublishOptions(provider);
      const options = normalized.options || {};
      const defaults = extractOptionDefaults(options);
      if (provider === "tiktok") {
        const disclosurePrefill = Boolean(defaults.branded_content) || Boolean(defaults.brand_organic);
        if (typeof defaults.commercial_content_disclosure === "undefined") {
          defaults.commercial_content_disclosure = disclosurePrefill;
        }
        if (!Boolean(defaults.commercial_content_disclosure)) {
          defaults.branded_content = false;
          defaults.brand_organic = false;
          defaults.confirm_branded_content = false;
        }
        const rawLastCaption = typeof normalized.last_caption === "string" ? normalized.last_caption.trim() : "";
        if (rawLastCaption) {
          const scheduleClip = clips.find((c) => c.id === scheduleClipId);
          const auto = scheduleClip ? autoTitle(scheduleClip).trim() : "";
          setScheduleCaption((prev) => {
            const prevTrimmed = String(prev || "").trim();
            if (!prevTrimmed || prevTrimmed === auto) return rawLastCaption;
            return prev;
          });
        }
      }
      setProviderOptionCatalog((prev) => ({ ...prev, [provider]: { ...normalized, options } }));
      setProviderOptionValues((prev) => ({ ...prev, [provider]: { ...(prev[provider] || {}), ...defaults } }));
    } catch {
      const fallback = fallbackPublishOptions(provider);
      const options = fallback.options || {};
      const defaults = extractOptionDefaults(options);
      setProviderOptionCatalog((prev) => ({ ...prev, [provider]: fallback }));
      setProviderOptionValues((prev) => ({ ...prev, [provider]: { ...(prev[provider] || {}), ...defaults } }));
    } finally {
      setProviderOptionLoading((prev) => ({ ...prev, [provider]: false }));
    }
  }

  function updateProviderOption(provider: SupportedSocialProvider, key: string, value: any) {
    const current = providerOptionValues[provider] || {};
    if (provider === "tiktok" && key === "privacy_level" && String(value || "").trim().toUpperCase() === "SELF_ONLY") {
      const hadInteraction = Boolean(current.allow_comments) || Boolean(current.allow_duet) || Boolean(current.allow_stitch);
      const hadPaidPartnership = Boolean(current.branded_content);
      if (hadInteraction || hadPaidPartnership) {
        setScheduleNotice("TikTok private posts disable comments, duet, stitch, and paid partnership disclosure.");
      }
    }
    setProviderOptionValues((prev) => ({
      ...prev,
      [provider]: {
        ...(() => {
          const base = { ...(prev[provider] || {}), [key]: value };
          if (provider !== "tiktok") return base;

          const next = { ...base };
          const privacy = String(next.privacy_level || "").trim().toUpperCase();

          if (key === "commercial_content_disclosure" && !Boolean(value)) {
            next.branded_content = false;
            next.brand_organic = false;
            next.confirm_branded_content = false;
          }

          if (key === "branded_content" || key === "brand_organic") {
            const hasDisclosureType = Boolean(next.branded_content) || Boolean(next.brand_organic);
            next.commercial_content_disclosure = hasDisclosureType || Boolean(next.commercial_content_disclosure);
            if (!hasDisclosureType) {
              next.confirm_branded_content = false;
            }
          }

          if (privacy === "SELF_ONLY") {
            next.allow_comments = false;
            next.allow_duet = false;
            next.allow_stitch = false;
            if (Boolean(next.branded_content)) {
              next.branded_content = false;
              next.confirm_branded_content = false;
            }
          }

          return next;
        })(),
      },
    }));
  }

  useEffect(() => {
    if (scheduleClipId === null) return;
    for (const provider of scheduleSelectedProviders) {
      void loadProviderOptions(provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleClipId, scheduleSelectedProviders]);

  function openCrop(clip: ClipDTO) {
    if (!editorDesktopOnly) {
      setActionError("Editor is desktop-only. Open Clips from a laptop or desktop browser.");
      return;
    }
    if (!editorEnabled) {
      setActionError("Editor is available on Starter and above.");
      return;
    }
    // Ensure only one drawer is visible; prevents the settings/schedule card
    // from rendering behind the editor shell.
    setSettingsClipId(null);
    setScheduleClipId(null);
    setCropClip(clip);
    setCropRect(DEFAULT_CROP_RECT);
    const d = Math.max(0.5, safeNum(clip.duration, 0));
    setCropTrimStart(0);
    setCropTrimEnd(d);
    setCropError(null);
  }

  function updateCropRect(patch: Partial<ClipCropRect>) {
    setCropRect((prev) => {
      const next: ClipCropRect = { ...prev, ...patch };
      next.w = Math.min(1, Math.max(0.1, next.w));
      next.h = Math.min(1, Math.max(0.1, next.h));
      next.x = Math.min(1, Math.max(0, next.x));
      next.y = Math.min(1, Math.max(0, next.y));
      if (next.x + next.w > 1) next.x = Math.max(0, 1 - next.w);
      if (next.y + next.h > 1) next.y = Math.max(0, 1 - next.h);
      return next;
    });
  }

  async function createCrop() {
    if (!cropClip || cropBusy) return;
    setCropBusy(true);
    setCropError(null);
    try {
      const total = Math.max(0.5, safeNum(cropClip.duration, 0));
      const start = Math.max(0, Math.min(cropTrimStart, total));
      const end = Math.max(start + 0.35, Math.min(cropTrimEnd || total, total));
      await apiFetch(`/clips/${cropClip.id}/crop`, {
        method: "POST",
        body: {
          ...cropRect,
          trim_start: start,
          trim_end: end,
        },
      });
      setCropClip(null);
      setReloadTick((v) => v + 1);
      setActionError(null);
    } catch (e: any) {
      setCropError(toErrorText(e));
    } finally {
      setCropBusy(false);
    }
  }

  async function submitSocialPosts(mode: "post_now" | "schedule") {
    if (!scheduleClipId || scheduleBusy) return;
    if (schedulePlatformLimit === 0) {
      setScheduleError("Social publishing is locked on Free Trial. Upgrade to Starter or Creator.");
      return;
    }
    if (schedulePlatformLimit !== null && scheduleSelectedProviders.length > schedulePlatformLimit) {
      const suffix = schedulePlatformLimit === 1 ? "" : "s";
      setScheduleError(
        `${schedulePlanLabel} plan allows up to ${schedulePlatformLimit} platform${suffix} per clip.`
      );
      return;
    }
    if (scheduleSelectedProviders.length === 0) {
      setScheduleError("Select at least one connected platform.");
      return;
    }
    if (mode === "schedule" && !scheduleWhen) {
      setScheduleError("Choose a schedule time, or use Post now.");
      return;
    }
    const scheduleClip = clips.find((c) => c.id === scheduleClipId);
    for (const provider of scheduleSelectedProviders) {
      if (providerOptionLoading[provider]) {
        setScheduleError(`Loading ${socialLabel(provider)} publish settings. Try again in a second.`);
        return;
      }
      if (provider === "tiktok" && scheduleClip) {
        const tiktokCatalog = providerOptionCatalog.tiktok;
        const tiktokBlocked = Boolean(tiktokCatalog?.post_blocked);
        const tiktokBlockedReason = String(tiktokCatalog?.post_block_reason || "").trim();
        if (tiktokBlocked) {
          setScheduleError(tiktokBlockedReason || "TikTok cannot post from this account right now. Please try again later.");
          return;
        }
        const tiktokMeta = providerOptionCatalog.tiktok?.options || {};
        const rawMax =
          tiktokMeta.max_video_post_duration_sec && typeof tiktokMeta.max_video_post_duration_sec === "object"
            ? Number((tiktokMeta.max_video_post_duration_sec as Record<string, any>).value)
            : Number(tiktokMeta.max_video_post_duration_sec || 0);
        if (rawMax > 0 && Number(scheduleClip.duration || 0) > rawMax) {
          setScheduleError(`TikTok currently allows up to ${rawMax}s for this account. Trim clip duration before posting.`);
          return;
        }
        const tkValues = providerOptionValues[provider] || {};
        const publishMode = String(tkValues.publish_mode || "DIRECT_POST").toUpperCase();
        const privacyLevel = String(tkValues.privacy_level || "").trim();
        const disclosureEnabled = Boolean(tkValues.commercial_content_disclosure);
        const hasDisclosureType = Boolean(tkValues.branded_content) || Boolean(tkValues.brand_organic);
        const confirmMusic = Boolean(tkValues.confirm_music_usage);
        const needsBrandedConfirm = hasDisclosureType;
        const confirmBranded = Boolean(tkValues.confirm_branded_content);
        if (publishMode === "DIRECT_POST" && !privacyLevel) {
          setScheduleError("TikTok: choose a privacy level before posting.");
          return;
        }
        if (publishMode === "DIRECT_POST" && disclosureEnabled && !hasDisclosureType) {
          setScheduleError("TikTok: select Paid partnership or Your brand, or turn off content disclosure.");
          return;
        }
        if (publishMode === "DIRECT_POST" && privacyLevel.toUpperCase() === "SELF_ONLY" && Boolean(tkValues.branded_content)) {
          setScheduleError("TikTok: Paid partnership disclosure is not available for private posts.");
          return;
        }
        if (publishMode === "DIRECT_POST" && !confirmMusic) {
          setScheduleError("TikTok: confirm music usage terms before posting.");
          return;
        }
        if (publishMode === "DIRECT_POST" && needsBrandedConfirm && !confirmBranded) {
          setScheduleError("TikTok: confirm branded content disclosure before posting.");
          return;
        }
      }
    }

    setScheduleBusy(true);
    setScheduleError(null);
    setScheduleNotice(null);

    try {
      const scheduledAt = mode === "schedule" ? new Date(scheduleWhen).toISOString() : undefined;
      const results: Array<SocialPostDTO & { provider: string }> = [];

      for (const provider of scheduleSelectedProviders) {
        try {
          const platformOptions = providerOptionValues[provider] || {};
          const res = await apiFetch<SocialPostDTO>("/social/posts", {
            method: "POST",
            body: {
              provider,
              clip_id: scheduleClipId,
              caption: scheduleCaption || "New Orbito clip",
              scheduled_at: scheduledAt,
              platform_options: platformOptions,
            },
          });
          results.push({ ...res, provider });
        } catch (e: any) {
          const raw = toErrorText(e);
          results.push({
            id: -1,
            provider,
            status: "failed",
            last_error: socialPublishErrorHint(provider, raw),
          });
        }
      }

      const failed = results.filter((r) => (r.status || "").toLowerCase() === "failed");
      if (failed.length > 0) {
        const msg = failed
          .map((r) => `${socialLabel(r.provider)}: ${(r.last_error || "Failed").toString()}`)
          .join("\n");
        setScheduleError(msg);
        return;
      }

      const posted = results.filter((r) => (r.status || "").toLowerCase() === "posted").length;
      const scheduled = results.filter((r) => (r.status || "").toLowerCase() === "scheduled").length;
      const queued = results.filter((r) => (r.status || "").toLowerCase() === "queued").length;
      const posting = results.filter((r) => (r.status || "").toLowerCase() === "posting").length;
      const summaryParts = [
        posted ? `Posted ${posted}` : "",
        scheduled ? `Scheduled ${scheduled}` : "",
        queued ? `Queued ${queued}` : "",
        posting ? `Posting ${posting}` : "",
      ].filter(Boolean);

      setScheduleNotice(summaryParts.length > 0 ? summaryParts.join(" • ") : "Social post created.");
      setActionError(null);
      setScheduleClipId(null);

      if (posting > 0 && scheduleSelectedProviders.includes("tiktok")) {
        setScheduleNotice("TikTok is processing your post. This can take a few minutes.");
        for (let i = 0; i < 6; i++) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          try {
            const sync = await apiFetch<{ results?: SocialPostDTO[] }>("/social/posts/sync?limit=12", {
              method: "POST",
            });
            const rows = Array.isArray(sync?.results) ? sync.results : [];
            const failedRows = rows.filter(
              (r) => String(r.provider || "").toLowerCase() === "tiktok" && String(r.status || "").toLowerCase() === "failed"
            );
            if (failedRows.length > 0) {
              setScheduleError(
                failedRows.map((r) => `TikTok: ${String(r.last_error || "Publish failed")}`).join("\n")
              );
              break;
            }
            const processingRows = rows.filter(
              (r) => String(r.provider || "").toLowerCase() === "tiktok" && String(r.status || "").toLowerCase() === "posting"
            );
            if (processingRows.length === 0) {
              const postedRows = rows.filter(
                (r) => String(r.provider || "").toLowerCase() === "tiktok" && String(r.status || "").toLowerCase() === "posted"
              );
              if (postedRows.length > 0) {
                setScheduleNotice(`TikTok posted ${postedRows.length} clip${postedRows.length === 1 ? "" : "s"}.`);
              }
              break;
            }
          } catch {
            // best-effort status sync only
          }
        }
      }
    } catch (e: any) {
      setScheduleError(toErrorText(e));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function createSchedule() {
    await submitSocialPosts("schedule");
  }

  async function createPostNow() {
    await submitSocialPosts("post_now");
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
        if (!cancelled) {
          setLoading(false);
          setLoadedOnce(true);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [uploadId, reloadTick]);

  // Filters
  const activeFilterCount = (query ? 1 : 0) + (sort !== "newest" ? 1 : 0);

  function clearAllUiFilters() {
    setQuery("");
    setSort("newest");
    setActionError(null);
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
            const hook = (c.hook || "").toLowerCase();
            return key.includes(q) || title.includes(q) || hook.includes(q) || String(c.id).includes(q);
          });

          return { ...g, clips: filteredClips };
        })
        .filter((g) => g.clips.length > 0);
    }

    // uploads: newest first by id
    out.sort((a, b) => (b.upload.id ?? 0) - (a.upload.id ?? 0));
    return out;
  }, [groups, query]);

  const uploadOrdinalById = useMemo(() => {
    const ids = Array.from(
      new Set(
        groups
          .map((g) => Number(g.upload.id))
          .filter((id) => Number.isFinite(id))
      )
    ).sort((a, b) => a - b);
    const map: Record<number, number> = {};
    ids.forEach((id, idx) => {
      map[id] = idx + 1;
    });
    return map;
  }, [groups]);

  function uploadLabel(uploadIdValue: number): string {
    const ord = uploadOrdinalById[uploadIdValue];
    if (ord) return `My Upload #${ord}`;
    return "My Upload";
  }

  // Visible clips (focused mode)
  const visibleClips = useMemo(() => {
    let out = [...clips];

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((c) => {
        const key = (c.storage_key || "").toLowerCase();
        const title = (c.title || "").toLowerCase();
        const hook = (c.hook || "").toLowerCase();
        return key.includes(q) || title.includes(q) || hook.includes(q) || String(c.id).includes(q);
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
              Clips <span className="grad-text">library</span>
            </div>
            <div className="mt-2 max-w-2xl text-sm text-white/65">
              {focused ? (
                <>
                  Showing clips from{" "}
                  <span className="text-white/85 font-semibold">
                    {uploadId && Number.isFinite(uploadId)
                      ? uploadLabel(uploadId)
                      : "selected upload"}
                  </span>
                  .
                </>
              ) : (
                <>All clips grouped by upload. Newest uploads show first.</>
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
                className="appearance-none rounded-full border border-white/12 bg-black/60 px-4 py-2 pr-9 text-[12px] font-semibold text-white/90 outline-none hover:bg-black/70 transition"
                style={{ colorScheme: "dark" }}
                aria-label="Sort"
              >
                <option value="newest" className="bg-black text-white">
                  Newest
                </option>
                <option value="oldest" className="bg-black text-white">
                  Oldest
                </option>
                <option value="duration" className="bg-black text-white">
                  Duration
                </option>
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
          {actionError ? (
            <span className="rounded-full border border-rose-300/25 bg-rose-300/10 px-3 py-1 text-rose-100/90">
              {actionError}
            </span>
          ) : null}
          {scheduleNotice ? (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-100/85">
              {scheduleNotice}
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
          <div className="mt-2 text-sm text-white/60">Loading your clip list.</div>
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
            If a job is still running, wait a moment. Clips will appear here automatically.
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
                        {uploadLabel(g.upload.id)}
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
                              <ClipPreview clip={c} variant="grid" autoPlayEnabled={autoPlayPreviews} />
                              <div className="mt-4 flex items-start justify-between gap-3">
                                <ClipMeta clip={c} />
                              </div>
                              <div className="mt-4">
                                <ClipActions
                                  clip={c}
                                  onSchedule={() => openSchedule(c)}
                                  onEdit={() => openCrop(c)}
                                  canEdit={canOpenEditor}
                                  editErrorMessage={editorBlockedMessage}
                                  onActionError={(msg) => setActionError(msg || null)}
                                />
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
                                  <ClipPreview clip={c} variant="thumb" autoPlayEnabled={autoPlayPreviews} />
                                  <ClipMeta clip={c} compact />
                                </div>
                                <ClipActions
                                  clip={c}
                                  onSchedule={() => openSchedule(c)}
                                  onEdit={() => openCrop(c)}
                                  canEdit={canOpenEditor}
                                  editErrorMessage={editorBlockedMessage}
                                  onActionError={(msg) => setActionError(msg || null)}
                                />
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
              <ClipPreview clip={c} variant="grid" autoPlayEnabled={autoPlayPreviews} />
              <div className="mt-4 flex items-start justify-between gap-3">
                <ClipMeta clip={c} />
              </div>
              <div className="mt-4">
                <ClipActions
                  clip={c}
                  onSchedule={() => openSchedule(c)}
                  onEdit={() => openCrop(c)}
                  canEdit={canOpenEditor}
                  editErrorMessage={editorBlockedMessage}
                  onActionError={(msg) => setActionError(msg || null)}
                />
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
                  <ClipPreview clip={c} variant="thumb" autoPlayEnabled={autoPlayPreviews} />
                  <ClipMeta clip={c} compact />
                </div>
                <ClipActions
                  clip={c}
                  onSchedule={() => openSchedule(c)}
                  onEdit={() => openCrop(c)}
                  canEdit={canOpenEditor}
                  editErrorMessage={editorBlockedMessage}
                  onActionError={(msg) => setActionError(msg || null)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SETTINGS DRAWER (UI-only) */}
      <Drawer
        open={settingsClipId !== null && cropClip === null}
        onClose={() => setSettingsClipId(null)}
        title={settingsClipId ? `Output settings - Clip #${settingsClipId}` : "Output settings"}
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

      {/* SCHEDULE DRAWER */}
      <Drawer
        open={scheduleClipId !== null && cropClip === null}
        onClose={() => setScheduleClipId(null)}
        title={scheduleClipId ? `Schedule - Clip #${scheduleClipId}` : "Schedule"}
        subtitle="Publish to social platforms"
        variant="schedule"
      >
        {scheduleClipId ? (
          <ScheduleForm
            providers={connectedScheduleProviders}
            selectedProviders={scheduleSelectedProviders}
            maxPlatforms={schedulePlatformLimit}
            planLabel={schedulePlanLabel}
            caption={scheduleCaption}
            when={scheduleWhen}
            busy={scheduleBusy}
            error={scheduleError}
            onProvidersChange={(v) => setScheduleSelectedProviders(limitSelectedProviders(v))}
            onCaptionChange={setScheduleCaption}
            onWhenChange={setScheduleWhen}
            onSchedule={createSchedule}
            onPostNow={createPostNow}
            providerOptionCatalog={providerOptionCatalog}
            providerOptionValues={providerOptionValues}
            providerOptionLoading={providerOptionLoading}
            onLoadProviderOptions={loadProviderOptions}
            onUpdateProviderOption={updateProviderOption}
          />
        ) : null}
      </Drawer>

      {/* CROP DRAWER */}
      <Drawer
        open={cropClip !== null}
        onClose={() => setCropClip(null)}
        title={cropClip ? `Edit - Clip #${cropClip.id}` : "Edit"}
        subtitle="Editor"
        variant="studio"
      >
        {cropClip ? (
          <CropForm
            clip={cropClip}
            rect={cropRect}
            trimStart={cropTrimStart}
            trimEnd={cropTrimEnd}
            busy={cropBusy}
            error={cropError}
            onChange={updateCropRect}
            onTrimChange={(start, end) => {
              setCropTrimStart(start);
              setCropTrimEnd(end);
            }}
            onSubmit={createCrop}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

export default function ClipsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-white/60">Loading clips…</div>}>
      <ClipsWorkspace />
    </Suspense>
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
              Saved in browser for now. Backend save will be added later.
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
          Aspect ratio is picked <span className="text-white/75 font-semibold">before processing</span>, not per clip.
          Per-clip style changes need a new render.
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

        <span className="text-[12px] text-white/45">Clip #{clipId} settings are stored in this browser for now.</span>
      </div>
    </div>
  );
}

/* =========================================================
   CropForm (backend-wired)
========================================================= */
function CropForm({
  clip,
  rect,
  trimStart,
  trimEnd,
  busy,
  error,
  onChange,
  onTrimChange,
  onSubmit,
}: {
  clip: ClipDTO;
  rect: ClipCropRect;
  trimStart: number;
  trimEnd: number;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<ClipCropRect>) => void;
  onTrimChange: (start: number, end: number) => void;
  onSubmit: () => void;
}) {
  type DragMode = "move" | "draw" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw";
  type TimelineDragMode = "playhead" | "start" | "end" | "range";
  type DragState = {
    mode: DragMode;
    startX: number;
    startY: number;
    stageW: number;
    stageH: number;
    stageLeft: number;
    stageTop: number;
    startRect: ClipCropRect;
    ratio: number;
  };
  type TimelineDragState = {
    mode: TimelineDragMode;
    offsetSec?: number;
    rangeLen?: number;
    anchorStart?: number;
    anchorEnd?: number;
  };

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const timelineDragRef = useRef<TimelineDragState | null>(null);

  const [duration, setDuration] = useState(0);
  const [scrub, setScrub] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [lockAspect, setLockAspect] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [snapGuides, setSnapGuides] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const frameStep = 1 / 30;

  const previewAspect =
    whToCss(clip.width, clip.height) || aspectStringToCss(clip.aspect_ratio) || "9 / 16";

  function clamp01(v: number) {
    return Math.max(0, Math.min(1, v));
  }

  function percent(v: number) {
    return Math.round(v * 100);
  }

  const minTrim = 0.35;
  const effectiveDuration = Math.max(minTrim, duration || safeNum(clip.duration, minTrim));
  const trimStartSafe = Math.max(0, Math.min(trimStart, Math.max(0, effectiveDuration - minTrim)));
  const trimEndSafe = Math.max(trimStartSafe + minTrim, Math.min(trimEnd || effectiveDuration, effectiveDuration));
  const trimLen = Math.max(0, trimEndSafe - trimStartSafe);
  const startPct = (trimStartSafe / effectiveDuration) * 100;
  const endPct = (trimEndSafe / effectiveDuration) * 100;
  const scrubPct = (Math.max(0, Math.min(scrub, effectiveDuration)) / effectiveDuration) * 100;

  function setTrimRange(nextStart: number, nextEnd: number) {
    const cap = Math.max(minTrim, effectiveDuration);
    let s = Math.max(0, Math.min(nextStart, cap - minTrim));
    let e = Math.max(minTrim, Math.min(nextEnd, cap));
    if (e - s < minTrim) {
      if (e >= cap) s = Math.max(0, e - minTrim);
      else e = Math.min(cap, s + minTrim);
    }
    onTrimChange(s, e);
    if (scrub < s || scrub > e) {
      syncScrub(s);
    }
  }

  function setTrimStartFromPlayhead() {
    setTrimRange(scrub, trimEndSafe);
  }

  function setTrimEndFromPlayhead() {
    setTrimRange(trimStartSafe, scrub);
  }

  function applyRect(next: ClipCropRect) {
    const clamped: ClipCropRect = {
      x: Math.min(1, Math.max(0, next.x)),
      y: Math.min(1, Math.max(0, next.y)),
      w: Math.min(1, Math.max(0.1, next.w)),
      h: Math.min(1, Math.max(0.1, next.h)),
    };

    if (snapGuides) {
      const snap = 0.012;
      const centerX = clamped.x + clamped.w / 2;
      const centerY = clamped.y + clamped.h / 2;

      if (Math.abs(clamped.x) <= snap) clamped.x = 0;
      if (Math.abs(clamped.y) <= snap) clamped.y = 0;
      if (Math.abs(1 - (clamped.x + clamped.w)) <= snap) clamped.x = 1 - clamped.w;
      if (Math.abs(1 - (clamped.y + clamped.h)) <= snap) clamped.y = 1 - clamped.h;
      if (Math.abs(centerX - 0.5) <= snap) clamped.x = 0.5 - clamped.w / 2;
      if (Math.abs(centerY - 0.5) <= snap) clamped.y = 0.5 - clamped.h / 2;
    }

    if (clamped.x + clamped.w > 1) clamped.x = Math.max(0, 1 - clamped.w);
    if (clamped.y + clamped.h > 1) clamped.y = Math.max(0, 1 - clamped.h);
    onChange(clamped);
  }

  function applyPreset(preset: "fit" | "vertical" | "square" | "landscape") {
    if (preset === "fit") {
      applyRect({ x: 0, y: 0, w: 1, h: 1 });
      return;
    }
    if (preset === "vertical") {
      applyRect({ x: 0.19, y: 0, w: 0.62, h: 1 });
      return;
    }
    if (preset === "square") {
      applyRect({ x: 0.11, y: 0.11, w: 0.78, h: 0.78 });
      return;
    }
    applyRect({ x: 0, y: 0.22, w: 1, h: 0.56 });
  }

  function onPointerMove(ev: PointerEvent) {
    const state = dragRef.current;
    if (!state) return;

    const dx = (ev.clientX - state.startX) / Math.max(1, state.stageW);
    const dy = (ev.clientY - state.startY) / Math.max(1, state.stageH);

    if (state.mode === "draw") {
      const curX = clamp01((ev.clientX - state.stageLeft) / Math.max(1, state.stageW));
      const curY = clamp01((ev.clientY - state.stageTop) / Math.max(1, state.stageH));
      const sx = clamp01(state.startRect.x);
      const sy = clamp01(state.startRect.y);
      let w = Math.max(0.1, Math.abs(curX - sx));
      let h = Math.max(0.1, Math.abs(curY - sy));
      let x = Math.min(sx, curX);
      let y = Math.min(sy, curY);
      if (lockAspect) {
        const ratio = Math.max(0.2, state.ratio || 1);
        if (w / Math.max(0.001, h) > ratio) {
          h = w / ratio;
        } else {
          w = h * ratio;
        }
      }
      if (x + w > 1) x = Math.max(0, 1 - w);
      if (y + h > 1) y = Math.max(0, 1 - h);
      applyRect({ x, y, w, h });
      return;
    }

    if (state.mode === "move") {
      applyRect({
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
      if (lockAspect) {
        if (Math.abs(dx) >= Math.abs(dy)) h = w / state.ratio;
        else w = h * state.ratio;
      }
    } else if (state.mode === "resize-sw") {
      x = state.startRect.x + dx;
      w = state.startRect.w - dx;
      h = state.startRect.h + dy;
      if (lockAspect) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          w = Math.max(0.1, w);
          h = w / state.ratio;
          x = state.startRect.x + (state.startRect.w - w);
        } else {
          h = Math.max(0.1, h);
          w = h * state.ratio;
          x = state.startRect.x + (state.startRect.w - w);
        }
      }
    } else if (state.mode === "resize-ne") {
      y = state.startRect.y + dy;
      h = state.startRect.h - dy;
      w = state.startRect.w + dx;
      if (lockAspect) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          w = Math.max(0.1, w);
          h = w / state.ratio;
          y = state.startRect.y + (state.startRect.h - h);
        } else {
          h = Math.max(0.1, h);
          w = h * state.ratio;
          y = state.startRect.y + (state.startRect.h - h);
        }
      }
    } else {
      x = state.startRect.x + dx;
      y = state.startRect.y + dy;
      w = state.startRect.w - dx;
      h = state.startRect.h - dy;
      if (lockAspect) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          w = Math.max(0.1, w);
          h = w / state.ratio;
          x = state.startRect.x + (state.startRect.w - w);
          y = state.startRect.y + (state.startRect.h - h);
        } else {
          h = Math.max(0.1, h);
          w = h * state.ratio;
          x = state.startRect.x + (state.startRect.w - w);
          y = state.startRect.y + (state.startRect.h - h);
        }
      }
    }

    applyRect({ x, y, w, h });
  }

  function stopDrag() {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
  }

  function beginDrag(e: React.PointerEvent, mode: DragMode) {
    e.preventDefault();
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      stageW: bounds.width,
      stageH: bounds.height,
      stageLeft: bounds.left,
      stageTop: bounds.top,
      startRect: { ...rect },
      ratio: rect.w / Math.max(0.0001, rect.h),
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", stopDrag, { once: true });
  }

  function beginDraw(e: React.PointerEvent) {
    const stage = stageRef.current;
    if (!stage || e.target !== stage) return;
    e.preventDefault();
    e.stopPropagation();
    const bounds = stage.getBoundingClientRect();
    const x = clamp01((e.clientX - bounds.left) / Math.max(1, bounds.width));
    const y = clamp01((e.clientY - bounds.top) / Math.max(1, bounds.height));
    dragRef.current = {
      mode: "draw",
      startX: e.clientX,
      startY: e.clientY,
      stageW: bounds.width,
      stageH: bounds.height,
      stageLeft: bounds.left,
      stageTop: bounds.top,
      startRect: { x, y, w: rect.w, h: rect.h },
      ratio: rect.w / Math.max(0.0001, rect.h),
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", stopDrag, { once: true });
  }

  function syncScrub(v: number, opts?: { clampToTrim?: boolean }) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(v)) return;
    let next = Math.max(0, Math.min(effectiveDuration, v));
    if (opts?.clampToTrim) {
      next = Math.max(trimStartSafe, Math.min(trimEndSafe, next));
    }
    video.currentTime = next;
    setScrub(next);
  }

  function seekBy(deltaSeconds: number) {
    syncScrub(scrub + deltaSeconds, { clampToTrim: true });
  }

  function stepFrame(deltaFrames: number) {
    seekBy(deltaFrames * frameStep);
  }

  function getTimelineSecondsFromClientX(clientX: number) {
    const timeline = timelineRef.current;
    if (!timeline) return null;
    const bounds = timeline.getBoundingClientRect();
    const pct = clamp01((clientX - bounds.left) / Math.max(1, bounds.width));
    return pct * effectiveDuration;
  }

  function onTimelinePointerMove(ev: PointerEvent) {
    const state = timelineDragRef.current;
    if (!state) return;
    const sec = getTimelineSecondsFromClientX(ev.clientX);
    if (sec === null) return;

    if (state.mode === "playhead") {
      syncScrub(sec, { clampToTrim: true });
      return;
    }

    if (state.mode === "start") {
      setTrimRange(sec, state.anchorEnd ?? trimEndSafe);
      return;
    }

    if (state.mode === "end") {
      setTrimRange(state.anchorStart ?? trimStartSafe, sec);
      return;
    }

    const rangeLen = Math.max(minTrim, state.rangeLen ?? trimLen);
    const offset = state.offsetSec ?? 0;
    let start = sec - offset;
    start = Math.max(0, Math.min(start, Math.max(0, effectiveDuration - rangeLen)));
    setTrimRange(start, start + rangeLen);
    if (scrub < start || scrub > start + rangeLen) {
      syncScrub(start, { clampToTrim: true });
    }
  }

  function stopTimelineDrag() {
    timelineDragRef.current = null;
    window.removeEventListener("pointermove", onTimelinePointerMove);
    window.removeEventListener("pointerup", stopTimelineDrag);
  }

  function beginTimelineDrag(e: React.PointerEvent, mode: TimelineDragMode) {
    e.preventDefault();
    e.stopPropagation();
    const sec = getTimelineSecondsFromClientX(e.clientX);
    if (sec === null) return;
    const next: TimelineDragState = { mode };
    if (mode === "start") {
      next.anchorEnd = trimEndSafe;
    } else if (mode === "end") {
      next.anchorStart = trimStartSafe;
    } else if (mode === "range") {
      next.rangeLen = trimLen;
      next.offsetSec = sec - trimStartSafe;
    }
    timelineDragRef.current = next;
    if (mode === "playhead") {
      syncScrub(sec, { clampToTrim: true });
    }
    window.addEventListener("pointermove", onTimelinePointerMove, { passive: true });
    window.addEventListener("pointerup", stopTimelineDrag, { once: true });
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.currentTime < trimStartSafe || video.currentTime > trimEndSafe) {
      video.currentTime = trimStartSafe;
      setScrub(trimStartSafe);
    }
    if (video.paused) {
      void video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.currentTime < trimStartSafe || video.currentTime > trimEndSafe) {
      video.currentTime = trimStartSafe;
    }
  }, [trimStartSafe, trimEndSafe]);

  // Keyboard shortcuts intentionally use a stable subscription over selected state fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)
      ) {
        return;
      }

      const k = e.key.toLowerCase();
      if (e.code === "Space") {
        e.preventDefault();
        togglePlayback();
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(e.shiftKey ? -1 : -0.2);
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(e.shiftKey ? 1 : 0.2);
        return;
      }

      if (e.key === "[") {
        e.preventDefault();
        setTrimStartFromPlayhead();
        return;
      }

      if (e.key === "]") {
        e.preventDefault();
        setTrimEndFromPlayhead();
        return;
      }

      if (k === "j") {
        e.preventDefault();
        seekBy(-2);
        return;
      }

      if (k === "l") {
        e.preventDefault();
        seekBy(2);
        return;
      }

      const nudge = e.shiftKey ? 0.02 : 0.01;
      if (k === "a") {
        e.preventDefault();
        applyRect({ ...rect, x: rect.x - nudge });
        return;
      }
      if (k === "d") {
        e.preventDefault();
        applyRect({ ...rect, x: rect.x + nudge });
        return;
      }
      if (k === "w") {
        e.preventDefault();
        applyRect({ ...rect, y: rect.y - nudge });
        return;
      }
      if (k === "s") {
        e.preventDefault();
        applyRect({ ...rect, y: rect.y + nudge });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, scrub, trimStartSafe, trimEndSafe, playbackRate, effectiveDuration]);

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-white/70">
          <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">
            {clip.aspect_ratio || "9:16"}
          </span>
          <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">Layout: Fill</span>
          <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">Tracker: Smart</span>
          <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">Manual crop</span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_220px]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 grid gap-4 h-fit">
          <div>
            <div className="text-sm font-semibold text-white/85">Edit controls</div>
            <div className="mt-1 text-[12px] text-white/55">
              Build an edited variant. Original clip stays unchanged.
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-[12px] font-medium text-white/70">Quick layouts</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => applyPreset("fit")} className="btn-ghost text-[12px] px-3 py-2">
                Fit
              </button>
              <button
                type="button"
                onClick={() => applyPreset("vertical")}
                className="btn-ghost text-[12px] px-3 py-2"
              >
                9:16
              </button>
              <button
                type="button"
                onClick={() => applyPreset("square")}
                className="btn-ghost text-[12px] px-3 py-2"
              >
                1:1
              </button>
              <button
                type="button"
                onClick={() => applyPreset("landscape")}
                className="btn-ghost text-[12px] px-3 py-2"
              >
                16:9
              </button>
            </div>
          </div>

          <label className="inline-flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
            <span className="text-[12px] text-white/70">Lock aspect</span>
            <button
              type="button"
              onClick={() => setLockAspect((v) => !v)}
              className={cx(
                "inline-flex h-6 w-11 items-center rounded-full border transition",
                lockAspect ? "border-emerald-400/30 bg-emerald-400/10" : "border-white/15 bg-white/[0.04]"
              )}
            >
              <span
                className={cx(
                  "ml-0.5 h-5 w-5 rounded-full transition",
                  lockAspect ? "translate-x-5 bg-emerald-200/90" : "bg-white/40"
                )}
              />
            </button>
          </label>

          <label className="inline-flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
            <span className="text-[12px] text-white/70">Show grid</span>
            <button
              type="button"
              onClick={() => setShowGrid((v) => !v)}
              className={cx(
                "inline-flex h-6 w-11 items-center rounded-full border transition",
                showGrid ? "border-cyan-300/40 bg-cyan-300/12" : "border-white/15 bg-white/[0.04]"
              )}
            >
              <span
                className={cx(
                  "ml-0.5 h-5 w-5 rounded-full transition",
                  showGrid ? "translate-x-5 bg-cyan-100/95" : "bg-white/40"
                )}
              />
            </button>
          </label>

          <label className="inline-flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
            <span className="text-[12px] text-white/70">Snap guides</span>
            <button
              type="button"
              onClick={() => setSnapGuides((v) => !v)}
              className={cx(
                "inline-flex h-6 w-11 items-center rounded-full border transition",
                snapGuides ? "border-cyan-300/40 bg-cyan-300/12" : "border-white/15 bg-white/[0.04]"
              )}
            >
              <span
                className={cx(
                  "ml-0.5 h-5 w-5 rounded-full transition",
                  snapGuides ? "translate-x-5 bg-cyan-100/95" : "bg-white/40"
                )}
              />
            </button>
          </label>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[12px] text-white/60">
            Drag the crop box with mouse.
            <br />
            Drag outside the box on preview to draw a new crop area.
            <br />
            Keyboard: Space play/pause, [ and ] set trim, WASD nudge crop.
          </div>

          <div className="grid gap-3">
            <div className="grid gap-1">
              <label className="text-[12px] text-white/70">Width: {percent(rect.w)}%</label>
              <input
                type="range"
                min={10}
                max={100}
                value={percent(rect.w)}
                onChange={(e) => applyRect({ ...rect, w: Number(e.target.value) / 100 })}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-[12px] text-white/70">Height: {percent(rect.h)}%</label>
              <input
                type="range"
                min={10}
                max={100}
                value={percent(rect.h)}
                onChange={(e) => applyRect({ ...rect, h: Number(e.target.value) / 100 })}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-[12px] text-white/70">Left: {percent(rect.x)}%</label>
              <input
                type="range"
                min={0}
                max={100}
                value={percent(rect.x)}
                onChange={(e) => applyRect({ ...rect, x: Number(e.target.value) / 100 })}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-[12px] text-white/70">Top: {percent(rect.y)}%</label>
              <input
                type="range"
                min={0}
                max={100}
                value={percent(rect.y)}
                onChange={(e) => applyRect({ ...rect, y: Number(e.target.value) / 100 })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/55 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white/85">Preview</div>
            <div className="text-[12px] text-white/55">
              X {percent(rect.x)}% • Y {percent(rect.y)}% • W {percent(rect.w)}% • H {percent(rect.h)}%
            </div>
          </div>

          <div
            ref={stageRef}
            className="relative mx-auto mt-4 w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-black"
            style={{ aspectRatio: previewAspect }}
            onPointerDown={beginDraw}
          >
            <video
              ref={videoRef}
              src={clip.url}
              className="h-full w-full object-cover"
              playsInline
              muted
              onLoadedMetadata={(e) => {
                const video = e.currentTarget as HTMLVideoElement;
                const d = Number(video.duration || 0);
                const clean = Number.isFinite(d) ? Math.max(minTrim, d) : minTrim;
                setDuration(clean);
                setTrimRange(trimStartSafe, Math.min(trimEndSafe, clean));
                video.currentTime = trimStartSafe;
                video.playbackRate = playbackRate;
                setScrub(trimStartSafe);
              }}
              onTimeUpdate={(e) => {
                const t = Number((e.currentTarget as HTMLVideoElement).currentTime || 0);
                if (!Number.isFinite(t)) return;
                if (t > trimEndSafe) {
                  (e.currentTarget as HTMLVideoElement).currentTime = trimStartSafe;
                  setScrub(trimStartSafe);
                  return;
                }
                if (t < trimStartSafe) {
                  setScrub(trimStartSafe);
                  return;
                }
                setScrub(t);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />

            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-0 right-0 top-0 bg-black/45" style={{ height: `${rect.y * 100}%` }} />
              <div className="absolute bottom-0 left-0 right-0 bg-black/45" style={{ height: `${(1 - (rect.y + rect.h)) * 100}%` }} />
              <div
                className="absolute left-0 bg-black/45"
                style={{ top: `${rect.y * 100}%`, width: `${rect.x * 100}%`, height: `${rect.h * 100}%` }}
              />
              <div
                className="absolute right-0 bg-black/45"
                style={{ top: `${rect.y * 100}%`, width: `${(1 - (rect.x + rect.w)) * 100}%`, height: `${rect.h * 100}%` }}
              />
            </div>

            <div
              className="absolute border-2 border-cyan-300/90 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(255,255,255,0.28)] cursor-move"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
              onPointerDown={(e) => beginDrag(e, "move")}
            >
              <div className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                Crop
              </div>

              {showGrid && (
                <>
                  <div className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-cyan-100/40" />
                  <div className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-cyan-100/40" />
                  <div className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-cyan-100/40" />
                  <div className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-cyan-100/40" />
                </>
              )}

              <button
                type="button"
                aria-label="Resize top left"
                className="absolute -left-2 -top-2 h-4 w-4 rounded-full border border-white/70 bg-cyan-200 shadow cursor-nwse-resize"
                onPointerDown={(e) => beginDrag(e, "resize-nw")}
              />
              <button
                type="button"
                aria-label="Resize top right"
                className="absolute -right-2 -top-2 h-4 w-4 rounded-full border border-white/70 bg-cyan-200 shadow cursor-nesw-resize"
                onPointerDown={(e) => beginDrag(e, "resize-ne")}
              />
              <button
                type="button"
                aria-label="Resize bottom left"
                className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full border border-white/70 bg-cyan-200 shadow cursor-nesw-resize"
                onPointerDown={(e) => beginDrag(e, "resize-sw")}
              />
              <button
                type="button"
                aria-label="Resize bottom right"
                className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border border-white/70 bg-cyan-200 shadow cursor-nwse-resize"
                onPointerDown={(e) => beginDrag(e, "resize-se")}
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
            <div className="flex items-center justify-between gap-2 text-[12px] text-white/75">
              <span className="font-medium">Trim timeline</span>
              <span>
                {formatTime(trimStartSafe)} - {formatTime(trimEndSafe)} ({trimLen.toFixed(1)}s)
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => stepFrame(-1)} className="btn-ghost text-[12px] px-2.5 py-1.5">
                  -1f
                </button>
                <button type="button" onClick={() => seekBy(-2)} className="btn-ghost text-[12px] px-2.5 py-1.5">
                  -2s
                </button>
                <button type="button" onClick={togglePlayback} className="btn-ghost text-[12px] px-3 py-1.5 min-w-[72px]">
                  {playing ? "Pause" : "Play"}
                </button>
                <button type="button" onClick={() => seekBy(2)} className="btn-ghost text-[12px] px-2.5 py-1.5">
                  +2s
                </button>
                <button type="button" onClick={() => stepFrame(1)} className="btn-ghost text-[12px] px-2.5 py-1.5">
                  +1f
                </button>
              </div>

              <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
                <span className="text-[11px] text-white/60">Speed</span>
                <select
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(Number(e.target.value))}
                  className="h-7 rounded-md border border-white/15 bg-black/55 px-2 text-[12px] text-white outline-none"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1}>1x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2x</option>
                </select>
              </div>
            </div>

            <div ref={timelineRef} className="relative mt-3 h-14 select-none touch-none">
              <button
                type="button"
                aria-label="Seek playhead"
                className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 cursor-pointer"
                onPointerDown={(e) => beginTimelineDrag(e, "playhead")}
              />
              <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/15" />
              <button
                type="button"
                aria-label="Move trimmed range"
                className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-cyan-300/45 cursor-grab active:cursor-grabbing"
                style={{ left: `${startPct}%`, width: `${Math.max(1, endPct - startPct)}%` }}
                onPointerDown={(e) => beginTimelineDrag(e, "range")}
              />
              <button
                type="button"
                aria-label="Trim start"
                className="absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/80 bg-cyan-200 shadow"
                style={{ left: `${startPct}%` }}
                onPointerDown={(e) => beginTimelineDrag(e, "start")}
              />
              <button
                type="button"
                aria-label="Trim end"
                className="absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/80 bg-cyan-200 shadow"
                style={{ left: `${endPct}%` }}
                onPointerDown={(e) => beginTimelineDrag(e, "end")}
              />
              <div
                className="pointer-events-none absolute bottom-1 top-1 w-px bg-cyan-100/80"
                style={{ left: `${scrubPct}%` }}
              />
              <button
                type="button"
                aria-label="Drag playhead"
                className="absolute top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-white shadow"
                style={{ left: `${scrubPct}%` }}
                onPointerDown={(e) => beginTimelineDrag(e, "playhead")}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] tabular-nums text-white/55">
              <span>{formatTime(0)}</span>
              <span>
                {formatTime(scrub)} / {formatTime(effectiveDuration)}
              </span>
              <span>{formatTime(effectiveDuration)}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={setTrimStartFromPlayhead} className="btn-ghost text-[12px] px-3 py-2">
                Set start @ playhead
              </button>
              <button type="button" onClick={setTrimEndFromPlayhead} className="btn-ghost text-[12px] px-3 py-2">
                Set end @ playhead
              </button>
            </div>

            <div className="mt-2 text-[11px] text-white/45">
              Shortcuts: Space play/pause, J/L jump 2s, arrows nudge, [ set start, ] set end.
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 grid gap-3 h-fit">
          <div className="text-sm font-semibold text-white/85">Editor actions</div>
          <div className="grid gap-2 text-[12px] text-white/60">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">AI tracker: enabled</div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">Motion smoothing: medium</div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">Snap to safe frame</div>
          </div>
          <button
            type="button"
            onClick={() => applyRect(DEFAULT_CROP_RECT)}
            className="btn-ghost text-[12px] px-3 py-2"
          >
            Reset frame
          </button>
          <button
            type="button"
            onClick={() => setTrimRange(0, effectiveDuration)}
            className="btn-ghost text-[12px] px-3 py-2"
          >
            Reset trim
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className={cx(
              "btn-solid-dark text-[12px] px-4 py-2 inline-flex items-center justify-center gap-2",
              busy && "opacity-70 cursor-not-allowed"
            )}
          >
            <Icon name="crop" />
            {busy ? "Saving…" : "Create edited clip"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100/85">
          {error}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   ScheduleForm
========================================================= */
function ScheduleForm({
  providers,
  selectedProviders,
  maxPlatforms,
  planLabel,
  caption,
  when,
  busy,
  error,
  onProvidersChange,
  onCaptionChange,
  onWhenChange,
  onSchedule,
  onPostNow,
  providerOptionCatalog,
  providerOptionValues,
  providerOptionLoading,
  onLoadProviderOptions,
  onUpdateProviderOption,
}: {
  providers: SupportedSocialProvider[];
  selectedProviders: SupportedSocialProvider[];
  maxPlatforms: number | null;
  planLabel: string;
  caption: string;
  when: string;
  busy: boolean;
  error: string | null;
  onProvidersChange: (v: SupportedSocialProvider[]) => void;
  onCaptionChange: (v: string) => void;
  onWhenChange: (v: string) => void;
  onSchedule: () => void;
  onPostNow: () => void;
  providerOptionCatalog: Partial<Record<SupportedSocialProvider, ProviderPublishOptionsDTO>>;
  providerOptionValues: Partial<Record<SupportedSocialProvider, Record<string, any>>>;
  providerOptionLoading: Partial<Record<SupportedSocialProvider, boolean>>;
  onLoadProviderOptions: (provider: SupportedSocialProvider) => Promise<void>;
  onUpdateProviderOption: (provider: SupportedSocialProvider, key: string, value: any) => void;
}) {
  const connectedSet = useMemo(() => new Set(providers), [providers]);
  const selectedSet = useMemo(() => new Set(selectedProviders), [selectedProviders]);
  const disconnectedProviders = useMemo(
    () => SUPPORTED_SOCIAL_PROVIDERS.filter((p) => !connectedSet.has(p)),
    [connectedSet]
  );
  const limitReached = maxPlatforms !== null && selectedProviders.length >= maxPlatforms;
  const remainingSlots = maxPlatforms === null ? null : Math.max(0, maxPlatforms - selectedProviders.length);
  const hasConnected = providers.length > 0;
  const captionLen = caption.trim().length;
  const tiktokCatalog = providerOptionCatalog.tiktok;
  const tiktokBlocked = selectedSet.has("tiktok") && Boolean(tiktokCatalog?.post_blocked);
  const tiktokBlockReason = tiktokBlocked
    ? String(tiktokCatalog?.post_block_reason || "TikTok cannot post from this account right now. Please try again later.")
    : "";
  const tiktokValues = (providerOptionValues.tiktok || {}) as Record<string, any>;
  const tiktokDisclosureInvalid =
    selectedSet.has("tiktok") &&
    Boolean(tiktokValues.commercial_content_disclosure) &&
    !Boolean(tiktokValues.branded_content) &&
    !Boolean(tiktokValues.brand_organic);
  const tiktokDisclosureReason =
    "TikTok: select Paid partnership or Your brand, or turn off content disclosure.";

  function toggleProvider(provider: SupportedSocialProvider) {
    if (!connectedSet.has(provider)) return;
    if (selectedProviders.includes(provider)) {
      onProvidersChange(selectedProviders.filter((p) => p !== provider));
      return;
    }
    if (maxPlatforms !== null && selectedProviders.length >= maxPlatforms) {
      return;
    }
    void onLoadProviderOptions(provider);
    const next = SUPPORTED_SOCIAL_PROVIDERS.filter((p) => [...selectedProviders, provider].includes(p));
    onProvidersChange(next);
  }

  function selectAllConnected() {
    for (const provider of providers) {
      void onLoadProviderOptions(provider);
    }
    if (maxPlatforms === null) {
      onProvidersChange([...providers]);
      return;
    }
    onProvidersChange(providers.slice(0, maxPlatforms));
  }

  function clearSelection() {
    onProvidersChange([]);
  }

  function dateTimeLocalValue(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function scheduleInMinutes(minutes: number) {
    const d = new Date(Date.now() + minutes * 60 * 1000);
    d.setSeconds(0, 0);
    onWhenChange(dateTimeLocalValue(d));
  }

  function scheduleTodayAt(hour: number) {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    if (d.getTime() <= Date.now() + 5 * 60 * 1000) d.setDate(d.getDate() + 1);
    onWhenChange(dateTimeLocalValue(d));
  }

  function scheduleTomorrowAt(hour: number) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    onWhenChange(dateTimeLocalValue(d));
  }

  function providerAccent(provider: SupportedSocialProvider): string {
    if (provider === "youtube") return "border-rose-300/35 bg-rose-300/10 text-rose-100";
    if (provider === "tiktok") return "border-cyan-300/35 bg-cyan-300/10 text-cyan-100";
    if (provider === "instagram") return "border-fuchsia-300/35 bg-fuchsia-300/10 text-fuchsia-100";
    return "border-blue-300/35 bg-blue-300/10 text-blue-100";
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/12 via-sky-300/10 to-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white/90">Social publishing</div>
          <div className="text-[11px] text-white/70">
            {selectedProviders.length} selected{maxPlatforms !== null ? ` / ${maxPlatforms}` : ""}
          </div>
        </div>
        <div className="mt-1 text-[12px] text-white/65">
          {maxPlatforms === null
            ? `${planLabel} plan: publish to all connected platforms.`
            : maxPlatforms === 0
              ? `${planLabel} plan: social publishing is locked.`
              : `${planLabel} plan: up to ${maxPlatforms} platform${maxPlatforms === 1 ? "" : "s"} per clip.`}{" "}
          {maxPlatforms !== null ? (
            <Link href="/app/billing" className="text-cyan-200 underline underline-offset-2 hover:text-cyan-100">
              Upgrade
            </Link>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-white/75">
            Connected: {providers.length}
          </span>
          <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-white/75">
            Selected: {selectedProviders.length}
          </span>
          {remainingSlots !== null ? (
            <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-white/75">
              Remaining: {remainingSlots}
            </span>
          ) : (
            <span className="rounded-full border border-emerald-300/25 bg-emerald-300/12 px-2.5 py-1 text-emerald-100">
              Unlimited slots
            </span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white/90">Platforms</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllConnected}
              className="btn-ghost px-3 py-1.5 text-[11px]"
              disabled={busy || providers.length === 0}
            >
              Select connected
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="btn-ghost px-3 py-1.5 text-[11px]"
              disabled={busy || selectedProviders.length === 0}
            >
              Clear
            </button>
          </div>
        </div>

        {!hasConnected ? (
          <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-3 text-[12px] text-amber-100/90">
            {maxPlatforms === 0 ? (
              <>
                Social publishing is locked on Free Trial.{" "}
                <Link href="/app/billing" className="underline underline-offset-2">
                  Upgrade plan
                </Link>{" "}
                to unlock channels.
              </>
            ) : (
              <>
                No connected platforms yet. Connect at least one account in{" "}
                <Link href="/app/connections" className="underline underline-offset-2">
                  Connections
                </Link>
                .
              </>
            )}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {SUPPORTED_SOCIAL_PROVIDERS.map((provider) => {
            const connected = connectedSet.has(provider);
            const checked = selectedSet.has(provider);
            const disabledByLimit = !checked && limitReached;
            const statusText = connected ? (disabledByLimit ? `Limit ${maxPlatforms}` : "Connected") : "Not connected";
            return (
              <label
                key={provider}
                className={cx(
                  "rounded-xl border px-3 py-3 text-left transition",
                  checked
                    ? "border-cyan-300/45 bg-cyan-300/12 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
                    : connected
                      ? "border-white/15 bg-white/[0.03] hover:border-white/25"
                      : "border-white/10 bg-white/[0.02] opacity-60",
                  (busy || !connected || disabledByLimit) ? "cursor-not-allowed" : "cursor-pointer"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cx("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide", providerAccent(provider))}>
                    {socialLabel(provider)}
                  </span>
                  <span className="text-[11px] text-white/65">{statusText}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProvider(provider)}
                    disabled={busy || !connected || disabledByLimit}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  <span className="text-sm text-white/90">{checked ? "Selected for publish" : "Tap to select"}</span>
                </div>
              </label>
            );
          })}
        </div>

        {disconnectedProviders.length > 0 && maxPlatforms !== 0 ? (
          <div className="mt-3 text-[12px] text-white/50">
            Not connected: {disconnectedProviders.map((p) => socialLabel(p)).join(", ")}
          </div>
        ) : null}
      </div>

      {selectedProviders.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold text-white/90">Platform settings</div>
          <div className="mt-1 text-[12px] text-white/58">
            Required publish controls vary by platform and account capabilities.
          </div>
          {tiktokBlocked ? (
            <div className="mt-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[12px] text-amber-100/90">
              {tiktokBlockReason}
            </div>
          ) : null}
          <div className="mt-3 grid gap-3">
            {selectedProviders.map((provider) => {
              const fallback = fallbackPublishOptions(provider);
              const catalog = providerOptionCatalog[provider] || fallback;
              const options = catalog.options || {};
              const defaults = extractOptionDefaults(options);
              const values = { ...defaults, ...(providerOptionValues[provider] || {}) };
              const loading = !!providerOptionLoading[provider];

              if (provider === "youtube") {
                const choices = Array.isArray((options.privacy_status as any)?.choices)
                  ? (options.privacy_status as any).choices
                  : ["public", "unlisted", "private"];
                return (
                  <div key={provider} className="rounded-xl border border-white/12 bg-black/25 p-3">
                    <div className="text-[12px] font-semibold text-white/86">YouTube</div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="text-[12px] text-white/60">Visibility</label>
                      <select
                        value={String(values.privacy_status || "public")}
                        onChange={(e) => onUpdateProviderOption(provider, "privacy_status", e.target.value)}
                        disabled={loading || busy}
                        className="h-10 rounded-xl border border-white/12 bg-black/35 px-3 text-sm text-white/90 outline-none"
                      >
                        {choices.map((choice: string) => (
                          <option key={choice} value={choice}>
                            {choice}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              }

              if (provider === "tiktok") {
                const modeChoices = Array.isArray((options.publish_mode as any)?.choices)
                  ? (options.publish_mode as any).choices
                  : ["DIRECT_POST", "MEDIA_UPLOAD"];
                const privacyChoices = Array.isArray((options.privacy_level as any)?.choices)
                  ? (options.privacy_level as any).choices
                  : TIKTOK_PRIVACY_CHOICES;
                const publishMode = String(values.publish_mode || "DIRECT_POST").toUpperCase();
                const isDirectPost = publishMode === "DIRECT_POST";
                const privacyLevel = String(values.privacy_level || "").trim().toUpperCase();
                const isPrivatePrivacy = privacyLevel === "SELF_ONLY";
                const interactionLocks: Record<string, boolean> = {
                  allow_comments: Boolean((options.allow_comments as any)?.locked),
                  allow_duet: Boolean((options.allow_duet as any)?.locked),
                  allow_stitch: Boolean((options.allow_stitch as any)?.locked),
                };
                const disclosureEnabled = Boolean(values.commercial_content_disclosure);
                const hasDisclosureType = Boolean(values.branded_content) || Boolean(values.brand_organic);
                const needsBrandedConfirm = hasDisclosureType;
                const maxDuration =
                  options.max_video_post_duration_sec && typeof options.max_video_post_duration_sec === "object"
                    ? Number((options.max_video_post_duration_sec as any).value || 0)
                    : Number(options.max_video_post_duration_sec || 0);
                const postBlocked = Boolean(catalog.post_blocked);
                const postBlockReason = String(catalog.post_block_reason || "").trim();
                return (
                  <div key={provider} className="rounded-xl border border-white/12 bg-black/25 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[12px] font-semibold tracking-wide text-white/86">TikTok</div>
                      {catalog.account_name ? <div className="text-[11px] text-white/55">{catalog.account_name}</div> : null}
                    </div>
                    {postBlocked ? (
                      <div className="mt-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100/90">
                        {postBlockReason || "TikTok cannot post from this account right now. Please try again later."}
                      </div>
                    ) : null}
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="text-[11px] font-medium text-white/58">Post destination</span>
                        <select
                          value={String(values.publish_mode || "DIRECT_POST")}
                          onChange={(e) => onUpdateProviderOption(provider, "publish_mode", e.target.value)}
                          disabled={loading || busy || postBlocked}
                          className="h-10 rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white/90 outline-none focus:border-cyan-300/40"
                        >
                          {modeChoices.map((choice: string) => (
                            <option key={choice} value={choice}>
                              {choice === "DIRECT_POST" ? "Direct post" : "Upload to TikTok inbox"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-medium text-white/58">Privacy level</span>
                        <select
                          value={String(values.privacy_level || "")}
                          onChange={(e) => onUpdateProviderOption(provider, "privacy_level", e.target.value)}
                          disabled={loading || busy || postBlocked}
                          className="h-10 rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white/90 outline-none focus:border-cyan-300/40"
                        >
                          <option value="">Select privacy level</option>
                          {privacyChoices.map((choice: string) => (
                            <option key={choice} value={choice}>
                              {choice}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {isDirectPost && !String(values.privacy_level || "").trim() ? (
                      <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100/85">
                        TikTok requires you to choose a privacy level before posting.
                      </div>
                    ) : null}
                    <div className="mt-3 text-[11px] font-medium text-white/58">Interaction settings</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        { key: "allow_comments", label: "Allow comments" },
                        { key: "allow_duet", label: "Allow duet" },
                        { key: "allow_stitch", label: "Allow stitch" },
                      ].map((toggle) => (
                        <label
                          key={toggle.key}
                          className="flex min-h-[52px] items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-snug text-white/80"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(values[toggle.key])}
                            onChange={(e) => onUpdateProviderOption(provider, toggle.key, e.target.checked)}
                            disabled={loading || busy || postBlocked || interactionLocks[toggle.key] || isPrivatePrivacy}
                            className="h-4 w-4 accent-cyan-400"
                          />
                          <span>{toggle.label}</span>
                        </label>
                      ))}
                    </div>
                    {isPrivatePrivacy ? (
                      <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/60">
                        Privacy is set to <strong>Private</strong>: comments, duet, and stitch are disabled.
                      </div>
                    ) : null}
                    {(interactionLocks.allow_comments || interactionLocks.allow_duet || interactionLocks.allow_stitch) ? (
                      <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/60">
                        One or more interaction toggles are locked by this TikTok account’s current creator settings.
                      </div>
                    ) : null}
                    <div className="mt-3 text-[11px] font-medium text-white/58">Content disclosure setting</div>
                    <label className="mt-2 flex min-h-[52px] items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-snug text-white/80">
                      <input
                        type="checkbox"
                        checked={disclosureEnabled}
                        onChange={(e) => onUpdateProviderOption(provider, "commercial_content_disclosure", e.target.checked)}
                        disabled={loading || busy || postBlocked}
                        className="h-4 w-4 accent-cyan-400"
                      />
                      <span>Enable commercial content disclosure</span>
                    </label>
                    {disclosureEnabled ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {[
                          { key: "branded_content", label: "Paid partnership", disabled: isPrivatePrivacy },
                          { key: "brand_organic", label: "Your brand", disabled: false },
                        ].map((toggle) => (
                          <label
                            key={toggle.key}
                            className="flex min-h-[52px] items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-snug text-white/80"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(values[toggle.key])}
                              onChange={(e) => onUpdateProviderOption(provider, toggle.key, e.target.checked)}
                              disabled={loading || busy || postBlocked || toggle.disabled}
                              className="h-4 w-4 accent-cyan-400"
                            />
                            <span>{toggle.label}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {disclosureEnabled ? (
                      <div
                        className={cx(
                          "mt-2 rounded-xl px-3 py-2 text-[11px]",
                          hasDisclosureType
                            ? "border border-emerald-300/25 bg-emerald-300/10 text-emerald-100/85"
                            : "border border-amber-300/25 bg-amber-300/10 text-amber-100/85"
                        )}
                      >
                        {!hasDisclosureType
                          ? "Select at least one disclosure type: Paid partnership or Your brand."
                          : Boolean(values.branded_content) && Boolean(values.brand_organic)
                            ? "Paid partnership and Your brand disclosures are enabled."
                            : Boolean(values.branded_content)
                              ? "Paid partnership disclosure is enabled."
                              : "Your brand disclosure is enabled."}
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-white/55">
                        Disclosure is off by default. Turn it on if this post includes paid partnership or your own brand promotion.
                      </div>
                    )}
                    <div className="mt-3 text-[11px] font-medium text-white/58">AI disclosure</div>
                    <label className="mt-2 flex min-h-[52px] items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-snug text-white/80">
                      <input
                        type="checkbox"
                        checked={Boolean(values.is_aigc)}
                        onChange={(e) => onUpdateProviderOption(provider, "is_aigc", e.target.checked)}
                        disabled={loading || busy || postBlocked}
                        className="h-4 w-4 accent-cyan-400"
                      />
                      <span>AI-generated</span>
                    </label>
                    {isDirectPost ? (
                      <div className="mt-3 grid gap-2">
                        <div className="text-[11px] font-medium text-white/58">Required confirmations</div>
                        <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-relaxed text-white/80">
                          <input
                            type="checkbox"
                            checked={Boolean(values.confirm_music_usage)}
                            onChange={(e) => onUpdateProviderOption(provider, "confirm_music_usage", e.target.checked)}
                            disabled={loading || busy || postBlocked}
                            className="mt-0.5 h-4 w-4 accent-cyan-400"
                          />
                          <span>
                            I confirm this post complies with{" "}
                            <a
                              href="https://developers.tiktok.com/doc/content-sharing-guidelines#compliance_requirements"
                              target="_blank"
                              rel="noreferrer noopener"
                              className="underline underline-offset-2 hover:text-white"
                              onClick={(e) => e.stopPropagation()}
                            >
                              TikTok Music Usage Confirmation
                            </a>{" "}
                            and content rights requirements.
                          </span>
                        </label>
                        {needsBrandedConfirm ? (
                          <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-relaxed text-white/80">
                              <input
                                type="checkbox"
                                checked={Boolean(values.confirm_branded_content)}
                                onChange={(e) => onUpdateProviderOption(provider, "confirm_branded_content", e.target.checked)}
                                disabled={loading || busy || postBlocked}
                                className="mt-0.5 h-4 w-4 accent-cyan-400"
                              />
                            <span>
                              I confirm branded content disclosure is accurate and follows{" "}
                              <a
                                href="https://developers.tiktok.com/doc/content-sharing-guidelines#compliance_requirements"
                                target="_blank"
                                rel="noreferrer noopener"
                                className="underline underline-offset-2 hover:text-white"
                                onClick={(e) => e.stopPropagation()}
                              >
                                TikTok Branded Content Policy
                              </a>
                              .
                            </span>
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                    {maxDuration > 0 ? (
                      <div className="mt-2 text-[11px] text-white/55">Account max duration: {maxDuration}s.</div>
                    ) : null}
                    <div className="mt-2 border-t border-white/8 pt-2 text-[11px] text-white/50">
                      Direct posts may remain in processing for a few minutes while TikTok finalizes publication.
                    </div>
                  </div>
                );
              }

              if (provider === "instagram") {
                return (
                  <div key={provider} className="rounded-xl border border-white/12 bg-black/25 p-3">
                    <div className="text-[12px] font-semibold text-white/86">Instagram</div>
                    <label className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white/80">
                      <input
                        type="checkbox"
                        checked={Boolean(values.share_to_feed)}
                        onChange={(e) => onUpdateProviderOption(provider, "share_to_feed", e.target.checked)}
                        disabled={loading || busy}
                        className="h-4 w-4 accent-cyan-400"
                      />
                      <span>Also share reel to feed</span>
                    </label>
                  </div>
                );
              }

              return (
                <div key={provider} className="rounded-xl border border-white/12 bg-black/25 p-3">
                  <div className="text-[12px] font-semibold text-white/86">Facebook</div>
                  <div className="mt-2 text-[12px] text-white/60">Uses your connected Page settings.</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[12px] text-white/60">Caption</label>
          <span className={cx("text-[11px]", captionLen > 220 ? "text-amber-200" : "text-white/50")}>
            {captionLen} chars
          </span>
        </div>
        <textarea
          className="mt-2 w-full min-h-[110px] resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/90 outline-none focus:border-cyan-300/50"
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder="Write a clear caption for this clip"
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <label className="text-[12px] text-white/60">Schedule time</label>
        <input
          type="datetime-local"
          className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white/90 outline-none focus:border-cyan-300/50"
          value={when}
          onChange={(e) => onWhenChange(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => scheduleInMinutes(60)} className="btn-ghost px-3 py-1.5 text-[11px]" disabled={busy}>
            In 1 hour
          </button>
          <button type="button" onClick={() => scheduleTodayAt(20)} className="btn-ghost px-3 py-1.5 text-[11px]" disabled={busy}>
            Tonight 8:00 PM
          </button>
          <button type="button" onClick={() => scheduleTomorrowAt(9)} className="btn-ghost px-3 py-1.5 text-[11px]" disabled={busy}>
            Tomorrow 9:00 AM
          </button>
        </div>
        <div className="mt-2 text-[12px] text-white/45">Leave blank if you want to post immediately.</div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-100/90 whitespace-pre-line break-words">
          {error}
        </div>
      )}

      <div className="sticky bottom-0 z-20 rounded-2xl border border-cyan-300/25 bg-black/75 p-4 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onPostNow}
            className="btn-aurora text-sm px-4 py-2"
            disabled={busy || tiktokBlocked || tiktokDisclosureInvalid}
            title={tiktokBlocked ? tiktokBlockReason : tiktokDisclosureInvalid ? tiktokDisclosureReason : undefined}
          >
            {busy ? "Posting..." : "Post now"}
          </button>
          <button
            type="button"
            onClick={onSchedule}
            className="btn-ghost text-sm px-4 py-2"
            disabled={busy || !when || tiktokBlocked || tiktokDisclosureInvalid}
            title={tiktokBlocked ? tiktokBlockReason : tiktokDisclosureInvalid ? tiktokDisclosureReason : undefined}
          >
            {busy ? "Scheduling..." : "Schedule post"}
          </button>
          <div className="text-[12px] text-white/55">
            {tiktokBlocked
              ? tiktokBlockReason
              : tiktokDisclosureInvalid
                ? tiktokDisclosureReason
                : "Set a time to schedule, or use Post now to publish instantly."}
          </div>
        </div>
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
  subtitle = "Clip options",
  variant = "side",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  variant?: "side" | "studio" | "full" | "schedule";
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
  const scheduleCard = variant === "schedule";
  const studioCard = variant === "studio";
  const enhancedScrollbar = scheduleCard || studioCard;

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

      <div
        className={cx(
          "absolute flex flex-col border-white/10 bg-black/70 backdrop-blur p-4 sm:p-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]",
          variant === "full"
            ? "inset-0 border-0 rounded-none"
            : scheduleCard
              ? "left-1/2 top-1/2 h-[min(90svh,860px)] w-[min(1040px,calc(100vw-1.25rem))] -translate-x-1/2 -translate-y-1/2 rounded-[26px] border shadow-[0_30px_120px_rgba(0,0,0,0.65),0_0_0_1px_rgba(125,211,252,0.09)] bg-[radial-gradient(130%_110%_at_18%_0%,rgba(125,211,252,0.14),transparent_54%),radial-gradient(100%_120%_at_82%_0%,rgba(167,139,250,0.11),transparent_48%),rgba(7,10,15,0.92)]"
            : variant === "studio"
              ? "left-1/2 top-1/2 h-[min(94dvh,980px)] w-[min(1680px,calc(100vw-1rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden overscroll-contain [scrollbar-gutter:stable] rounded-3xl border-0 bg-transparent p-0 sm:p-0 backdrop-blur-0 shadow-none"
              : "right-0 top-0 h-full w-full max-w-md border-l"
        )}
      >
        <div className={cx("flex items-start justify-between gap-3", scheduleCard ? "border-b border-white/10 pb-3" : "")}>
          <div className="min-w-0">
            <div className={cx("font-semibold text-white/90", scheduleCard ? "text-base sm:text-lg" : "text-sm")}>{title}</div>
            {subtitle && <div className={cx("mt-1 text-white/55", scheduleCard ? "text-[13px]" : "text-sm")}>{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cx(
              "inline-flex h-9 w-9 items-center justify-center rounded-full border transition focus:outline-none focus-visible:ring-2",
              scheduleCard
                ? "border-cyan-300/25 bg-cyan-300/10 hover:bg-cyan-300/16 focus-visible:ring-cyan-200/30"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] focus-visible:ring-white/20"
            )}
            aria-label="Close"
          >
            <Icon name="x" />
          </button>
        </div>

        <div
          className={cx(
            "mt-5 min-h-0",
            studioCard
              ? "flex-1 overflow-y-auto orbito-scrollbar pr-3"
              : enhancedScrollbar
                ? "flex-1 overflow-y-auto orbito-scrollbar pr-3"
                : "flex-1 overflow-y-auto pr-2"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
