// frontend/app/app/generate/GenerateClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type GenerationMode = "video" | "image" | "voiceover";
type VideoSpeedMode = "relax" | "fast";
type JobKind = "generate" | "generate_image" | "generate_voiceover";

type GenerateResponse = {
  upload_id: number;
  job_id: number;
  kind?: string;
  credits_reserved?: number;
  duration_seconds?: number | null;
  text_length?: number | null;
};

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
  asset_type?: string;
  mime_type?: string;
  start_time: number;
  end_time: number;
  duration: number;
  title?: string | null;
};

const RELAX_CREDITS_PER_SECOND = 1;
const FAST_CREDITS_PER_SECOND = 2;
const IMAGE_CREDITS = 4;
const VOICE_CHARS_PER_CREDIT = 250;
const VOICE_MIN_CREDITS = 1;

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

function kindLabel(kind: string | undefined) {
  const k = String(kind || "").toLowerCase();
  if (k === "generate_image") return "Image";
  if (k === "generate_voiceover") return "Voiceover";
  return "Video";
}

function modeToJobKind(mode: GenerationMode): JobKind {
  if (mode === "image") return "generate_image";
  if (mode === "voiceover") return "generate_voiceover";
  return "generate";
}

function durationPresetLabel(durationSeconds: number | null | undefined): string {
  const d = Number(durationSeconds || 0);
  if (!d || d < 1) return "—";
  if (d <= 4) return "Short";
  if (d <= 6) return "Standard";
  return "Extended";
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

export default function GenerateClient() {
  const searchParams = useSearchParams();
  const spKey = useMemo(() => (searchParams ? searchParams.toString() : ""), [searchParams]);

  const [mode, setMode] = useState<GenerationMode>("video");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState(6);
  const [videoSpeed, setVideoSpeed] = useState<VideoSpeedMode>("relax");
  const [voiceName, setVoiceName] = useState("en-us");
  const [voiceSpeed, setVoiceSpeed] = useState(165);
  const [currentPlan, setCurrentPlan] = useState("free");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsBilling, setNeedsBilling] = useState(false);

  const [activeJob, setActiveJob] = useState<JobRow | null>(null);
  const [activeUploadId, setActiveUploadId] = useState<number | null>(null);

  const [clips, setClips] = useState<ClipRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);

  const pollTimer = useRef<number | null>(null);
  const hydratedFromQuery = useRef(false);

  const textLength = useMemo(() => prompt.trim().length, [prompt]);

  const estimatedCredits = useMemo(() => {
    if (mode === "image") return IMAGE_CREDITS;
    if (mode === "voiceover") {
      const usage = Math.ceil(Math.max(1, textLength) / VOICE_CHARS_PER_CREDIT);
      return Math.max(VOICE_MIN_CREDITS, usage);
    }
    const perSecond = videoSpeed === "fast" ? FAST_CREDITS_PER_SECOND : RELAX_CREDITS_PER_SECOND;
    return Math.max(1, Number(duration || 0)) * perSecond;
  }, [mode, textLength, duration, videoSpeed]);

  const fastEligible = useMemo(() => {
    const plan = String(currentPlan || "").trim().toLowerCase();
    return plan === "creator" || plan === "studio";
  }, [currentPlan]);

  const canGenerate = useMemo(() => {
    const p = prompt.trim();
    return p.length >= 3 && p.length <= 6000 && !submitting;
  }, [prompt, submitting]);

  async function refreshJobs() {
    try {
      const rows = (await apiFetch<JobRow[]>("/jobs", { method: "GET" })) || [];
      const gen = rows.filter((r) =>
        ["generate", "generate_image", "generate_voiceover"].includes(String(r?.kind || ""))
      );
      setJobs(gen);
    } catch {
      // ignore
    }
  }

  async function loadAssetsForUpload(uploadId: number) {
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
          await loadAssetsForUpload(uploadId);
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
    apiFetch<{ plan?: string }>("/auth/me", { method: "GET" })
      .then((me) => {
        setCurrentPlan(String(me?.plan || "free"));
      })
      .catch(() => {
        setCurrentPlan("free");
      });
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydratedFromQuery.current) return;
    hydratedFromQuery.current = true;

    const p = searchParams?.get("p");
    const ar = searchParams?.get("ar");
    const dRaw = searchParams?.get("d");
    const kindRaw = searchParams?.get("kind");
    const jobRaw = searchParams?.get("job");
    const uploadRaw = searchParams?.get("upload");

    if (typeof p === "string" && p.trim() && !prompt.trim()) setPrompt(p);
    if (typeof ar === "string" && ["9:16", "16:9", "1:1"].includes(ar)) setAspectRatio(ar);
    if (kindRaw === "image" || kindRaw === "voiceover" || kindRaw === "video") {
      setMode(kindRaw);
    }

    const d = dRaw ? Number(dRaw) : NaN;
    if (Number.isFinite(d) && [4, 6, 8].includes(d)) setDuration(d);

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
    if (p.length < 3) {
      setError(mode === "voiceover" ? "Write voiceover text first." : "Write a prompt first.");
      return;
    }

    setSubmitting(true);
    try {
      let endpoint = "/labs/generate";
      let body: Record<string, any> = {};

      if (mode === "image") {
        endpoint = "/labs/generate/image";
        body = {
          prompt: p,
          aspect_ratio: aspectRatio,
          model: "google",
          style_preset: "photo-real",
        };
      } else if (mode === "voiceover") {
        endpoint = "/labs/generate/voiceover";
        body = {
          script: p,
          model: "google",
          voice_name: voiceName,
          speed_wpm: voiceSpeed,
        };
      } else {
        endpoint = "/labs/generate";
        body = {
          prompt: p,
          aspect_ratio: aspectRatio,
          duration_seconds: duration,
          generation_speed: videoSpeed,
          model: "google",
        };
      }

      const res = await apiFetch<GenerateResponse>(endpoint, {
        method: "POST",
        body,
      });

      const uploadId = Number(res?.upload_id || 0);
      const jobId = Number(res?.job_id || 0);
      if (!uploadId || !jobId) throw new Error("generation_failed");

      const kind = modeToJobKind(mode);
      setActiveUploadId(uploadId);
      setActiveJob({ id: jobId, upload_id: uploadId, kind, status: "queued" } as JobRow);
      setClips([]);

      await refreshJobs();
      await pollJob(jobId, uploadId);
    } catch (err: any) {
      const detail = err?.detail || err?.message || "Could not start generation.";
      const msg = typeof detail === "string" ? detail : "Could not start generation.";
      const low = String(msg || "").toLowerCase();
      const outOfCredits = err?.status === 402 || low.includes("insufficient credits");
      if (outOfCredits) {
        setNeedsBilling(true);
        setError("You’re out of credits. Add more from Pricing to keep generating.");
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
                Create <span className="grad-text">video, image, or voiceover</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                Generate AI assets with one credit system. Keep outputs ready for editing and publishing.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href="/pricing" className="btn-solid-dark text-[12px] px-4 py-2">
                Buy more credits
              </Link>
              <Link href="/app/editor" className="btn-ghost text-[12px] px-4 py-2">
                Open editor
              </Link>
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
          </div>
        </section>

        <section className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="surface rounded-3xl p-6">
              <div className="text-xs text-white/55">• Mode</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["video", "image", "voiceover"] as GenerationMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cx(
                      "rounded-2xl border px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition",
                      mode === m
                        ? "border-white/20 bg-white/12 text-white/90"
                        : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]"
                    )}
                  >
                    {m === "voiceover" ? "Voiceover" : m[0].toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>

              <div className="mt-5 text-xs text-white/55">• Prompt</div>
              <form onSubmit={onGenerate} className="mt-3 grid gap-4">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={mode === "voiceover" ? 9 : 7}
                  placeholder={
                    mode === "voiceover"
                      ? "Example: Welcome to Clipforge Labs. In this tutorial, we’ll generate your first post-ready assets."
                      : mode === "image"
                        ? "Example: A clean product photo of a black sneaker on a reflective studio floor with soft cinematic lighting."
                        : "Example: A cinematic drone shot over a coastal city at sunrise, soft fog, warm light."
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[14px] text-white/90 outline-none placeholder:text-white/35 focus:border-white/20 focus:bg-white/[0.06]"
                />

                {mode !== "voiceover" ? (
                  <div className={cx("grid gap-3", mode === "video" ? "grid-cols-2" : "grid-cols-1")}>
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
                    {mode === "video" ? (
                      <div className="grid gap-3">
                        <div className="grid gap-2">
                          <div className="text-[12px] font-medium text-white/70">Duration</div>
                          <select
                            value={duration}
                            onChange={(e) => setDuration(Number(e.target.value))}
                            className="h-11 rounded-2xl border border-white/10 bg-black/50 px-3 text-[14px] text-white/85 outline-none hover:bg-black/60 focus:border-white/20 focus:bg-black/60"
                          >
                            <option value={4}>Short clip</option>
                            <option value={6}>Standard clip</option>
                            <option value={8}>Extended clip</option>
                          </select>
                        </div>
                        <div className="grid gap-2">
                          <div className="text-[12px] font-medium text-white/70">Generation mode</div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setVideoSpeed("relax")}
                              className={cx(
                                "rounded-xl border px-3 py-2 text-[12px] font-semibold transition",
                                videoSpeed === "relax"
                                  ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                                  : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
                              )}
                            >
                              Relax
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (fastEligible) setVideoSpeed("fast");
                              }}
                              disabled={!fastEligible}
                              className={cx(
                                "rounded-xl border px-3 py-2 text-[12px] font-semibold transition",
                                videoSpeed === "fast"
                                  ? "border-orange-300/45 bg-orange-400/10 text-orange-100"
                                  : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]",
                                !fastEligible && "cursor-not-allowed opacity-50"
                              )}
                              title={fastEligible ? "Fast mode" : "Upgrade to Creator for Fast mode"}
                            >
                              Fast
                            </button>
                          </div>
                          {!fastEligible ? (
                            <div className="text-[11px] text-white/50">
                              Fast mode unlocks on Creator.{" "}
                              <Link href="/pricing" className="text-white/70 underline decoration-white/20 underline-offset-4">
                                Upgrade plan
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <div className="text-[12px] font-medium text-white/70">Voice</div>
                      <input
                        value={voiceName}
                        onChange={(e) => setVoiceName(e.target.value)}
                        className="h-11 rounded-2xl border border-white/10 bg-black/50 px-3 text-[14px] text-white/85 outline-none hover:bg-black/60 focus:border-white/20 focus:bg-black/60"
                        placeholder="en-us"
                      />
                    </div>
                    <div className="grid gap-2">
                      <div className="text-[12px] font-medium text-white/70">Speed (WPM)</div>
                      <input
                        type="number"
                        value={voiceSpeed}
                        min={80}
                        max={260}
                        onChange={(e) => setVoiceSpeed(Number(e.target.value || 165))}
                        className="h-11 rounded-2xl border border-white/10 bg-black/50 px-3 text-[14px] text-white/85 outline-none hover:bg-black/60 focus:border-white/20 focus:bg-black/60"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[12px] text-white/70">
                  <div>
                    Estimated cost: <span className="text-white/90">{estimatedCredits} credits</span>
                    {mode === "voiceover" ? (
                      <span className="ml-2 text-white/55">({textLength.toLocaleString()} chars)</span>
                    ) : null}
                    {mode === "video" ? (
                      <span className="ml-2 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-white/75">
                        {videoSpeed}
                      </span>
                    ) : null}
                  </div>
                  <Link href="/pricing" className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/[0.08]">
                    Buy more credits
                  </Link>
                </div>
                <div className="text-[11px] text-white/52">
                  Cost guide: Relax mode is lower-cost and slower • Fast mode is priority and costs more • Image 4 credits • Voiceover starts at 1 credit / 250 chars.
                </div>

                {error ? (
                  <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-100">
                    <div>{error}</div>
                    {needsBilling ? (
                      <div className="mt-2">
                        <Link href="/pricing" className="text-rose-50/90 underline decoration-rose-200/25 underline-offset-4">
                          Open pricing
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
                  <span className="relative inline-flex items-center justify-center gap-2">
                    {submitting ? "Starting…" : `Generate ${mode === "voiceover" ? "Voiceover" : mode[0].toUpperCase() + mode.slice(1)}`}
                  </span>
                </button>

                <div className="text-[12px] text-white/50">
                  {mode === "voiceover"
                    ? "Tip: keep scripts concise and conversational for clearer voiceover output."
                    : mode === "image"
                      ? "Tip: specify subject, camera angle, lighting, and style for stronger image output."
                      : "Tip: mention camera motion, lighting, and subject in 1-2 sentences for better video output."}
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
                          {(j.prompt || "").trim() ? String(j.prompt) : `Job #${j.id}`}
                        </div>
                        <span className="chip">{prettyStatus(j.status)}</span>
                      </div>
                      <div className="mt-2 text-[12px] text-white/55">
                        {kindLabel(j.kind)} • {j.aspect_ratio || "—"} • {durationPresetLabel(j.duration_seconds)} • Upload #{j.upload_id}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

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
                  {clips.map((c) => {
                    const assetType = detectAssetType(c);
                    return (
                      <div key={c.id} className="grid gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[13px] font-semibold text-white/85">
                            {c.title || `${assetType[0].toUpperCase()}${assetType.slice(1)} #${c.id}`}
                          </div>
                          <a
                            href={`/api/clips/${c.id}/download`}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-white/75 transition hover:bg-white/8 active:scale-[0.99]"
                          >
                            Download
                          </a>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-2">
                          {assetType === "image" ? (
                            <img src={c.url} alt={c.title || `Image ${c.id}`} className="block w-full rounded-xl object-contain" />
                          ) : assetType === "audio" ? (
                            <div className="grid gap-3 rounded-xl border border-white/10 bg-black/30 p-4">
                              <div className="text-[12px] text-white/65">Voiceover preview</div>
                              <audio src={c.url} controls preload="metadata" className="w-full" />
                            </div>
                          ) : (
                            <video src={c.url} controls playsInline preload="metadata" className="block w-full rounded-xl" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[13px] text-white/60">
                  {activeJob?.status === "running" || activeJob?.status === "queued"
                    ? "Generating your asset…"
                    : "Your generated video, image, and voiceover assets will appear here."}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
