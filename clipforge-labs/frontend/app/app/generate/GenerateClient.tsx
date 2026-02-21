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

const RELAX_CREDITS_PER_SECOND = 1;
const FAST_CREDITS_PER_SECOND = 2;
const IMAGE_CREDITS = 4;
const VOICE_CHARS_PER_CREDIT = 250;
const VOICE_MIN_CREDITS = 1;
const VOICE_OPTIONS = [
  { value: "en-US-Neural2-F", label: "Luna (US • Natural female)" },
  { value: "en-US-Neural2-J", label: "Atlas (US • Natural male)" },
  { value: "en-US-Neural2-C", label: "Nova (US • Balanced female)" },
  { value: "en-GB-Neural2-A", label: "Aria (UK • Natural female)" },
  { value: "en-AU-Neural2-A", label: "Kai (AU • Natural male)" },
] as const;

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

function statusTone(status: string) {
  const v = String(status || "").toLowerCase();
  if (v === "running" || v === "queued") return "border-cyan-300/30 bg-cyan-400/10 text-cyan-100";
  if (v === "done") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  if (v === "failed" || v === "canceled") return "border-rose-300/30 bg-rose-400/10 text-rose-100";
  return "border-white/15 bg-white/[0.06] text-white/75";
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

function modeLabel(mode: GenerationMode) {
  if (mode === "voiceover") return "Voiceover";
  return mode[0].toUpperCase() + mode.slice(1);
}

function shortPromptLabel(prompt: string | null | undefined, fallbackId: number): string {
  const value = String(prompt || "").trim();
  if (!value) return `Job #${fallbackId}`;
  if (value.length <= 120) return value;
  return `${value.slice(0, 117).trimEnd()}...`;
}

function durationPresetLabel(durationSeconds: number | null | undefined): string {
  const d = Number(durationSeconds || 0);
  if (!d || d < 1) return "—";
  if (d <= 4) return "Short";
  if (d <= 6) return "Standard";
  return "Extended";
}

function humanizeGenerationError(raw: string | null | undefined): string {
  const msg = String(raw || "").trim();
  if (!msg) return "Generation failed. Please try again.";
  const low = msg.toLowerCase();
  if (
    low.includes("signaturedoesnotmatch") ||
    low.includes("putobject") ||
    low.includes("nocredentialserror")
  ) {
    return "We couldn’t store this output in cloud storage. Please retry in a few seconds.";
  }
  if (low.includes("request failed") || low.includes("provider")) {
    return "The generation provider is temporarily unavailable. Try again shortly.";
  }
  if (low.includes("timeout")) {
    return "This request timed out. Retry with a shorter prompt or try again in a minute.";
  }
  return msg;
}

export default function GenerateClient() {
  const searchParams = useSearchParams();
  const spKey = useMemo(() => (searchParams ? searchParams.toString() : ""), [searchParams]);

  const [mode, setMode] = useState<GenerationMode>("video");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState(6);
  const [videoSpeed, setVideoSpeed] = useState<VideoSpeedMode>("relax");
  const [voiceName, setVoiceName] = useState<string>(VOICE_OPTIONS[0].value);
  const [voiceSpeed, setVoiceSpeed] = useState(165);
  const [currentPlan, setCurrentPlan] = useState("free");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTechnical, setErrorTechnical] = useState<string | null>(null);
  const [needsBilling, setNeedsBilling] = useState(false);

  const [activeJob, setActiveJob] = useState<JobRow | null>(null);
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

  async function pollJob(jobId: number) {
    if (pollTimer.current) window.clearInterval(pollTimer.current);

    async function tick() {
      try {
        const job = await apiFetch<JobRow>(`/jobs/${jobId}`, { method: "GET" });
        setActiveJob(job);
        if (job?.status === "done") {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          pollTimer.current = null;
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
      .then((me) => setCurrentPlan(String(me?.plan || "free")))
      .catch(() => setCurrentPlan("free"));
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
    if (kindRaw === "image" || kindRaw === "voiceover" || kindRaw === "video") setMode(kindRaw);

    const d = dRaw ? Number(dRaw) : NaN;
    if (Number.isFinite(d) && [4, 6, 8].includes(d)) setDuration(d);

    const jobId = jobRaw ? Number(jobRaw) : 0;
    const uploadId = uploadRaw ? Number(uploadRaw) : 0;
    if (jobId > 0 && uploadId > 0) {
      pollJob(jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spKey]);

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorTechnical(null);
    setNeedsBilling(false);

    const p = prompt.trim();
    if (p.length < 3) {
      setError(mode === "voiceover" ? "Write voiceover text first." : "Write a prompt first.");
      return;
    }

    setSubmitting(true);
    try {
      let endpoint = "/labs/generate";
      let body: Record<string, string | number> = {};

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
      setActiveJob({ id: jobId, upload_id: uploadId, kind, status: "queued" } as JobRow);

      await refreshJobs();
      await pollJob(jobId);
    } catch (err: any) {
      const detail = err?.detail || err?.message || "Could not start generation.";
      const msg = typeof detail === "string" ? detail : "Could not start generation.";
      const low = String(msg || "").toLowerCase();
      const outOfCredits = err?.status === 402 || low.includes("insufficient credits");
      if (outOfCredits) {
        setNeedsBilling(true);
        setError("You’re out of credits. Add more from Pricing to continue.");
      } else {
        const friendly = humanizeGenerationError(msg);
        setError(friendly);
        if (friendly !== msg) setErrorTechnical(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const status = activeJob?.status || "";
  const statusLabel = activeJob ? prettyStatus(activeJob.status) : "Idle";

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-[1200px] px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        <section className="surface relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-16 opacity-50 blur-3xl"
            style={{
              background:
                "radial-gradient(300px 180px at 14% 30%, rgba(255,183,3,0.20), transparent 72%), radial-gradient(320px 200px at 88% 35%, rgba(58,134,255,0.18), transparent 74%), radial-gradient(300px 180px at 55% 96%, rgba(251,86,7,0.12), transparent 76%)",
            }}
          />

          <div className="relative grid gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs text-white/55">• Labs Console</div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  <span className="grad-text">Console</span>
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-white/70">
                  Create video, image, and voiceover from one place. Run jobs, monitor status, and export assets.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link href="/pricing" className="btn-solid-dark px-4 py-2 text-xs">
                  Buy more credits
                </Link>
                <Link href="/app/clips" className="btn-ghost px-4 py-2 text-xs">
                  My assets
                </Link>
                <span className={cx("rounded-full border px-3 py-1.5 text-xs font-semibold", statusTone(status))}>
                  {statusLabel}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.08em] text-white/55">Mode</div>
                <div className="mt-1 text-sm font-semibold text-white/90">{modeLabel(mode)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.08em] text-white/55">Estimated cost</div>
                <div className="mt-1 text-sm font-semibold text-white/90">{estimatedCredits} credits</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.08em] text-white/55">Current plan</div>
                <div className="mt-1 text-sm font-semibold text-white/90">{String(currentPlan || "free").toUpperCase()}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.08em] text-white/55">Lane</div>
                <div className="mt-1 text-sm font-semibold text-white/90">
                  {mode === "video" ? (videoSpeed === "fast" ? "Fast" : "Relax") : "Standard"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6">
          <div className="surface rounded-3xl border border-white/10 p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs text-white/55">• Controls</div>
                <div className="mt-1 text-base font-semibold text-white/90">Prompt and rendering settings</div>
                <div className="mt-1 text-xs text-white/55">Configure once, then generate from a single control panel.</div>
              </div>
              <Link href="/app/clips" className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 hover:bg-white/10">
                Open clips library
              </Link>
            </div>

            <form onSubmit={onGenerate} className="mt-5 grid gap-5">
              <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/35 p-1.5">
                {(["video", "image", "voiceover"] as GenerationMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cx(
                      "min-w-[110px] flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
                      mode === m
                        ? "border-white/30 bg-white/18 text-white"
                        : "border-white/12 bg-black/45 text-white/80 hover:bg-white/10"
                    )}
                  >
                    {modeLabel(m)}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-1 2xl:grid-cols-12">
                <div className="grid min-w-0 gap-2 2xl:col-span-7">
                  <label className="text-xs font-medium text-white/70">Prompt</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={mode === "voiceover" ? 10 : 8}
                    placeholder={
                      mode === "voiceover"
                        ? "Write the exact script you want spoken."
                        : mode === "image"
                          ? "Describe subject, angle, lighting, and mood."
                          : "Describe scene, motion, framing, and style in 1–2 lines."
                    }
                    className="w-full rounded-2xl border border-white/12 bg-black/45 px-4 py-3 text-sm text-white/90 outline-none placeholder:text-white/40 focus:border-white/25"
                  />
                  <div className="text-[11px] text-white/50">
                    {mode === "voiceover" ? `${textLength.toLocaleString()} characters` : "Use concise prompts for faster, cleaner results."}
                  </div>
                </div>

                <div className="grid min-w-0 gap-4 2xl:col-span-5">
                  {mode !== "voiceover" ? (
                    mode === "video" ? (
                      <div className="grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2 2xl:grid-cols-2">
                          <div className="grid gap-2">
                            <label className="text-xs font-medium text-white/70">Aspect ratio</label>
                            <select
                              value={aspectRatio}
                              onChange={(e) => setAspectRatio(e.target.value)}
                              className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-white/25"
                            >
                              <option value="9:16">9:16 (Shorts/Reels)</option>
                              <option value="16:9">16:9 (YouTube)</option>
                              <option value="1:1">1:1 (Square)</option>
                            </select>
                          </div>

                          <div className="grid gap-2">
                            <label className="text-xs font-medium text-white/70">Duration</label>
                            <select
                              value={duration}
                              onChange={(e) => setDuration(Number(e.target.value))}
                              className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-white/25"
                            >
                              <option value={4}>Short clip</option>
                              <option value={6}>Standard clip</option>
                              <option value={8}>Extended clip</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <label className="text-xs font-medium text-white/70">Generation mode</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setVideoSpeed("relax")}
                              className={cx(
                                "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                                videoSpeed === "relax"
                                  ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                                  : "border-white/10 bg-black/35 text-white/70 hover:bg-white/8"
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
                                "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                                videoSpeed === "fast"
                                  ? "border-orange-300/45 bg-orange-400/10 text-orange-100"
                                  : "border-white/10 bg-black/35 text-white/70 hover:bg-white/8",
                                !fastEligible && "cursor-not-allowed opacity-55"
                              )}
                              title={fastEligible ? "Fast lane enabled" : "Upgrade to Creator for Fast lane"}
                            >
                              Fast
                            </button>
                          </div>
                          {!fastEligible ? (
                            <div className="text-[11px] text-white/50">
                              Fast lane unlocks on Creator.{" "}
                              <Link href="/pricing" className="underline decoration-white/20 underline-offset-4">
                                Upgrade plan
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        <label className="text-xs font-medium text-white/70">Aspect ratio</label>
                        <select
                          value={aspectRatio}
                          onChange={(e) => setAspectRatio(e.target.value)}
                          className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-white/25"
                        >
                          <option value="9:16">9:16 (Shorts/Reels)</option>
                          <option value="16:9">16:9 (YouTube)</option>
                          <option value="1:1">1:1 (Square)</option>
                        </select>
                      </div>
                    )
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      <div className="grid gap-2">
                        <label className="text-xs font-medium text-white/70">Voice</label>
                        <select
                          value={voiceName}
                          onChange={(e) => setVoiceName(e.target.value)}
                          className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-white/25"
                        >
                          {VOICE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="text-[11px] text-white/50">
                          Human-like neural voices. Pick the one that best matches your brand tone.
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs font-medium text-white/70">Speed (WPM)</label>
                        <input
                          type="number"
                          value={voiceSpeed}
                          min={80}
                          max={260}
                          onChange={(e) => setVoiceSpeed(Number(e.target.value || 165))}
                          className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-white/25"
                        />
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-4 text-xs text-white/70">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        Estimated cost: <span className="font-semibold text-white/90">{estimatedCredits} credits</span>
                      </div>
                      <Link href="/pricing" className="inline-flex w-fit rounded-xl border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/10">
                        Buy more credits
                      </Link>
                    </div>
                    <div className="mt-2 text-[11px] text-white/55">
                      Relax is lower cost and slower. Fast is priority. Image is 4 credits. Voiceover starts at 1 credit per 250 chars.
                    </div>
                  </div>

                  {error ? (
                    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-xs text-rose-100">
                      <div className="font-semibold text-rose-50">Generation issue</div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-rose-100/95">{error}</div>
                      {errorTechnical ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] text-rose-100/80">Show technical details</summary>
                          <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-rose-300/20 bg-black/20 p-2 text-[11px] text-rose-50/85">
                            {errorTechnical}
                          </pre>
                        </details>
                      ) : null}
                      {needsBilling ? (
                        <div className="mt-2">
                          <Link href="/pricing" className="underline decoration-rose-200/30 underline-offset-4">
                            Open pricing
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {activeJob?.status === "failed" && activeJob?.error ? (
                    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-xs text-rose-100">
                      <div className="font-semibold text-rose-50">Latest job failed</div>
                      <div className="mt-1 whitespace-pre-wrap break-words">{humanizeGenerationError(String(activeJob.error))}</div>
                    </div>
                  ) : null}
                </div>
              </div>

              <button
                type="submit"
                disabled={!canGenerate}
                className={cx(
                  "h-12 w-full rounded-2xl border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                  canGenerate
                    ? "border-white/12 bg-white/12 text-white hover:bg-white/18"
                    : "cursor-not-allowed border-white/10 bg-white/[0.06] text-white/45"
                )}
              >
                {submitting ? "Starting generation…" : `Generate ${modeLabel(mode)}`}
              </button>
            </form>
          </div>

          <div className="surface-soft rounded-3xl border border-white/10 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-white/55">• Queue</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Recent generation jobs</div>
              </div>
              <button
                type="button"
                onClick={refreshJobs}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 hover:bg-white/10"
              >
                Refresh
              </button>
            </div>

            {jobs.length ? (
              <div className="mt-4 grid gap-2">
                {jobs.slice(0, 8).map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => {
                      pollJob(j.id);
                    }}
                    className="text-left rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 truncate pr-3 text-sm font-semibold text-white/85">
                        {shortPromptLabel(j.prompt, j.id)}
                      </div>
                      <span className={cx("rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusTone(j.status))}>
                        {prettyStatus(j.status)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-white/55">
                      {kindLabel(j.kind)} • {j.aspect_ratio || "—"} • {durationPresetLabel(j.duration_seconds)} • Upload #{j.upload_id}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-sm text-white/60">
                No generation jobs yet.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
