// frontend/app/app/upload/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

/* =========================================================
   Orbito — Uploads (REAL)
   Real flow (file):
   1) /storage/presign
   2) PUT to S3 (presigned)
   3) /uploads/register  -> returns upload_id + job_id (credits deducted here)
   4) Poll /jobs/{id} for status (queued/running/done/failed)

   Launch-ready:
   - Hero header card styled like Clips "workspace"
   - Output settings (aspect required, captions toggle, watermark paid-only)
   - Settings + session persistence

   YouTube (User-assisted, reliable):
   - Paste link -> open in new tab -> user downloads MP4 -> upload via normal flow
   - No server-side YouTube fetch (avoids bot-wall + silent failures)

   POLISH (Option A):
   - Remove misleading “we download it” language
   - Dropzone highlight when YouTube step becomes ready
   - YouTube trust + preview + disclaimer (shows credits)
========================================================= */

const DEV_BUILD_STAMP = "upload-page-2026-01-29-youtube-assisted-preview";

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

type Flow =
  | "idle"
  | "dragging"
  | "selected"
  | "uploading"
  | "processing"
  | "done"
  | "error"
  | "canceled";

type JobStatus = "queued" | "running" | "done" | "failed";

type PresignResponse = {
  put_url: string;
  storage_key: string;
  required_headers?: Record<string, string>;
};

type RegisterResponse = {
  upload_id: number;
  job_id: number;
  status: JobStatus;
};

type JobRow = {
  id: number;
  upload_id: number;
  status: JobStatus;
  error: string | null;
  created_at: string;
  updated_at?: string | null;
};

type MeResponse = {
  email: string;
  plan: string; // "free" | "starter" | ...
  credits: number;
};

// IMPORTANT: must match backend RegisterUploadRequest.AspectRatio
type AspectRatio = "9:16" | "1:1" | "4:5" | "16:9" | "4:3";

// YouTube preview (Option A trust + cost visibility)
type YouTubePreviewResponse = {
  video_id?: string;
  normalized_url?: string;
  title: string;
  channel: string | null;
  duration_seconds: number;
  thumbnail_url: string | null;
  credits_required: number;
  minutes_rounded?: number;
};

function prettyBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function ceilMinutes(seconds: number) {
  const s = Math.max(0, Number(seconds || 0));
  return Math.max(1, Math.ceil(s / 60));
}

function creditsForSeconds(seconds: number) {
  // Orbito rule: 2 credits per minute
  return ceilMinutes(seconds) * 2;
}

async function getVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    const cleanup = () => {
      try {
        video.src = "";
        URL.revokeObjectURL(url);
      } catch {}
    };

    video.onloadedmetadata = () => {
      const d = Number(video.duration);
      cleanup();
      if (!Number.isFinite(d) || d <= 0) return resolve(0);
      resolve(d);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read video duration."));
    };

    video.src = url;
  });
}

function isValidYoutubeUrl(v: string) {
  const s = v.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    const host = u.hostname.replace("www.", "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      return u.searchParams.has("v");
    }
    if (host === "youtu.be") return !!u.pathname.slice(1);
    return false;
  } catch {
    return false;
  }
}

function normalizeYoutubeUrl(input: string) {
  const s = input.trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    const host = u.hostname.replace("www.", "");
    if (host === "youtu.be") {
      const id = u.pathname.replace("/", "").trim();
      if (!id) return s;
      const out = new URL("https://www.youtube.com/watch");
      out.searchParams.set("v", id);
      return out.toString();
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v")?.trim();
      if (!v) return s;
      const out = new URL("https://www.youtube.com/watch");
      out.searchParams.set("v", v);
      return out.toString();
    }
    return s;
  } catch {
    return s;
  }
}

function StepChip({
  label,
  active,
  done,
}: {
  label: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <div
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] transition",
        done
          ? "border-white/12 bg-white/[0.06] text-white/80"
          : active
          ? "border-white/16 bg-white/[0.10] text-white/85"
          : "border-white/10 bg-white/[0.03] text-white/55"
      )}
    >
      <span
        className={cx(
          "h-1.5 w-1.5 rounded-full",
          done ? "bg-white/60" : active ? "bg-white/55" : "bg-white/25"
        )}
      />
      {label}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full border border-white/10 bg-white/[0.03]">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${v}%`,
          background:
            "linear-gradient(90deg, rgba(167,139,250,0.55), rgba(125,211,252,0.45), rgba(45,212,191,0.40))",
        }}
      />
    </div>
  );
}

function ErrorBanner({
  title,
  detail,
  onReset,
  cta,
}: {
  title: string;
  detail?: string | null;
  onReset: () => void;
  cta?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
      <div className="text-sm font-semibold text-white/90">{title}</div>
      {detail ? (
        <div className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-white/70">
          {detail}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="btn-solid-dark px-4 py-2 text-[12px]"
        >
          Reset
        </button>
        {cta ? cta : null}
      </div>
    </div>
  );
}

function isProbablyCorsNetworkError(e: any) {
  const msg = String(e?.message || e || "");
  return (
    msg.toLowerCase().includes("failed to fetch") ||
    msg.toLowerCase().includes("networkerror") ||
    msg.toLowerCase().includes("cors")
  );
}

function formatS3CorsHint() {
  return [
    "This looks like a browser CORS block while uploading to S3.",
    "",
    "Fix (S3 bucket CORS) must allow:",
    "- Origin: your frontend (e.g. http://localhost:3000 / http://127.0.0.1:3000)",
    "- Methods: PUT, GET, HEAD",
    "- AllowedHeaders: Content-Type, x-amz-meta-original_filename (or *)",
    "",
    "After updating S3 CORS, retry the upload.",
  ].join("\n");
}

function sanitizePutHeaders(h: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h || {})) {
    const lk = k.toLowerCase().trim();
    if (lk === "x-amz-meta-user_id") continue;
    out[k.trim()] = String(v);
  }
  return out;
}

function xhrPutWithProgress(args: {
  url: string;
  file: File;
  headers: Record<string, string>;
  onProgress: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { url, file, headers, onProgress, signal } = args;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);

    Object.entries(headers).forEach(([k, v]) => {
      const lk = k.toLowerCase().trim();
      if (lk === "x-amz-meta-user_id") return;
      xhr.setRequestHeader(k, v);
    });

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const pct = ev.total > 0 ? (ev.loaded / ev.total) * 100 : 0;
      onProgress(pct);
    };

    xhr.onerror = () => reject(new Error("Network error (likely CORS) during S3 upload."));
    xhr.onabort = () => reject(new Error("Upload canceled."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const body = xhr.responseText || "";
      reject(
        new Error(
          `S3 PUT failed (HTTP ${xhr.status})\n\n${body.slice(0, 3000) || "No response body"}`
        )
      );
    };

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      const onAbort = () => xhr.abort();
      signal.addEventListener("abort", onAbort, { once: true });
    }

    xhr.send(file);
  });
}

function loadPersistedSession():
  | {
      uploadId: number | null;
      jobId: number | null;
      storageKey: string | null;
      fileName: string | null;
    }
  | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("cf_upload_session_v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      uploadId: Number.isFinite(parsed.uploadId) ? parsed.uploadId : null,
      jobId: Number.isFinite(parsed.jobId) ? parsed.jobId : null,
      storageKey: typeof parsed.storageKey === "string" ? parsed.storageKey : null,
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : null,
    };
  } catch {
    return null;
  }
}

function persistSession(s: {
  uploadId: number | null;
  jobId: number | null;
  storageKey: string | null;
  fileName: string | null;
}) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("cf_upload_session_v1", JSON.stringify(s));
  } catch {
    // ignore
  }
}

function clearPersistedSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("cf_upload_session_v1");
  } catch {
    // ignore
  }
}

const SETTINGS_KEY = "cf_upload_settings_v2";

function loadSettings():
  | {
      aspect_ratio: AspectRatio | null;
      captions_enabled: boolean;
      watermark_enabled: boolean;
    }
  | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as any;
    const ar =
      typeof p?.aspect_ratio === "string" ? (p.aspect_ratio as AspectRatio) : null;
    const ce = typeof p?.captions_enabled === "boolean" ? p.captions_enabled : true;
    const we = typeof p?.watermark_enabled === "boolean" ? p.watermark_enabled : true;
    return { aspect_ratio: ar, captions_enabled: ce, watermark_enabled: we };
  } catch {
    return null;
  }
}

function saveSettings(s: {
  aspect_ratio: AspectRatio | null;
  captions_enabled: boolean;
  watermark_enabled: boolean;
}) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
      className={cx(
        "group flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
        disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-white/[0.04]",
        "border-white/10 bg-white/[0.02]"
      )}
    >
      <div>
        <div className="text-[12px] font-semibold text-white/85">{label}</div>
        {hint ? <div className="mt-1 text-[12px] text-white/55">{hint}</div> : null}
      </div>

      <div
        className={cx(
          "mt-0.5 h-5 w-9 rounded-full border px-[2px] transition flex items-center",
          checked
            ? "border-white/20 bg-white/[0.10] justify-end"
            : "border-white/10 bg-white/[0.03] justify-start"
        )}
      >
        <div
          className={cx(
            "h-4 w-4 rounded-full transition-transform",
            checked ? "bg-white/80" : "bg-white/35"
          )}
        />
      </div>
    </button>
  );
}

function AspectSegment({
  value,
  active,
  onClick,
}: {
  value: AspectRatio;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "relative rounded-full border px-3 py-1.5 text-[12px] transition",
        active
          ? "border-white/20 bg-white/[0.10] text-white/90"
          : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.05] hover:border-white/14"
      )}
    >
      <span className="relative">{value.replace(":", " : ")}</span>
    </button>
  );
}

function isInsufficientCreditsError(e: any) {
  const status = e?.status ?? e?.response?.status ?? e?.httpStatus;
  if (status === 402) return true;
  const msg = String(e?.message || "");
  return msg.includes("402") || msg.toLowerCase().includes("insufficient credits");
}

export function UploadWorkspace() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [flow, setFlow] = useState<Flow>("idle");
  const [file, setFile] = useState<File | null>(null);

  // Local file cost preview (exact duration from metadata)
  const [fileDurationSec, setFileDurationSec] = useState<number | null>(null);
  const [fileCredits, setFileCredits] = useState<number | null>(null);
  const [fileDurationLoading, setFileDurationLoading] = useState(false);

  const [uploadId, setUploadId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);

  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState<string>("");

  const [errorTitle, setErrorTitle] = useState<string>("");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  // YouTube (user-assisted)
  const [url, setUrl] = useState("");
  const urlOk = useMemo(() => isValidYoutubeUrl(url), [url]);
  const [ytStep, setYtStep] = useState<"idle" | "opened" | "ready">("idle");

  const [ytPreview, setYtPreview] = useState<YouTubePreviewResponse | null>(null);
  const [ytPreviewLoading, setYtPreviewLoading] = useState(false);
  const [ytPreviewError, setYtPreviewError] = useState<string | null>(null);
  const ytPreviewAbort = useRef<AbortController | null>(null);

  // Me (plan gating)
  const [me, setMe] = useState<MeResponse | null>(null);

  // Output settings
  const [aspectRatio, setAspectRatio] = useState<AspectRatio | null>(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);

  const isFree = (me?.plan || "").toLowerCase().trim() === "free";

  const pollAbort = useRef<AbortController | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);

  // Dropzone pulse focus (YouTube Step 3)
  const dropzoneRef = useRef<HTMLDivElement | null>(null);
  const [pulseOn, setPulseOn] = useState(false);
  const pulseTimer = useRef<number | null>(null);
  
  
  async function requestCancelJob(targetJobId: number) {
    try {
    await apiFetch(`/jobs/${targetJobId}/cancel`, { method: "POST" });
  } catch {
    // best-effort
  }
}


  function pulseDropzone() {
    try {
      if (typeof window !== "undefined") {
        if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
      }
    } catch {}
    setPulseOn(true);

    try {
      dropzoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {}

    if (typeof window !== "undefined") {
      pulseTimer.current = window.setTimeout(() => setPulseOn(false), 1400);
    }
  }

  useEffect(() => {
    return () => {
      try {
        if (typeof window !== "undefined" && pulseTimer.current) {
          window.clearTimeout(pulseTimer.current);
        }
      } catch {}
    };
  }, []);

  const steps = useMemo(() => {
    const selectedDone = flow !== "idle" && flow !== "dragging";
    const uploadDone = flow === "processing" || flow === "done";
    const processDone = flow === "done";
    return { selectedDone, uploadDone, processDone };
  }, [flow]);

  const canBrowse =
    !file &&
    (flow === "idle" || flow === "dragging" || flow === "error" || flow === "canceled");

  const settingsOk = !!aspectRatio;

  async function fetchYoutubePreview(targetUrl: string) {
    ytPreviewAbort.current?.abort();
    const ac = new AbortController();
    ytPreviewAbort.current = ac;

    setYtPreviewLoading(true);
    setYtPreviewError(null);

    try {
      const data = await apiFetch<YouTubePreviewResponse>("/youtube/preview", {
        method: "POST",
        body: { url: targetUrl },
        signal: ac.signal,
      });
      setYtPreview(data);
    } catch (e: any) {
      const msg = typeof e?.message === "string" ? e.message : "Could not preview video.";
      setYtPreview(null);
      setYtPreviewError(msg);
    } finally {
      setYtPreviewLoading(false);
      ytPreviewAbort.current = null;
    }
  }

  useEffect(() => {
    console.log("[UploadsPage.build]", DEV_BUILD_STAMP);

    apiFetch<MeResponse>("/auth/me")
      .then((d) => setMe(d))
      .catch(() => setMe(null));

    const s = loadSettings();
    if (s) {
      setAspectRatio(s.aspect_ratio ?? null);
      setCaptionsEnabled(!!s.captions_enabled);
      setWatermarkEnabled(!!s.watermark_enabled);
    }

    const sess = loadPersistedSession();
    if (!sess?.jobId) return;

    setUploadId(sess.uploadId);
    setJobId(sess.jobId);
    setStorageKey(sess.storageKey);

    setFile(null);
    setFlow("processing");
    setProgress(92);
    setStatusText("Resuming…");

    pollJobUntilComplete(sess.jobId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveSettings({
      aspect_ratio: aspectRatio,
      captions_enabled: captionsEnabled,
      watermark_enabled: watermarkEnabled,
    });
  }, [aspectRatio, captionsEnabled, watermarkEnabled]);

  useEffect(() => {
    if (isFree) setWatermarkEnabled(true);
  }, [isFree]);

  // YouTube URL changes: reset step + preview state (debounced preview call)
  useEffect(() => {
    const u = url.trim();
    setYtPreviewError(null);

    if (!u) {
      setYtPreview(null);
      setYtPreviewLoading(false);
      ytPreviewAbort.current?.abort();
      ytPreviewAbort.current = null;
      return;
    }

    if (!urlOk) {
      setYtPreview(null);
      setYtPreviewLoading(false);
      ytPreviewAbort.current?.abort();
      ytPreviewAbort.current = null;
      return;
    }

    const normalized = normalizeYoutubeUrl(u);
    const t = window.setTimeout(() => {
      fetchYoutubePreview(normalized);
    }, 450);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlOk, url]);

  function resetFileFlow() {
    pollAbort.current?.abort();
    pollAbort.current = null;

    uploadAbort.current?.abort();
    uploadAbort.current = null;

    setFlow("idle");
    setFile(null);

    setFileDurationSec(null);
    setFileCredits(null);
    setFileDurationLoading(false);

    setUploadId(null);
    setJobId(null);
    setStorageKey(null);

    setProgress(0);
    setStatusText("");

    setErrorTitle("");
    setErrorDetail(null);

    clearPersistedSession();
    if (inputRef.current) inputRef.current.value = "";
  }

  async function cancelUpload() {
   uploadAbort.current?.abort();
    pollAbort.current?.abort();
    uploadAbort.current = null;
    pollAbort.current = null;

    if (jobId) {
      await requestCancelJob(jobId);
    }

    clearPersistedSession();

    setStatusText("Canceled.");
    setFlow("canceled");
  }


  function fail(title: string, detail?: string | null) {
    pollAbort.current?.abort();
    pollAbort.current = null;

    uploadAbort.current?.abort();
    uploadAbort.current = null;

    setErrorTitle(title);
    setErrorDetail(detail ?? null);
    setFlow("error");
  }

  function openPicker() {
    if (!canBrowse) return;
    inputRef.current?.click();
  }

  async function onFilePicked(f: File | null) {
    if (!f) return;
    if (flow === "uploading" || flow === "processing") return;

    resetFileFlow();
    setFile(f);
    setFlow("selected");

    setFileDurationSec(null);
    setFileCredits(null);
    setFileDurationLoading(true);

    try {
      const dur = await getVideoDurationSeconds(f);
      setFileDurationSec(dur);
      setFileCredits(creditsForSeconds(dur));
    } catch {
      setFileDurationSec(null);
      setFileCredits(null);
    } finally {
      setFileDurationLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (flow === "uploading" || flow === "processing") return;

    const f = e.dataTransfer.files?.[0] ?? null;
    setFlow("idle");
    void onFilePicked(f);
  }

  async function pollJobUntilComplete(targetJobId: number) {
    pollAbort.current?.abort();
    const ac = new AbortController();
    pollAbort.current = ac;

    const started = Date.now();
    setStatusText("Queued…");
    setProgress((p) => Math.max(p, 92));

    let delay = 700;

    while (!ac.signal.aborted) {
      // eslint-disable-next-line no-await-in-loop
      const hit = await apiFetch<JobRow>(`/jobs/${targetJobId}`, {
        signal: ac.signal,
      });

      if (hit.status === "queued") setStatusText("Queued…");
      else if (hit.status === "running") setStatusText("Processing…");
      else if (hit.status === "done") {
        setStatusText("Ready.");
        setProgress(100);
        setFlow("done");
        clearPersistedSession();
        return;
      } else if (hit.status === "failed") {
        fail("Job failed", hit.error ?? "Unknown worker error.");
        clearPersistedSession();
        return;
      }

      // 60 minutes max
      if (Date.now() - started > 60 * 60 * 1000) {
        fail("Timed out", "Job is taking too long. Check worker logs and try again.");
        return;
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(2500, Math.round(delay * 1.2));
    }
  }

  async function startUpload() {
    if (!file) return;
    if (!settingsOk) {
      fail("Choose output settings", "Select an aspect ratio before starting the upload.");
      return;
    }
    if (flow === "uploading" || flow === "processing") return;

    setFlow("uploading");
    setErrorTitle("");
    setErrorDetail(null);

    uploadAbort.current?.abort();
    const ac = new AbortController();
    uploadAbort.current = ac;

    setProgress(2);
    setStatusText("Requesting upload URL…");

    try {
      const presign = await apiFetch<PresignResponse>("/storage/presign", {
        method: "POST",
        body: {
          filename: file.name,
          content_type: file.type || "video/mp4",
          content_length: file.size,
        },
        signal: ac.signal,
      });

      setStorageKey(presign.storage_key);
      setProgress(10);
      setStatusText("Uploading to storage…");

      const required = presign.required_headers ?? null;
      if (!required || Object.keys(required).length === 0) {
        fail("Upload misconfigured", "Backend /storage/presign did not return required_headers.");
        return;
      }

      const safeHeaders = sanitizePutHeaders(required);

      await xhrPutWithProgress({
        url: presign.put_url,
        file,
        headers: safeHeaders,
        signal: ac.signal,
        onProgress: (pct) => {
          const mapped = 10 + pct * 0.75;
          setProgress((p) => Math.max(p, Math.min(85, mapped)));
        },
      });

      setProgress(88);
      setStatusText("Registering upload…");

      const reg = await apiFetch<RegisterResponse>("/uploads/register", {
        method: "POST",
        body: {
          original_filename: file.name,
          storage_key: presign.storage_key,

          // render settings
          aspect_ratio: aspectRatio,
          captions_enabled: captionsEnabled,
          watermark_enabled: isFree ? true : watermarkEnabled,

          // backend expects caption_style (or ignore)
          caption_style_json: null,
        },
        signal: ac.signal,
      });

      setUploadId(reg.upload_id);
      setJobId(reg.job_id);

      persistSession({
        uploadId: reg.upload_id,
        jobId: reg.job_id,
        storageKey: presign.storage_key,
        fileName: file.name,
      });

      setProgress(92);
      setFlow("processing");
      setStatusText(reg.status === "queued" ? "Queued…" : "Processing…");

      await pollJobUntilComplete(reg.job_id);
    } catch (e: any) {
      if (String(e?.message || "").toLowerCase().includes("canceled")) {
        setFlow("canceled");
        setStatusText("Canceled.");
        return;
      }

      const msg =
        typeof e?.detail === "string"
          ? e.detail
          : e?.detail
          ? JSON.stringify(e.detail, null, 2)
          : e?.body
          ? JSON.stringify(e.body, null, 2)
          : e?.message
          ? String(e.message)
          : "Unexpected error occurred.";


      if (isProbablyCorsNetworkError(e)) {
        fail("Upload failed (CORS)", `${msg}\n\n${formatS3CorsHint()}`);
        return;
      }

      if (isInsufficientCreditsError(e)) {
        const detail = e?.detail
          ? typeof e.detail === "string"
            ? e.detail
            : JSON.stringify(e.detail, null, 2)
          : "You don’t have enough credits for this video. Buy credits and try again.";
        fail("Insufficient credits", detail);
        return;
      }

      if (e?.detail) {
        try {
          const detailStr =
            typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail, null, 2);
          fail("Upload failed", detailStr);
          return;
        } catch {}
      }

      fail("Upload failed", msg);
    } finally {
      uploadAbort.current = null;
    }
  }

  function onDropzoneClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!canBrowse) return;
    const t = e.target as HTMLElement | null;
    if (t) {
      const interactive = t.closest("button, a, input, textarea, select, [role='button']");
      if (interactive) return;
    }
    openPicker();
  }

  function onDropzoneKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!canBrowse) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  }

  const headerSubtitle = useMemo(() => {
    if (flow === "processing") return "Processing runs in the background — you can leave this page.";
    if (flow === "done") return "Your clips are ready. Jump to Clips to review and export.";
    return "Drop a file or paste a YouTube link. Choose output settings first.";
  }, [flow]);

  const canStartUpload = settingsOk && !fileDurationLoading && fileCredits != null;

  return (
    <div className="grid gap-6">
      {/* HERO (match Clips workspace vibe) */}
      <div className="surface-soft relative overflow-hidden rounded-3xl p-6 md:p-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-12 opacity-40 blur-2xl"
          style={{
            background:
              "radial-gradient(220px 160px at 20% 25%, rgba(167,139,250,0.22), transparent 70%), radial-gradient(260px 180px at 70% 35%, rgba(125,211,252,0.18), transparent 72%), radial-gradient(260px 180px at 55% 95%, rgba(45,212,191,0.14), transparent 72%)",
          }}
        />
        <div className="relative">
          <div className="text-[12px] text-white/55">• Library</div>

          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white/90">
                Upload <span className="grad-text">workspace</span>
              </h1>
              <div className="mt-1 text-sm text-white/60">{headerSubtitle}</div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StepChip
                  label="Select"
                  active={
                    flow === "idle" ||
                    flow === "dragging" ||
                    flow === "selected" ||
                    flow === "canceled"
                  }
                  done={steps.selectedDone}
                />
                <StepChip label="Upload" active={flow === "uploading"} done={steps.uploadDone} />
                <StepChip
                  label="Processing"
                  active={flow === "processing"}
                  done={steps.processDone}
                />
                <StepChip label="Ready" active={flow === "done"} done={flow === "done"} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={uploadId ? `/app/clips?upload_id=${uploadId}` : "/app/clips"}
                className="btn-ghost text-[12px] px-4 py-2"
              >
                View clips
              </Link>
              <Link href="/app/billing" className="btn-solid-dark text-[12px] px-4 py-2">
                Buy credits
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-white/50">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              Credits: <span className="text-white/70">{me?.credits ?? "—"}</span>
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              Charge rule: <span className="text-white/70">2 credits / minute</span>
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              Charged at: <span className="text-white/70">Register</span>
            </span>
          </div>
        </div>
      </div>

      {/* Upload options */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* FILE */}
        <div className="surface-soft relative overflow-hidden p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-10 opacity-30 blur-2xl"
            style={{
              background:
                "radial-gradient(160px 110px at 25% 30%, rgba(167,139,250,0.14), transparent 70%), radial-gradient(180px 130px at 80% 45%, rgba(125,211,252,0.12), transparent 72%), radial-gradient(180px 130px at 50% 85%, rgba(45,212,191,0.10), transparent 72%)",
            }}
          >
            {/* bg only */}
          </div>

          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white/90">Upload a video</div>
                <div className="mt-1 text-sm text-white/60">Pick output settings, then upload.</div>
              </div>
              {file ? (
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-white/70">
                  {prettyBytes(file.size)}
                </div>
              ) : null}
            </div>

            {/* Output settings */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] font-semibold text-white/85">Output settings</div>
                  <div className="mt-1 text-[12px] text-white/55">Aspect ratio is required.</div>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-white/70">
                  Plan: <span className="text-white/85">{me?.plan ?? "—"}</span>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] font-semibold text-white/80">
                    Aspect ratio <span className="text-rose-200/90">*</span>
                  </div>
                  {!settingsOk ? (
                    <div className="text-[12px] text-rose-200/75">Required</div>
                  ) : (
                    <div className="text-[12px] text-white/45">Locked in for this run</div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {(["9:16", "1:1", "4:5", "16:9", "4:3"] as AspectRatio[]).map((v) => (
                    <AspectSegment
                      key={v}
                      value={v}
                      active={aspectRatio === v}
                      onClick={() => setAspectRatio(v)}
                    />
                  ))}
                </div>

                {!settingsOk ? (
                  <div className="mt-2 text-[12px] text-white/50">
                    Choose an aspect ratio to enable{" "}
                    <span className="text-white/70">Start upload</span>.
                  </div>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <Toggle
                  checked={captionsEnabled}
                  onChange={setCaptionsEnabled}
                  label="Captions"
                  hint="Burned-in subtitles (recommended)."
                />
                <Toggle
                  checked={watermarkEnabled || isFree}
                  onChange={setWatermarkEnabled}
                  disabled={isFree}
                  label="Watermark"
                  hint={isFree ? "Free plan forces watermark ON." : "Paid users can toggle."}
                />
              </div>
            </div>

            {/* File input */}
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => void onFilePicked(e.target.files?.[0] ?? null)}
            />

            {/* Dropzone */}
            <div
              ref={dropzoneRef}
              onClick={onDropzoneClick}
              onKeyDown={onDropzoneKeyDown}
              role={canBrowse ? "button" : undefined}
              tabIndex={canBrowse ? 0 : -1}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFlow((s) =>
                  s === "uploading" || s === "processing" || s === "done" ? s : "dragging"
                );
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFlow((s) => (s === "dragging" ? "idle" : s));
              }}
              onDrop={handleDrop}
              className={cx(
                "mt-4 group relative flex min-h-[190px] items-center justify-center rounded-2xl border border-dashed text-center transition",
                canBrowse ? "cursor-pointer" : "cursor-default",
                flow === "dragging"
                  ? "border-white/35 bg-white/[0.06]"
                  : "border-white/20 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]",
                pulseOn &&
                  "ring-2 ring-emerald-400/30 border-emerald-400/35 bg-emerald-500/[0.06]"
              )}
            >
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="aurora opacity-35" />
              </div>

              <div className="relative px-6">
                {flow === "error" ? (
                  <div className="w-full max-w-xl text-left">
                    <ErrorBanner
                      title={errorTitle || "Something went wrong"}
                      detail={errorDetail}
                      onReset={resetFileFlow}
                      cta={
                        isInsufficientCreditsError({ message: errorDetail || "" }) ? (
                          <Link href="/app/billing" className="btn-ghost px-4 py-2 text-[12px]">
                            Buy credits
                          </Link>
                        ) : null
                      }
                    />
                  </div>
                ) : flow === "uploading" ? (
                  <div className="mx-auto w-full max-w-sm text-left">
                    <div className="text-sm font-semibold text-white/85">Uploading…</div>
                    <div className="mt-1 text-xs text-white/55">
                      {file?.name ?? "video"} • {Math.round(progress)}%
                    </div>
                    <div className="mt-4">
                      <ProgressBar value={progress} />
                    </div>
                    <div className="mt-3 text-[12px] text-white/45">{statusText || "Uploading…"}</div>
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void cancelUpload()}

                        className="btn-ghost text-[12px] px-4 py-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : flow === "processing" ? (
                  <div className="mx-auto w-full max-w-sm text-left">
                    <div className="text-sm font-semibold text-white/85">
                      {statusText || "Queued for processing"}
                    </div>
                    <div className="mt-1 text-xs text-white/55">
                      Extracting audio, transcribing, cutting clips.
                    </div>

                    <div className="mt-4">
                      <ProgressBar value={progress} />
                    </div>

                    <div className="mt-3 space-y-1 text-[12px] text-white/45">
                      {uploadId ? (
                        <div>
                          Upload: <span className="text-white/65">{uploadId}</span>
                        </div>
                      ) : null}
                      {jobId ? (
                        <div>
                          Job: <span className="text-white/65">{jobId}</span>
                        </div>
                      ) : null}
                      {storageKey ? (
                        <div className="truncate">
                          Key: <span className="text-white/55">{storageKey}</span>
                        </div>
                      ) : null}
                      {aspectRatio ? (
                        <div>
                          Aspect: <span className="text-white/65">{aspectRatio}</span>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <span>Captions:</span>
                        <span className="text-white/65">{captionsEnabled ? "On" : "Off"}</span>
                        <span className="text-white/25">•</span>
                        <span>Watermark:</span>
                        <span className="text-white/65">
                          {(isFree ? true : watermarkEnabled) ? "On" : "Off"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <Link
                        href={uploadId ? `/app/clips?upload_id=${uploadId}` : "/app/clips"}
                        className="btn-ghost text-[12px] px-4 py-2"
                      >
                        Go to Clips
                      </Link>
                      <button
                        type="button"
                        onClick={() => void cancelUpload()}

                        className="btn-solid-dark text-[12px] px-4 py-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : flow === "done" ? (
                  <div className="mx-auto w-full max-w-sm text-left">
                    <div className="text-sm font-semibold text-white/85">Ready</div>
                    <div className="mt-1 text-xs text-white/55">Your clips are available now.</div>

                    <div className="mt-3 space-y-1 text-[12px] text-white/45">
                      {uploadId ? (
                        <div>
                          Upload: <span className="text-white/65">{uploadId}</span>
                        </div>
                      ) : null}
                      {jobId ? (
                        <div>
                          Job: <span className="text-white/65">{jobId}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <Link
                        href={uploadId ? `/app/clips?upload_id=${uploadId}` : "/app/clips"}
                        className="btn-solid-dark text-[12px] px-4 py-2"
                      >
                        View clips
                      </Link>
                      <button
                        type="button"
                        onClick={resetFileFlow}
                        className="btn-ghost text-[12px] px-4 py-2"
                      >
                        Upload another
                      </button>
                    </div>
                  </div>
                ) : flow === "canceled" ? (
                  <div className="mx-auto w-full max-w-sm text-left">
                    <div className="text-sm font-semibold text-white/85">Canceled</div>
                    <div className="mt-1 text-xs text-white/55">
                      Nothing was registered. You can try again.
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={resetFileFlow}
                        className="btn-solid-dark text-[12px] px-4 py-2"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                ) : file ? (
                  <div className="mx-auto w-full max-w-sm text-left">
                    <div className="text-sm font-semibold text-white/85">Ready to upload</div>
                    <div className="mt-1 text-xs text-white/55">
                      <span className="text-white/80">{file.name}</span> • {prettyBytes(file.size)}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-white/45">
                      <span>
                        Duration:{" "}
                        <span className="text-white/65">
                          {fileDurationLoading
                            ? "Reading…"
                            : fileDurationSec
                            ? formatDuration(fileDurationSec)
                            : "—"}
                        </span>
                      </span>
                      <span className="text-white/25">•</span>
                      <span>
                        Cost:{" "}
                        <span className="text-white/65">
                          {fileCredits != null ? `${fileCredits} credits` : "—"}
                        </span>
                      </span>
                    </div>

                    <div className="mt-2 text-[12px] text-white/45">
                      Output: <span className="text-white/65">{aspectRatio ?? "—"}</span>
                      <span className="text-white/25"> • </span>
                      Captions:{" "}
                      <span className="text-white/65">{captionsEnabled ? "On" : "Off"}</span>
                      <span className="text-white/25"> • </span>
                      Watermark:{" "}
                      <span className="text-white/65">
                        {(isFree ? true : watermarkEnabled) ? "On" : "Off"}
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={startUpload}
                        disabled={!canStartUpload}
                        className={cx(
                          "btn-solid-dark text-[12px] px-4 py-2",
                          !canStartUpload && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        Start upload
                      </button>
                      <button
                        type="button"
                        onClick={resetFileFlow}
                        className="btn-ghost text-[12px] px-4 py-2"
                      >
                        Choose different file
                      </button>
                    </div>

                    {!settingsOk ? (
                      <div className="mt-3 text-[12px] text-rose-200/70">
                        Select an aspect ratio above to continue.
                      </div>
                    ) : fileDurationLoading ? (
                      <div className="mt-3 text-[12px] text-white/45">
                        Reading video duration to calculate credits…
                      </div>
                    ) : fileCredits == null ? (
                      <div className="mt-3 text-[12px] text-white/45">
                        Couldn’t read duration — you can re-pick the file.
                      </div>
                    ) : (
                      <div className="mt-3 text-[12px] text-white/45">
                        Tip: Long-form works best (podcasts, interviews).
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <div className="text-sm font-semibold text-white/85">
                      {flow === "dragging" ? "Drop to upload" : "Drop a video file here"}
                    </div>
                    <div className="mt-1 text-xs text-white/55">MP4, MOV — long-form recommended</div>

                    <div className="mt-4 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openPicker();
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/75 transition hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                        aria-label="Browse files"
                      >
                        Or click to browse
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-white/55">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                Background processing
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                Safe to leave after starting
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                Clips appear automatically
              </span>
            </div>

            <div className="mt-3 text-[12px] text-white/35">
              Dev note: upload headers come from{" "}
              <span className="text-white/45">/storage/presign.required_headers</span>.
            </div>
          </div>
        </div>

        {/* PART 1 ENDS HERE — YouTube panel continues in Part 2 */}
        {/* YOUTUBE URL (User-assisted, reliable) */}
        <div className="surface-soft relative overflow-hidden p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-10 opacity-30 blur-2xl"
            style={{
              background:
                "radial-gradient(160px 110px at 25% 30%, rgba(167,139,250,0.14), transparent 70%), radial-gradient(180px 130px at 80% 45%, rgba(125,211,252,0.12), transparent 72%), radial-gradient(180px 130px at 50% 85%, rgba(45,212,191,0.10), transparent 72%)",
            }}
          />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white/90">Paste a YouTube link</div>
                <div className="mt-1 text-sm text-white/60">
                  Open the video in a new tab, download an MP4 locally, then upload it on the left.
                </div>
              </div>

              <div
                className={cx(
                  "rounded-full border bg-white/[0.04] px-3 py-1 text-[12px] text-white/70",
                  ytStep === "idle" ? "border-white/10" : "border-white/14"
                )}
              >
                {ytStep === "idle" ? "Step 1" : ytStep === "opened" ? "Step 2" : "Ready"}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setYtStep("idle");
                }}
                placeholder="Paste YouTube link…"
                className="field"
              />

              {!urlOk && url.trim().length > 0 ? (
                <div className="text-[12px] text-white/45">
                  Enter a valid YouTube URL (youtube.com/watch?v=… or youtu.be/…)
                </div>
              ) : null}

              {/* Preview card */}
              {urlOk ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                      {ytPreview?.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ytPreview.thumbnail_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-white/80">
                        {ytPreviewLoading
                          ? "Fetching preview…"
                          : ytPreview
                          ? ytPreview.title
                          : "Preview"}
                      </div>

                      {ytPreviewError ? (
                        <div className="mt-1 text-[12px] text-rose-200/70">{ytPreviewError}</div>
                      ) : ytPreview ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-white/55">
                          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5">
                            {formatDuration(ytPreview.duration_seconds)}
                          </span>
                          {ytPreview.channel ? (
                            <span className="truncate text-white/50">{ytPreview.channel}</span>
                          ) : null}
                          <span className="text-white/25">•</span>
                          <span className="text-white/55">
                            Credits:{" "}
                            <span className="text-white/75">{ytPreview.credits_required}</span>
                          </span>
                        </div>
                      ) : (
                        <div className="mt-1 text-[12px] text-white/45">
                          Paste a link to see duration + credits.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 text-[12px] text-white/45">
                    Credits are charged when you upload the MP4 and Orbito registers the job.
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!urlOk) return;
                    const u = normalizeYoutubeUrl(url);
                    window.open(u, "_blank", "noopener,noreferrer");
                    setYtStep("opened");
                  }}
                  disabled={!urlOk || ytStep === "ready"}
                  className={cx(
                    "btn-solid-dark px-4 py-2 text-[12px]",
                    (!urlOk || ytStep === "ready") && "opacity-50 cursor-not-allowed"
                  )}
                >
                  Open video
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!urlOk) return;
                    setYtStep("ready");
                    pulseDropzone();
                  }}
                  disabled={!urlOk || ytStep !== "opened"}
                  className={cx(
                    "btn-ghost px-4 py-2 text-[12px]",
                    (!urlOk || ytStep !== "opened") && "opacity-50 cursor-not-allowed"
                  )}
                >
                  I downloaded it
                </button>

                <div className="text-[12px] text-white/55">Most reliable method.</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-[12px] text-white/55">
                {ytStep === "idle" ? (
                  <>
                    <div className="font-semibold text-white/70">How it works</div>
                    <div className="mt-1">
                      1) Open the video • 2) Download MP4 locally • 3) Upload on the left
                    </div>
                  </>
                ) : ytStep === "opened" ? (
                  <>
                    <div className="font-semibold text-white/70">Step 2: Download the MP4</div>
                    <div className="mt-1">
                      Download the video locally, then click{" "}
                      <span className="text-white/75">I downloaded it</span>.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold text-white/70">Step 3: Upload it</div>
                    <div className="mt-1">
                      The uploader on the left is highlighted — upload your MP4 there.
                    </div>
                  </>
                )}
              </div>

              {ytStep === "ready" ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="text-sm font-semibold text-white/90">Ready to upload</div>
                  <div className="mt-1 text-sm text-white/65">
                    Upload the downloaded video using the left panel.
                  </div>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-[12px] font-semibold text-white/80">
                      YouTube download disclaimer
                    </div>
                    <div className="mt-2 text-[12px] leading-relaxed text-white/55">
                      YouTube does not allow Orbito to automatically download videos on your behalf.
                      To avoid copyright violations and unreliable imports, you’ll need to download
                      the MP4 locally using a third-party downloader you trust, then upload it here.
                    </div>
                    <div className="mt-3 text-[12px] text-white/45">
                      Automated YouTube imports are planned later.
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Trust / disclaimer (always visible) */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-[12px] font-semibold text-white/80">
                  Why do I download it myself?
                </div>
                <div className="mt-2 text-[12px] leading-relaxed text-white/55">
                  YouTube does not allow us to automatically download videos on your behalf. To keep
                  Orbito reliable and avoid failed imports, you download the MP4 locally using a tool
                  you trust, then upload it here.
                </div>
                <div className="mt-3 text-[12px] text-white/45">
                  Fully automated YouTube imports are coming later.
                </div>
              </div>

              <div className="pt-1 text-[12px] text-white/35">
                Tip: choose the highest-quality MP4 available.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / build stamp */}
      <div className="pt-1 text-[12px] text-white/30">
        Build: <span className="text-white/40">{DEV_BUILD_STAMP}</span>
      </div>
    </div>
  );
}

export default function UploadsPage() {
  return <UploadWorkspace />;
}
