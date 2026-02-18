// frontend/app/app/clips/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type ClipRow = {
  id: number;
  upload_id: number;
  storage_key: string;
  url: string;
  duration: number;
  title?: string | null;
  hook?: string | null;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function clip(s: string, n: number) {
  const t = String(s || "").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}…`;
}

export default function ClipsPage() {
  const [rows, setRows] = useState<ClipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = (await apiFetch<ClipRow[]>("/clips?grouped=false", { method: "GET" })) || [];
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setRows([]);
      setError(err?.detail || "Could not load clips right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((c) => {
      const t = `${c.title || ""}\n${c.hook || ""}`.toLowerCase();
      return t.includes(s);
    });
  }, [rows, q]);

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-12">
        <section className="surface relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-80">
            <div className="aurora" />
          </div>

          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Clips</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/95">
                Your <span className="grad-text">generated</span> videos
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                All your outputs in one place. Download MP4s, preview, and publish from Studio.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href="/app/generate" className="btn-aurora text-[12px] px-4 py-2">
                Generate a new clip
              </Link>
              <Link href="/app/studio" className="btn-ghost text-[12px] px-4 py-2">
                Studio
              </Link>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className={cx(
                  "btn-ghost text-[12px] px-4 py-2",
                  loading && "opacity-60 cursor-not-allowed"
                )}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4">
          <div className="surface-soft rounded-3xl p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-white/85">
                {loading ? "Loading…" : `${filtered.length} clip${filtered.length === 1 ? "" : "s"}`}
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search prompts or titles…"
                className="field max-w-md"
              />
            </div>
            {error ? (
              <div className="mt-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-100">
                {String(error)}
              </div>
            ) : null}
          </div>

          {filtered.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((c) => (
                <div key={c.id} className="surface-soft overflow-hidden rounded-3xl">
                  <div className="border-b border-white/10 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-white/90">
                          {c.title || `Clip #${c.id}`}
                        </div>
                        {c.hook ? (
                          <div className="mt-1 text-[12px] text-white/55">{clip(c.hook, 110)}</div>
                        ) : (
                          <div className="mt-1 text-[12px] text-white/45">Upload #{c.upload_id}</div>
                        )}
                      </div>
                      <span className="chip">{Math.max(0, Math.round(c.duration || 0))}s</span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <a href={`/api/clips/${c.id}/download`} className="btn-solid-dark text-[12px] px-4 py-2">
                        Download
                      </a>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="btn-ghost text-[12px] px-4 py-2"
                      >
                        Open
                      </a>
                    </div>
                  </div>

                  <div className="bg-black/35 p-4">
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                      <video src={c.url} controls playsInline preload="metadata" className="block w-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="surface-soft rounded-3xl p-7 text-sm text-white/60">
              {loading ? "Loading clips…" : "No clips yet. Generate your first one from the Generator."}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
