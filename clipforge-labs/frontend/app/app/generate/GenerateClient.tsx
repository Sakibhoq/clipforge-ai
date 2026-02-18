// frontend/app/app/generate/GenerateClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type GenerateResponse = { upload_id: number; job_id: number };
type JobRow = {
  id: number;
  upload_id: number;
  kind?: string;
  status: string;
  error?: string | null;
  prompt?: string | null;
  aspect_ratio?: string | null;
  duration_seconds?: number | null;
  created_at?: string;
};

type ClipRow = {
  id: number;
  upload_id: number;
  storage_key: string;
  url: string;
  start_time: number;
  end_time: number;
  duration: number;
  title?: string | null;
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

export default function GenerateClient() {
  const searchParams = useSearchParams();
  const spKey = useMemo(() => (searchParams ? searchParams.toString() : ""), [searchParams]);

  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState(6);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsBilling, setNeedsBilling] = useState(false);

  const [activeJob, setActiveJob] = useState<JobRow | null>(null);
  const [activeUploadId, setActiveUploadId] = useState<number | null>(null);

  const [clips, setClips] = useState<ClipRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);

  const pollTimer = useRef<number | null>(null);
  const hydratedFromQuery = useRef(false);

  const canGenerate = useMemo(() => {
    const p = prompt.trim();
    return p.length >= 3 && p.length <= 1200 && !submitting;
  }, [prompt, submitting]);

  async function refreshJobs() {
    try {
      const rows = (await apiFetch<JobRow[]>("/jobs", { method: "GET" })) || [];
      const gen = rows.filter((r) => (r?.kind || "clip") === "generate");
      setJobs(gen);
    } catch {
      // ignore
    }
  }

  async function loadClipsForUpload(uploadId: number) {
    const rows = (await apiFetch<ClipRow[]>(`/clips?upload_id=${uploadId}`, { method: "GET" })) || [];
    setClips(Array.isArray(rows) ? rows : []);
  }

  async function pollJob(jobId: number, uploadId: number) {
    if (pollTimer.current) window.clearInterval(pollTimer.current);

    async function tick() {
      try {
        const job = await apiFetch<JobRow>(`/jobs/${jobId}`, { method: "GET" });
        setActiveJob(job);
        if (job?.status === "done") {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          pollTimer.current = null;
          await loadClipsForUpload(uploadId);
          await refreshJobs();
        }
        if (job?.status === "failed" || job?.status === "canceled") {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          pollTimer.current = null;
          await refreshJobs();
        }
      } catch {
        // ignore
      }
    }

    await tick();
    pollTimer.current = window.setInterval(tick, 1600);
  }

  useEffect(() => {
    refreshJobs();
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Deep link support:
    // - /app/generate?p=...&ar=...&d=...
    // - /app/generate?job=123&upload=456
    if (hydratedFromQuery.current) return;
    hydratedFromQuery.current = true;

    const p = searchParams?.get("p");
    const ar = searchParams?.get("ar");
    const dRaw = searchParams?.get("d");
    const jobRaw = searchParams?.get("job");
    const uploadRaw = searchParams?.get("upload");

    if (typeof p === "string" && p.trim() && !prompt.trim()) setPrompt(p);
    if (typeof ar === "string" && ["9:16", "16:9", "1:1"].includes(ar)) setAspectRatio(ar);

    const d = dRaw ? Number(dRaw) : NaN;
    if (Number.isFinite(d) && [6, 10, 15, 20].includes(d)) setDuration(d);

    const jobId = jobRaw ? Number(jobRaw) : 0;
    const uploadId = uploadRaw ? Number(uploadRaw) : 0;
    if (jobId > 0 && uploadId > 0) {
      setActiveUploadId(uploadId);
      pollJob(jobId, uploadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spKey]);

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsBilling(false);

    const p = prompt.trim();
    if (p.length < 3) return setError("Write a prompt first.");

    setSubmitting(true);
    try {
      const res = await apiFetch<GenerateResponse>("/labs/generate", {
        method: "POST",
        body: {
          prompt: p,
          aspect_ratio: aspectRatio,
          duration_seconds: duration,
          model: "google",
        },
      });

      const uploadId = Number(res?.upload_id || 0);
      const jobId = Number(res?.job_id || 0);
      if (!uploadId || !jobId) throw new Error("generation_failed");

      setActiveUploadId(uploadId);
      setActiveJob({ id: jobId, upload_id: uploadId, status: "queued" } as any);
      setClips([]);

      await refreshJobs();
      await pollJob(jobId, uploadId);
    } catch (err: any) {
      const detail = err?.detail || err?.message || "Could not start generation.";
      const msg = typeof detail === "string" ? detail : "Could not start generation.";
      const low = String(msg || "").toLowerCase();
      const outOfMinutes = err?.status === 402 || low.includes("insufficient credits");
      if (outOfMinutes) {
        setNeedsBilling(true);
        setError("You’re out of minutes. Add minutes in Billing to generate more videos.");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const status = activeJob?.status || "";
  const statusLabel = activeJob ? prettyStatus(activeJob.status) : null;

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-12">
        <section className="surface relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-45 blur-3xl"
            style={{
              background:
                "radial-gradient(260px 180px at 18% 28%, rgba(255,183,3,0.18), transparent 70%), radial-gradient(260px 180px at 78% 35%, rgba(58,134,255,0.16), transparent 72%), radial-gradient(260px 180px at 55% 92%, rgba(251,86,7,0.12), transparent 72%)",
            }}
          />
          <div className="relative flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Generate</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/90">
                Create a clip with <span className="grad-text">AI</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                Describe what you want. Clipforge Labs generates a short video you can download or publish.
              </p>
            </div>

            {activeJob ? (
              <div
                className={cx(
                  "rounded-full border px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.08em]",
                  status === "running"
                    ? "border-white/15 bg-white/5 text-white/70"
                    : status === "queued"
                      ? "border-white/10 bg-white/5 text-white/60"
                      : status === "failed"
                        ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
                        : status === "done"
                          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                          : "border-white/10 bg-white/5 text-white/70"
                )}
              >
                Status: <span className="text-white/90">{statusLabel}</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8 grid gap-8 lg:grid-cols-12">
          {/* Prompt */}
          <div className="lg:col-span-5">
            <div className="surface rounded-3xl p-6">
              <div className="text-xs text-white/55">• Prompt</div>
              <form onSubmit={onGenerate} className="mt-4 grid gap-4">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={7}
                  placeholder="Example: A cinematic drone shot over a coastal city at sunrise, soft fog, warm light."
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[14px] text-white/90 outline-none placeholder:text-white/35 focus:border-white/20 focus:bg-white/[0.06]"
                />

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <div className="text-[12px] font-medium text-white/70">Aspect ratio</div>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      className="h-11 rounded-2xl border border-white/10 bg-black/50 px-3 text-[14px] text-white/85 outline-none hover:bg-black/60 focus:border-white/20 focus:bg-black/60"
                    >
                      <option value="9:16">9:16 (Shorts/Reels)</option>
                      <option value="16:9">16:9 (YouTube)</option>
                      <option value="1:1">1:1 (Square)</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <div className="text-[12px] font-medium text-white/70">Duration</div>
                    <select
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="h-11 rounded-2xl border border-white/10 bg-black/50 px-3 text-[14px] text-white/85 outline-none hover:bg-black/60 focus:border-white/20 focus:bg-black/60"
                    >
                      <option value={6}>6 seconds</option>
                      <option value={10}>10 seconds</option>
                      <option value={15}>15 seconds</option>
                      <option value={20}>20 seconds</option>
                    </select>
                  </div>
                </div>

                {error ? (
                  <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-100">
                    <div>{error}</div>
                    {needsBilling ? (
                      <div className="mt-2">
                        <Link href="/app/billing" className="text-rose-50/90 underline decoration-rose-200/25 underline-offset-4">
                          Open Billing
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activeJob?.status === "failed" && activeJob?.error ? (
                  <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-100">
                    {String(activeJob.error)}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={!canGenerate}
                  className={cx(
                    "group relative h-11 w-full overflow-hidden rounded-2xl border text-[13px] font-semibold tracking-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 active:scale-[0.99]",
                    canGenerate
                      ? "border-white/10 bg-white/10 text-white/90 hover:bg-white/12"
                      : "cursor-not-allowed border-white/10 bg-white/[0.06] text-white/45"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background:
                        "radial-gradient(140px 90px at 35% 45%, rgba(255,183,3,0.26), transparent 70%), radial-gradient(140px 90px at 70% 55%, rgba(58,134,255,0.18), transparent 72%)",
                    }}
                  />
                  <span className="relative inline-flex items-center justify-center gap-2">
                    {submitting ? "Starting…" : "Generate"}
                  </span>
                </button>

                <div className="text-[12px] text-white/50">
                  Tip: mention camera motion, lighting, and the subject. Keep it under 2 sentences.
                </div>
              </form>
            </div>

            {jobs.length ? (
              <div className="mt-6 surface-soft rounded-3xl p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-white/55">• Recent</div>
                    <div className="mt-1 text-sm font-semibold text-white/90">Generation jobs</div>
                  </div>
                  <button
                    type="button"
                    onClick={refreshJobs}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mt-4 grid gap-2">
                  {jobs.slice(0, 8).map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => {
                        setActiveUploadId(j.upload_id);
                        pollJob(j.id, j.upload_id);
                      }}
                      className="text-left rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[13px] font-semibold text-white/85">
                          {(j.prompt || "").trim() ? (j.prompt as any) : `Job #${j.id}`}
                        </div>
                        <span className="chip">{prettyStatus(j.status)}</span>
                      </div>
                      <div className="mt-2 text-[12px] text-white/55">
                        {j.aspect_ratio || "—"} • {j.duration_seconds || "—"}s • Upload #{j.upload_id}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Output */}
          <div className="lg:col-span-7">
            <div className="surface rounded-3xl p-6">
              <div className="text-xs text-white/55">• Output</div>

              {activeUploadId ? (
                <div className="mt-3 text-[12px] text-white/60">
                  Upload ID: <span className="text-white/80">{activeUploadId}</span>
                </div>
              ) : null}

              {clips.length ? (
                <div className="mt-5 grid gap-6">
                  {clips.map((c) => (
                    <div key={c.id} className="grid gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[13px] font-semibold text-white/85">{c.title || `Clip #${c.id}`}</div>
                        <a
                          href={`/api/clips/${c.id}/download`}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-white/75 transition hover:bg-white/8 active:scale-[0.99]"
                        >
                          Download
                        </a>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                        <video src={c.url} controls playsInline preload="metadata" className="block w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[13px] text-white/60">
                  {activeJob?.status === "running" || activeJob?.status === "queued"
                    ? "Generating your video…"
                    : "Your generated clips will appear here."}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
