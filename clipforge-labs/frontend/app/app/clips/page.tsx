"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, getApiBase } from "@/lib/api";
import { AppPlan, normalizeAppPlan } from "@/lib/plans";
import EditorWorkspace from "@/components/editor/EditorWorkspace";

type ClipRow = {
  id: number;
  job_id: number;
  upload_id: number;
  storage_key: string;
  url: string;
  asset_type?: string;
  mime_type?: string;
  start_time?: number;
  end_time?: number;
  duration: number;
  title?: string | null;
  hook?: string | null;
};

type SocialAccountDTO = {
  id: number;
  provider: string;
  status: string;
  account_name?: string | null;
};

type SocialPostDTO = {
  id: number;
  provider: string;
  status: string;
  last_error?: string | null;
  platform_options?: Record<string, any>;
};

type ProviderPublishOptionsDTO = {
  provider: string;
  account_name?: string | null;
  post_blocked?: boolean;
  post_block_reason?: string | null;
  options?: Record<string, any>;
};

const SUPPORTED_SOCIAL_PROVIDERS = ["youtube", "tiktok", "instagram", "facebook"] as const;
type SupportedSocialProvider = (typeof SUPPORTED_SOCIAL_PROVIDERS)[number];
type SocialPlan = AppPlan;
type AssetFilter = "all" | "video" | "image" | "audio";
type ActionIconName = "download" | "play" | "schedule" | "edit";
type ClipSourceMode = "orbito" | "ai";

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

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function clip(s: string, n: number) {
  const t = String(s || "").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}...`;
}

function extFromStorageKey(key: string): string {
  const m = String(key || "").toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m ? m[1] : "";
}

function detectAssetType(row: ClipRow): "video" | "image" | "audio" {
  const t = String(row.asset_type || "").toLowerCase();
  if (t === "image" || t === "audio" || t === "video") return t;
  const ext = extFromStorageKey(row.storage_key || "");
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  if ([".mp3", ".wav", ".m4a", ".ogg"].includes(ext)) return "audio";
  return "video";
}

function normalizeClipMediaUrl(rawUrl: string): string {
  const value = String(rawUrl || "").trim();
  if (!value) return value;

  const base = String(getApiBase() || "").trim().replace(/\/+$/, "");
  const withBase = (path: string) => {
    if (!base) return path;
    if (path.startsWith("/")) return `${base}${path}`;
    return `${base}/${path.replace(/^\/+/, "")}`;
  };

  if (value.startsWith("/")) return withBase(value);

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      const rewrittenPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      if (parsed.pathname.startsWith("/storage/local-get")) {
        return withBase(rewrittenPath);
      }
      if (parsed.pathname.includes("/storage/local-get")) {
        const idx = parsed.pathname.indexOf("/storage/local-get");
        const tail = `${parsed.pathname.slice(idx)}${parsed.search}${parsed.hash}`;
        return withBase(tail);
      }
      if (host === "backend" || host === "labs-backend" || host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
        return withBase(rewrittenPath);
      }
      if (typeof window !== "undefined" && window.location.protocol === "https:" && parsed.protocol === "http:") {
        parsed.protocol = "https:";
        return parsed.toString();
      }
      return parsed.toString();
    } catch {
      return value;
    }
  }

  return withBase(value);
}

function isLegacyPostComponent(row: ClipRow): boolean {
  const key = String(row.storage_key || "").toLowerCase();
  const title = String(row.title || "").toLowerCase();
  const hook = String(row.hook || "").toLowerCase();

  const keyLooksLegacy =
    key.includes("assets/post-scenes/") ||
    key.includes("assets/post-scenes-video/") ||
    key.includes("assets/post-voiceovers/");

  const titleLooksLegacy =
    title.includes(" · scene ") ||
    title.endsWith(" · scene") ||
    title.includes(" · voiceover") ||
    hook.includes("scene ");

  return keyLooksLegacy || titleLooksLegacy;
}

function socialLabel(p: string) {
  const s = (p || "").toLowerCase();
  if (s === "youtube") return "YouTube";
  if (s === "tiktok") return "TikTok";
  if (s === "instagram") return "Instagram";
  if (s === "facebook") return "Facebook";
  return p || "Social";
}

function socialPlanLabel(plan: SocialPlan): string {
  if (plan === "starter") return "Starter";
  if (plan === "creator") return "Creator";
  if (plan === "studio") return "Studio";
  return "Free Trial";
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

function socialPublishErrorHint(provider: string, raw: string): string {
  const msg = String(raw || "").trim();
  const low = msg.toLowerCase();
  const p = String(provider || "").toLowerCase();

  if (p === "tiktok" && low.includes("unaudited_client_can_only_post_to_private_accounts")) {
    return "TikTok app is still in audit mode. Posting is limited to approved tester accounts.";
  }
  if (p === "facebook" && (low.includes("no permission to publish") || low.includes("\"code\":100"))) {
    return "Facebook publishing permission is missing. Reconnect Facebook in Connections.";
  }
  if (p === "instagram" && low.includes("no instagram professional account linked")) {
    return "Instagram must be a Professional account linked to a Facebook Page.";
  }
  if (msg.length > 220) return `${msg.slice(0, 220)}...`;
  return msg || "Publishing failed";
}

function dateTimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function durationChip(c: ClipRow, type: "video" | "image" | "audio") {
  if (type === "image") return "Image";
  return `${Math.max(0, Math.round(c.duration || 0))}s`;
}

function typeTone(type: "video" | "image" | "audio") {
  if (type === "video") return "border-cyan-300/35 bg-cyan-400/14 text-cyan-100";
  if (type === "audio") return "border-amber-300/35 bg-amber-400/14 text-amber-100";
  return "border-emerald-300/35 bg-emerald-400/14 text-emerald-100";
}

function filterLabel(filter: AssetFilter) {
  if (filter === "video") return "Video";
  if (filter === "image") return "Image";
  if (filter === "audio") return "Audio";
  return "All";
}

const clipsSurfacePrimaryClass = "bg-[linear-gradient(145deg,rgba(22,28,44,0.96),rgba(14,20,34,0.93),rgba(10,30,27,0.9))]";
const clipsSurfaceSoftClass = "bg-[linear-gradient(145deg,rgba(17,22,37,0.92),rgba(12,18,30,0.88),rgba(9,24,22,0.84))]";
const clipsSurfaceInsetClass = "bg-[linear-gradient(145deg,rgba(11,16,28,0.95),rgba(8,13,23,0.92),rgba(8,19,18,0.88))]";

function ActionGlyph({ icon }: { icon: ActionIconName }) {
  if (icon === "download") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v10" />
        <path d="m8 10 4 4 4-4" />
        <path d="M5 19h14" />
      </svg>
    );
  }
  if (icon === "schedule") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2.5" />
        <path d="M8 3v4M16 3v4M3 10h18" />
        <path d="M12 13v4M10 15h4" />
      </svg>
    );
  }
  if (icon === "edit") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="m16.5 3.5 4 4L7 21H3v-4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M8 6.5c0-1.02 1.1-1.66 1.98-1.13l8.24 4.95a1.31 1.31 0 0 1 0 2.26l-8.24 4.95A1.32 1.32 0 0 1 8 16.39V6.5Z" />
    </svg>
  );
}

function ActionIconButton({
  href,
  onClick,
  icon,
  label,
}: {
  href?: string;
  onClick?: () => void;
  icon: ActionIconName;
  label: string;
}) {
  const className =
    "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#fb56076e] bg-[linear-gradient(135deg,rgba(255,183,3,0.15),rgba(251,86,7,0.2),rgba(58,134,255,0.18))] text-white transition hover:border-[#fb5607ad] hover:brightness-110 active:translate-y-px";

  if (href) {
    return (
      <a href={href} className={className} title={label} aria-label={label}>
        <ActionGlyph icon={icon} />
        <span className="sr-only">{label}</span>
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} title={label} aria-label={label}>
      <ActionGlyph icon={icon} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

export default function ClipsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [sourceMode, setSourceMode] = useState<ClipSourceMode>(() => {
    if (typeof window === "undefined") return "ai";
    const params = new URLSearchParams(window.location.search);
    const source = String(params.get("source") || "").trim().toLowerCase();
    if (source === "ai") return "ai";
    if (source === "orbito") return "orbito";

    // Backward compatibility for old shared links using generated=...
    const raw = String(params.get("generated") || "").trim().toLowerCase();
    if (!raw) return "ai";
    if (raw === "0" || raw === "false" || raw === "no" || raw === "off" || raw === "all") return "orbito";
    return "ai";
  });
  const generatedOnly = sourceMode === "ai";

  const [rows, setRows] = useState<ClipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [error, setError] = useState<string | null>(null);

  const [socialAccounts, setSocialAccounts] = useState<SocialAccountDTO[]>([]);
  const [socialPlan, setSocialPlan] = useState<SocialPlan>("free");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFromQuery, setEditorFromQuery] = useState(false);
  const [editorClipId, setEditorClipId] = useState<number | null>(null);
  const [previewClip, setPreviewClip] = useState<ClipRow | null>(null);

  const [scheduleClip, setScheduleClip] = useState<ClipRow | null>(null);
  const [scheduleSelectedProviders, setScheduleSelectedProviders] = useState<SupportedSocialProvider[]>([]);
  const [scheduleCaption, setScheduleCaption] = useState("");
  const [scheduleWhen, setScheduleWhen] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [providerOptionCatalog, setProviderOptionCatalog] = useState<Partial<Record<SupportedSocialProvider, ProviderPublishOptionsDTO>>>({});
  const [providerOptionValues, setProviderOptionValues] = useState<Partial<Record<SupportedSocialProvider, Record<string, any>>>>({});
  const [providerOptionLoading, setProviderOptionLoading] = useState<Partial<Record<SupportedSocialProvider, boolean>>>({});

  function openEditor(clipId?: number) {
    setScheduleClip(null);
    setEditorClipId(typeof clipId === "number" && clipId > 0 ? clipId : null);
    setEditorOpen(true);
  }

  function openPreview(clipRow: ClipRow) {
    setScheduleClip(null);
    setPreviewClip(clipRow);
  }

  function closePreview() {
    setPreviewClip(null);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditorClipId(null);
    if (!editorFromQuery) return;
    const nextQuery = new URLSearchParams(window.location.search);
    nextQuery.delete("editor");
    nextQuery.delete("clipId");
    const next = nextQuery.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    setEditorFromQuery(false);
  }

  function switchSource(next: ClipSourceMode) {
    if (next === sourceMode) return;
    setSourceMode(next);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("source", next);
    params.delete("generated");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  async function loadClips() {
    setLoading(true);
    setError(null);
    try {
      const path = generatedOnly ? "/clips?grouped=false&generated_only=1" : "/clips?grouped=false";
      const data = (await apiFetch<ClipRow[]>(path, { method: "GET" })) || [];
      const normalized = Array.isArray(data) ? data : [];
      // Hide legacy AI Post component assets (scene fragments + voice stems) from old jobs.
      const cleaned = normalized
        .filter((row) => !isLegacyPostComponent(row))
        .map((row) => ({ ...row, url: normalizeClipMediaUrl(row.url) }));
      setRows(cleaned);
    } catch (err: any) {
      setRows([]);
      setError(err?.detail || "Could not load clips right now.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSocialState() {
    try {
      const [me, accounts] = await Promise.all([
        apiFetch<{ plan?: string }>("/auth/me", { method: "GET" }),
        apiFetch<SocialAccountDTO[]>("/social/accounts", { method: "GET" }),
      ]);
      setSocialPlan(normalizeAppPlan(me?.plan));
      setSocialAccounts(Array.isArray(accounts) ? accounts : []);
    } catch {
      setSocialPlan("free");
      setSocialAccounts([]);
    }
  }

  async function refreshAll() {
    await Promise.all([loadClips(), loadSocialState()]);
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedOnly]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("editor") !== "1") return;
    setEditorFromQuery(true);
    const clipId = Number(query.get("clipId") || 0);
    setEditorClipId(clipId > 0 ? clipId : null);
    setEditorOpen(true);
  }, []);

  useEffect(() => {
    if (!editorOpen) return;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [editorOpen]);

  useEffect(() => {
    if (!previewClip) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewClip(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewClip]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  }, [rows]);

  const counts = useMemo(() => {
    let video = 0;
    let image = 0;
    let audio = 0;
    for (const row of rows) {
      const t = detectAssetType(row);
      if (t === "video") video += 1;
      else if (t === "image") image += 1;
      else audio += 1;
    }
    return { total: rows.length, video, image, audio };
  }, [rows]);

  const connectedSocialCount = useMemo(() => {
    return socialAccounts.filter((a) => String(a.status || "").toLowerCase() === "connected").length;
  }, [socialAccounts]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sortedRows.filter((c) => {
      const type = detectAssetType(c);
      if (assetFilter !== "all" && type !== assetFilter) return false;
      if (!s) return true;
      const t = `${c.title || ""}\n${c.hook || ""}`.toLowerCase();
      return t.includes(s);
    });
  }, [sortedRows, q, assetFilter]);

  const allowedScheduleProviders = useMemo(() => socialPlanAllowedProviders(socialPlan), [socialPlan]);
  const schedulePlatformLimit = useMemo(() => socialPlanPlatformLimit(socialPlan), [socialPlan]);
  const schedulePlanLabel = useMemo(() => socialPlanLabel(socialPlan), [socialPlan]);

  const connectedScheduleProviders = useMemo(() => {
    const connectedSet = new Set(
      socialAccounts
        .filter((a) => String(a.status || "").toLowerCase() === "connected")
        .map((a) => String(a.provider || "").toLowerCase())
    );
    return SUPPORTED_SOCIAL_PROVIDERS.filter(
      (p) => connectedSet.has(p) && allowedScheduleProviders.includes(p)
    );
  }, [socialAccounts, allowedScheduleProviders]);

  function limitSelectedProviders(next: SupportedSocialProvider[]) {
    const ordered = SUPPORTED_SOCIAL_PROVIDERS.filter((p) => next.includes(p));
    if (schedulePlatformLimit === null) return ordered;
    return ordered.slice(0, schedulePlatformLimit);
  }

  function openSchedule(clipRow: ClipRow) {
    setEditorOpen(false);
    setPreviewClip(null);
    setScheduleError(null);
    setScheduleNotice(null);
    setScheduleBusy(false);
    setScheduleWhen("");
    setScheduleCaption(String(clipRow.title || clipRow.hook || "").trim());
    setScheduleSelectedProviders((prev) => {
      const validPrev = prev.filter((p) => connectedScheduleProviders.includes(p));
      const seed = validPrev.length ? validPrev : connectedScheduleProviders;
      return limitSelectedProviders(seed);
    });
    setScheduleClip(clipRow);
  }

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
    if (!scheduleClip) return;
    for (const provider of scheduleSelectedProviders) {
      void loadProviderOptions(provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleClip, scheduleSelectedProviders]);

  async function submitSocialPosts(mode: "post_now" | "schedule") {
    if (!scheduleClip || scheduleBusy) return;
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
    for (const provider of scheduleSelectedProviders) {
      if (providerOptionLoading[provider]) {
        setScheduleError(`Loading ${socialLabel(provider)} publish settings. Try again in a second.`);
        return;
      }
      const catalog = providerOptionCatalog[provider];
      if (Boolean(catalog?.post_blocked)) {
        const reason = String(catalog?.post_block_reason || "").trim();
        setScheduleError(reason || `${socialLabel(provider)} cannot post from this account right now. Please try again later.`);
        return;
      }
      if (provider === "tiktok") {
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
      const failures: Array<{ provider: string; detail: string }> = [];
      const success: SocialPostDTO[] = [];

      for (const provider of scheduleSelectedProviders) {
        try {
          const platformOptions = providerOptionValues[provider] || {};
          const res = await apiFetch<SocialPostDTO>("/social/posts", {
            method: "POST",
            body: {
              provider,
              clip_id: scheduleClip.id,
              caption: scheduleCaption || "New clip",
              scheduled_at: scheduledAt,
              platform_options: platformOptions,
            },
          });
          success.push(res);
        } catch (e: any) {
          const raw = String(e?.detail || e?.message || "Failed");
          failures.push({ provider, detail: socialPublishErrorHint(provider, raw) });
        }
      }

      const posted = success.filter((r) => String(r?.status || "").toLowerCase() === "posted").length;
      const scheduled = success.filter((r) => String(r?.status || "").toLowerCase() === "scheduled").length;
      const posting = success.filter((r) => String(r?.status || "").toLowerCase() === "posting").length;

      if (success.length > 0) {
        const parts = [
          posted > 0 ? `Posted ${posted}` : "",
          scheduled > 0 ? `Scheduled ${scheduled}` : "",
          posting > 0 ? `Processing ${posting}` : "",
        ].filter(Boolean);
        setScheduleNotice(parts.length ? parts.join(" • ") : "Social post created.");
      }

      if (failures.length > 0) {
        const msg = failures.map((f) => `${socialLabel(f.provider)}: ${f.detail}`).join("\n");
        setScheduleError(msg);
      } else {
        setScheduleClip(null);
      }

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
      setScheduleError(String(e?.detail || e?.message || "Could not create social posts."));
    } finally {
      setScheduleBusy(false);
    }
  }

  function scheduleInMinutes(minutes: number) {
    const d = new Date(Date.now() + minutes * 60 * 1000);
    d.setSeconds(0, 0);
    setScheduleWhen(dateTimeLocalValue(d));
  }

  function scheduleTodayAt(hour: number) {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    if (d.getTime() <= Date.now() + 5 * 60 * 1000) d.setDate(d.getDate() + 1);
    setScheduleWhen(dateTimeLocalValue(d));
  }

  function scheduleTomorrowAt(hour: number) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    setScheduleWhen(dateTimeLocalValue(d));
  }

  const visualRows = useMemo(
    () => filtered.filter((row) => detectAssetType(row) !== "audio"),
    [filtered]
  );

  const audioRows = useMemo(
    () => filtered.filter((row) => detectAssetType(row) === "audio"),
    [filtered]
  );
  const scheduleSelectedSet = useMemo(() => new Set(scheduleSelectedProviders), [scheduleSelectedProviders]);
  const providerBlocks = useMemo(
    () =>
      scheduleSelectedProviders
        .map((provider) => {
          const catalog = providerOptionCatalog[provider];
          const blocked = Boolean(catalog?.post_blocked);
          const reason = String(catalog?.post_block_reason || "").trim();
          return {
            provider,
            blocked,
            reason:
              reason ||
              `${socialLabel(provider)} cannot post from this account right now. Please try again later.`,
          };
        })
        .filter((item) => item.blocked),
    [scheduleSelectedProviders, providerOptionCatalog]
  );
  const hasProviderBlock = providerBlocks.length > 0;
  const providerBlockReason = providerBlocks.map((item) => `${socialLabel(item.provider)}: ${item.reason}`).join("\n");
  const providerBlockSummary = providerBlocks[0]?.reason || "";
  const tiktokScheduleValues = (providerOptionValues.tiktok || {}) as Record<string, any>;
  const tiktokDisclosureInvalid =
    scheduleSelectedSet.has("tiktok") &&
    Boolean(tiktokScheduleValues.commercial_content_disclosure) &&
    !Boolean(tiktokScheduleValues.branded_content) &&
    !Boolean(tiktokScheduleValues.brand_organic);
  const tiktokDisclosureReason =
    "TikTok: select Paid partnership or Your brand, or turn off content disclosure.";

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-[1520px] px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        <section className={cx("surface relative overflow-hidden rounded-[30px] border border-[#fb560740] p-5 sm:p-7", clipsSurfaceSoftClass)}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-16 opacity-60 blur-3xl"
            style={{
              background:
                "radial-gradient(320px 220px at 14% 20%, rgba(255,183,3,0.2), transparent 72%), radial-gradient(360px 220px at 82% 18%, rgba(58,134,255,0.22), transparent 74%), radial-gradient(320px 220px at 52% 96%, rgba(251,86,7,0.2), transparent 76%)",
            }}
          />

          <div className="relative grid gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs text-white/55">{generatedOnly ? "• AI Clips" : "• Asset Command Center"}</div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  {generatedOnly ? (
                    <>
                      AI <span className="grad-text">Clips</span>
                    </>
                  ) : (
                    <>
                      Orbito <span className="grad-text">Clips Library</span>
                    </>
                  )}
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-white/68 sm:text-[15px]">
                  {generatedOnly
                    ? "Only AI-generated clips from Orbito Labs appear here. Review, edit, and publish from one workflow."
                    : "Shared Orbito clip library for review, editor flow, and scheduling in one place."}
                </p>
              </div>

              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                <Link href="/app/generate" className="btn-aurora px-4 py-2 text-center text-[12px]">
                  Open Generator
                </Link>
                <button type="button" onClick={() => openEditor()} className="btn-aurora px-4 py-2 text-center text-[12px]">
                  Open Editor
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => switchSource("orbito")}
                className={cx(
                  "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                  sourceMode === "orbito"
                    ? "border-[#fb560782] bg-[linear-gradient(120deg,rgba(255,183,3,0.16),rgba(251,86,7,0.2),rgba(58,134,255,0.18))] text-white"
                    : cx("border-white/12 text-white/72 hover:bg-white/10", clipsSurfaceInsetClass)
                )}
              >
                Orbito Clips
              </button>
              <button
                type="button"
                onClick={() => switchSource("ai")}
                className={cx(
                  "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                  sourceMode === "ai"
                    ? "border-[#fb560782] bg-[linear-gradient(120deg,rgba(255,183,3,0.16),rgba(251,86,7,0.2),rgba(58,134,255,0.18))] text-white"
                    : cx("border-white/12 text-white/72 hover:bg-white/10", clipsSurfaceInsetClass)
                )}
              >
                AI Clips
              </button>
              <span className="text-[11px] text-white/50">Switch between shared Orbito clips and Labs AI-only clips.</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                { label: "Total Assets", value: counts.total },
                { label: "Video Clips", value: counts.video },
                { label: "Image Frames", value: counts.image },
                { label: "Audio Tracks", value: counts.audio },
                { label: "Connected Channels", value: connectedSocialCount },
              ].map((item) => (
                <div key={item.label} className={cx("rounded-2xl border border-[#fb560738] px-4 py-3", clipsSurfacePrimaryClass)}>
                  <div className="text-[11px] uppercase tracking-[0.08em] text-white/55">{item.label}</div>
                  <div className="mt-1 text-lg font-semibold text-white/92">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={cx("mt-6 rounded-[28px] border border-[#fb560733] p-4 sm:p-5", clipsSurfaceSoftClass)}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search titles or hooks..."
                className="h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white/90 outline-none placeholder:text-white/45 focus:border-white/25"
              />
              <div className={cx("rounded-full border border-white/12 px-3 py-2 text-[12px] text-white/72", clipsSurfaceInsetClass)}>
                {loading ? "Loading..." : `${filtered.length} result${filtered.length === 1 ? "" : "s"}`}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["all", "video", "image", "audio"] as AssetFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setAssetFilter(filter)}
                  className={cx(
                    "rounded-full border px-3 py-2 text-[11px] font-semibold transition",
                    assetFilter === filter
                      ? "border-[#fb560782] bg-[linear-gradient(120deg,rgba(255,183,3,0.16),rgba(251,86,7,0.2),rgba(58,134,255,0.18))] text-white"
                      : cx("border-white/10 text-white/70 hover:bg-white/10", clipsSurfaceInsetClass)
                  )}
                >
                  {filterLabel(filter)}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={refreshAll}
              disabled={loading}
              className={cx("btn-ghost px-4 py-2 text-[12px]", loading && "cursor-not-allowed opacity-60")}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {scheduleNotice ? (
            <div className="mt-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[12px] text-emerald-100">
              {scheduleNotice}
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-100">
              {String(error)}
            </div>
          ) : null}
        </section>

        {visualRows.length ? (
          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white/90">Visual Assets</div>
              <div className="text-[12px] text-white/60">{visualRows.length} items</div>
            </div>
            <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visualRows.map((c) => {
                const assetType = detectAssetType(c);
                return (
                  <article
                    key={c.id}
                    className={cx("surface-soft group overflow-hidden rounded-[20px] border border-[#fb560740] shadow-[0_16px_40px_rgba(0,0,0,0.36)]", clipsSurfacePrimaryClass)}
                  >
                    <div className="relative aspect-[9/12] bg-black/50">
                      {assetType === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.url} alt={c.title || `Image ${c.id}`} className="h-full w-full object-cover" />
                      ) : (
                        <video src={c.url} playsInline muted autoPlay loop preload="metadata" className="h-full w-full object-cover" />
                      )}

                      <div className="absolute left-3 top-3 z-10 flex gap-2">
                        <span className={cx("rounded-full border px-2.5 py-1 text-[10px] font-semibold", typeTone(assetType))}>
                          {assetType.toUpperCase()}
                        </span>
                        <span className="rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] text-white/80">
                          {durationChip(c, assetType)}
                        </span>
                      </div>
                    </div>

                    <div className="p-3">
                      <div className="truncate text-[13px] font-semibold text-white/94">{c.title || `Asset #${c.id}`}</div>
                      <div className="mt-1 text-[11px] text-white/60">{c.hook ? clip(c.hook, 72) : `Upload #${c.upload_id}`}</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <ActionIconButton onClick={() => openEditor(c.id)} icon="edit" label="Open editor" />
                        <ActionIconButton href={`/api/clips/${c.id}/download`} icon="download" label="Download" />
                        <ActionIconButton onClick={() => openPreview(c)} icon="play" label="Open preview" />
                        {assetType === "video" ? (
                          <ActionIconButton onClick={() => openSchedule(c)} icon="schedule" label="Schedule / Post" />
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {audioRows.length ? (
          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white/90">Audio Assets</div>
              <div className="text-[12px] text-white/60">{audioRows.length} items</div>
            </div>
            <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {audioRows.map((c) => (
                <article
                  key={c.id}
                  className={cx(
                    "surface-soft relative flex h-full min-h-[220px] flex-col overflow-hidden rounded-[20px] border border-[#fb560740] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.36)]",
                    clipsSurfacePrimaryClass
                  )}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-65"
                    style={{
                      background:
                        "radial-gradient(280px 160px at 18% 10%, rgba(155,140,255,0.24), transparent 72%), radial-gradient(280px 160px at 85% 20%, rgba(70,215,255,0.2), transparent 75%), radial-gradient(260px 160px at 56% 100%, rgba(53,242,166,0.14), transparent 78%)",
                    }}
                  />
                  <div className="relative flex h-full flex-col">
                    <div className="flex items-center gap-2">
                      <span className={cx("rounded-full border px-2.5 py-1 text-[10px] font-semibold", typeTone("audio"))}>
                        AUDIO
                      </span>
                      <span className="rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] text-white/80">
                        {durationChip(c, "audio")}
                      </span>
                    </div>

                    <div className="mt-3 truncate text-[14px] font-semibold text-white/94">{c.title || `Audio #${c.id}`}</div>
                    <div className="mt-1 text-[11px] text-white/58">Storage: {clip(c.storage_key || "", 36)}</div>

                    <div className={cx("mt-3 rounded-2xl border border-white/12 p-3", clipsSurfaceInsetClass)}>
                      <audio src={c.url} controls preload="metadata" className="w-full" />
                    </div>

                    <div className="mt-auto pt-4">
                      <div className={cx("flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 p-2", clipsSurfaceInsetClass)}>
                        <ActionIconButton href={`/api/clips/${c.id}/download`} icon="download" label="Download" />
                        <ActionIconButton onClick={() => openPreview(c)} icon="play" label="Open preview" />
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!visualRows.length && !audioRows.length ? (
          <section className={cx("mt-6 surface-soft rounded-3xl p-7 text-sm text-white/60", clipsSurfaceSoftClass)}>
            {loading
              ? "Loading assets..."
              : generatedOnly
              ? "No AI assets yet. Generate your first one from Generator."
              : "No clips yet. Upload in Orbito or generate in Labs to populate this library."}
          </section>
        ) : null}
      </main>

      {previewClip ? (
        <div className="fixed inset-0 z-[85]">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px]" onClick={closePreview} />
          <div className="absolute inset-0 p-3 sm:p-6">
            <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-white/20 bg-[#070b16]/95 shadow-[0_38px_120px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="min-w-0 truncate text-sm font-semibold text-white/90">
                  {previewClip.title || `Clip #${previewClip.id}`}
                </div>
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/[0.10]"
                >
                  Close
                </button>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                {detectAssetType(previewClip) === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewClip.url} alt={previewClip.title || `Image ${previewClip.id}`} className="max-h-full max-w-full rounded-xl object-contain" />
                ) : detectAssetType(previewClip) === "audio" ? (
                  <div className={cx("w-full max-w-xl rounded-2xl border border-white/10 p-4", clipsSurfaceInsetClass)}>
                    <audio src={previewClip.url} controls autoPlay preload="metadata" className="w-full" />
                  </div>
                ) : (
                  <video src={previewClip.url} controls autoPlay playsInline preload="metadata" className="max-h-full max-w-full rounded-xl object-contain" />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editorOpen ? (
        <div className="fixed inset-0 z-[90]">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" onClick={closeEditor} />
          <div className="absolute inset-0 p-3 sm:p-5">
            <div className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-[28px] border border-[#7dd3fc33] bg-[radial-gradient(130%_120%_at_15%_0%,rgba(125,211,252,0.16),transparent_52%),radial-gradient(100%_120%_at_84%_0%,rgba(167,139,250,0.13),transparent_48%),rgba(7,11,21,0.96)] shadow-[0_38px_120px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)_inset]">
              <div className="clipforge-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pb-1">
                <EditorWorkspace mode="card" onClose={closeEditor} initialClipId={editorClipId || undefined} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {scheduleClip ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setScheduleClip(null)} />
          <div className="relative z-10 w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/15 bg-[#070b16]/95 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.62)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] text-white/55">Schedule / Post</div>
                <div className="mt-1 text-lg font-semibold text-white/92">{scheduleClip.title || `Clip #${scheduleClip.id}`}</div>
                <div className="mt-1 text-xs text-white/55">
                  {schedulePlanLabel} plan • {schedulePlatformLimit === null ? "Unlimited channels" : `Up to ${schedulePlatformLimit} channels`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScheduleClip(null)}
                className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/75 hover:bg-white/[0.08]"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white/90">Platforms</div>
                <div className="text-[11px] text-white/60">
                  {scheduleSelectedProviders.length} selected{schedulePlatformLimit !== null ? ` / ${schedulePlatformLimit}` : ""}
                </div>
              </div>

              {connectedScheduleProviders.length === 0 ? (
                <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-3 text-[12px] text-amber-100/90">
                  {schedulePlatformLimit === 0 ? (
                    <>
                      Social publishing is locked on Free Trial. <Link href="/app/billing" className="underline underline-offset-2">Open billing</Link> to unlock posting.
                    </>
                  ) : (
                    <>
                      No connected platforms yet. Connect accounts in <a href="/app/connections" className="underline underline-offset-2">Connections</a>.
                    </>
                  )}
                </div>
              ) : null}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {SUPPORTED_SOCIAL_PROVIDERS.map((provider) => {
                  const connected = connectedScheduleProviders.includes(provider);
                  const selected = scheduleSelectedProviders.includes(provider);
                  const disabledByLimit =
                    !selected &&
                    schedulePlatformLimit !== null &&
                    scheduleSelectedProviders.length >= schedulePlatformLimit;

                  return (
                    <label
                      key={provider}
                      className={cx(
                        "rounded-xl border px-3 py-3 transition",
                        selected
                          ? "border-[#fb560780] bg-[#fb560724]"
                          : connected
                            ? "border-white/15 bg-white/[0.03] hover:border-white/25"
                            : "border-white/10 bg-white/[0.02] opacity-55",
                        !connected || disabledByLimit || scheduleBusy ? "cursor-not-allowed" : "cursor-pointer"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-white/70">{socialLabel(provider)}</span>
                        <span className="text-[11px] text-white/50">{connected ? "Connected" : "Not connected"}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={!connected || disabledByLimit || scheduleBusy}
                          onChange={() => {
                            if (selected) {
                              setScheduleSelectedProviders((prev) => prev.filter((p) => p !== provider));
                              return;
                            }
                            void loadProviderOptions(provider);
                            setScheduleSelectedProviders((prev) => limitSelectedProviders([...prev, provider]));
                          }}
                          className="h-4 w-4 accent-orange-500"
                        />
                        <span className="text-sm text-white/88">{selected ? "Selected" : "Tap to select"}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {scheduleSelectedProviders.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-semibold text-white/90">Platform settings</div>
                <div className="mt-1 text-[12px] text-white/58">Required publish controls vary by platform and account capabilities.</div>
                {providerBlocks.length > 0 ? (
                  <div className="mt-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[12px] text-amber-100/90 whitespace-pre-line">
                    {providerBlockReason}
                  </div>
                ) : null}
                <div className="mt-3 grid gap-3">
                  {scheduleSelectedProviders.map((provider) => {
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
                              onChange={(e) => updateProviderOption(provider, "privacy_status", e.target.value)}
                              disabled={loading || scheduleBusy}
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
                        <div key={provider} className="rounded-xl border border-white/12 bg-black/25 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[12px] font-semibold text-white/86">TikTok</div>
                            {catalog.account_name ? <div className="text-[11px] text-white/55">{catalog.account_name}</div> : null}
                          </div>
                          {postBlocked ? (
                            <div className="mt-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100/90">
                              {postBlockReason || "TikTok cannot post from this account right now. Please try again later."}
                            </div>
                          ) : null}
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <label className="grid gap-1">
                              <span className="text-[11px] text-white/60">Post destination</span>
                              <select
                                value={String(values.publish_mode || "DIRECT_POST")}
                                onChange={(e) => updateProviderOption(provider, "publish_mode", e.target.value)}
                                disabled={loading || scheduleBusy || postBlocked}
                                className="h-10 rounded-xl border border-white/12 bg-black/35 px-3 text-sm text-white/90 outline-none"
                              >
                                {modeChoices.map((choice: string) => (
                                  <option key={choice} value={choice}>
                                    {choice === "DIRECT_POST" ? "Direct post" : "Upload to TikTok inbox"}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1">
                              <span className="text-[11px] text-white/60">Privacy level</span>
                              <select
                                value={String(values.privacy_level || "")}
                                onChange={(e) => updateProviderOption(provider, "privacy_level", e.target.value)}
                                disabled={loading || scheduleBusy || postBlocked}
                                className="h-10 rounded-xl border border-white/12 bg-black/35 px-3 text-sm text-white/90 outline-none"
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
                            <div className="mt-2 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100/85">
                              TikTok requires you to choose a privacy level before posting.
                            </div>
                          ) : null}
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            {[
                              { key: "allow_comments", label: "Allow comments" },
                              { key: "allow_duet", label: "Allow duet" },
                              { key: "allow_stitch", label: "Allow stitch" },
                            ].map((toggle) => (
                              <label key={toggle.key} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white/80">
                                <input
                                  type="checkbox"
                                  checked={Boolean(values[toggle.key])}
                                  onChange={(e) => updateProviderOption(provider, toggle.key, e.target.checked)}
                                  disabled={loading || scheduleBusy || postBlocked || interactionLocks[toggle.key] || isPrivatePrivacy}
                                  className="h-4 w-4 accent-orange-500"
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
                            <div className="mt-2 text-[11px] text-white/55">
                              One or more interaction toggles are locked by this TikTok account’s current creator settings.
                            </div>
                          ) : null}
                          <div className="mt-3 text-[11px] font-medium text-white/58">Content disclosure setting</div>
                          <label className="mt-2 flex min-h-[52px] items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-snug text-white/80">
                            <input
                              type="checkbox"
                              checked={disclosureEnabled}
                              onChange={(e) => updateProviderOption(provider, "commercial_content_disclosure", e.target.checked)}
                              disabled={loading || scheduleBusy || postBlocked}
                              className="h-4 w-4 accent-orange-500"
                            />
                            <span>Enable commercial content disclosure</span>
                          </label>
                          {disclosureEnabled ? (
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              {[
                                { key: "branded_content", label: "Paid partnership", disabled: isPrivatePrivacy },
                                { key: "brand_organic", label: "Your brand", disabled: false },
                              ].map((toggle) => (
                                <label key={toggle.key} className="flex min-h-[52px] items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-snug text-white/80">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(values[toggle.key])}
                                    onChange={(e) => updateProviderOption(provider, toggle.key, e.target.checked)}
                                    disabled={loading || scheduleBusy || postBlocked || toggle.disabled}
                                    className="h-4 w-4 accent-orange-500"
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
                              onChange={(e) => updateProviderOption(provider, "is_aigc", e.target.checked)}
                              disabled={loading || scheduleBusy || postBlocked}
                              className="h-4 w-4 accent-orange-500"
                            />
                            <span>AI-generated</span>
                          </label>
                          {isDirectPost ? (
                            <div className="mt-2 grid gap-2">
                              <div className="text-[11px] font-medium text-white/58">Required confirmations</div>
                              <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white/80">
                                <input
                                  type="checkbox"
                                  checked={Boolean(values.confirm_music_usage)}
                                  onChange={(e) => updateProviderOption(provider, "confirm_music_usage", e.target.checked)}
                                  disabled={loading || scheduleBusy || postBlocked}
                                  className="mt-0.5 h-4 w-4 accent-orange-500"
                                />
                                <span>
                                  I confirm this post complies with TikTok Music Usage Confirmation and content rights requirements.
                                </span>
                              </label>
                              {needsBrandedConfirm ? (
                                <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white/80">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(values.confirm_branded_content)}
                                    onChange={(e) => updateProviderOption(provider, "confirm_branded_content", e.target.checked)}
                                    disabled={loading || scheduleBusy || postBlocked}
                                    className="mt-0.5 h-4 w-4 accent-orange-500"
                                  />
                                  <span>
                                    I confirm branded content disclosure is accurate and follows TikTok Branded Content Policy.
                                  </span>
                                </label>
                              ) : null}
                            </div>
                          ) : null}
                          {maxDuration > 0 ? (
                            <div className="mt-2 text-[11px] text-white/55">Account max duration: {maxDuration}s.</div>
                          ) : null}
                          <div className="mt-1 text-[11px] text-white/50">
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
                              onChange={(e) => updateProviderOption(provider, "share_to_feed", e.target.checked)}
                              disabled={loading || scheduleBusy}
                              className="h-4 w-4 accent-orange-500"
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

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[12px] text-white/60">Caption</label>
                  <span className="text-[11px] text-white/50">{scheduleCaption.trim().length} chars</span>
                </div>
                <textarea
                  className="mt-2 min-h-[120px] w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/90 outline-none focus:border-[#fb560782]"
                  value={scheduleCaption}
                  onChange={(e) => setScheduleCaption(e.target.value)}
                  placeholder="Write a clear caption for this clip"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <label className="text-[12px] text-white/60">Schedule time</label>
                <input
                  type="datetime-local"
                  className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white/90 outline-none focus:border-[#fb560782]"
                  value={scheduleWhen}
                  onChange={(e) => setScheduleWhen(e.target.value)}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => scheduleInMinutes(60)} className="btn-ghost px-3 py-1.5 text-[11px]" disabled={scheduleBusy}>
                    In 1 hour
                  </button>
                  <button type="button" onClick={() => scheduleTodayAt(20)} className="btn-ghost px-3 py-1.5 text-[11px]" disabled={scheduleBusy}>
                    Tonight 8:00 PM
                  </button>
                  <button type="button" onClick={() => scheduleTomorrowAt(9)} className="btn-ghost px-3 py-1.5 text-[11px]" disabled={scheduleBusy}>
                    Tomorrow 9:00 AM
                  </button>
                </div>
              </div>
            </div>

            {scheduleError ? (
              <div className="mt-4 whitespace-pre-line rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-100/90">
                {scheduleError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => submitSocialPosts("post_now")}
                disabled={scheduleBusy || hasProviderBlock || tiktokDisclosureInvalid}
                title={hasProviderBlock ? providerBlockSummary : tiktokDisclosureInvalid ? tiktokDisclosureReason : undefined}
                className="btn-aurora px-4 py-2 text-sm"
              >
                {scheduleBusy ? "Posting..." : "Post now"}
              </button>
              <button
                type="button"
                onClick={() => submitSocialPosts("schedule")}
                disabled={scheduleBusy || !scheduleWhen || hasProviderBlock || tiktokDisclosureInvalid}
                title={hasProviderBlock ? providerBlockSummary : tiktokDisclosureInvalid ? tiktokDisclosureReason : undefined}
                className="btn-ghost px-4 py-2 text-sm"
              >
                {scheduleBusy ? "Scheduling..." : "Schedule post"}
              </button>
              <div className="text-[12px] text-white/55">
                {hasProviderBlock
                  ? providerBlockSummary
                  : tiktokDisclosureInvalid
                    ? tiktokDisclosureReason
                    : "Set a time to schedule, or use Post now for immediate publish."}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
