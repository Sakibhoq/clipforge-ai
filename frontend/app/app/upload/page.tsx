"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

/* =========================================================
   Clipforge — Uploads (REAL)
   Real flow (file):
   1) /storage/presign
   2) PUT to S3 (presigned)
   3) /uploads/register  -> returns upload_id + job_id
   4) Poll /jobs for job_id status (queued/running/done/failed)

   Improvements (this file):
   - Fix: “Or click to browse” button actually opens file picker
   - Dropzone click opens picker unless click came from an interactive element
   - Real upload progress via XHR (fetch can't report upload progress)
   - Cancel upload (aborts XHR + polling)
   - Better error messaging (detect likely S3 CORS block)
========================================================= */

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

function UploadCard({
  title,
  desc,
  children,
  right,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="surface-soft relative overflow-hidden p-6">
      {/* subtle aurora wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 opacity-35 blur-2xl"
        style={{
          background:
            "radial-gradient(160px 110px at 25% 30%, rgba(167,139,250,0.18), transparent 70%), radial-gradient(180px 130px at 80% 45%, rgba(125,211,252,0.16), transparent 72%), radial-gradient(180px 130px at 50% 85%, rgba(45,212,191,0.12), transparent 72%)",
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">{title}</div>
            <div className="mt-1 text-sm text-white/60">{desc}</div>
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function StepPill({
  active,
  done,
  label,
}: {
  active?: boolean;
  done?: boolean;
  label: string;
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
}: {
  title: string;
  detail?: string | null;
  onReset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
      <div className="text-sm font-semibold text-white/90">{title}</div>
      {detail ? (
        <div className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-white/70">
          {detail}
        </div>
      ) : null}
      <div className="mt-3">
        <button
          type="button"
          onClick={onReset}
          className="btn-solid-dark px-4 py-2 text-[12px]"
        >
          Reset
        </button>
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
    "- AllowedHeaders: Content-Type, x-amz-meta-user_id, x-amz-meta-original_filename (or *)",
    "",
    "After updating S3 CORS, retry the upload.",
  ].join("\n");
}

// XHR upload to get real progress + abort support
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

    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

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

export default function UploadsPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [flow, setFlow] = useState<Flow>("idle");
  const [file, setFile] = useState<File | null>(null);

  // real pipeline identifiers
  const [uploadId, setUploadId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);

  // UI
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState<string>("");

  // errors
  const [errorTitle, setErrorTitle] = useState<string>("");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  // URL flow remains UI-only for now
  const [url, setUrl] = useState("");
  const urlOk = useMemo(() => isValidYoutubeUrl(url), [url]);
  const [urlQueued, setUrlQueued] = useState(false);
  const [urlJobId, setUrlJobId] = useState<string | null>(null);

  // Polling control
  const pollAbort = useRef<AbortController | null>(null);

  // Upload abort (XHR)
  const uploadAbort = useRef<AbortController | null>(null);

  const steps = useMemo(() => {
    const selectedDone = flow !== "idle" && flow !== "dragging";
    const uploadDone = flow === "processing" || flow === "done";
    const processDone = flow === "done";
    return { selectedDone, uploadDone, processDone };
  }, [flow]);

  const canBrowse =
    !file && (flow === "idle" || flow === "dragging" || flow === "error" || flow === "canceled");

  function resetFileFlow() {
    pollAbort.current?.abort();
    pollAbort.current = null;

    uploadAbort.current?.abort();
    uploadAbort.current = null;

    setFlow("idle");
    setFile(null);

    setUploadId(null);
    setJobId(null);
    setStorageKey(null);

    setProgress(0);
    setStatusText("");

    setErrorTitle("");
    setErrorDetail(null);

    // reset file input so picking same file again works
    if (inputRef.current) inputRef.current.value = "";
  }

  function cancelUpload() {
    // Only meaningful during uploading/processing
    uploadAbort.current?.abort();
    pollAbort.current?.abort();
    uploadAbort.current = null;
    pollAbort.current = null;

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

  function onFilePicked(f: File | null) {
    if (!f) return;
    if (flow === "uploading" || flow === "processing") return;

    resetFileFlow();
    setFile(f);
    setFlow("selected");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (flow === "uploading" || flow === "processing") return;

    const f = e.dataTransfer.files?.[0] ?? null;
    setFlow("idle");
    onFilePicked(f);
  }

  async function pollJobUntilComplete(targetJobId: number) {
    pollAbort.current?.abort();
    const ac = new AbortController();
    pollAbort.current = ac;

    const started = Date.now();

    setStatusText("Queued…");
    setProgress((p) => Math.max(p, 92));

    // light exponential backoff
    let delay = 700;

    while (!ac.signal.aborted) {
      // eslint-disable-next-line no-await-in-loop
      const jobs = await apiFetch<JobRow[]>("/jobs", { signal: ac.signal });

      const hit = jobs.find((j) => j.id === targetJobId);
      if (!hit) {
        setStatusText("Registering…");
      } else if (hit.status === "queued") {
        setStatusText("Queued…");
      } else if (hit.status === "running") {
        setStatusText("Processing…");
      } else if (hit.status === "done") {
        setStatusText("Ready.");
        setProgress(100);
        setFlow("done");
        return;
      } else if (hit.status === "failed") {
        fail("Job failed", hit.error ?? "Unknown worker error.");
        return;
      }

      // timeout guard (10 minutes)
      if (Date.now() - started > 10 * 60 * 1000) {
        fail(
          "Timed out",
          "Job is taking too long. Check worker logs and try again."
        );
        return;
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(2500, Math.round(delay * 1.2));
    }
  }

  async function startUpload() {
    if (!file) return;
    if (flow === "uploading" || flow === "processing") return;

    setFlow("uploading");
    setErrorTitle("");
    setErrorDetail(null);

    // Abort controller for the whole upload step
    uploadAbort.current?.abort();
    const ac = new AbortController();
    uploadAbort.current = ac;

    setProgress(2);
    setStatusText("Requesting upload URL…");

    try {
      // 1) presign
      const presign = await apiFetch<PresignResponse>("/storage/presign", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "video/mp4",
        }),
        signal: ac.signal,
      });

      setStorageKey(presign.storage_key);
      setProgress(10);
      setStatusText("Uploading to storage…");

      // 2) PUT to S3 (presigned)
      // IMPORTANT: presign currently requires x-amz-meta-user_id + x-amz-meta-original_filename.
      // In dev, your test user_id is 1. Once backend returns user_id (e.g. via /auth/me) OR
      // returns required_headers in presign response, replace this hardcoded value.
      const userIdForMeta = "1";

      await xhrPutWithProgress({
        url: presign.put_url,
        file,
        headers: {
          "Content-Type": file.type || "video/mp4",
          "x-amz-meta-user_id": userIdForMeta,
          "x-amz-meta-original_filename": file.name,
        },
        signal: ac.signal,
        onProgress: (pct) => {
          // Map upload 0-100% into 10-85% of the total progress bar
          const mapped = 10 + pct * 0.75;
          setProgress((p) => Math.max(p, Math.min(85, mapped)));
        },
      });

      setProgress(88);
      setStatusText("Registering upload…");

      // 3) register upload -> creates job
      const reg = await apiFetch<RegisterResponse>("/uploads/register", {
        method: "POST",
        body: JSON.stringify({
          original_filename: file.name,
          storage_key: presign.storage_key,
        }),
        signal: ac.signal,
      });

      setUploadId(reg.upload_id);
      setJobId(reg.job_id);

      setProgress(92);
      setFlow("processing");
      setStatusText(reg.status === "queued" ? "Queued…" : "Processing…");

      // 4) poll /jobs for completion
      await pollJobUntilComplete(reg.job_id);
    } catch (e: any) {
      if (String(e?.message || "").toLowerCase().includes("canceled")) {
        setFlow("canceled");
        setStatusText("Canceled.");
        return;
      }

      const msg =
        typeof e?.message === "string" ? e.message : "Unexpected error occurred.";

      // If it looks like CORS, guide the dev fix immediately
      if (isProbablyCorsNetworkError(e)) {
        fail("Upload failed (CORS)", `${msg}\n\n${formatS3CorsHint()}`);
        return;
      }

      fail("Upload failed", msg);
    } finally {
      uploadAbort.current = null;
    }
  }

  function queueUrl() {
    if (!urlOk) return;
    setUrlQueued(true);
    const id = `job_${Math.floor(100000 + Math.random() * 900000)}`;
    setUrlJobId(id);
    setTimeout(() => setUrlQueued(false), 900);
  }

  // Dropzone click: open picker unless click came from an interactive element inside
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

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-white/90">Upload long-form</div>
          <div className="mt-1 text-sm text-white/60">
            Drop a file or paste a YouTube link. You can leave after starting — processing runs in the background.
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StepPill
              label="Select"
              active={flow === "idle" || flow === "dragging" || flow === "selected" || flow === "canceled"}
              done={steps.selectedDone}
            />
            <StepPill label="Upload" active={flow === "uploading"} done={steps.uploadDone} />
            <StepPill label="Processing" active={flow === "processing"} done={steps.processDone} />
            <StepPill label="Ready" active={flow === "done"} done={flow === "done"} />
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

      {/* Upload options */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* FILE */}
        <UploadCard
          title="Upload a video"
          desc="Best for podcasts, interviews, or raw footage."
          right={
            file ? (
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-white/70">
                {prettyBytes(file.size)}
              </div>
            ) : null
          }
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
          />

          {/* Dropzone */}
          <div
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
              "group relative flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed text-center transition",
              canBrowse ? "cursor-pointer" : "cursor-default",
              flow === "dragging"
                ? "border-white/35 bg-white/[0.06]"
                : "border-white/20 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]"
            )}
          >
            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="aurora opacity-35" />
            </div>

            <div className="relative px-6">
              {flow === "error" ? (
                <div className="w-full max-w-xl text-left">
                  <ErrorBanner title={errorTitle || "Something went wrong"} detail={errorDetail} onReset={resetFileFlow} />
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
                      onClick={cancelUpload}
                      className="btn-ghost text-[12px] px-4 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : flow === "processing" ? (
                <div className="mx-auto w-full max-w-sm text-left">
                  <div className="text-sm font-semibold text-white/85">{statusText || "Queued for processing"}</div>
                  <div className="mt-1 text-xs text-white/55">
                    We’re extracting audio, transcribing, and cutting clips.
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
                      onClick={cancelUpload}
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
                    <button type="button" onClick={resetFileFlow} className="btn-ghost text-[12px] px-4 py-2">
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
                    <button type="button" onClick={resetFileFlow} className="btn-solid-dark text-[12px] px-4 py-2">
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
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={startUpload} className="btn-solid-dark text-[12px] px-4 py-2">
                      Start upload
                    </button>
                    <button type="button" onClick={resetFileFlow} className="btn-ghost text-[12px] px-4 py-2">
                      Choose different file
                    </button>
                  </div>
                  <div className="mt-3 text-[12px] text-white/45">Tip: Long-form works best (podcasts, interviews).</div>
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

          {/* tiny helper row */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-white/55">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Background processing</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Safe to leave after starting</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Clips appear automatically</span>
          </div>

          {/* Dev note */}
          <div className="mt-3 text-[12px] text-white/35">
            Dev note: presign currently requires{" "}
            <span className="text-white/45">x-amz-meta-user_id</span>. We’re temporarily sending{" "}
            <span className="text-white/45">"1"</span>. Next: include user id in{" "}
            <span className="text-white/45">/auth/me</span> or return required headers from presign.
          </div>
        </UploadCard>

        {/* YOUTUBE URL (UI-only) */}
        <UploadCard
          title="Paste a YouTube link"
          desc="Fastest way to start. No downloads required."
          right={
            urlJobId ? (
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-white/70">
                {urlQueued ? "Queueing…" : "Queued"}
              </div>
            ) : null
          }
        >
          <div className="space-y-3">
            <div className="relative">
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setUrlJobId(null);
                }}
                placeholder="Paste YouTube link…"
                className="field"
              />
            </div>

            {!urlOk && url.trim().length > 0 ? (
              <div className="text-[12px] text-white/45">
                Enter a valid YouTube URL (youtube.com/watch?v=… or youtu.be/…)
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={queueUrl}
                disabled={!urlOk || urlQueued}
                className={cx(
                  "btn-solid-dark px-4 py-2 text-[12px]",
                  (!urlOk || urlQueued) && "opacity-50 cursor-not-allowed"
                )}
              >
                {urlQueued ? "Queueing…" : "Use link"}
              </button>

              <div className="text-[12px] text-white/55">One link = background processing</div>
            </div>

            {urlJobId ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-sm font-semibold text-white/85">Link queued</div>
                <div className="mt-1 text-sm text-white/60">
                  We’ll process this in the background and publish clips as they’re ready.
                </div>
                <div className="mt-3 text-[12px] text-white/45">
                  Job: <span className="text-white/65">{urlJobId}</span>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Link href="/app/clips" className="btn-ghost text-[12px] px-4 py-2">
                    Go to Clips
                  </Link>
                  <button
                    type="button"
                    className="btn-solid-dark text-[12px] px-4 py-2"
                    onClick={() => {
                      setUrl("");
                      setUrlJobId(null);
                    }}
                  >
                    New link
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </UploadCard>
      </div>

      {/* Placeholder: uploads list (next) */}
      <div className="surface-soft p-6">
        <div className="text-sm font-semibold text-white/85">Upload history</div>
        <div className="mt-1 text-sm text-white/60">
          Next: list uploads + last job status + quick link to clips.
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Link href="/app" className="btn-ghost text-[12px] px-4 py-2">
            Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
