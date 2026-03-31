// frontend/app/app/generate/GenerateClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { normalizeAppPlan } from "@/lib/plans";

// API payloads and persisted draft state for the Labs generator surface.
type GenerationMode = "post" | "video" | "image" | "voiceover";
type VideoSpeedMode = "relax" | "4k";
type PostVisualMode = "image" | "video";
type JobKind = "generate" | "generate_image" | "generate_voiceover" | "generate_post";
type StylePreset = "real" | "anime" | "cartoon" | "comic";

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
  analysis?: PromptHelperAnalysis | null;
  storyboard?: PromptHelperStoryboardBeat[] | null;
};

type PromptHelperAnalysis = {
  continuity_anchor?: string;
  hook_focus?: string;
  quality_guardrails?: string[];
  camera_plan?: string[];
};

type PromptHelperStoryboardBeat = {
  label?: string;
  time_range?: string;
  visual_beat?: string;
  voice_beat?: string;
  camera?: string;
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
  dialogue_script?: string;
  voice_name?: string;
  voice_mode?: "narration" | "dialogue" | null;
  speed_wpm?: number;
  style_preset?: string;
  caption_style_preset?: string;
  post_visual_mode?: PostVisualMode;
  generated_scene_media_type?: "image" | "video";
  generation_speed?: string;
  watermark_enabled?: boolean;
  captions_enabled?: boolean;
  seed?: number;
  continuation_job_id?: number;
  reference_job_id?: number;
  continuity_anchor?: string;
};

type GenerateDraft = {
  mode?: GenerationMode;
  prompt?: string;
  aspectRatio?: string;
  duration?: number;
  videoSpeed?: VideoSpeedMode;
  stylePreset?: StylePreset;
  postVisualPrompt?: string;
  postVoiceScript?: string;
  postDialogueScript?: string;
  postIdeaSeed?: string;
  postDurationSeconds?: number;
  postVisualMode?: PostVisualMode;
  postCaptionsEnabled?: boolean;
  watermarkEnabled?: boolean;
  voiceName?: string;
  voiceSpeedMultiplier?: number;
  videoDialogueScript?: string;
  videoVoiceEnabled?: boolean;
  videoVoiceMode?: "narration" | "dialogue";
  continuationJobId?: number | null;
  referenceJobId?: number | null;
};

const CREDIT_USD_VALUE = 0.10;
const VIDEO_REAL_USD_PER_SECOND = 0.20;
const VIDEO_LOW_COST_USD_PER_SECOND = 0.10;
const VIDEO_HD_MIN_CREDITS_PER_SECOND = 3;
const VIDEO_PREMIUM_CREDITS_PER_SECOND = 4;
const IMAGE_REAL_USD_PER_IMAGE = 0.04;
const IMAGE_LOW_COST_USD_PER_IMAGE = 0.04;
const IMAGE_TARGET_PROFIT_USD = 0.40;
const POST_IMAGE_TARGET_PROFIT_USD = 1.45;
const POST_VIDEO_TARGET_PROFIT_USD = 3.5;
const VOICE_WORDS_PER_CREDIT = 300;
const VOICE_MIN_CREDITS = 1;
const VOICE_TARGET_MARGIN_USD = 0.05;
const VIDEO_FORCE_LOW_COST_MODELS =
  (process.env.NEXT_PUBLIC_LABS_FORCE_LOW_COST_MODELS ?? "1") !== "0";
const VOICE_BASE_WPM = 165;
const POST_MAX_AUTO_WPM = 210;
const POST_DURATION_SECONDS = 60;
const POST_IMAGE_DEFAULT_COUNT = 6;
const VIDEO_DURATION_OPTIONS: number[] = [5, 6, 7];
const POST_DURATION_OPTIONS: number[] = [60, 90, 120];
const POST_SCENE_COUNT_BY_DURATION: Record<number, number> = {
  60: 6,
  90: 8,
  120: 10,
};
const VIDEO_PROMPT_MAX_CHARS = 3000;
const IMAGE_PROMPT_MAX_CHARS = 3000;
const POST_VISUAL_PROMPT_MAX_CHARS = 3000;
const POST_VOICE_SCRIPT_MAX_CHARS = 12000;
const VOICEOVER_SCRIPT_MAX_CHARS = 6000;
const LOW_COST_STYLES = new Set<StylePreset>(["anime", "cartoon", "comic"]);
const GENERATOR_DRAFT_STORAGE_KEY = "clipforge-labs-generate-draft-v4";
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

const VOICE_OPTIONS = [
  { value: "en-US-Neural2-H", label: "Iris (US • expressive female • recommended)" },
  { value: "en-US-Neural2-I", label: "Noir (US • dramatic male • premium)" },
  { value: "en-US-Neural2-A", label: "Ember (US • narrative male • premium)" },
  { value: "en-US-Neural2-G", label: "Riven (US • deep female • premium)" },
  { value: "en-US-Studio-O", label: "Sora (US • studio female • highest realism • higher credits)" },
  { value: "en-US-Studio-Q", label: "Vale (US • studio male • highest realism • higher credits)" },
  { value: "en-US-Standard-C", label: "Core (US • Standard female • lower cost)" },
  { value: "en-US-Standard-D", label: "Atlas (US • Standard male • lower cost)" },
  { value: "en-US-Standard-E", label: "Mira (US • Standard female)" },
  { value: "en-US-Standard-F", label: "Rowan (US • Standard female)" },
  { value: "en-GB-Neural2-B", label: "Aster (UK • polished male)" },
  { value: "en-GB-Neural2-A", label: "Lyra (UK • polished female)" },
  { value: "en-AU-Neural2-B", label: "Cove (AU • warm male)" },
  { value: "en-AU-Neural2-A", label: "Skye (AU • warm female)" },
] as const;

const DEFAULT_VOICE_NAME = "en-US-Neural2-H";

const STYLE_PRESET_VALUES = new Set<StylePreset>(STYLE_PRESET_OPTIONS.map((opt) => opt.value));
const VOICE_VALUES = new Set<string>(VOICE_OPTIONS.map((opt) => opt.value));
const STORY_MEMORY_EXAMPLES = [
  "A premium skincare founder story told in a calm, editorial tone.",
  "An anime comeback story where the hero rebuilds after losing everything.",
  "A suspenseful true-story explainer about a forgotten invention that changed everything.",
];

const generatorPanelClass =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,16,27,0.9),rgba(7,10,18,0.98))] shadow-[0_28px_90px_rgba(0,0,0,0.34)]";
const generatorInsetClass =
  "rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,20,32,0.8),rgba(7,11,19,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
const generatorSelectClass =
  "h-11 w-full rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(9,13,22,0.96),rgba(7,11,18,0.98))] px-3 text-sm text-white/90 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition focus:border-sky-300/45 focus:shadow-[0_0_0_1px_rgba(125,211,252,0.16)]";
const generatorFieldClass =
  "w-full rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(9,13,22,0.96),rgba(7,11,18,0.98))] px-4 py-3 text-sm text-white/92 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition placeholder:text-white/36 focus:border-sky-300/45 focus:shadow-[0_0_0_1px_rgba(125,211,252,0.16),0_16px_38px_rgba(3,11,24,0.34)]";
const generatorQuietButtonClass =
  "rounded-xl border border-white/10 bg-[#0b1220]/78 px-3 py-1.5 text-[11px] font-semibold text-white/82 transition hover:bg-white/[0.10]";
const generatorAccentButtonClass =
  "border-sky-300/35 bg-[linear-gradient(120deg,rgba(96,165,250,0.18),rgba(45,212,191,0.12),rgba(245,158,11,0.08))] text-sky-50 shadow-[0_14px_32px_rgba(56,189,248,0.14)] hover:brightness-110";
const generatorWarningButtonClass =
  "border-amber-300/45 bg-[linear-gradient(120deg,rgba(251,191,36,0.28),rgba(245,158,11,0.24),rgba(251,146,60,0.18))] text-amber-50 shadow-[0_16px_36px_rgba(245,158,11,0.2)] hover:brightness-110";
const generatorWarningCardClass =
  "rounded-2xl border border-amber-300/35 bg-[linear-gradient(180deg,rgba(120,53,15,0.22),rgba(69,26,3,0.18))] px-4 py-3 text-amber-50/95 shadow-[0_14px_32px_rgba(245,158,11,0.10)]";
const generatorModeActiveClass =
  "border-sky-300/35 bg-[linear-gradient(180deg,rgba(96,165,250,0.18),rgba(45,212,191,0.12))] text-sky-50 shadow-[0_12px_28px_rgba(56,189,248,0.12)]";
const generatorModeIdleClass =
  "border-white/10 bg-[#09101b]/78 text-white/78 hover:bg-white/[0.08]";

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

function postSceneCountForDuration(durationSeconds: number): number {
  return POST_SCENE_COUNT_BY_DURATION[Math.max(60, Math.min(120, Number(durationSeconds || POST_DURATION_SECONDS)))] || POST_IMAGE_DEFAULT_COUNT;
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

function clipText(value: string | null | undefined, maxChars: number): string {
  const text = String(value || "").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function normalizePromptStoryboard(value: unknown): PromptHelperStoryboardBeat[] {
  if (!Array.isArray(value)) return [];
  const beats: PromptHelperStoryboardBeat[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = String(row.label || "").trim();
    const timeRange = String(row.time_range || "").trim();
    const visualBeat = String(row.visual_beat || "").trim();
    const voiceBeat = String(row.voice_beat || "").trim();
    const camera = String(row.camera || "").trim();
    if (!label && !visualBeat && !voiceBeat) continue;
    beats.push({
      label: label || "Beat",
      time_range: timeRange,
      visual_beat: visualBeat,
      voice_beat: voiceBeat,
      camera,
    });
  }
  return beats;
}

function durationPresetLabel(durationSeconds: number | null | undefined): string {
  const d = Number(durationSeconds || 0);
  if (!d || d < 1) return "—";
  if (d >= 120) return "2 min";
  if (d >= 90) return "1.5 min";
  if (d >= 60) return "1 min";
  if (d <= 5) return "Short";
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
  if (
    low.includes("service agents are being provisioned") ||
    low.includes("access-control#service-agents")
  ) {
    return "Google Cloud is provisioning Vertex service agents for your project. Wait 3-10 minutes, then retry.";
  }
  if (low === "not found" || low.includes("404")) {
    return "Generation service is not available right now. Please retry in a minute.";
  }
  if (
    low.includes("jailed") ||
    low.includes("blocked") ||
    low.includes("safety") ||
    low.includes("policy") ||
    low.includes("moderation")
  ) {
    return "This prompt was blocked by safety checks. Remove IP names or sensitive terms and retry.";
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
    return "Open Billing, add credits, then run again.";
  }
  if (
    low.includes("service agents are being provisioned") ||
    low.includes("access-control#service-agents")
  ) {
    return "Wait 3-10 minutes, then retry. If it persists, grant Vertex service-agent access to your GCS bucket.";
  }
  if (low === "not found" || low.includes("404")) {
    return "Retry in 1 minute. If it repeats, switch style or shorten the prompt.";
  }
  if (
    low.includes("jailed") ||
    low.includes("blocked") ||
    low.includes("safety") ||
    low.includes("policy") ||
    low.includes("moderation")
  ) {
    return "Rewrite the prompt with original characters and non-sensitive wording, then retry.";
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

function generationErrorDetail(err: any): string {
  const detail = err?.detail ?? err?.message;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first === "object") {
      const path = Array.isArray(first.loc)
        ? first.loc
            .map((v: unknown) => String(v ?? "").trim())
            .filter(Boolean)
            .join(".")
        : "";
      const msg = String(first.msg || "").trim();
      if (path && msg) return `${path}: ${msg}`;
      if (msg) return msg;
    }
    return "Validation failed. Check prompt length and required fields.";
  }
  return "Could not start generation.";
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
  return creditsFromUsd(base + IMAGE_TARGET_PROFIT_USD);
}

function estimateVideoCreditsPerSecond(speed: VideoSpeedMode, stylePreset: StylePreset): number {
  if (speed === "4k") return VIDEO_PREMIUM_CREDITS_PER_SECOND;
  // Mirror backend pricing behavior where low-cost routing may be forced globally.
  const lowCost = VIDEO_FORCE_LOW_COST_MODELS || isLowCostStyle(stylePreset);
  return lowCost ? VIDEO_HD_MIN_CREDITS_PER_SECOND : Math.max(VIDEO_HD_MIN_CREDITS_PER_SECOND, VIDEO_PREMIUM_CREDITS_PER_SECOND - 1);
}

function estimateVoiceBaseCredits(wordCount: number): number {
  const usage = Math.ceil(Math.max(1, wordCount) / VOICE_WORDS_PER_CREDIT);
  return Math.max(VOICE_MIN_CREDITS, usage);
}

function voiceRateUsdPerChar(voiceName: string): number {
  const token = String(voiceName || DEFAULT_VOICE_NAME).trim().toLowerCase();
  if (token.includes("studio")) return 160 / 1_000_000;
  if (token.includes("standard")) return 4 / 1_000_000;
  return 16 / 1_000_000;
}

function estimateVoiceProviderCostUsd(script: string, voiceName: string): number {
  const charCount = script.trim().length;
  if (charCount <= 0) return 0;
  return charCount * voiceRateUsdPerChar(voiceName);
}

function estimateVoiceCredits(script: string, voiceName: string): number {
  const baseCredits = estimateVoiceBaseCredits(countWords(script));
  const baseRevenue = baseCredits * CREDIT_USD_VALUE;
  const targetRevenue = estimateVoiceProviderCostUsd(script, voiceName) + VOICE_TARGET_MARGIN_USD;
  if (targetRevenue <= baseRevenue) return baseCredits;
  const extraCredits = Math.max(1, Math.ceil((targetRevenue - baseRevenue) / CREDIT_USD_VALUE));
  return baseCredits + extraCredits;
}

function estimatePostSceneDurationSeconds(durationSeconds: number, imageCount: number): number {
  return Math.max(5, Math.min(7, Math.round(durationSeconds / Math.max(1, imageCount))));
}

function estimatePostCredits(
  imageCount: number,
  voiceScript: string,
  stylePreset: StylePreset,
  durationSeconds: number,
  visualMode: PostVisualMode,
  voiceName: string
): number {
  const voiceCost = estimateVoiceProviderCostUsd(voiceScript, voiceName);
  if (visualMode === "video") {
    const safeDuration = Math.max(60, Math.min(120, Number(durationSeconds || POST_DURATION_SECONDS)));
    const safeImageCount = Math.max(6, Math.min(10, Number(imageCount || POST_IMAGE_DEFAULT_COUNT)));
    const sceneDuration = estimatePostSceneDurationSeconds(safeDuration, safeImageCount);
    const lowCost = VIDEO_FORCE_LOW_COST_MODELS || isLowCostStyle(stylePreset);
    const providerVideoUsd = safeImageCount * sceneDuration * (lowCost ? VIDEO_LOW_COST_USD_PER_SECOND : VIDEO_REAL_USD_PER_SECOND);
    return creditsFromUsd(providerVideoUsd + voiceCost + POST_VIDEO_TARGET_PROFIT_USD);
  }
  const safeImageCount = Math.max(6, Math.min(10, Number(imageCount || POST_IMAGE_DEFAULT_COUNT)));
  const imageUsd = safeImageCount * (isLowCostStyle(stylePreset) ? IMAGE_LOW_COST_USD_PER_IMAGE : IMAGE_REAL_USD_PER_IMAGE);
  return creditsFromUsd(imageUsd + voiceCost + POST_IMAGE_TARGET_PROFIT_USD);
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

async function postJsonWithCredentials<T = any>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
    cache: "no-store",
  });

  const raw = await res.text();
  let parsed: any = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }

  if (!res.ok) {
    const detail =
      (parsed && typeof parsed === "object" && (parsed.detail || parsed.message || parsed.error)) ||
      (typeof parsed === "string" ? parsed : "") ||
      `Request failed (${res.status})`;
    throw { status: res.status, detail: String(detail) };
  }

  return parsed as T;
}

export default function GenerateClient() {
  const searchParams = useSearchParams();
  const spKey = useMemo(() => (searchParams ? searchParams.toString() : ""), [searchParams]);

  // Core generation state lives here so the form, queue, and continuity tools stay in sync.
  const [mode, setMode] = useState<GenerationMode>("post");

  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState(6);
  const [videoSpeed, setVideoSpeed] = useState<VideoSpeedMode>("relax");
  const [stylePreset, setStylePreset] = useState<StylePreset>("real");

  const [postVisualPrompt, setPostVisualPrompt] = useState("");
  const [postVoiceScript, setPostVoiceScript] = useState("");
  const [postDialogueScript, setPostDialogueScript] = useState("");
  const [postIdeaSeed, setPostIdeaSeed] = useState("");
  const [postIdeaLoading, setPostIdeaLoading] = useState(false);
  const [postIdeaError, setPostIdeaError] = useState<string | null>(null);
  const [postIdeaAnalysis, setPostIdeaAnalysis] = useState<PromptHelperAnalysis | null>(null);
  const [postIdeaStoryboard, setPostIdeaStoryboard] = useState<PromptHelperStoryboardBeat[]>([]);
  const [postDurationSeconds, setPostDurationSeconds] = useState<number>(POST_DURATION_SECONDS);
  const [postVisualMode, setPostVisualMode] = useState<PostVisualMode>("image");
  const [postCaptionsEnabled, setPostCaptionsEnabled] = useState(true);
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);

  const [voiceName, setVoiceName] = useState<string>(DEFAULT_VOICE_NAME);
  const [voiceSpeedMultiplier, setVoiceSpeedMultiplier] = useState<number>(1);
  const [videoDialogueScript, setVideoDialogueScript] = useState("");
  const [videoVoiceEnabled, setVideoVoiceEnabled] = useState(false);
  const [videoVoiceMode, setVideoVoiceMode] = useState<"narration" | "dialogue">("narration");
  const [continuationJobId, setContinuationJobId] = useState<number | null>(null);
  const [referenceJobId, setReferenceJobId] = useState<number | null>(null);
  const [currentPlan, setCurrentPlan] = useState("free");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsBilling, setNeedsBilling] = useState(false);

  const [activeJob, setActiveJob] = useState<JobRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [cancelingJobId, setCancelingJobId] = useState<number | null>(null);
  const [voicePreviewError, setVoicePreviewError] = useState<string | null>(null);
  const [voicePreviewPlayingKey, setVoicePreviewPlayingKey] = useState<string | null>(null);
  const [voicePreviewSrcByKey, setVoicePreviewSrcByKey] = useState<Record<string, string>>({});

  const pollTimer = useRef<number | null>(null);
  const hydratedFromQuery = useRef(false);
  const hydratedFromDraft = useRef(false);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  const textLength = useMemo(() => prompt.trim().length, [prompt]);
  const postVisualLength = useMemo(() => postVisualPrompt.trim().length, [postVisualPrompt]);
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
  const normalizedPlan = useMemo(() => normalizeAppPlan(currentPlan), [currentPlan]);
  const postPlanMaxDuration = useMemo(() => {
    const caps: Record<string, number> = { free: 60, free_trial: 60, trial: 60, starter: 120, creator: 120, studio: 120 };
    return caps[normalizedPlan] ?? 60;
  }, [normalizedPlan]);
  const postDurationOptions = useMemo(
    () => (lowCostStyleSelected ? [...POST_DURATION_OPTIONS] : [POST_DURATION_SECONDS]).filter((value) => value <= postPlanMaxDuration),
    [lowCostStyleSelected, postPlanMaxDuration]
  );
  const maxVideoDuration = useMemo(() => {
    const extended = lowCostStyleSelected || videoSpeed === "4k";
    const hdCaps: Record<string, number> = { free: 5, free_trial: 5, trial: 5, starter: 6, creator: 7, studio: 7 };
    const extendedCaps: Record<string, number> = { free: 5, free_trial: 5, trial: 5, starter: 7, creator: 7, studio: 7 };
    const fallback = extended ? 5 : 5;
    const table = extended ? extendedCaps : hdCaps;
    return table[normalizedPlan] ?? fallback;
  }, [normalizedPlan, lowCostStyleSelected, videoSpeed]);
  const videoDurationOptions = useMemo(() => VIDEO_DURATION_OPTIONS.filter((d) => d <= maxVideoDuration), [maxVideoDuration]);
  const postSceneCount = useMemo(() => postSceneCountForDuration(postDurationSeconds), [postDurationSeconds]);
  const postImageCreditsEstimate = useMemo(
    () => estimatePostCredits(postSceneCount, postVoiceScript, stylePreset, postDurationSeconds, "image", voiceName),
    [postSceneCount, postVoiceScript, stylePreset, postDurationSeconds, voiceName]
  );
  const postVideoCreditsEstimate = useMemo(
    () => estimatePostCredits(postSceneCount, postVoiceScript, stylePreset, postDurationSeconds, "video", voiceName),
    [postSceneCount, postVoiceScript, stylePreset, postDurationSeconds, voiceName]
  );

  const estimatedCredits = useMemo(() => {
    if (mode === "post") {
      return estimatePostCredits(postSceneCount, postVoiceScript, stylePreset, postDurationSeconds, postVisualMode, voiceName);
    }
    if (mode === "image") return estimateImageCredits(stylePreset);
    if (mode === "voiceover") {
      return estimateVoiceCredits(prompt, voiceName);
    }
    const perSecond = estimateVideoCreditsPerSecond(videoSpeed, stylePreset);
    const voiceScript = videoVoiceMode === "dialogue" && videoDialogueScript.trim() ? videoDialogueScript : prompt;
    const voiceCredits = videoVoiceEnabled ? estimateVoiceCredits(voiceScript, voiceName) : 0;
    return Math.max(1, Number(duration || 0)) * perSecond + voiceCredits;
  }, [
    mode,
    postVoiceScript,
    stylePreset,
    prompt,
    duration,
    videoSpeed,
    postDurationSeconds,
    postSceneCount,
    postVisualMode,
    voiceName,
    videoVoiceEnabled,
    videoVoiceMode,
    videoDialogueScript,
  ]);

  const fastEligible = useMemo(() => {
    return normalizedPlan === "creator" || normalizedPlan === "studio";
  }, [normalizedPlan]);
  const freeTrialWatermarkLocked = useMemo(() => {
    return normalizedPlan === "free";
  }, [normalizedPlan]);

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
      setDuration(videoDurationOptions[videoDurationOptions.length - 1] || 5);
    }
  }, [videoDurationOptions, duration]);

  function hydrateFormFromJob(job: JobRow, opts?: { preservePrompt?: boolean }) {
    const preservePrompt = !!opts?.preservePrompt;
    const kind = String(job?.kind || "").toLowerCase();
    const settings: JobSettings =
      job?.settings && typeof job.settings === "object" ? (job.settings as JobSettings) : {};
    setPostIdeaAnalysis(null);
    setPostIdeaStoryboard([]);
    setPostIdeaError(null);

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
    setReferenceJobId(Number.isFinite(Number(settings.reference_job_id)) ? Number(settings.reference_job_id) : null);

    if (kind === "generate_post") {
      setMode("post");
      if (!preservePrompt || !postVisualPrompt.trim()) {
        setPostVisualPrompt(typeof settings.visual_prompt === "string" ? settings.visual_prompt : String(job.prompt || ""));
      }
      if (!preservePrompt || !postVoiceScript.trim()) {
        setPostVoiceScript(typeof settings.voice_script === "string" ? settings.voice_script : "");
      }
      setPostDialogueScript(typeof settings.dialogue_script === "string" ? settings.dialogue_script : "");
      const postDurationRaw =
        typeof job.duration_seconds === "number" ? job.duration_seconds : Number.parseInt(String(job.duration_seconds || ""), 10);
      if (Number.isFinite(postDurationRaw) && [60, 90, 120].includes(postDurationRaw)) {
        setPostDurationSeconds(postDurationRaw);
      }
      const savedPostVisualMode = typeof settings.post_visual_mode === "string" ? settings.post_visual_mode.trim().toLowerCase() : "";
      const generatedSceneMediaType =
        typeof settings.generated_scene_media_type === "string" ? settings.generated_scene_media_type.trim().toLowerCase() : "";
      if (savedPostVisualMode === "image" || savedPostVisualMode === "video") {
        setPostVisualMode(savedPostVisualMode as PostVisualMode);
      } else if (generatedSceneMediaType === "image" || generatedSceneMediaType === "video") {
        setPostVisualMode(generatedSceneMediaType as PostVisualMode);
      } else {
        setPostVisualMode("image");
      }
      setPostCaptionsEnabled(typeof settings.captions_enabled === "boolean" ? settings.captions_enabled : true);
      setContinuationJobId(Number.isFinite(Number(settings.continuation_job_id)) ? Number(settings.continuation_job_id) : null);
      return;
    }

    const promptText = String(job.prompt || "");
    if (!preservePrompt || !prompt.trim()) {
      setPrompt(promptText);
    }

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
    setVideoDialogueScript(typeof settings.dialogue_script === "string" ? settings.dialogue_script : "");
    if (typeof settings.voice_name === "string" && settings.voice_name.trim()) {
      setVideoVoiceEnabled(true);
      setVoiceName(settings.voice_name.trim());
    } else {
      setVideoVoiceEnabled(false);
    }
    const savedVoiceMode = typeof settings.voice_mode === "string" ? settings.voice_mode.trim().toLowerCase() : "";
    if (savedVoiceMode === "dialogue") {
      setVideoVoiceMode("dialogue");
    } else {
      setVideoVoiceMode("narration");
    }
    const durationSeconds =
      typeof job.duration_seconds === "number" ? job.duration_seconds : Number.parseInt(String(job.duration_seconds || ""), 10);
    if (Number.isFinite(durationSeconds) && [5, 6, 7].includes(durationSeconds)) {
      setDuration(durationSeconds);
    }
    const generationSpeed = typeof settings.generation_speed === "string" ? settings.generation_speed : "";
    if (generationSpeed === "relax" || generationSpeed === "4k") {
      setVideoSpeed(generationSpeed);
    } else if (generationSpeed === "hd" || generationSpeed === "standard") {
      setVideoSpeed("relax");
    } else if (generationSpeed === "4k" || generationSpeed === "uhd" || generationSpeed === "fast") {
      setVideoSpeed("4k");
    }
    setContinuationJobId(Number.isFinite(Number(settings.continuation_job_id)) ? Number(settings.continuation_job_id) : null);
  }

  async function openJobFromQueue(summary: JobRow) {
    setError(null);
    setNeedsBilling(false);
    let target = summary;
    try {
      target = await apiFetch<JobRow>(`/labs/jobs/${summary.id}`, { method: "GET" });
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
        const body = {
          voice_name: targetVoice,
          speed_wpm: targetSpeedWpm,
        };
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const previewPaths = [
          `${origin}/app/labs/lapi/labs/voice-preview`,
          `${origin}/lapi/labs/voice-preview`,
          `${origin}/app/labs/api/labs/voice-preview`,
          "/labs/voice-preview",
          "/labs/generate/voice-preview",
        ];
        const uniquePaths = Array.from(new Set(previewPaths.filter(Boolean)));
        let payload: VoicePreviewResponse | null = null;
        let lastErr: any = null;
        for (const previewPath of uniquePaths) {
          try {
            payload = previewPath.startsWith("http")
              ? await postJsonWithCredentials<VoicePreviewResponse>(previewPath, body)
              : await apiFetch<VoicePreviewResponse>(previewPath, {
                  method: "POST",
                  body,
                });
            break;
          } catch (err: any) {
            lastErr = err;
          }
        }
        if (!payload) {
          throw lastErr || new Error("Could not load voice preview.");
        }
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
        <div className={cx("grid gap-2 p-2.5", generatorInsetClass)}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={voiceName}
              onChange={(e) => {
                setVoiceName(e.target.value);
                setVoicePreviewError(null);
              }}
              className={cx("h-10 text-[12px]", generatorSelectClass)}
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
                  ? generatorAccentButtonClass
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
          <div className="text-[11px] text-white/52">
            Neural2 is the default. Studio voices reserve extra credits because they cost more to synthesize.
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

  function storyJobLabel(job: JobRow) {
    const created = job.created_at ? new Date(job.created_at) : null;
    if (!created || Number.isNaN(created.getTime())) return shortPromptLabel(job.prompt, job.id);
    return `${shortPromptLabel(job.prompt, job.id)} • ${created.toLocaleDateString()}`;
  }

  function isReferenceEligibleJob(job: JobRow) {
    const kind = String(job.kind || "").toLowerCase();
    const status = String(job.status || "").toLowerCase();
    return status === "done" && (kind === "generate" || kind === "generate_post" || kind === "generate_image");
  }

  function applyContinuationFromJob(job: JobRow) {
    const kind = String(job.kind || "").toLowerCase();
    if (kind === "generate_post") {
      // Keep the current prompt fields when possible, but inherit the prior job's settings and continuity anchor.
      hydrateFormFromJob(job, { preservePrompt: true });
      setMode("post");
      setContinuationJobId(job.id);
      setReferenceJobId(null);
      return;
    }
    if (kind === "generate") {
      hydrateFormFromJob(job, { preservePrompt: true });
      setMode("video");
      setContinuationJobId(job.id);
      setReferenceJobId(null);
    }
  }

  function applyReferenceFromJob(job: JobRow) {
    if (!isReferenceEligibleJob(job)) return;
    const settings: JobSettings =
      job?.settings && typeof job.settings === "object" ? (job.settings as JobSettings) : {};
    const style = typeof settings.style_preset === "string" ? settings.style_preset : "";
    // Reference mode mainly nudges style/look, so we sync the visible style preset too.
    if (STYLE_PRESET_VALUES.has(style as StylePreset)) {
      setStylePreset(style as StylePreset);
    }
    setReferenceJobId(job.id);
    setContinuationJobId(null);
  }

  async function refreshJobs() {
    try {
      const rows = (await apiFetch<JobRow[]>("/labs/jobs", { method: "GET" })) || [];
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
        const job = await apiFetch<JobRow>(`/labs/jobs/${jobId}`, { method: "GET" });
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

  async function cancelQueuedJob(jobId: number) {
    if (!jobId) return;
    setCancelingJobId(jobId);
    setError(null);
    try {
      await apiFetch(`/labs/jobs/${jobId}/cancel`, { method: "POST" });
      setActiveJob((prev) =>
        prev && prev.id === jobId
          ? {
              ...prev,
              status: "canceled",
              error: prev.error || "Canceled by user",
            }
          : prev
      );
      await refreshJobs();
    } catch (err: any) {
      setError(String(err?.detail || err?.message || "Could not cancel job."));
    } finally {
      setCancelingJobId((prev) => (prev === jobId ? null : prev));
    }
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
    if (hydratedFromDraft.current || typeof window === "undefined") return;
    hydratedFromDraft.current = true;
    try {
      const raw = window.localStorage.getItem(GENERATOR_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as GenerateDraft;
      if (draft.mode === "post" || draft.mode === "video" || draft.mode === "image" || draft.mode === "voiceover") {
        setMode(draft.mode);
      }
      if (typeof draft.prompt === "string") setPrompt(draft.prompt);
      if (draft.aspectRatio && ["9:16", "16:9", "1:1"].includes(draft.aspectRatio)) setAspectRatio(draft.aspectRatio);
      if (typeof draft.duration === "number" && VIDEO_DURATION_OPTIONS.includes(draft.duration)) setDuration(draft.duration);
      if (draft.videoSpeed === "relax" || draft.videoSpeed === "4k") setVideoSpeed(draft.videoSpeed);
      if (draft.stylePreset && STYLE_PRESET_VALUES.has(draft.stylePreset)) setStylePreset(draft.stylePreset);
      if (typeof draft.postVisualPrompt === "string") setPostVisualPrompt(draft.postVisualPrompt);
      if (typeof draft.postVoiceScript === "string") setPostVoiceScript(draft.postVoiceScript);
      if (typeof draft.postDialogueScript === "string") setPostDialogueScript(draft.postDialogueScript);
      if (typeof draft.postIdeaSeed === "string") setPostIdeaSeed(draft.postIdeaSeed);
      if (typeof draft.postDurationSeconds === "number" && POST_DURATION_OPTIONS.includes(draft.postDurationSeconds)) {
        setPostDurationSeconds(draft.postDurationSeconds);
      }
      if (draft.postVisualMode === "image" || draft.postVisualMode === "video") setPostVisualMode(draft.postVisualMode);
      if (typeof draft.postCaptionsEnabled === "boolean") setPostCaptionsEnabled(draft.postCaptionsEnabled);
      if (!freeTrialWatermarkLocked && typeof draft.watermarkEnabled === "boolean") {
        setWatermarkEnabled(draft.watermarkEnabled);
      }
      if (typeof draft.voiceName === "string" && VOICE_VALUES.has(draft.voiceName)) setVoiceName(draft.voiceName);
      if (typeof draft.voiceSpeedMultiplier === "number") setVoiceSpeedMultiplier(draft.voiceSpeedMultiplier);
      if (typeof draft.videoDialogueScript === "string") setVideoDialogueScript(draft.videoDialogueScript);
      if (typeof draft.videoVoiceEnabled === "boolean") setVideoVoiceEnabled(draft.videoVoiceEnabled);
      if (draft.videoVoiceMode === "narration" || draft.videoVoiceMode === "dialogue") setVideoVoiceMode(draft.videoVoiceMode);
      if (Number.isFinite(Number(draft.continuationJobId))) {
        setContinuationJobId(Number(draft.continuationJobId));
      }
      if (Number.isFinite(Number(draft.referenceJobId))) {
        setReferenceJobId(Number(draft.referenceJobId));
      }
    } catch {
      // ignore invalid saved drafts
    }
  }, [freeTrialWatermarkLocked]);

  useEffect(() => {
    if (typeof window === "undefined" || !hydratedFromDraft.current) return;
    const payload: GenerateDraft = {
      mode,
      prompt,
      aspectRatio,
      duration,
      videoSpeed,
      stylePreset,
      postVisualPrompt,
      postVoiceScript,
      postDialogueScript,
      postIdeaSeed,
      postDurationSeconds,
      postVisualMode,
      postCaptionsEnabled,
      watermarkEnabled,
      voiceName,
      voiceSpeedMultiplier,
      videoDialogueScript,
      videoVoiceEnabled,
      videoVoiceMode,
      continuationJobId,
      referenceJobId,
    };
    window.localStorage.setItem(GENERATOR_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  }, [
    aspectRatio,
    continuationJobId,
    duration,
    mode,
    postCaptionsEnabled,
    postDialogueScript,
    postDurationSeconds,
    postVisualMode,
    postIdeaSeed,
    postVisualPrompt,
    postVoiceScript,
    prompt,
    referenceJobId,
    stylePreset,
    videoDialogueScript,
    videoSpeed,
    videoVoiceEnabled,
    videoVoiceMode,
    voiceName,
    voiceSpeedMultiplier,
    watermarkEnabled,
  ]);

  useEffect(() => {
    if (mode === "post" || mode === "video") return;
    setContinuationJobId(null);
    setReferenceJobId(null);
  }, [mode]);

  useEffect(() => {
    if (!continuationJobId) return;
    const job = (activeJob && activeJob.id === continuationJobId ? activeJob : null) || jobs.find((row) => row.id === continuationJobId) || null;
    if (!job) return;
    const kind = String(job.kind || "").toLowerCase();
    if ((mode === "post" && kind !== "generate_post") || (mode === "video" && kind !== "generate")) {
      setContinuationJobId(null);
    }
  }, [activeJob, continuationJobId, jobs, mode]);

  useEffect(() => {
    if (!referenceJobId) return;
    const job = (activeJob && activeJob.id === referenceJobId ? activeJob : null) || jobs.find((row) => row.id === referenceJobId) || null;
    if (!job) return;
    if (mode !== "post" && mode !== "video") {
      setReferenceJobId(null);
      return;
    }
    if (!isReferenceEligibleJob(job)) {
      setReferenceJobId(null);
    }
  }, [activeJob, jobs, mode, referenceJobId]);

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
    if (Number.isFinite(d) && [5, 6, 7].includes(d)) setDuration(d);

    const jobId = jobRaw ? Number(jobRaw) : 0;
    const uploadId = uploadRaw ? Number(uploadRaw) : 0;
    if (jobId > 0 && uploadId > 0) {
      pollJob(jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spKey]);

  const storyMemoryJobs = useMemo(() => {
    const allowedKinds = mode === "post" ? new Set(["generate_post"]) : mode === "video" ? new Set(["generate"]) : null;
    if (!allowedKinds) return [] as JobRow[];
    return jobs
      .filter((job) => allowedKinds.has(String(job.kind || "").toLowerCase()) && String(job.status || "").toLowerCase() === "done")
      .slice(0, 5);
  }, [jobs, mode]);

  const continuationJob = useMemo(() => {
    if (!continuationJobId) return null;
    if (activeJob && activeJob.id === continuationJobId) return activeJob;
    return jobs.find((job) => job.id === continuationJobId) || null;
  }, [activeJob, continuationJobId, jobs]);

  const referenceJob = useMemo(() => {
    if (!referenceJobId) return null;
    if (activeJob && activeJob.id === referenceJobId) return activeJob;
    return jobs.find((job) => job.id === referenceJobId) || null;
  }, [activeJob, jobs, referenceJobId]);

  async function startGeneration() {
    setError(null);
    setNeedsBilling(false);

    const p = prompt.trim();
    const postPrompt = postVisualPrompt.trim();
    const postScript = postVoiceScript.trim();
    const postDialogue = postDialogueScript.trim();
    const videoDialogue = videoDialogueScript.trim();

    if (mode === "post") {
      if (postPrompt.length < 3) {
        setError("Describe the visual story first.");
        return;
      }
      if (postPrompt.length > POST_VISUAL_PROMPT_MAX_CHARS) {
        setError(`Visual prompt is too long (${postPrompt.length}/${POST_VISUAL_PROMPT_MAX_CHARS}).`);
        return;
      }
      if (postScript.length < 30) {
        setError("Write at least a short voiceover script (30+ characters).");
        return;
      }
      if (postScript.length > POST_VOICE_SCRIPT_MAX_CHARS) {
        setError(`Voice script is too long (${postScript.length}/${POST_VOICE_SCRIPT_MAX_CHARS}).`);
        return;
      }
    } else {
      if (p.length < 3) {
        setError(mode === "voiceover" ? "Write voiceover text first." : "Write a prompt first.");
        return;
      }
      if (mode === "video" && p.length > VIDEO_PROMPT_MAX_CHARS) {
        setError(`Video prompt is too long (${p.length}/${VIDEO_PROMPT_MAX_CHARS}).`);
        return;
      }
      if (mode === "image" && p.length > IMAGE_PROMPT_MAX_CHARS) {
        setError(`Image prompt is too long (${p.length}/${IMAGE_PROMPT_MAX_CHARS}).`);
        return;
      }
      if (mode === "voiceover" && p.length > VOICEOVER_SCRIPT_MAX_CHARS) {
        setError(`Voiceover script is too long (${p.length}/${VOICEOVER_SCRIPT_MAX_CHARS}).`);
        return;
      }
    }

    setSubmitting(true);
    try {
      let endpoint = "/labs/generate";
      let body: Record<string, string | number | boolean | undefined> = {};

      if (mode === "post") {
        endpoint = "/labs/generate/post";
        body = {
          visual_prompt: postPrompt,
          voice_script: postScript,
          dialogue_script: postDialogue || undefined,
          aspect_ratio: aspectRatio,
          duration_seconds: postDurationSeconds,
          image_count: postSceneCount,
          post_visual_mode: postVisualMode,
          model: "google",
          voice_name: voiceName,
          style_preset: stylePreset,
          caption_style_preset: postCaptionsEnabled ? "orbito" : "none",
          captions_enabled: postCaptionsEnabled,
          watermark_enabled: freeTrialWatermarkLocked ? true : watermarkEnabled,
          continuation_job_id: continuationJobId || undefined,
          reference_job_id: referenceJobId || undefined,
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
          dialogue_script: videoDialogue || undefined,
          aspect_ratio: aspectRatio,
          duration_seconds: duration,
          generation_speed: videoSpeed,
          model: "google",
          style_preset: stylePreset,
          watermark_enabled: freeTrialWatermarkLocked ? true : watermarkEnabled,
          voice_name: videoVoiceEnabled ? voiceName : undefined,
          voice_mode: videoVoiceEnabled ? videoVoiceMode : undefined,
          continuation_job_id: continuationJobId || undefined,
          reference_job_id: referenceJobId || undefined,
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
      const msg = generationErrorDetail(err);
      const low = String(msg || "").toLowerCase();
      const outOfCredits = err?.status === 402 || low.includes("insufficient credits");
      if (outOfCredits) {
        setNeedsBilling(true);
        setError("You’re out of credits. Add more from Billing to continue.");
      } else {
        const friendly = humanizeGenerationError(msg);
        setError(friendly);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function generatePostPromptPack() {
    // Prompt-helper is the low-friction planning step before spending credits on a full render.
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
          continuation_job_id: continuationJobId || undefined,
          reference_job_id: referenceJobId || undefined,
        },
      });
      const visual = String(res?.visual_prompt || "").trim();
      const voice = String(res?.voice_script || "").trim();
      if (!visual || !voice) {
        throw new Error("Prompt helper returned an empty result.");
      }
      // The helper fills the editable fields, but the storyboard stays as a review layer above them.
      setPostVisualPrompt(visual);
      setPostVoiceScript(voice);
      setPostIdeaAnalysis(res && typeof res.analysis === "object" ? (res.analysis as PromptHelperAnalysis) : null);
      setPostIdeaStoryboard(normalizePromptStoryboard(res?.storyboard));
    } catch (err: any) {
      const detail = String(err?.detail || err?.message || "Could not generate a prompt pack.");
      setPostIdeaStoryboard([]);
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
  const activeJobCancelable = !!activeJob && (status === "queued" || status === "running");
  const generationInFlight = submitting || activeJobCancelable;
  const showContinuityTools =
    (mode === "post" || mode === "video") &&
    (Boolean(continuationJob) || Boolean(referenceJob) || storyMemoryJobs.length > 0);
  const postPromptHelperCard =
    mode === "post" ? (
      <section className="group relative overflow-hidden rounded-[32px] border border-[#fb56075f] bg-black/35 p-5 sm:p-6">
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
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ffbe6a]/90">Prompt Helper</div>
              <div className="mt-1 text-base font-semibold text-white sm:text-lg">
                Start with one clear brief. Orbito will draft the visual direction and voiceover for you.
              </div>
              <p className="mt-1 text-xs text-white/68">
                Describe the outcome you want in plain language. You can review the first draft, edit it, and generate when it feels right.
              </p>
            </div>
            <span className="rounded-full border border-[#fb560770] bg-[#fb56071a] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ffbe6a]">
              Quick Start
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {STORY_MEMORY_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setPostIdeaSeed(example);
                  setPostIdeaAnalysis(null);
                  setPostIdeaStoryboard([]);
                  setPostIdeaError(null);
                }}
                className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/74 transition hover:bg-white/[0.10]"
              >
                {clipText(example, 60)}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-2">
            <label className="text-xs font-medium text-white/72">Brief</label>
            <textarea
              value={postIdeaSeed}
              onChange={(e) => {
                setPostIdeaSeed(e.target.value);
                setPostIdeaAnalysis(null);
                setPostIdeaStoryboard([]);
                if (postIdeaError) setPostIdeaError(null);
              }}
              rows={4}
              placeholder="Example: A premium founder story about rebuilding after a failed launch, with clean visuals, emotional pacing, and a calm confident voice."
              className="min-h-[120px] w-full resize-y rounded-2xl border border-white/12 bg-black/50 px-4 py-3 text-sm text-white/92 outline-none placeholder:text-white/42 focus:border-[#ffbe6a]/55"
            />
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] text-white/58">
              {postIdeaSeed.trim().length.toLocaleString()} chars
              <span className="mx-2 text-white/30">•</span>
              Up to {POST_VISUAL_PROMPT_MAX_CHARS.toLocaleString()} chars
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
              {postIdeaLoading ? "Drafting..." : "Draft prompt + voiceover"}
            </button>
          </div>

          {postIdeaError ? <div className="mt-2 text-[11px] text-rose-100/90">{postIdeaError}</div> : null}
          {postIdeaAnalysis ? (
            <div className={cx("mt-3 text-[11px]", generatorWarningCardClass)}>
              {postIdeaAnalysis.hook_focus ? (
                <div>
                  <span className="font-semibold text-amber-50">Hook focus:</span> {postIdeaAnalysis.hook_focus}
                </div>
              ) : null}
              {postIdeaAnalysis.continuity_anchor ? (
                <div className="mt-1">
                  <span className="font-semibold text-amber-50">Continuity anchor:</span>{" "}
                  {postIdeaAnalysis.continuity_anchor}
                </div>
              ) : null}
              {Array.isArray(postIdeaAnalysis.quality_guardrails) && postIdeaAnalysis.quality_guardrails.length > 0 ? (
                <div className="mt-1 text-amber-100/90">
                  <span className="font-semibold text-amber-50">Quality checks:</span>{" "}
                  {postIdeaAnalysis.quality_guardrails.slice(0, 3).join(" • ")}
                </div>
              ) : null}
              {Array.isArray(postIdeaAnalysis.camera_plan) && postIdeaAnalysis.camera_plan.length > 0 ? (
                <div className="mt-1 text-amber-100/90">
                  <span className="font-semibold text-amber-50">Camera plan:</span>{" "}
                  {postIdeaAnalysis.camera_plan.slice(0, 2).join(" | ")}
                </div>
              ) : null}
            </div>
          ) : null}
          {postIdeaStoryboard.length ? (
            <div className="mt-3 grid gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/52">Draft Preview</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {postIdeaStoryboard.map((beat, index) => (
                  <div key={`${beat.label || "beat"}-${index}`} className="rounded-2xl border border-white/10 bg-black/30 p-3 text-[11px] text-white/72">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-white/90">{beat.label || `Beat ${index + 1}`}</div>
                      {beat.time_range ? <div className="text-white/46">{beat.time_range}</div> : null}
                    </div>
                    {beat.visual_beat ? <div className="mt-2 text-white/84">{beat.visual_beat}</div> : null}
                    {beat.voice_beat ? <div className="mt-1 text-white/62">{beat.voice_beat}</div> : null}
                    {beat.camera ? (
                      <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[10px] text-white/58">
                        Camera: {beat.camera}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    ) : null;

  return (
    <div className="theme-merged relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-[1080px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <div className="grid gap-5">
          {postPromptHelperCard}

          <form onSubmit={onGenerate} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className={cx("surface relative flex min-h-[720px] flex-col overflow-hidden rounded-[32px] border-white/10 p-5 sm:p-6", generatorPanelClass)}>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-12 opacity-50 blur-3xl"
                style={{
                  background:
                    "radial-gradient(560px 300px at 12% 12%, rgba(125,211,252,0.22), transparent 72%), radial-gradient(560px 320px at 88% 16%, rgba(45,212,191,0.16), transparent 74%), radial-gradient(480px 260px at 50% 0%, rgba(245,158,11,0.10), transparent 72%)",
                }}
              />

            <div className="relative flex h-full flex-col">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/82">Orbito Generate</div>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white/95 sm:text-[2.1rem]">Create AI clips</h1>
                  <p className="mt-2 max-w-2xl text-sm text-white/64">
                    Keep it simple: choose a mode, write the brief, adjust a few essentials, and generate.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href="/app/clips?editor=1" className="btn-aurora px-4 py-2 text-xs">
                    Open editor
                  </Link>
                  <Link href="/app/clips" className={cx("inline-flex items-center px-4 py-2 text-xs", generatorQuietButtonClass)}>
                    Clips library
                  </Link>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-[24px] border border-white/10 bg-[#08101a]/82 p-1.5 sm:flex sm:flex-wrap">
                {(["post", "video", "image", "voiceover"] as GenerationMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cx(
                      "w-full min-w-0 rounded-xl border px-3 py-2.5 text-sm font-semibold transition sm:min-w-[110px] sm:flex-1",
                      mode === m
                        ? generatorModeActiveClass
                        : generatorModeIdleClass
                    )}
                  >
                    {modeLabel(m)}
                  </button>
                ))}
              </div>

              {showContinuityTools ? (
                <details open={Boolean(continuationJob || referenceJob)} className={cx("mt-4 p-4", generatorInsetClass)}>
                  <summary className="cursor-pointer list-none text-sm font-semibold text-white/88">
                    Continue a story or reuse a look
                  </summary>
                  <div className="mt-4 grid gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100/55">Story Memory</div>
                      <div className="mt-1 text-[12px] text-white/58">
                        Use a finished generation when you want the next clip to feel like the same story.
                      </div>
                    </div>

                    {continuationJob ? (
                      <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-[12px] text-sky-50/95">
                        Continuing from <span className="font-semibold">{storyJobLabel(continuationJob)}</span>.
                        <button
                          type="button"
                          onClick={() => setContinuationJobId(null)}
                          className={cx("ml-3", generatorQuietButtonClass, "border-sky-300/25 bg-sky-400/10 text-sky-100")}
                        >
                          Clear
                        </button>
                      </div>
                    ) : null}

                    {storyMemoryJobs.length ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {storyMemoryJobs.map((job) => {
                          const active = continuationJobId === job.id;
                          return (
                            <button
                              key={job.id}
                              type="button"
                              onClick={() => applyContinuationFromJob(job)}
                              className={cx(
                                "rounded-2xl border px-3 py-3 text-left transition",
                                active
                                  ? "border-sky-300/30 bg-sky-400/10 text-white"
                                  : "border-white/10 bg-[#0a111b]/76 text-white/86 hover:bg-white/[0.06]"
                              )}
                            >
                              <div className="truncate text-[12px] font-semibold">{shortPromptLabel(job.prompt, job.id)}</div>
                              <div className="mt-1 text-[11px] text-white/55">
                                Job #{job.id} • {durationPresetLabel(job.duration_seconds)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-3 text-[12px] text-white/58">
                        Finish one {modeLabel(mode).toLowerCase()} first and it will appear here.
                      </div>
                    )}

                    <div className="rounded-2xl border border-white/10 bg-[#09111d]/68 px-4 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/55">Reference Look</div>
                      <div className="mt-1 text-[12px] text-white/62">
                        Use a finished clip as a visual reference without continuing the same storyline.
                      </div>
                      {referenceJob ? (
                        <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-50/95">
                          Using <span className="font-semibold">{storyJobLabel(referenceJob)}</span>.
                          <button
                            type="button"
                            onClick={() => setReferenceJobId(null)}
                            className={cx("ml-3", generatorQuietButtonClass, "border-emerald-300/25 bg-emerald-400/10 text-emerald-100")}
                          >
                            Clear
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-3 text-[12px] text-white/55">
                          Pick “Use as reference look” from Recent generations when you want more consistency.
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              ) : null}

              {activeJob ? (
                <div className={cx("mt-4 flex flex-wrap items-center gap-2", generatorWarningCardClass)}>
                  <span className={cx("rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusTone(status))}>
                    {statusLabel}
                  </span>
                  <span className="text-xs text-amber-100/85">Latest job #{activeJob.id}</span>
                  {activeJobCancelable ? (
                    <button
                      type="button"
                      onClick={() => cancelQueuedJob(activeJob.id)}
                      disabled={cancelingJobId === activeJob.id}
                      className={cx(
                        "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition",
                        cancelingJobId === activeJob.id
                          ? "cursor-not-allowed border-rose-300/25 bg-rose-500/10 text-rose-100/60"
                          : "border-rose-300/35 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                      )}
                    >
                      {cancelingJobId === activeJob.id ? "Canceling..." : status === "running" ? "Stop generation" : "Cancel"}
                    </button>
                  ) : null}
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
                    <div className={cx("grid gap-3", generatorWarningCardClass)}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/90">AI Post Mode</div>
                          <div className="mt-1 text-sm font-semibold text-amber-50">Choose between a picture post or a video post.</div>
                        </div>
                        <div className="text-[11px] text-amber-100/90">Images cost less. Video costs more.</div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setPostVisualMode("image")}
                          className={cx(
                            "rounded-2xl border px-4 py-3 text-left transition",
                            postVisualMode === "image"
                              ? "border-amber-200/60 bg-amber-300/12 text-amber-50 shadow-[0_0_0_1px_rgba(253,224,71,0.18)]"
                              : "border-white/12 bg-black/25 text-white/80 hover:bg-white/[0.06]"
                          )}
                        >
                          <div className="text-sm font-semibold">Picture post</div>
                          <div className="mt-1 text-[12px] text-white/70">Still images + voiceover</div>
                          <div className="mt-2 text-[11px] text-amber-100/90">{postImageCreditsEstimate} credits estimated</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPostVisualMode("video")}
                          className={cx(
                            "rounded-2xl border px-4 py-3 text-left transition",
                            postVisualMode === "video"
                              ? "border-amber-200/60 bg-amber-300/12 text-amber-50 shadow-[0_0_0_1px_rgba(253,224,71,0.18)]"
                              : "border-white/12 bg-black/25 text-white/80 hover:bg-white/[0.06]"
                          )}
                        >
                          <div className="text-sm font-semibold">Video post</div>
                          <div className="mt-1 text-[12px] text-white/70">Moving scenes + voiceover</div>
                          <div className="mt-2 text-[11px] text-amber-100/90">{postVideoCreditsEstimate} credits estimated</div>
                        </button>
                      </div>
                    </div>

                    <label className="text-xs font-medium text-white/70">Visual direction</label>
                    <textarea
                      value={postVisualPrompt}
                      onChange={(e) => setPostVisualPrompt(e.target.value)}
                      rows={10}
                      placeholder="Describe shots, scene style, camera behavior, and pacing."
                      className={generatorFieldClass}
                    />
                    <div className="text-[11px] text-white/50">
                      {postVisualLength.toLocaleString()} / {POST_VISUAL_PROMPT_MAX_CHARS.toLocaleString()} characters
                    </div>

                    <label className="mt-1 text-xs font-medium text-white/70">Voiceover script</label>
                    <textarea
                      value={postVoiceScript}
                      onChange={(e) => setPostVoiceScript(e.target.value)}
                      rows={8}
                      placeholder="Write the narration for your 1-minute clip."
                      className={generatorFieldClass}
                    />
                    <div className="text-[11px] text-white/50">
                      {postVoiceLength.toLocaleString()} / {POST_VOICE_SCRIPT_MAX_CHARS.toLocaleString()} characters
                    </div>
                    <details className="rounded-2xl border border-white/10 bg-[#09111c]/72 px-4 py-3 text-[12px] text-white/70">
                      <summary className="cursor-pointer list-none font-semibold text-white/84">Optional dialogue for character lines</summary>
                      <div className="mt-3 grid gap-2">
                        <label className="text-xs font-medium text-white/70">Character dialogue</label>
                        <textarea
                          value={postDialogueScript}
                          onChange={(e) => setPostDialogueScript(e.target.value)}
                          rows={4}
                          placeholder="Optional: Founder: We almost quit. Partner: But we kept showing up."
                          className={generatorFieldClass}
                        />
                      </div>
                    </details>
                    <div className={cx("text-[11px]", generatorWarningCardClass)}>
                      <div>
                        Estimated voice length at 1x:{" "}
                        <span className="font-semibold text-amber-50">{formatDuration(postEstimateAt1xSeconds)}</span>
                      </div>
                      {postNeedsMoreWords ? (
                        <div className="mt-1 text-amber-50">
                          Script is short for this duration. Add more words for fuller narration.
                        </div>
                      ) : null}
                      {postWillAutoSpeed ? (
                        <div className="mt-1 text-amber-50">Script is long, so playback speed is auto-adjusted to fit.</div>
                      ) : null}
                      <div className="mt-1 text-amber-100/85">
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
                      className={generatorFieldClass}
                    />
                    <div className="text-[11px] text-white/50">
                      {mode === "voiceover"
                        ? `${textLength.toLocaleString()} / ${VOICEOVER_SCRIPT_MAX_CHARS.toLocaleString()} characters`
                        : `${textLength.toLocaleString()} / ${
                            (mode === "image" ? IMAGE_PROMPT_MAX_CHARS : VIDEO_PROMPT_MAX_CHARS).toLocaleString()
                          } characters`}
                    </div>
                    {mode === "video" ? (
                      <>
                        <details className="rounded-2xl border border-white/10 bg-[#09111c]/72 px-4 py-3 text-[12px] text-white/70">
                          <summary className="cursor-pointer list-none font-semibold text-white/84">Optional dialogue for voice mode</summary>
                          <div className="mt-3 grid gap-2">
                            <label className="text-xs font-medium text-white/70">Character dialogue</label>
                            <textarea
                              value={videoDialogueScript}
                              onChange={(e) => setVideoDialogueScript(e.target.value)}
                              rows={4}
                              placeholder="Optional speaking lines to guide lip-sync and emotional tone."
                              className={generatorFieldClass}
                            />
                          </div>
                        </details>
                      </>
                    ) : null}
                  </>
                )}
              </div>

              {error ? (
                <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-xs text-rose-100">
                  <div className="font-semibold text-rose-50">Generation issue</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-rose-100/95">{error}</div>
                  <div className="mt-2 text-rose-100/85">
                    What to do: <span className="font-semibold">{generationRecoveryAction(error)}</span>
                  </div>
                  {needsBilling ? (
                    <div className="mt-2">
                      <Link href="/app/billing" className="underline decoration-rose-200/30 underline-offset-4">
                        Open billing
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className={cx("text-xs", generatorWarningCardClass)}>
                  Estimated cost: <span className="font-semibold text-amber-50">{estimatedCredits} credits</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[auto_auto]">
                  {activeJobCancelable ? (
                    <button
                      type="button"
                      onClick={() => activeJob && cancelQueuedJob(activeJob.id)}
                      disabled={!activeJob || cancelingJobId === activeJob.id}
                      className={cx(
                        "h-12 rounded-2xl border px-5 text-sm font-semibold transition",
                        !activeJob || cancelingJobId === activeJob?.id
                          ? "cursor-not-allowed border-rose-300/20 bg-rose-500/10 text-rose-100/60"
                          : "border-rose-300/40 bg-rose-500/12 text-rose-100 hover:bg-rose-500/20"
                      )}
                    >
                      {cancelingJobId === activeJob?.id ? "Canceling..." : "Cancel"}
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={!canGenerate}
                    className={cx(
                      "h-12 rounded-2xl border px-6 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/25",
                      generationInFlight
                        ? generatorWarningButtonClass
                        : canGenerate
                          ? generatorAccentButtonClass
                          : "cursor-not-allowed border-white/10 bg-white/[0.06] text-white/45"
                    )}
                  >
                    {submitting ? "Starting..." : activeJobCancelable ? statusLabel : `Generate ${modeLabel(mode)}`}
                  </button>
                </div>
              </div>

              </div>
            </section>

            <aside className="grid gap-4">
              <div className={cx("surface-soft rounded-[28px] border-white/10 p-5", generatorPanelClass)}>
                <div className="text-sm font-semibold text-white/88">Render setup</div>
                <div className="mt-1 text-[12px] text-white/56">Only the controls that materially change the output stay visible here.</div>
                <div className="mt-3 grid gap-3">
                  {(mode === "post" || mode === "video" || mode === "image") ? (
                    <div className="grid gap-2">
                      <label className="text-xs font-medium text-white/70">Aspect ratio</label>
                      <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value)}
                        className={generatorSelectClass}
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
                        className={generatorSelectClass}
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
                    <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#09111c]/72 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={watermarkEnabled}
                        onChange={(e) => setWatermarkEnabled(e.target.checked)}
                        disabled={freeTrialWatermarkLocked}
                        className="h-4 w-4 accent-sky-400"
                      />
                      <span className="text-xs text-white/80">
                        Orbito Watermark
                        {freeTrialWatermarkLocked ? " • required on Free Trial" : ""}
                      </span>
                    </label>
                  ) : null}

                  {mode === "post" ? (
                    <>
                      <div className={cx("text-[11px]", generatorWarningCardClass)}>
                        Picture posts use still images plus voiceover and cost less. Video posts use moving scenes plus voiceover and cost more.
                      </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-medium text-white/70">Duration</label>
                      <select
                        value={postDurationSeconds}
                        onChange={(e) => setPostDurationSeconds(Number(e.target.value))}
                        className={generatorSelectClass}
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
                    <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#09111c]/72 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={postCaptionsEnabled}
                        onChange={(e) => setPostCaptionsEnabled(e.target.checked)}
                        className="h-4 w-4 accent-sky-400"
                      />
                      <span className="text-xs text-white/80">Burn-in captions</span>
                    </label>
                    <div className="text-[11px] text-amber-100/85">Captions use Orbito Labs’ default burn-in style. It’s either on or off now.</div>
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
                        className={generatorSelectClass}
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
                              ? generatorModeActiveClass
                              : "border-white/10 bg-[#09111c]/72 text-white/70 hover:bg-white/8"
                          )}
                        >
                          HD
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (fastEligible) setVideoSpeed("4k");
                          }}
                          disabled={!fastEligible}
                          className={cx(
                            "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                            videoSpeed === "4k"
                              ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-50"
                              : "border-white/10 bg-[#09111c]/72 text-white/70 hover:bg-white/8",
                            !fastEligible && "cursor-not-allowed opacity-55"
                          )}
                          title={fastEligible ? "Premium enabled" : "Upgrade to Creator for Premium"}
                        >
                          Premium
                        </button>
                      </div>
                      <div className="text-[11px] text-white/55">Premium uses the higher-quality Veo path and costs more than HD.</div>
                      {!fastEligible ? <div className="text-[11px] text-white/55">Creator plan required for Premium mode.</div> : null}
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-medium text-white/70">Voice (optional)</label>
                      <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#09111c]/72 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={videoVoiceEnabled}
                          onChange={(e) => setVideoVoiceEnabled(e.target.checked)}
                          className="h-4 w-4 accent-sky-400"
                        />
                        <span className="text-xs text-white/80">Add voiceover</span>
                      </label>
                      {videoVoiceEnabled ? (
                        <div className={cx("grid gap-2 p-3", generatorInsetClass)}>
                          <div className="grid gap-2">
                            <label className="text-[11px] font-semibold text-white/70">Voice style</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setVideoVoiceMode("narration")}
                                className={cx(
                                  "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                                  videoVoiceMode === "narration"
                                    ? generatorModeActiveClass
                                    : "border-white/10 bg-[#09111c]/72 text-white/70 hover:bg-white/8"
                                )}
                              >
                                Narration
                              </button>
                              <button
                                type="button"
                                onClick={() => setVideoVoiceMode("dialogue")}
                                className={cx(
                                  "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                                  videoVoiceMode === "dialogue"
                                    ? generatorModeActiveClass
                                    : "border-white/10 bg-[#09111c]/72 text-white/70 hover:bg-white/8"
                                )}
                              >
                                Dialogue
                              </button>
                            </div>
                          </div>
                          {renderVoiceSelector(VOICE_BASE_WPM)}
                          {videoVoiceMode === "dialogue" ? (
                            <div className="text-[11px] text-white/55">
                              Dialogue uses your dialogue lines to alternate two voices for back-and-forth speech.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
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
                        className={generatorSelectClass}
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

            <details className={cx("surface-soft rounded-[28px] border-white/10 p-5", generatorPanelClass)}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white/88">Recent generations</div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    refreshJobs();
                  }}
                  className={generatorQuietButtonClass}
                >
                  Refresh
                </button>
              </summary>

              {jobs.length ? (
                <div className="mt-3 grid gap-2">
                  {jobs.slice(0, 4).map((j) => (
                    <div
                      key={j.id}
                      onClick={() => {
                        openJobFromQueue(j);
                      }}
                      className="cursor-pointer text-left rounded-2xl border border-white/10 bg-[#09111c]/72 p-3 transition hover:bg-white/[0.06]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-sm font-semibold text-white/85">{shortPromptLabel(j.prompt, j.id)}</div>
                        <div className="flex items-center gap-2">
                          <span className={cx("rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusTone(j.status))}>
                            {prettyStatus(j.status)}
                          </span>
                          {["queued", "running"].includes(String(j.status || "").toLowerCase()) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelQueuedJob(j.id);
                              }}
                              disabled={cancelingJobId === j.id}
                              className={cx(
                                "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition",
                                cancelingJobId === j.id
                                  ? "cursor-not-allowed border-rose-300/25 bg-rose-500/10 text-rose-100/60"
                                  : "border-rose-300/35 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                              )}
                            >
                              {cancelingJobId === j.id ? "Canceling..." : String(j.status || "").toLowerCase() === "running" ? "Stop" : "Cancel"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-white/55">
                        {kindLabel(j.kind)} • {durationPresetLabel(j.duration_seconds)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openJobFromQueue(j);
                          }}
                          className={generatorQuietButtonClass}
                        >
                          Load settings
                        </button>
                        {((mode === "post" && String(j.kind || "").toLowerCase() === "generate_post") ||
                          (mode === "video" && String(j.kind || "").toLowerCase() === "generate")) &&
                        String(j.status || "").toLowerCase() === "done" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              applyContinuationFromJob(j);
                            }}
                            className="rounded-xl border border-sky-300/30 bg-sky-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky-100 transition hover:bg-sky-400/18"
                          >
                            Use as story memory
                          </button>
                        ) : null}
                        {(mode === "post" || mode === "video") && isReferenceEligibleJob(j) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              applyReferenceFromJob(j);
                            }}
                            className="rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/18"
                          >
                            Use as reference look
                          </button>
                        ) : null}
                      </div>
                      {(String(j.status || "").toLowerCase() === "failed" || String(j.status || "").toLowerCase() === "canceled") ? (
                        <div className="mt-2 rounded-xl border border-rose-300/20 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-100/90">
                          <div>{conciseError(j.error || "Generation failed.")}</div>
                          <div className="mt-1 text-rose-100/80">What to do: {generationRecoveryAction(j.error || "")}</div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-center text-sm text-white/60">
                  No generation jobs yet.
                </div>
              )}
            </details>
          </aside>
        </form>
        </div>
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
