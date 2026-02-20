// frontend/app/app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type JobRow = {
  id: number;
  upload_id: number;
  kind?: string;
  status: string;
  prompt?: string | null;
  aspect_ratio?: string | null;
  duration_seconds?: number | null;
  created_at?: string;
};

type SocialAccount = {
  id: number;
  provider: string;
  account_name?: string | null;
  status?: string | null;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function prettyStatus(s: string) {
  const v = (s || "").toLowerCase();
  if (v === "queued") return "Queued";
  if (v === "running") return "Generating";
  if (v === "done") return "Ready";
  if (v === "failed") return "Failed";
  if (v === "canceled") return "Canceled";
  return s || "Unknown";
}

function clip(s: string, n: number) {
  const t = String(s || "").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}…`;
}

type PromptRecipe = {
  title: string;
  prompt: string;
  aspect_ratio: "9:16" | "16:9" | "1:1";
  duration_seconds: 4 | 6 | 8;
  vibe: string;
};

function durationPresetLabel(durationSeconds: number | null | undefined): string {
  const d = Number(durationSeconds || 0);
  if (!d || d < 1) return "—";
  if (d <= 4) return "Short";
  if (d <= 6) return "Standard";
  return "Extended";
}

export default function AppConsolePage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);

  const connectedProviders = useMemo(() => {
    const map = new Map<string, SocialAccount>();
    for (const a of accounts) {
      const key = String(a.provider || "").toLowerCase();
      if (!key) continue;
      const connected = String(a.status || "").toLowerCase() === "connected";
      if (!connected) continue;
      if (!map.has(key)) map.set(key, a);
    }
    return Array.from(map.keys()).sort();
  }, [accounts]);

  const recipes = useMemo<PromptRecipe[]>(
    () => [
      {
        title: "Coffee pour macro",
        prompt:
          "Close-up of espresso pouring into a glass, warm window light, shallow depth of field, subtle film grain, smooth motion.",
        aspect_ratio: "9:16",
        duration_seconds: 6,
        vibe: "Warm",
      },
      {
        title: "Neon street b-roll",
        prompt:
          "Slow dolly-in on a neon-lit street at night, rain reflections, moody cinematic lighting, soft haze, 35mm look.",
        aspect_ratio: "9:16",
        duration_seconds: 6,
        vibe: "Cinematic",
      },
      {
        title: "Minimal product spin",
        prompt:
          "Matte-black sneaker on a clean studio backdrop, slow turntable rotation, crisp highlights, premium commercial look.",
        aspect_ratio: "1:1",
        duration_seconds: 6,
        vibe: "Clean",
      },
      {
        title: "Golden-hour travel",
        prompt:
          "Drone flyover of a coastal cliff path at golden hour, soft fog, gentle camera motion, warm color grade, people walking.",
        aspect_ratio: "16:9",
        duration_seconds: 8,
        vibe: "Travel",
      },
    ],
    []
  );

  async function refresh() {
    try {
      const [jobsRes, accountsRes] = await Promise.allSettled([
        apiFetch<JobRow[]>("/jobs", { method: "GET" }),
        apiFetch<SocialAccount[]>("/social/accounts", { method: "GET" }),
      ]);

      if (jobsRes.status === "fulfilled") {
        const rows = (jobsRes.value || []).filter((r) => (r?.kind || "clip") === "generate");
        setJobs(rows.slice(0, 8));
      }
      if (accountsRes.status === "fulfilled") setAccounts(Array.isArray(accountsRes.value) ? accountsRes.value : []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-12">
        <section className="surface relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-80">
            <div className="aurora" />
          </div>

          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Console</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/95">
                Your <span className="grad-text">video lab</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                Prompt in, MP4 out. Generate clips, download them, then publish to your connected channels.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href="/app/generate" className="btn-aurora text-[12px] px-4 py-2">
                Open generator
              </Link>
              <Link href="/pricing" className="btn-solid-dark text-[12px] px-4 py-2">
                Buy more credits
              </Link>
              <Link href="/app/clips" className="btn-solid-dark text-[12px] px-4 py-2">
                My clips
              </Link>
              <Link href="/app/studio" className="btn-ghost text-[12px] px-4 py-2">
                Studio
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-8 lg:grid-cols-12">
          {/* Prompt recipes (no duplicate generator UI here) */}
          <div className="lg:col-span-7">
            <div className="surface rounded-3xl p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-white/55">• Prompt recipes</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">Pick a starter, then tweak it</div>
                </div>
                <div className="chip">Open in generator</div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {recipes.map((r) => {
                  const href = `/app/generate?p=${encodeURIComponent(r.prompt)}&ar=${encodeURIComponent(r.aspect_ratio)}&d=${encodeURIComponent(
                    String(r.duration_seconds)
                  )}`;

                  return (
                    <Link
                      key={r.title}
                      href={href}
                      className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] transition hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.03]"
                      title="Open in generator"
                    >
                      <div className="relative h-[150px] border-b border-white/10 bg-[linear-gradient(120deg,rgba(255,183,3,0.22),rgba(251,86,7,0.14),rgba(58,134,255,0.18))]">
                        <div className="absolute inset-0 bg-[radial-gradient(900px_260px_at_22%_22%,rgba(255,255,255,0.10),transparent_60%)]" />

                        <div className="absolute left-4 top-4 flex gap-2">
                          <span className="chip">{r.aspect_ratio}</span>
                          <span className="chip">{durationPresetLabel(r.duration_seconds)}</span>
                        </div>
                        <div className="absolute right-4 top-4 chip">{r.vibe}</div>

                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="rounded-full border border-white/15 bg-black/40 px-4 py-2 text-[12px] font-semibold text-white/80">
                            Open in generator
                          </div>
                        </div>
                      </div>

                      <div className="p-5">
                        <div className="text-sm font-semibold text-white/90">{r.title}</div>
                        <div className="mt-2 text-[13px] leading-relaxed text-white/60">{clip(r.prompt, 140)}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Link href="/app/generate" className="btn-aurora text-[12px] px-4 py-2">
                  Open generator
                </Link>
                <Link href="/pricing" className="btn-solid-dark text-[12px] px-4 py-2">
                  Buy more credits
                </Link>
                <Link href="/app/studio" className="btn-ghost text-[12px] px-4 py-2">
                  Studio
                </Link>
                <Link href="/app/clips" className="btn-solid-dark text-[12px] px-4 py-2">
                  My clips
                </Link>
              </div>

              <div className="mt-3 text-[12px] text-white/50">
                Tip: include subject, motion, camera, lighting, and style. Keep it specific.
              </div>
            </div>
          </div>

          {/* Right rail */}
          <div className="lg:col-span-5 grid gap-6">
            <div className="surface-soft rounded-3xl p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-white/55">• Connected platforms</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">Studio</div>
                </div>
                <Link href="/app/studio" className="text-xs text-white/60 hover:text-white/80">
                  Manage
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {connectedProviders.length ? (
                  connectedProviders.map((p) => (
                    <span key={p} className="chip">
                      {p}
                    </span>
                  ))
                ) : (
                  <div className="text-sm text-white/60">
                    Not connected yet. Connect accounts to publish from Studio.
                  </div>
                )}
              </div>
            </div>

            <div className="surface-soft rounded-3xl p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-white/55">• Recent generations</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">Jobs</div>
                </div>
                <button
                  type="button"
                  onClick={refresh}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
                >
                  Refresh
                </button>
              </div>

              {jobs.length ? (
                <div className="mt-4 grid gap-2">
                  {jobs.map((j) => (
                    <Link
                      key={j.id}
                      href={`/app/generate?job=${j.id}&upload=${j.upload_id}`}
                      className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[13px] font-semibold text-white/85">{clip(j.prompt || "", 44) || "—"}</div>
                        <span
                          className={cx(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                            j.status === "done"
                              ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                              : j.status === "failed"
                                ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
                                : j.status === "running"
                                  ? "border-white/15 bg-white/5 text-white/70"
                                  : "border-white/10 bg-white/5 text-white/60"
                          )}
                        >
                          {prettyStatus(j.status)}
                        </span>
                      </div>
                      <div className="mt-2 text-[12px] text-white/55">
                        {j.aspect_ratio || "—"} • {durationPresetLabel(j.duration_seconds)} • Job #{j.id}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/60">
                  No generation jobs yet.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
