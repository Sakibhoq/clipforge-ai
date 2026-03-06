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

type PromptHelperResponse = {
  title: string;
  visual_prompt: string;
  voice_script: string;
  aspect_ratio: string;
  duration_seconds: number;
  style_preset: string;
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
  settings?: Record<string, unknown> | null;
  created_at?: string;
};

type JobSettings = {
  visual_prompt?: string;
  voice_script?: string;
  voice_name?: string;
  speed_wpm?: number;
  style_preset?: string;
  caption_style_preset?: string;
  generation_speed?: string;
  watermark_enabled?: boolean;
  captions_enabled?: boolean;
};

const CREDIT_USD_VALUE = 0.10;
const VIDEO_REAL_USD_PER_SECOND = 0.50;
const VIDEO_LOW_COST_USD_PER_SECOND = 0.10;
const VIDEO_HD_MARKUP = 2.7;
const VIDEO_4K_MARKUP = 3.0;
const IMAGE_REAL_USD_PER_IMAGE = 0.04;
const IMAGE_LOW_COST_USD_PER_IMAGE = 0.02;
const IMAGE_MARKUP = 6.0;
const VOICE_WORDS_PER_CREDIT = 300;
const VOICE_MIN_CREDITS = 1;
const VOICE_BASE_WPM = 165;
const POST_MAX_AUTO_WPM = 210;
const POST_DURATION_SECONDS = 60;
const POST_IMAGE_DEFAULT_COUNT = 10;
const VIDEO_DURATION_OPTIONS: number[] = [4, 6, 8, 10, 12];
const POST_DURATION_OPTIONS: number[] = [60, 90, 120];
const LOW_COST_STYLES = new Set<StylePreset>(["anime", "cartoon", "comic"]);
const VOICE_SPEED_OPTIONS = [
  { value: 0.5, label: "0.5x" },
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "1x" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
  { value: 2, label: "2x" },
] as const;

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

const STYLE_PRESET_VALUES = new Set<StylePreset>(STYLE_PRESET_OPTIONS.map((opt) => opt.value));
const CAPTION_STYLE_VALUES = new Set<CaptionStylePreset>(CAPTION_STYLE_OPTIONS.map((opt) => opt.value));
const VOICE_VALUES = new Set<string>(VOICE_OPTIONS.map((opt) => opt.value));

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
  if (d >= 90) return "1.5 min";
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
  if (low.includes("insufficient credits")) {
    return "You don’t have enough credits for this generation.";
  }
  return msg;
}

function generationRecoveryAction(raw: string | null | undefined): string {
  const msg = String(raw || "").trim();
  const low = msg.toLowerCase();

  if (
    low.includes("quota exceeded") ||
    low.includes("resourceexhausted") ||
    low.includes("too many requests") ||
    low.includes("429") ||
    low.includes("provider capacity")
  ) {
    return "Wait 2-5 minutes, then retry the same prompt.";
  }
  if (
    low.includes("signaturedoesnotmatch") ||
    low.includes("putobject") ||
    low.includes("nocredentialserror")
  ) {
    return "Retry in 1 minute. If it repeats, check storage credentials/config.";
  }
  if (low.includes("insufficient credits")) {
    return "Open Pricing, add credits, then run again.";
  }
  if (low.includes("timeout")) {
    return "Retry now. If it repeats, simplify the prompt and try again.";
  }
  if (low.includes("voiceover") || low.includes("tts")) {
    return "Try a different voice or shorten the voiceover script, then retry.";
  }
  if (low.includes("unsupported") || low.includes("invalid") || low.includes("must be")) {
    return "Adjust the requested settings to valid values and retry.";
  }
  if (low.includes("canceled")) {
    return "Start a new generation when ready.";
  }
  return "Retry once. If it fails again, slightly simplify prompt details and try again.";
}

function conciseError(raw: string | null | undefined, maxChars = 170): string {
  const msg = humanizeGenerationError(raw);
  if (msg.length <= maxChars) return msg;
  return `${msg.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function speedMultiplierToWpm(multiplier: number): number {
  return Math.max(80, Math.min(330, Math.round(VOICE_BASE_WPM * multiplier)));
}

function creditsFromUsd(usd: number): number {
  return Math.max(1, Math.ceil(Math.max(0, usd) / CREDIT_USD_VALUE));
}

function isLowCostStyle(stylePreset: StylePreset): boolean {
  return LOW_COST_STYLES.has(stylePreset);
}

function estimateImageCredits(stylePreset: StylePreset): number {
  const base = isLowCostStyle(stylePreset) ? IMAGE_LOW_COST_USD_PER_IMAGE : IMAGE_REAL_USD_PER_IMAGE;
  return creditsFromUsd(base * IMAGE_MARKUP);
}

function estimateVideoCreditsPerSecond(speed: VideoSpeedMode, stylePreset: StylePreset): number {
  const base = isLowCostStyle(stylePreset) ? VIDEO_LOW_COST_USD_PER_SECOND : VIDEO_REAL_USD_PER_SECOND;
  const markup = speed === "fast" ? VIDEO_4K_MARKUP : VIDEO_HD_MARKUP;
  return creditsFromUsd(base * markup);
}

function estimateVoiceCredits(wordCount: number): number {
  const usage = Math.ceil(Math.max(1, wordCount) / VOICE_WORDS_PER_CREDIT);
  return Math.max(VOICE_MIN_CREDITS, usage);
}

function estimatePostCredits(imageCount: number, voiceWordCount: number, stylePreset: StylePreset): number {
  return imageCount * estimateImageCredits(stylePreset) + estimateVoiceCredits(voiceWordCount);
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function estimateSpeechSeconds(words: number, wpm: number): number {
  if (!words || !wpm) return 0;
  return (words / wpm) * 60;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function wpmToSpeedMultiplier(wpm: number): number {
  const normalized = Math.max(80, Math.min(330, Number(wpm || VOICE_BASE_WPM))) / VOICE_BASE_WPM;
  let closest: number = VOICE_SPEED_OPTIONS[0].value;
  let bestDistance = Math.abs(normalized - closest);
  for (const opt of VOICE_SPEED_OPTIONS) {
    const distance = Math.abs(normalized - opt.value);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = opt.value;
    }
  }
  return closest;
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
  const [postIdeaSeed, setPostIdeaSeed] = useState("");
  const [postIdeaLoading, setPostIdeaLoading] = useState(false);
  const [postIdeaError, setPostIdeaError] = useState<string | null>(null);
  const [postDurationSeconds, setPostDurationSeconds] = useState<number>(POST_DURATION_SECONDS);
  const [postCaptionStylePreset, setPostCaptionStylePreset] = useState<CaptionStylePreset>("bold_center");
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);

  const [voiceName, setVoiceName] = useState<string>(VOICE_OPTIONS[0].value);
  const [voiceSpeedMultiplier, setVoiceSpeedMultiplier] = useState<number>(1);
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
  const voiceWordCount = useMemo(() => countWords(prompt), [prompt]);
  const postVoiceLength = useMemo(() => postVoiceScript.trim().length, [postVoiceScript]);
  const voiceSpeedWpm = useMemo(() => speedMultiplierToWpm(voiceSpeedMultiplier), [voiceSpeedMultiplier]);
  const postWordCount = useMemo(() => countWords(postVoiceScript), [postVoiceScript]);
  const postEstimateAt1xSeconds = useMemo(
    () => estimateSpeechSeconds(postWordCount, VOICE_BASE_WPM),
    [postWordCount]
  );
  const postAutoSpeedWpm = useMemo(() => {
    if (postEstimateAt1xSeconds <= postDurationSeconds) return VOICE_BASE_WPM;
    const required = Math.ceil((postWordCount * 60) / postDurationSeconds);
    return Math.max(VOICE_BASE_WPM, Math.min(POST_MAX_AUTO_WPM, required));
  }, [postWordCount, postEstimateAt1xSeconds, postDurationSeconds]);
  const postEstimateAppliedSeconds = useMemo(
    () => estimateSpeechSeconds(postWordCount, postAutoSpeedWpm),
    [postWordCount, postAutoSpeedWpm]
  );
  const postNeedsMoreWords = useMemo(
    () => postEstimateAt1xSeconds > 0 && postEstimateAt1xSeconds < postDurationSeconds * 0.8,
    [postEstimateAt1xSeconds, postDurationSeconds]
  );
  const postWillAutoSpeed = useMemo(() => postAutoSpeedWpm > VOICE_BASE_WPM, [postAutoSpeedWpm]);
  const lowCostStyleSelected = useMemo(() => isLowCostStyle(stylePreset), [stylePreset]);
  const normalizedPlan = useMemo(() => String(currentPlan || "free").trim().toLowerCase(), [currentPlan]);
  const postPlanMaxDuration = useMemo(() => {
    const caps: Record<string, number> = { free: 60, free_trial: 60, trial: 60, starter: 120, creator: 120, studio: 120 };
    return caps[normalizedPlan] ?? 60;
  }, [normalizedPlan]);
  const postDurationOptions = useMemo(
    () => (lowCostStyleSelected ? [...POST_DURATION_OPTIONS] : [POST_DURATION_SECONDS]).filter((value) => value <= postPlanMaxDuration),
    [lowCostStyleSelected, postPlanMaxDuration]
  );
  const maxVideoDuration = useMemo(() => {
    const extended = lowCostStyleSelected || videoSpeed === "fast";
    const hdCaps: Record<string, number> = { free: 4, free_trial: 4, trial: 4, starter: 6, creator: 8, studio: 8 };
    const extendedCaps: Record<string, number> = { free: 4, free_trial: 4, trial: 4, starter: 8, creator: 12, studio: 12 };
    const fallback = extended ? 4 : 4;
    const table = extended ? extendedCaps : hdCaps;
    return table[normalizedPlan] ?? fallback;
  }, [normalizedPlan, lowCostStyleSelected, videoSpeed]);
  const videoDurationOptions = useMemo(() => VIDEO_DURATION_OPTIONS.filter((d) => d <= maxVideoDuration), [maxVideoDuration]);

  const estimatedCredits = useMemo(() => {
    if (mode === "post") {
      return estimatePostCredits(POST_IMAGE_DEFAULT_COUNT, postWordCount, stylePreset);
    }
    if (mode === "image") return estimateImageCredits(stylePreset);
    if (mode === "voiceover") {
      return estimateVoiceCredits(voiceWordCount);
    }
    const perSecond = estimateVideoCreditsPerSecond(videoSpeed, stylePreset);
    return Math.max(1, Number(duration || 0)) * perSecond;
  }, [mode, postWordCount, stylePreset, voiceWordCount, duration, videoSpeed]);

  const fastEligible = useMemo(() => {
    const plan = String(currentPlan || "").trim().toLowerCase();
    return plan === "creator" || plan === "studio";
  }, [currentPlan]);
  const freeTrialWatermarkLocked = useMemo(() => {
    const plan = String(currentPlan || "").trim().toLowerCase();
    return plan === "free" || plan === "free_trial" || plan === "trial";
  }, [currentPlan]);

  const canGenerate = useMemo(() => {
    if (submitting) return false;
    if (mode === "post") {
      return postVisualPrompt.trim().length >= 3 && postVoiceScript.trim().length >= 30;
    }
    const p = prompt.trim();
    return p.length >= 3 && p.length <= 12000;
  }, [mode, postVisualPrompt, postVoiceScript, prompt, submitting]);

  useEffect(() => {
    if (!postDurationOptions.includes(postDurationSeconds)) {
      setPostDurationSeconds(postDurationOptions[0]);
    }
  }, [postDurationOptions, postDurationSeconds]);

  useEffect(() => {
    if (!videoDurationOptions.includes(duration)) {
      setDuration(videoDurationOptions[videoDurationOptions.length - 1] || 4);
    }
  }, [videoDurationOptions, duration]);

  function hydrateFormFromJob(job: JobRow) {
    const kind = String(job?.kind || "").toLowerCase();
    const settings: JobSettings =
      job?.settings && typeof job.settings === "object" ? (job.settings as JobSettings) : {};

    const aspect = typeof job.aspect_ratio === "string" ? job.aspect_ratio : null;
    if (aspect && ["9:16", "16:9", "1:1"].includes(aspect)) {
      setAspectRatio(aspect);
    }

    const stylePreset = typeof settings.style_preset === "string" ? settings.style_preset : "";
    if (STYLE_PRESET_VALUES.has(stylePreset as StylePreset)) {
      setStylePreset(stylePreset as StylePreset);
    }

    const voice = typeof settings.voice_name === "string" ? settings.voice_name : "";
    if (voice && VOICE_VALUES.has(voice)) {
      setVoiceName(voice);
    }
    if (freeTrialWatermarkLocked) {
      setWatermarkEnabled(true);
    } else if (typeof settings.watermark_enabled === "boolean") {
      setWatermarkEnabled(settings.watermark_enabled);
    }

    if (kind === "generate_post") {
      setMode("post");
      setPostVisualPrompt(typeof settings.visual_prompt === "string" ? settings.visual_prompt : String(job.prompt || ""));
      setPostVoiceScript(typeof settings.voice_script === "string" ? settings.voice_script : "");
      const postDurationRaw =
        typeof job.duration_seconds === "number" ? job.duration_seconds : Number.parseInt(String(job.duration_seconds || ""), 10);
      if (Number.isFinite(postDurationRaw) && [60, 90, 120].includes(postDurationRaw)) {
        setPostDurationSeconds(postDurationRaw);
      }

      const captionPreset = typeof settings.caption_style_preset === "string" ? settings.caption_style_preset : "";
      if (CAPTION_STYLE_VALUES.has(captionPreset as CaptionStylePreset)) {
        setPostCaptionStylePreset(captionPreset as CaptionStylePreset);
      }
      return;
    }

    const promptText = String(job.prompt || "");
    setPrompt(promptText);

    if (kind === "generate_image") {
      setMode("image");
      return;
    }

    if (kind === "generate_voiceover") {
      setMode("voiceover");
      const speedWpm =
        typeof settings.speed_wpm === "number"
          ? settings.speed_wpm
          : Number.parseFloat(String(settings.speed_wpm || ""));
      if (Number.isFinite(speedWpm) && speedWpm > 0) {
        setVoiceSpeedMultiplier(wpmToSpeedMultiplier(speedWpm));
      }
      return;
    }

    setMode("video");
    const durationSeconds =
      typeof job.duration_seconds === "number" ? job.duration_seconds : Number.parseInt(String(job.duration_seconds || ""), 10);
    if (Number.isFinite(durationSeconds) && [4, 6, 8, 10, 12].includes(durationSeconds)) {
      setDuration(durationSeconds);
    }
    const generationSpeed = typeof settings.generation_speed === "string" ? settings.generation_speed : "";
    if (generationSpeed === "relax" || generationSpeed === "fast") {
      setVideoSpeed(generationSpeed);
    } else if (generationSpeed === "hd" || generationSpeed === "standard") {
      setVideoSpeed("relax");
    } else if (generationSpeed === "4k" || generationSpeed === "uhd") {
      setVideoSpeed("fast");
    }
  }

  async function openJobFromQueue(summary: JobRow) {
    setError(null);
    setNeedsBilling(false);
    let target = summary;
    try {
      target = await apiFetch<JobRow>(`/jobs/${summary.id}`, { method: "GET" });
    } catch {
      // keep summary fallback when details fail
    }
    hydrateFormFromJob(target);
    await pollJob(target.id);
  }

  function voicePreviewKey(targetVoice: string, targetSpeedWpm: number) {
    return `${targetVoice}::${targetSpeedWpm}`;
  }

  async function playVoicePreview(targetVoice: string, targetSpeedWpm: number) {
    const key = voicePreviewKey(targetVoice, targetSpeedWpm);
    setVoicePreviewError(null);

    try {
      let src = voicePreviewSrcByKey[key];
      if (!src) {
        const payload = await apiFetch<VoicePreviewResponse>("/labs/voice-preview", {
          method: "POST",
          body: {
            voice_name: targetVoice,
            speed_wpm: targetSpeedWpm,
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

  function renderVoiceSelector(previewSpeedWpm: number) {
    const activePreviewKey = voicePreviewKey(voiceName, previewSpeedWpm);
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
              onClick={() => playVoicePreview(voiceName, previewSpeedWpm)}
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
    if (freeTrialWatermarkLocked) {
      setWatermarkEnabled(true);
    }
  }, [freeTrialWatermarkLocked]);

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
    if (Number.isFinite(d) && [4, 6, 8, 10, 12].includes(d)) setDuration(d);

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
      let body: Record<string, string | number | boolean> = {};

      if (mode === "post") {
        endpoint = "/labs/generate/post";
        body = {
          visual_prompt: postPrompt,
          voice_script: postScript,
          aspect_ratio: aspectRatio,
          duration_seconds: postDurationSeconds,
          image_count: POST_IMAGE_DEFAULT_COUNT,
          model: "google",
          voice_name: voiceName,
          style_preset: stylePreset,
          caption_style_preset: postCaptionStylePreset,
          captions_enabled: true,
          watermark_enabled: freeTrialWatermarkLocked ? true : watermarkEnabled,
        };
      } else if (mode === "image") {
        endpoint = "/labs/generate/image";
        body = {
          prompt: p,
          aspect_ratio: aspectRatio,
          model: "google",
          style_preset: stylePreset,
          watermark_enabled: freeTrialWatermarkLocked ? true : watermarkEnabled,
        };
      } else if (mode === "voiceover") {
        endpoint = "/labs/generate/voiceover";
        body = {
          script: p,
          model: "google",
          voice_name: voiceName,
          speed_wpm: voiceSpeedWpm,
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
          watermark_enabled: freeTrialWatermarkLocked ? true : watermarkEnabled,
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

  async function generatePostPromptPack() {
    const idea = postIdeaSeed.trim();
    if (idea.length < 3) {
      setPostIdeaError("Share a short idea first.");
      return;
    }
    setPostIdeaLoading(true);
    setPostIdeaError(null);
    try {
      const res = await apiFetch<PromptHelperResponse>("/labs/prompt-helper", {
        method: "POST",
        body: {
          idea,
          style_preset: stylePreset,
          aspect_ratio: aspectRatio,
          duration_seconds: postDurationSeconds,
        },
      });
      const visual = String(res?.visual_prompt || "").trim();
      const voice = String(res?.voice_script || "").trim();
      if (!visual || !voice) {
        throw new Error("Prompt helper returned an empty result.");
      }
      setPostVisualPrompt(visual);
      setPostVoiceScript(voice);
    } catch (err: any) {
      const detail = String(err?.detail || err?.message || "Could not generate a prompt pack.");
      setPostIdeaError(detail);
    } finally {
      setPostIdeaLoading(false);
    }
  }

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    await startGeneration();
  }

  const status = activeJob?.status || "";
  const statusLabel = activeJob ? prettyStatus(activeJob.status) : "";
  const activeJobFailed = !!activeJob && (status === "failed" || status === "canceled");
  const activeJobFailureReason = activeJobFailed ? humanizeGenerationError(activeJob?.error || "") : "";
  const activeJobFailureAction = activeJobFailed ? generationRecoveryAction(activeJob?.error || "") : "";

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-[1100px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <form onSubmit={onGenerate} className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
          <section className="surface relative flex min-h-[760px] flex-col overflow-hidden rounded-3xl border border-[#fb560740] p-5 sm:p-6 xl:min-h-[860px]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-12 opacity-35 blur-3xl"
              style={{
                background:
                  "radial-gradient(520px 260px at 18% 16%, rgba(255,183,3,0.22), transparent 72%), radial-gradient(520px 260px at 88% 18%, rgba(251,86,7,0.18), transparent 72%)",
              }}
            />

            <div className="relative flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">Generate Clips</h1>
                  <p className="mt-1 text-sm text-white/65">Create ready-to-post clips with image, video, and voice generation.</p>
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

              {activeJobFailed ? (
                <div className="mt-3 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
                  <div className="font-semibold text-rose-50">Latest job failed</div>
                  <div className="mt-1 text-rose-100/95">{activeJobFailureReason}</div>
                  <div className="mt-2 text-rose-100/90">
                    What to do: <span className="font-semibold">{activeJobFailureAction}</span>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid flex-1 gap-3">
                {mode === "post" ? (
                  <>
                    <div className="group relative overflow-hidden rounded-3xl border border-[#fb56075f] bg-black/35 p-4 sm:p-5">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -left-24 -top-20 h-44 w-44 rounded-full opacity-65 blur-3xl animate-pulse"
                        style={{ background: "radial-gradient(circle, rgba(251,86,7,0.45) 0%, rgba(251,86,7,0) 72%)" }}
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -bottom-24 right-0 h-56 w-56 rounded-full opacity-55 blur-3xl animate-pulse"
                        style={{ background: "radial-gradient(circle, rgba(58,134,255,0.33) 0%, rgba(58,134,255,0) 74%)" }}
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(138deg, rgba(251,86,7,0.10) 0%, rgba(255,183,3,0.07) 32%, rgba(58,134,255,0.07) 64%, rgba(2,8,23,0.60) 100%)",
                        }}
                      />

                      <div className="relative">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ffbe6a]/90">Prompt Assistant</div>
                            <div className="mt-1 text-base font-semibold text-white sm:text-lg">
                              Don&apos;t have a prompt? Just tell me what you&apos;re thinking.
                            </div>
                            <p className="mt-1 text-xs text-white/68">
                              You type the idea. Clipforge returns a ready-to-paste visual direction and matching voiceover script.
                            </p>
                          </div>
                          <span className="rounded-full border border-[#fb560770] bg-[#fb56071a] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ffbe6a]">
                            AI
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2">
                          <label className="text-xs font-medium text-white/72">Idea brief</label>
                          <textarea
                            value={postIdeaSeed}
                            onChange={(e) => {
                              setPostIdeaSeed(e.target.value);
                              if (postIdeaError) setPostIdeaError(null);
                            }}
                            rows={4}
                            placeholder="Example: I want a motivational gym comeback story with anime style and strong scene-by-scene pacing."
                            className="min-h-[120px] w-full resize-y rounded-2xl border border-white/12 bg-black/50 px-4 py-3 text-sm text-white/92 outline-none placeholder:text-white/42 focus:border-[#ffbe6a]/55"
                          />
                        </div>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-[11px] text-white/58">
                            {postIdeaSeed.trim().length.toLocaleString()} chars
                            <span className="mx-2 text-white/30">•</span>
                            Optimized for AI Post
                          </div>
                          <button
                            type="button"
                            onClick={generatePostPromptPack}
                            disabled={postIdeaLoading}
                            className={cx(
                              "h-12 rounded-2xl border px-5 text-sm font-semibold transition",
                              postIdeaLoading
                                ? "cursor-not-allowed border-white/10 bg-white/[0.06] text-white/45"
                                : "border-[#ffbe6a]/60 bg-[linear-gradient(120deg,rgba(251,86,7,0.28)_0%,rgba(255,183,3,0.25)_55%,rgba(58,134,255,0.2)_100%)] text-amber-50 shadow-[0_0_32px_rgba(251,86,7,0.22)] hover:brightness-110"
                            )}
                          >
                            {postIdeaLoading ? "Generating..." : "Generate prompt + voiceover"}
                          </button>
                        </div>

                        {postIdeaError ? <div className="mt-2 text-[11px] text-rose-100/90">{postIdeaError}</div> : null}
                      </div>
                    </div>

                    <label className="text-xs font-medium text-white/70">Visual direction</label>
                    <textarea
                      value={postVisualPrompt}
                      onChange={(e) => setPostVisualPrompt(e.target.value)}
                      rows={10}
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
                    <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-[11px] text-white/72">
                      <div>
                        Estimated voice length at 1x:{" "}
                        <span className="font-semibold text-white/90">{formatDuration(postEstimateAt1xSeconds)}</span>
                      </div>
                      {postNeedsMoreWords ? (
                        <div className="mt-1 text-amber-100/90">
                          Script is short for this duration. Add more words for fuller narration.
                        </div>
                      ) : null}
                      {postWillAutoSpeed ? (
                        <div className="mt-1 text-amber-100/90">Script is long, so playback speed is auto-adjusted to fit.</div>
                      ) : null}
                      <div className="mt-1 text-white/55">
                        Estimated output length: {formatDuration(postEstimateAppliedSeconds)}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="text-xs font-medium text-white/70">Prompt</label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={mode === "voiceover" ? 12 : 10}
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

              {mode === "post" ? (
                <div className="mt-3 rounded-2xl border border-[#ffbe3d55] bg-[#ffbe3d1a] px-4 py-3 text-xs text-amber-100/95">
                  AI Post builds a{" "}
                  {postDurationSeconds === 60
                    ? "1-minute"
                    : postDurationSeconds === 90
                      ? "90-second"
                      : "2-minute"}{" "}
                  story from generated images and voiceover, then renders one ready-to-post clip.
                </div>
              ) : null}
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

                {(mode === "post" || mode === "video" || mode === "image") ? (
                  <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={watermarkEnabled}
                      onChange={(e) => setWatermarkEnabled(e.target.checked)}
                      disabled={freeTrialWatermarkLocked}
                      className="h-4 w-4 accent-orange-500"
                    />
                    <span className="text-xs text-white/80">
                      Add Clipforge watermark
                      {freeTrialWatermarkLocked ? " • required on Free Trial" : ""}
                    </span>
                  </label>
                ) : null}

                {mode === "post" ? (
                  <>
                    <div className="grid gap-2">
                      <label className="text-xs font-medium text-white/70">Duration</label>
                      <select
                        value={postDurationSeconds}
                        onChange={(e) => setPostDurationSeconds(Number(e.target.value))}
                        className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-amber-300/30"
                      >
                        {postDurationOptions.map((value) => (
                          <option key={value} value={value}>
                            {value === 60 ? "1 minute" : value === 90 ? "1.5 minutes" : "2 minutes"}
                          </option>
                        ))}
                      </select>
                      {!lowCostStyleSelected ? (
                        <div className="text-[11px] text-white/55">Anime, cartoon, and comic styles unlock 90s and 120s AI posts.</div>
                      ) : postPlanMaxDuration < 90 ? (
                        <div className="text-[11px] text-white/55">Upgrade to Starter to unlock 90s and 120s AI posts.</div>
                      ) : null}
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
                    {renderVoiceSelector(VOICE_BASE_WPM)}
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
                        {videoDurationOptions.map((seconds) => (
                          <option key={seconds} value={seconds}>
                            {seconds} seconds
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-medium text-white/70">Output quality</label>
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
                          HD
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
                          title={fastEligible ? "4K enabled" : "Upgrade to Creator for 4K"}
                        >
                          4K
                        </button>
                      </div>
                      {!fastEligible ? <div className="text-[11px] text-white/55">Creator or Studio required for 4K.</div> : null}
                    </div>
                  </>
                ) : null}

                {mode === "voiceover" ? (
                  <>
                    {renderVoiceSelector(voiceSpeedWpm)}
                    <div className="grid gap-2">
                      <label className="text-xs font-medium text-white/70">Speed</label>
                      <select
                        value={voiceSpeedMultiplier}
                        onChange={(e) => setVoiceSpeedMultiplier(Number(e.target.value || 1))}
                        className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-white/90 outline-none focus:border-amber-300/30"
                      >
                        {VOICE_SPEED_OPTIONS.map((opt) => (
                          <option key={String(opt.value)} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
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
                        openJobFromQueue(j);
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
                      {(String(j.status || "").toLowerCase() === "failed" || String(j.status || "").toLowerCase() === "canceled") ? (
                        <div className="mt-2 rounded-xl border border-rose-300/20 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-100/90">
                          <div>{conciseError(j.error || "Generation failed.")}</div>
                          <div className="mt-1 text-rose-100/80">What to do: {generationRecoveryAction(j.error || "")}</div>
                        </div>
                      ) : null}
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
