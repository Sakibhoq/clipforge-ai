// frontend/app/app/generate/GenerateClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type GenerationMode = "post" | "video" | "image" | "voiceover";
type VideoSpeedMode = "relax" | "fast";
type JobKind = "generate" | "generate_image" | "generate_voiceover" | "generate_post";
type StylePreset = "real" | "anime" | "cartoon" | "comic";
type CaptionStylePreset = "bold_center" | "clean_bottom" | "minimal";

type GenerateResponse = {
  upload_id: number;
  job_id: number;
  kind?: string;
  credits_reserved?: number;
  duration_seconds?: number | null;
  text_length?: number | null;
};

type VoicePreviewResponse = {
  voice_name: string;
  content_type: string;
  audio_base64: string;
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

const VIDEO_RELAX_CREDITS_PER_SECOND = 10;
const VIDEO_FAST_CREDITS_PER_SECOND = 12;
const POST_CREDITS_PER_MINUTE = 15;
const IMAGE_CREDITS = 4;
const VOICE_CHARS_PER_CREDIT = 250;
const VOICE_MIN_CREDITS = 1;
const POST_DURATION_SECONDS = 60;
const POST_IMAGE_DEFAULT_COUNT = 10;

const STYLE_PRESET_OPTIONS: Array<{ value: StylePreset; label: string }> = [
  { value: "real", label: "Real" },
  { value: "anime", label: "Anime" },
  { value: "cartoon", label: "Cartoon" },
  { value: "comic", label: "Comic" },
];
const CAPTION_STYLE_OPTIONS: Array<{ value: CaptionStylePreset; label: string; hint: string }> = [
  { value: "bold_center", label: "Bold center", hint: "High contrast, centered lower-third." },
  { value: "clean_bottom", label: "Clean bottom", hint: "Bottom aligned with softer background." },
  { value: "minimal", label: "Minimal", hint: "Smaller clean text with light highlight." },
];

const VOICE_OPTIONS = [
  { value: "en-US-Neural2-F", label: "Luna (US • Natural female)" },
  { value: "en-US-Neural2-J", label: "Atlas (US • Natural male)" },
  { value: "en-US-Neural2-D", label: "Ryder (US • Natural male)" },
  { value: "en-US-Standard-B", label: "Milo (US • Classic male)" },
  { value: "en-US-Standard-D", label: "Theo (US • Classic male)" },
  { value: "en-US-Neural2-C", label: "Nova (US • Balanced female)" },
  { value: "en-GB-Neural2-A", label: "Aria (UK • Natural female)" },
  { value: "en-GB-Standard-B", label: "Felix (UK • Classic male)" },
  { value: "en-GB-Standard-D", label: "Noah (UK • Classic male)" },
  { value: "en-AU-Neural2-A", label: "Kai (AU • Natural male)" },
  { value: "en-AU-Standard-B", label: "Levi (AU • Classic male)" },
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
  if (v === "running" || v === "queued") return "border-amber-300/35 bg-amber-400/12 text-amber-100";
  if (v === "done") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  if (v === "failed" || v === "canceled") return "border-rose-300/30 bg-rose-400/10 text-rose-100";
  return "border-white/15 bg-white/[0.06] text-white/75";
}

function kindLabel(kind: string | undefined) {
  const k = String(kind || "").toLowerCase();
  if (k === "generate_post") return "AI Post";
  if (k === "generate_image") return "Image";
  if (k === "generate_voiceover") return "Voiceover";
  return "Video";
}

function modeToJobKind(mode: GenerationMode): JobKind {
  if (mode === "post") return "generate_post";
  if (mode === "image") return "generate_image";
  if (mode === "voiceover") return "generate_voiceover";
  return "generate";
}

function modeLabel(mode: GenerationMode) {
  if (mode === "post") return "AI Post";
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
  if (d >= 120) return "2 min";
  if (d >= 60) return "1 min";
  if (d <= 4) return "Short";
  if (d <= 8) return "Clip";
  return `${Math.round(d)}s`;
}

function humanizeGenerationError(raw: string | null | undefined): string {
  const msg = String(raw || "").trim();
  if (!msg) return "Generation failed. Please try again.";
  const low = msg.toLowerCase();
  if (
    low.includes("quota exceeded") ||
    low.includes("resourceexhausted") ||
    low.includes("too many requests") ||
    low.includes("429")
  ) {
    return "Generation queue is at provider capacity. Retry in a few minutes.";
  }
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
    return "This request timed out. Retry in a minute.";
  }
  return msg;
}

export default function GenerateClient() {
  const searchParams = useSearchParams();
  const spKey = useMemo(() => (searchParams ? searchParams.toString() : ""), [searchParams]);

  const [mode, setMode] = useState<GenerationMode>("post");

  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState(6);
  const [videoSpeed, setVideoSpeed] = useState<VideoSpeedMode>("relax");
  const [stylePreset, setStylePreset] = useState<StylePreset>("real");

  const [postVisualPrompt, setPostVisualPrompt] = useState("");
  const [postVoiceScript, setPostVoiceScript] = useState("");
  const [postCaptionStylePreset, setPostCaptionStylePreset] = useState<CaptionStylePreset>("bold_center");

  const [voiceName, setVoiceName] = useState<string>(VOICE_OPTIONS[0].value);
  const [voiceSpeed, setVoiceSpeed] = useState(165);
  const [currentPlan, setCurrentPlan] = useState("free");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsBilling, setNeedsBilling] = useState(false);

  const [activeJob, setActiveJob] = useState<JobRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [voicePreviewError, setVoicePreviewError] = useState<string | null>(null);
  const [voicePreviewPlayingKey, setVoicePreviewPlayingKey] = useState<string | null>(null);
  const [voicePreviewSrcByKey, setVoicePreviewSrcByKey] = useState<Record<string, string>>({});

  const pollTimer = useRef<number | null>(null);
  const hydratedFromQuery = useRef(false);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  const textLength = useMemo(() => prompt.trim().length, [prompt]);
  const postVoiceLength = useMemo(() => postVoiceScript.trim().length, [postVoiceScript]);

  const estimatedCredits = useMemo(() => {
    if (mode === "post") {
      return POST_CREDITS_PER_MINUTE;
    }
    if (mode === "image") return IMAGE_CREDITS;
    if (mode === "voiceover") {
      const usage = Math.ceil(Math.max(1, textLength) / VOICE_CHARS_PER_CREDIT);
      return Math.max(VOICE_MIN_CREDITS, usage);
    }
    const perSecond = videoSpeed === "fast" ? VIDEO_FAST_CREDITS_PER_SECOND : VIDEO_RELAX_CREDITS_PER_SECOND;
    return Math.max(1, Number(duration || 0)) * perSecond;
  }, [mode, textLength, duration, videoSpeed]);

  const fastEligible = useMemo(() => {
    const plan = String(currentPlan || "").trim().toLowerCase();
    return plan === "creator" || plan === "studio";
  }, [currentPlan]);

  const canGenerate = useMemo(() => {
    if (submitting) return false;
    if (mode === "post") {
      return postVisualPrompt.trim().length >= 3 && postVoiceScript.trim().length >= 30;
    }
    const p = prompt.trim();
    return p.length >= 3 && p.length <= 12000;
  }, [mode, postVisualPrompt, postVoiceScript, prompt, submitting]);

  function voicePreviewKey(targetVoice: string, targetSpeed: number) {
    return `${targetVoice}::${targetSpeed}`;
  }

  async function playVoicePreview(targetVoice: string) {
    const key = voicePreviewKey(targetVoice, voiceSpeed);
    setVoicePreviewError(null);

    try {
      let src = voicePreviewSrcByKey[key];
      if (!src) {
        const payload = await apiFetch<VoicePreviewResponse>("/labs/voice-preview", {
          method: "POST",
          body: {
            voice_name: targetVoice,
            speed_wpm: voiceSpeed,
          },
        });
        src = `data:${payload.content_type || "audio/mpeg"};base64,${payload.audio_base64 || ""}`;
        setVoicePreviewSrcByKey((prev) => ({ ...prev, [key]: src! }));
      }

      const audio = voicePreviewAudioRef.current;
      if (!audio) return;

      audio.pause();
      audio.src = src;
      audio.currentTime = 0;
      setVoicePreviewPlayingKey(key);
      await audio.play();
    } catch (err: any) {
      setVoicePreviewPlayingKey(null);
      setVoicePreviewError(String(err?.detail || err?.message || "Could not load voice preview."));
    }
  }

  function renderVoiceSelector() {
    const activePreviewKey = voicePreviewKey(voiceName, voiceSpeed);
    const previewLoading = voicePreviewPlayingKey === activePreviewKey;

    return (
      <div className="grid gap-2">
        <label className="text-xs font-medium text-white/70">Voice</label>
        <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/45 p-2.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={voiceName}
              onChange={(e) => {
                setVoiceName(e.target.value);
                setVoicePreviewError(null);
              }}
              className="h-10 w-full rounded-xl border border-white/10 bg-black/55 px-3 text-[12px] text-white/90 outline-none focus:border-white/25"
            >
              {VOICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => playVoicePreview(voiceName)}
              className={cx(
                "h-10 rounded-xl border px-3 text-[11px] font-semibold transition sm:min-w-[92px]",
                previewLoading
                  ? "border-amber-300/40 bg-amber-400/12 text-amber-100"
                  : "border-white/12 bg-white/[0.06] text-white/82 hover:bg-white/[0.12]"
              )}
            >
              {previewLoading ? "Playing…" : "Preview"}
            </button>
          </div>
          <div className="text-[11px] text-white/55">
            Current voice:{" "}
            <span className="font-semibold text-white/88">
              {VOICE_OPTIONS.find((opt) => opt.value === voiceName)?.label || voiceName}
            </span>
          </div>
        </div>

        {voicePreviewError ? (
          <div className="text-[11px] text-rose-200/90">{voicePreviewError}</div>
        ) : (
          <div className="text-[11px] text-white/52">Click Preview to hear each voice before generating.</div>
        )}
      </div>
    );
  }

  async function refreshJobs() {
    try {
      const rows = (await apiFetch<JobRow[]>("/jobs", { method: "GET" })) || [];
      const gen = rows.filter((r) =>
        ["generate", "generate_image", "generate_voiceover", "generate_post"].includes(String(r?.kind || ""))
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
        if (job?.status === "done" || job?.status === "failed" || job?.status === "canceled") {
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
    const voicePreviewAudio = voicePreviewAudioRef.current;
    refreshJobs();
    apiFetch<{ plan?: string }>("/auth/me", { method: "GET" })
      .then((me) => setCurrentPlan(String(me?.plan || "free")))
      .catch(() => setCurrentPlan("free"));
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      if (voicePreviewAudio) {
        voicePreviewAudio.pause();
        voicePreviewAudio.removeAttribute("src");
      }
    };
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
    if (typeof p === "string" && p.trim() && !postVisualPrompt.trim()) setPostVisualPrompt(p);
    if (typeof ar === "string" && ["9:16", "16:9", "1:1"].includes(ar)) setAspectRatio(ar);
    if (kindRaw === "image" || kindRaw === "voiceover" || kindRaw === "video" || kindRaw === "post") {
      setMode(kindRaw);
    }

    const d = dRaw ? Number(dRaw) : NaN;
    if (Number.isFinite(d) && [4, 6, 8].includes(d)) setDuration(d);

    const jobId = jobRaw ? Number(jobRaw) : 0;
    const uploadId = uploadRaw ? Number(uploadRaw) : 0;
    if (jobId > 0 && uploadId > 0) {
      pollJob(jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spKey]);

  const selectedCaptionStyleHint = useMemo(() => {
    return CAPTION_STYLE_OPTIONS.find((opt) => opt.value === postCaptionStylePreset)?.hint || "";
  }, [postCaptionStylePreset]);

  async function startGeneration() {
    setError(null);
    setNeedsBilling(false);

    const p = prompt.trim();
    const postPrompt = postVisualPrompt.trim();
    const postScript = postVoiceScript.trim();

    if (mode === "post") {
      if (postPrompt.length < 3) {
        setError("Describe the visual story first.");
        return;
      }
      if (postScript.length < 30) {
        setError("Write at least a short voiceover script (30+ characters).");
        return;
      }
    } else if (p.length < 3) {
      setError(mode === "voiceover" ? "Write voiceover text first." : "Write a prompt first.");
      return;
    }

    setSubmitting(true);
    try {
      let endpoint = "/labs/generate";
      let body: Record<string, string | number> = {};

      if (mode === "post") {
        endpoint = "/labs/generate/post";
        body = {
          visual_prompt: postPrompt,
          voice_script: postScript,
          aspect_ratio: aspectRatio,
          duration_seconds: POST_DURATION_SECONDS,
          image_count: POST_IMAGE_DEFAULT_COUNT,
          model: "google",
          voice_name: voiceName,
          style_preset: stylePreset,
          caption_style_preset: postCaptionStylePreset,
        };
      } else if (mode === "image") {
        endpoint = "/labs/generate/image";
        body = {
          prompt: p,
          aspect_ratio: aspectRatio,
          model: "google",
          style_preset: stylePreset,
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
          style_preset: stylePreset,
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
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    await startGeneration();
  }

  const status = activeJob?.status || "";
  const statusLabel = activeJob ? prettyStatus(activeJob.status) : "";

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-[1100px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <form onSubmit={onGenerate} className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
          <section className="surface relative overflow-hidden rounded-3xl border border-[#fb560740] p-5 sm:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-12 opacity-35 blur-3xl"
              style={{
                background:
                  "radial-gradient(520px 260px at 18% 16%, rgba(255,183,3,0.22), transparent 72%), radial-gradient(520px 260px at 88% 18%, rgba(251,86,7,0.18), transparent 72%)",
              }}
            />

            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">Generate Clips</h1>
                  <p className="mt-1 text-sm text-white/65">
                    Fast one-minute AI posts. For longer videos, generate images and finish in the editor.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href="/app/clips?editor=1" className="btn-aurora px-4 py-2 text-xs">
                    Open editor
                  </Link>
                  <Link
                    href="/app/clips"
                    className="inline-flex items-center rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white/82 transition hover:bg-white/[0.10]"
                  >
                    Clips library
                  </Link>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/35 p-1.5 sm:flex sm:flex-wrap">
                {(["post", "video", "image", "voiceover"] as GenerationMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cx(
                      "w-full min-w-0 rounded-xl border px-3 py-2.5 text-sm font-semibold transition sm:min-w-[110px] sm:flex-1",
                      mode === m
                        ? "border-amber-300/35 bg-amber-500/12 text-amber-100"
                        : "border-white/12 bg-black/45 text-white/80 hover:bg-white/10"
                    )}
                  >
                    {modeLabel(m)}
                  </button>
                ))}
              </div>

              {activeJob ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className={cx("rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusTone(status))}>
                    {statusLabel}
                  </span>
                  <span className="text-xs text-white/60">Latest job #{activeJob.id}</span>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3">
                {mode === "post" ? (
                  <>
                    <label className="text-xs font-medium text-white/70">Visual direction</label>
                    <textarea
                      value={postVisualPrompt}
                      onChange={(e) => setPostVisualPrompt(e.target.value)}
                      rows={7}
                      placeholder="Describe shots, scene style, camera behavior, and pacing."
                      className="w-full rounded-2xl border border-white/12 bg-black/45 px-4 py-3 text-sm text-white/90 outline-none placeholder:text-white/40 focus:border-amber-300/30"
                    />

                    <label className="mt-1 text-xs font-medium text-white/70">Voiceover script</label>
                    <textarea
                      value={postVoiceScript}
                      onChange={(e) => setPostVoiceScript(e.target.value)}
                      rows={8}
                      placeholder="Write the narration for your 1-minute clip."
                      className="w-full rounded-2xl border border-white/12 bg-black/45 px-4 py-3 text-sm text-white/90 outline-none placeholder:text-white/40 focus:border-amber-300/30"
                    />
                    <div className="text-[11px] text-white/50">{postVoiceLength.toLocaleString()} characters</div>

                    <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-3 text-[11px] text-amber-100/90">
                      Need longer than 1 minute? Use Image mode and complete timing/transitions in editor.
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setMode("image")}
                          className="rounded-lg border border-amber-200/25 bg-black/35 px-2.5 py-1 font-semibold text-amber-100/90 hover:bg-black/45"
                        >
                          Switch to Image mode
                        </button>
                        <Link
                          href="/app/clips?editor=1"
                          className="rounded-lg border border-amber-200/25 bg-black/35 px-2.5 py-1 font-semibold text-amber-100/90 hover:bg-black/45"
                        >
                          Open editor
                        </Link>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="text-xs font-medium text-white/70">Prompt</label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={mode === "voiceover" ? 10 : 8}
                      placeholder={
                        mode === "voiceover"
                          ? "Write the exact script you want spoken."
                          : mode === "image"
                            ? "Describe subject, lighting, lens, and mood."
                            : "Describe the shot, motion, and final style in one concise prompt."
                      }
                      className="w-full rounded-2xl border border-white/12 bg-black/45 px-4 py-3 text-sm text-white/90 outline-none placeholder:text-white/40 focus:border-amber-300/30"
                    />
                    <div className="text-[11px] text-white/50">
                      {mode === "voiceover"
                        ? `${textLength.toLocaleString()} characters`
                        : "Keep prompts short and specific for cleaner output."}
                    </div>
                  </>
                )}
              </div>

              {error ? (
                <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-xs text-rose-100">
                  <div className="font-semibold text-rose-50">Generation issue</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-rose-100/95">{error}</div>
                  {needsBilling ? (
                    <div className="mt-2">
                      <Link href="/pricing" className="underline decoration-rose-200/30 underline-offset-4">
                        Open pricing
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-3 text-xs text-white/70">
                  Estimated cost: <span className="font-semibold text-white/90">{estimatedCredits} credits</span>
                </div>
                <button
                  type="submit"
                  disabled={!canGenerate}
                  className={cx(
                    "h-12 rounded-2xl border px-6 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/25",
                    canGenerate
                      ? "border-amber-300/35 bg-amber-500/14 text-amber-100 hover:bg-amber-500/22"
                      : "cursor-not-allowed border-white/10 bg-white/[0.06] text-white/45"
                  )}
                >
                  {submitting ? "Starting generation..." : `Generate ${modeLabel(mode)}`}
                </button>
              </div>
            </div>
          </section>

          <aside className="grid gap-4">
            <div className="surface-soft rounded-3xl border border-[#fb560740] p-5">
              <div className="text-sm font-semibold text-white/88">Settings</div>
              <div className="mt-3 grid gap-3">
                {(mode === "post" || mode === "video" || mode === "image") ? (
                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-white/70">Aspect ratio</label>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-amber-300/30"
                    >
                      <option value="9:16">9:16 (Shorts/Reels/TikTok)</option>
                      <option value="16:9">16:9 (Landscape)</option>
                      <option value="1:1">1:1 (Square)</option>
                    </select>
                  </div>
                ) : null}

                {(mode === "post" || mode === "video" || mode === "image") ? (
                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-white/70">Style</label>
                    <select
                      value={stylePreset}
                      onChange={(e) => setStylePreset(e.target.value as StylePreset)}
                      className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-amber-300/30"
                    >
                      {STYLE_PRESET_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {mode === "post" ? (
                  <>
                    <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-3 text-[11px] text-amber-100/90">
                      AI Post is fixed to 1 minute. Backend retries automatically with 10 → 8 → 6 scenes when capacity is tight.
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-medium text-white/70">Caption style</label>
                      <select
                        value={postCaptionStylePreset}
                        onChange={(e) => setPostCaptionStylePreset(e.target.value as CaptionStylePreset)}
                        className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-amber-300/30"
                      >
                        {CAPTION_STYLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className="text-[11px] text-white/55">{selectedCaptionStyleHint}</div>
                    </div>
                    {renderVoiceSelector()}
                    <div className="rounded-2xl border border-white/12 bg-black/35 p-3 text-[11px] text-white/65">
                      Voice speed is auto-calculated to match 60-second delivery.
                    </div>
                  </>
                ) : null}

                {mode === "video" ? (
                  <>
                    <div className="grid gap-2">
                      <label className="text-xs font-medium text-white/70">Duration</label>
                      <select
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-amber-300/30"
                      >
                        <option value={4}>4 seconds</option>
                        <option value={6}>6 seconds</option>
                        <option value={8}>8 seconds</option>
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-medium text-white/70">Generation lane</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setVideoSpeed("relax")}
                          className={cx(
                            "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                            videoSpeed === "relax"
                              ? "border-amber-300/35 bg-amber-500/12 text-amber-100"
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
                    </div>
                  </>
                ) : null}

                {mode === "voiceover" ? (
                  <>
                    {renderVoiceSelector()}
                    <div className="grid gap-2">
                      <label className="text-xs font-medium text-white/70">Speed (WPM)</label>
                      <input
                        type="number"
                        value={voiceSpeed}
                        min={80}
                        max={260}
                        onChange={(e) => setVoiceSpeed(Number(e.target.value || 165))}
                        className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-amber-300/30"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="surface-soft rounded-3xl border border-[#fb560740] p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white/88">Queue</div>
                <button
                  type="button"
                  onClick={refreshJobs}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 hover:bg-white/10"
                >
                  Refresh
                </button>
              </div>

              {jobs.length ? (
                <div className="mt-3 grid gap-2">
                  {jobs.slice(0, 4).map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => {
                        pollJob(j.id);
                      }}
                      className="text-left rounded-2xl border border-white/10 bg-white/[0.02] p-3 transition hover:bg-white/[0.06]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-sm font-semibold text-white/85">{shortPromptLabel(j.prompt, j.id)}</div>
                        <span className={cx("rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusTone(j.status))}>
                          {prettyStatus(j.status)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-white/55">
                        {kindLabel(j.kind)} • {durationPresetLabel(j.duration_seconds)}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-center text-sm text-white/60">
                  No generation jobs yet.
                </div>
              )}
            </div>
          </aside>
        </form>
        <audio
          ref={voicePreviewAudioRef}
          onEnded={() => setVoicePreviewPlayingKey(null)}
          onPause={() => setVoicePreviewPlayingKey((prev) => (prev ? null : prev))}
          className="hidden"
          preload="none"
        />
      </main>
    </div>
  );
}
