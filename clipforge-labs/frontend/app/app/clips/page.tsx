"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

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
};

const SUPPORTED_SOCIAL_PROVIDERS = ["youtube", "tiktok", "instagram", "facebook"] as const;
type SupportedSocialProvider = (typeof SUPPORTED_SOCIAL_PROVIDERS)[number];
type SocialPlan = "free" | "starter" | "creator" | "studio";
type AssetFilter = "all" | "video" | "image" | "audio";

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

function socialLabel(p: string) {
  const s = (p || "").toLowerCase();
  if (s === "youtube") return "YouTube";
  if (s === "tiktok") return "TikTok";
  if (s === "instagram") return "Instagram";
  if (s === "facebook") return "Facebook";
  return p || "Social";
}

function normalizeSocialPlan(raw: string | undefined | null): SocialPlan {
  const plan = String(raw || "")
    .trim()
    .toLowerCase();
  if (plan === "starter") return "starter";
  if (plan === "creator") return "creator";
  if (plan === "studio") return "studio";
  return "free";
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

function ActionIconButton({
  href,
  onClick,
  symbol,
  label,
  tone = "ghost",
}: {
  href?: string;
  onClick?: () => void;
  symbol: string;
  label: string;
  tone?: "ghost" | "brand";
}) {
  const className = cx(
    "inline-flex h-9 w-9 items-center justify-center rounded-full border text-base font-semibold transition",
    tone === "brand"
      ? "border-[#46d7ff7a] bg-[#46d7ff2b] text-white hover:bg-[#46d7ff45]"
      : "border-white/15 bg-black/35 text-white/90 hover:bg-white/14"
  );

  if (href) {
    return (
      <a href={href} className={className} title={label} aria-label={label}>
        <span aria-hidden="true">{symbol}</span>
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} title={label} aria-label={label}>
      <span aria-hidden="true">{symbol}</span>
    </button>
  );
}

export default function ClipsPage() {
  const [rows, setRows] = useState<ClipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [error, setError] = useState<string | null>(null);

  const [socialAccounts, setSocialAccounts] = useState<SocialAccountDTO[]>([]);
  const [socialPlan, setSocialPlan] = useState<SocialPlan>("free");

  const [scheduleClip, setScheduleClip] = useState<ClipRow | null>(null);
  const [scheduleSelectedProviders, setScheduleSelectedProviders] = useState<SupportedSocialProvider[]>([]);
  const [scheduleCaption, setScheduleCaption] = useState("");
  const [scheduleWhen, setScheduleWhen] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);

  async function loadClips() {
    setLoading(true);
    setError(null);
    try {
      const data = (await apiFetch<ClipRow[]>("/clips?grouped=false", { method: "GET" })) || [];
      setRows(Array.isArray(data) ? data : []);
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
      setSocialPlan(normalizeSocialPlan(me?.plan));
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
  }, []);

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
    const defaults =
      schedulePlatformLimit === null
        ? [...connectedScheduleProviders]
        : connectedScheduleProviders.slice(0, schedulePlatformLimit);
    setScheduleClip(clipRow);
    setScheduleSelectedProviders(defaults);
    setScheduleCaption((clipRow.title || clipRow.hook || "").trim() || `New clip #${clipRow.id}`);
    setScheduleWhen("");
    setScheduleError(null);
    setScheduleNotice(null);
  }

  async function submitSocialPosts(mode: "post_now" | "schedule") {
    if (!scheduleClip || scheduleBusy) return;
    if (schedulePlatformLimit === 0) {
      setScheduleError("Social publishing is locked on Free Trial. Upgrade to Starter or Creator.");
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

    setScheduleBusy(true);
    setScheduleError(null);
    setScheduleNotice(null);

    try {
      const scheduledAt = mode === "schedule" ? new Date(scheduleWhen).toISOString() : undefined;
      const failures: Array<{ provider: string; detail: string }> = [];
      const success: SocialPostDTO[] = [];

      for (const provider of scheduleSelectedProviders) {
        try {
          const res = await apiFetch<SocialPostDTO>("/social/posts", {
            method: "POST",
            body: {
              provider,
              clip_id: scheduleClip.id,
              caption: scheduleCaption || "New clip",
              scheduled_at: scheduledAt,
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

      if (success.length > 0) {
        const parts = [posted > 0 ? `Posted ${posted}` : "", scheduled > 0 ? `Scheduled ${scheduled}` : ""].filter(Boolean);
        setScheduleNotice(parts.length ? parts.join(" • ") : "Social post created.");
      }

      if (failures.length > 0) {
        const msg = failures.map((f) => `${socialLabel(f.provider)}: ${f.detail}`).join("\n");
        setScheduleError(msg);
      } else {
        setScheduleClip(null);
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

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-[1520px] px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        <section className="surface relative overflow-hidden rounded-[30px] border border-[#8f8cff3d] p-5 sm:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-16 opacity-60 blur-3xl"
            style={{
              background:
                "radial-gradient(320px 220px at 14% 20%, rgba(155,140,255,0.22), transparent 72%), radial-gradient(360px 220px at 82% 18%, rgba(70,215,255,0.22), transparent 74%), radial-gradient(320px 220px at 52% 96%, rgba(53,242,166,0.14), transparent 76%)",
            }}
          />

          <div className="relative grid gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs text-white/55">• Asset Command Center</div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  Clipforge <span className="grad-text">Media Library</span>
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-white/68 sm:text-[15px]">
                  Manage published-ready visuals and audio in one workspace designed for fast review and posting.
                </p>
              </div>

              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                <Link href="/app/generate" className="btn-aurora px-4 py-2 text-center text-[12px]">
                  Open Generator
                </Link>
                <Link href="/app/editor" className="btn-orbito px-4 py-2 text-center text-[12px]">
                  Open Editor
                </Link>
                <Link href="/app/connections" className="btn-ghost col-span-2 px-4 py-2 text-center text-[12px] sm:col-auto">
                  Connections
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                { label: "Total Assets", value: counts.total },
                { label: "Video Clips", value: counts.video },
                { label: "Image Frames", value: counts.image },
                { label: "Audio Tracks", value: counts.audio },
                { label: "Connected Channels", value: connectedSocialCount },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[#8f8cff36] bg-[linear-gradient(140deg,rgba(9,15,29,0.92),rgba(7,11,22,0.86))] px-4 py-3"
                >
                  <div className="text-[11px] uppercase tracking-[0.08em] text-white/55">{item.label}</div>
                  <div className="mt-1 text-lg font-semibold text-white/92">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-[#8f8cff2f] bg-[#090f1c]/92 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search titles or hooks..."
                className="h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white/90 outline-none placeholder:text-white/45 focus:border-white/25"
              />
              <div className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-2 text-[12px] text-white/72">
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
                      ? "border-[#46d7ff6b] bg-[#46d7ff26] text-white"
                      : "border-white/10 bg-black/35 text-white/70 hover:bg-white/10"
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
                    className="group overflow-hidden rounded-[24px] border border-[#8f8cff3d] bg-[#070d1a] shadow-[0_18px_44px_rgba(0,0,0,0.38)]"
                  >
                    <div className="relative aspect-[9/12] bg-black/50">
                      {assetType === "image" ? (
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
                      <div className="mt-3 flex items-center gap-2">
                        <ActionIconButton href={`/api/clips/${c.id}/download`} symbol="⬇️" label="Download" />
                        <ActionIconButton href={c.url} symbol="🔎" label="Open preview" tone="brand" />
                        {assetType === "video" ? (
                          <ActionIconButton onClick={() => openSchedule(c)} symbol="📅" label="Schedule / Post" tone="brand" />
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
                  className="surface-soft relative flex h-full min-h-[220px] flex-col overflow-hidden rounded-[20px] border border-[#8f8cff3d] bg-[#090f1d]/95 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.36)]"
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

                    <div className="mt-3 rounded-2xl border border-white/12 bg-black/35 p-3">
                      <audio src={c.url} controls preload="metadata" className="w-full" />
                    </div>

                    <div className="mt-auto pt-4">
                      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/35 p-2">
                        <ActionIconButton href={`/api/clips/${c.id}/download`} symbol="⬇️" label="Download" />
                        <ActionIconButton href={c.url} symbol="🔎" label="Open preview" tone="brand" />
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!visualRows.length && !audioRows.length ? (
          <section className="mt-6 surface-soft rounded-3xl p-7 text-sm text-white/60">
            {loading ? "Loading assets..." : "No assets yet. Generate your first one from Generator."}
          </section>
        ) : null}
      </main>

      {scheduleClip ? (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setScheduleClip(null)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-3xl border border-white/15 bg-[#070b16]/95 p-5 shadow-[0_-24px_80px_rgba(0,0,0,0.6)] sm:inset-x-6 sm:bottom-6 sm:mx-auto sm:max-w-3xl sm:rounded-3xl">
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
                      Social publishing is locked on Free Trial. <Link href="/pricing" className="underline underline-offset-2">Upgrade plan</Link> to unlock posting.
                    </>
                  ) : (
                    <>
                      No connected platforms yet. Connect accounts in <Link href="/app/connections" className="underline underline-offset-2">Connections</Link>.
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
                          ? "border-cyan-300/45 bg-cyan-300/12"
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
                            setScheduleSelectedProviders((prev) => limitSelectedProviders([...prev, provider]));
                          }}
                          className="h-4 w-4 accent-cyan-400"
                        />
                        <span className="text-sm text-white/88">{selected ? "Selected" : "Tap to select"}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[12px] text-white/60">Caption</label>
                  <span className="text-[11px] text-white/50">{scheduleCaption.trim().length} chars</span>
                </div>
                <textarea
                  className="mt-2 min-h-[120px] w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/90 outline-none focus:border-cyan-300/50"
                  value={scheduleCaption}
                  onChange={(e) => setScheduleCaption(e.target.value)}
                  placeholder="Write a clear caption for this clip"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <label className="text-[12px] text-white/60">Schedule time</label>
                <input
                  type="datetime-local"
                  className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white/90 outline-none focus:border-cyan-300/50"
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
              <button type="button" onClick={() => submitSocialPosts("post_now")} disabled={scheduleBusy} className="btn-aurora px-4 py-2 text-sm">
                {scheduleBusy ? "Posting..." : "Post now"}
              </button>
              <button
                type="button"
                onClick={() => submitSocialPosts("schedule")}
                disabled={scheduleBusy || !scheduleWhen}
                className="btn-ghost px-4 py-2 text-sm"
              >
                {scheduleBusy ? "Scheduling..." : "Schedule post"}
              </button>
              <div className="text-[12px] text-white/55">Set a time to schedule, or use Post now for immediate publish.</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
