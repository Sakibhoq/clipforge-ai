"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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

function formatSeconds(n: number) {
  const s = Math.max(0, Number.isFinite(n) ? n : 0);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${ms}`;
}

function aspectValue(frame: string) {
  if (frame === "1:1") return "1 / 1";
  if (frame === "16:9") return "16 / 9";
  return "9 / 16";
}

export default function EditorPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<ClipRow[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<number | null>(null);
  const [frame, setFrame] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(6);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const videoClips = useMemo(
    () => clips.filter((c) => detectAssetType(c) === "video"),
    [clips]
  );

  const selectedClip = useMemo(
    () => videoClips.find((c) => c.id === selectedClipId) || null,
    [videoClips, selectedClipId]
  );

  const maxDuration = useMemo(
    () => Math.max(1, Number(selectedClip?.duration || 0)),
    [selectedClip]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = (await apiFetch<ClipRow[]>("/clips?grouped=false", { method: "GET" })) || [];
      const allRows = Array.isArray(rows) ? rows : [];
      setClips(allRows);
      const firstVideo = allRows.find((row) => detectAssetType(row) === "video");
      setSelectedClipId(firstVideo ? Number(firstVideo.id) : null);
    } catch (err: any) {
      setError(err?.detail || "Could not load clips for editing.");
      setClips([]);
      setSelectedClipId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const duration = Math.max(1, Number(selectedClip?.duration || 0));
    setTrimStart(0);
    setTrimEnd(Math.min(duration, 6));
  }, [selectedClipId, selectedClip?.duration]);

  useEffect(() => {
    setTrimStart((prev) => Math.min(Math.max(0, prev), Math.max(0, trimEnd - 0.1)));
    setTrimEnd((prev) => Math.min(maxDuration, Math.max(prev, trimStart + 0.1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDuration]);

  const editRecipe = useMemo(() => {
    return {
      clip_id: selectedClip?.id ?? null,
      frame,
      trim_start: Number(trimStart.toFixed(2)),
      trim_end: Number(trimEnd.toFixed(2)),
      duration: Number(Math.max(0, trimEnd - trimStart).toFixed(2)),
      safe_area_overlay: showSafeArea,
    };
  }, [selectedClip?.id, frame, trimStart, trimEnd, showSafeArea]);

  async function copyRecipe() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(editRecipe, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      setCopied(false);
    }
  }

  function playLoop() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = trimStart;
    void video.play();
  }

  function pause() {
    videoRef.current?.pause();
  }

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-12">
        <section className="surface relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-45 blur-3xl"
            style={{
              background:
                "radial-gradient(240px 160px at 16% 28%, rgba(255,183,3,0.22), transparent 70%), radial-gradient(280px 200px at 80% 34%, rgba(58,134,255,0.18), transparent 72%), radial-gradient(260px 180px at 58% 90%, rgba(251,86,7,0.14), transparent 72%)",
            }}
          />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Editor</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/92">
                Production <span className="grad-text">editor workspace</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                Live trim loop, frame preview, and safe-area guides so your final post lands clean on every feed.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/app/clips" className="btn-ghost text-[12px] px-4 py-2">
                Clips
              </Link>
              <Link href="/app/generate" className="btn-ghost text-[12px] px-4 py-2">
                Generate
              </Link>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className={cx(
                  "btn-solid-dark text-[12px] px-4 py-2",
                  loading && "opacity-60 cursor-not-allowed"
                )}
              >
                {loading ? "Refreshing…" : "Refresh assets"}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="surface-soft rounded-3xl p-6">
              <div className="text-xs text-white/55">• Source clip</div>
              <div className="mt-3">
                <select
                  value={selectedClipId ?? ""}
                  onChange={(e) => setSelectedClipId(Number(e.target.value || 0) || null)}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-[14px] text-white/85 outline-none hover:bg-black/60 focus:border-white/20 focus:bg-black/60"
                >
                  {videoClips.length ? (
                    videoClips.map((clip) => (
                      <option key={clip.id} value={clip.id}>
                        {clip.title || `Clip #${clip.id}`} • {Math.round(clip.duration || 0)}s
                      </option>
                    ))
                  ) : (
                    <option value="">No video clips yet</option>
                  )}
                </select>
              </div>

              <div className="mt-5 text-xs text-white/55">• Frame</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["9:16", "1:1", "16:9"] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setFrame(ratio)}
                    className={cx(
                      "rounded-xl border px-3 py-2 text-[12px] font-semibold transition",
                      frame === ratio
                        ? "border-white/20 bg-white/[0.12] text-white/90"
                        : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]"
                    )}
                  >
                    {ratio}
                  </button>
                ))}
              </div>

              <div className="mt-5 text-xs text-white/55">• Live trim</div>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between text-[12px] text-white/65">
                  <span>Start: {formatSeconds(trimStart)}</span>
                  <span>End: {formatSeconds(trimEnd)}</span>
                </div>

                <div className="mt-3 grid gap-3">
                  <input
                    type="range"
                    min={0}
                    max={maxDuration}
                    step={0.1}
                    value={trimStart}
                    onChange={(e) => {
                      const next = Number(e.target.value || 0);
                      setTrimStart(Math.min(next, Math.max(0, trimEnd - 0.1)));
                    }}
                    className="w-full accent-white"
                  />
                  <input
                    type="range"
                    min={0}
                    max={maxDuration}
                    step={0.1}
                    value={trimEnd}
                    onChange={(e) => {
                      const next = Number(e.target.value || 0);
                      setTrimEnd(Math.max(next, Math.min(maxDuration, trimStart + 0.1)));
                    }}
                    className="w-full accent-white"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={playLoop} className="btn-solid-dark text-[12px] px-4 py-2">
                  Play loop
                </button>
                <button type="button" onClick={pause} className="btn-ghost text-[12px] px-4 py-2">
                  Pause
                </button>
                <button type="button" onClick={() => setShowSafeArea((v) => !v)} className="btn-ghost text-[12px] px-4 py-2">
                  {showSafeArea ? "Hide safe area" : "Show safe area"}
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-[12px] font-semibold text-white/80">Edit recipe</div>
                <div className="mt-2 text-[12px] text-white/55">
                  Save your trim + frame decisions for team review or repeatable posting.
                </div>
                <button type="button" onClick={copyRecipe} className="mt-3 btn-ghost text-[12px] px-4 py-2 w-full">
                  {copied ? "Copied" : "Copy edit recipe"}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="surface rounded-3xl p-6">
              <div className="text-xs text-white/55">• Preview</div>
              {selectedClip ? (
                <>
                  <div className="mt-3 text-[13px] font-semibold text-white/85">
                    {selectedClip.title || `Clip #${selectedClip.id}`}
                  </div>
                  <div className="mt-2 text-[12px] text-white/55">
                    Loop length: {formatSeconds(Math.max(0, trimEnd - trimStart))} • Frame: {frame}
                  </div>

                  <div className="mt-4 rounded-3xl border border-white/10 bg-black/35 p-3">
                    <div
                      className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/10 bg-black"
                      style={{ aspectRatio: aspectValue(frame) }}
                    >
                      <video
                        ref={videoRef}
                        src={selectedClip.url}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                        onLoadedMetadata={(e) => {
                          const video = e.currentTarget;
                          const duration = Math.max(1, Number(video.duration || 0));
                          setTrimStart(0);
                          setTrimEnd(Math.min(duration, 6));
                        }}
                        onPlay={(e) => {
                          const video = e.currentTarget;
                          if (video.currentTime < trimStart || video.currentTime > trimEnd) {
                            video.currentTime = trimStart;
                          }
                        }}
                        onTimeUpdate={(e) => {
                          const video = e.currentTarget;
                          if (video.currentTime >= trimEnd) {
                            video.currentTime = trimStart;
                            if (!video.paused) void video.play();
                          }
                        }}
                      />

                      {showSafeArea ? (
                        <div className="pointer-events-none absolute inset-[8%] rounded-xl border border-white/25" />
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <a href={`/api/clips/${selectedClip.id}/download`} className="btn-solid-dark text-[12px] px-4 py-2">
                      Download original
                    </a>
                    <a href={selectedClip.url} target="_blank" rel="noreferrer noopener" className="btn-ghost text-[12px] px-4 py-2">
                      Open source
                    </a>
                    <Link href="/pricing" className="btn-ghost text-[12px] px-4 py-2">
                      Upgrade for Fast lane
                    </Link>
                  </div>
                </>
              ) : (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[13px] text-white/60">
                  {error ? error : "No video clips yet. Generate one first, then open Editor for live trim and frame control."}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
