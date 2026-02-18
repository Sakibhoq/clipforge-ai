// frontend/app/app/youtube/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Channel = {
  id: number;
  channel_id: string;
  channel_title?: string | null;
  active: boolean;
  last_polled_at?: string | null;
};

type QueueItem = {
  id: number;
  video_id: string;
  video_url: string;
  title?: string | null;
  duration_seconds?: number | null;
  status: string;
  last_error?: string | null;
};

export default function YouTubePage() {
  const [handle, setHandle] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");

  function refresh() {
    apiFetch<Channel[]>("/youtube/channels", { method: "GET" })
      .then((d) => setChannels(Array.isArray(d) ? d : []))
      .catch(() => setChannels([]));
    apiFetch<QueueItem[]>("/youtube/ingest/queue", { method: "GET" })
      .then((d) => setQueue(Array.isArray(d) ? d : []))
      .catch(() => setQueue([]));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function subscribe() {
    if (!handle.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/youtube/channels/subscribe", {
        method: "POST",
        body: handle.trim().startsWith("@")
          ? { handle: handle.trim() }
          : { channel_id: handle.trim() },
      });
      setHandle("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function pollChannel(id: number) {
    setBusy(true);
    try {
      await apiFetch(`/youtube/channels/${id}/poll`, { method: "POST" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function dispatchQueue() {
    setBusy(true);
    try {
      await apiFetch(`/youtube/ingest/dispatch?limit=2`, { method: "POST" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function ingestUrl() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/youtube/ingest`, {
        method: "POST",
        body: {
          url: url.trim(),
          aspect_ratio: "9:16",
          captions_enabled: true,
          watermark_enabled: true,
        },
      });
      setUrl("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-10 sm:pt-12">
      <div className="surface relative overflow-hidden p-6 sm:p-8">
        <div className="text-xs text-white/55">• YouTube ingest</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          YouTube ingest
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/65">
          Subscribe to channels for new uploads, or paste a link to ingest now.
        </p>

        <div className="mt-6 grid gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              className="h-11 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white/90"
              placeholder="YouTube channel ID (UC...) or @handle"
            />
            <button
              type="button"
              onClick={subscribe}
              className="btn-solid-dark text-sm px-4 py-2"
              disabled={busy}
            >
              Subscribe
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-11 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white/90"
              placeholder="Paste YouTube URL to ingest"
            />
            <button
              type="button"
              onClick={ingestUrl}
              className="btn-aurora text-sm px-4 py-2"
              disabled={busy}
            >
              Import now
            </button>
          </div>
        </div>

        <div className="mt-8">
          <div className="text-sm font-semibold text-white/85">Channels</div>
          <div className="mt-3 grid gap-2">
            {channels.length ? (
              channels.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
                >
                  <div>
                    <div className="font-semibold text-white/85">{c.channel_title || c.channel_id}</div>
                    <div className="text-[12px] text-white/55">{c.channel_id}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => pollChannel(c.id)}
                    className="btn-ghost text-[12px] px-3 py-1.5"
                    disabled={busy}
                  >
                    Poll
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
                No channels yet.
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <div className="text-sm font-semibold text-white/85">Ingest queue</div>
          <button type="button" onClick={dispatchQueue} className="btn-ghost text-[12px] px-3 py-1.5" disabled={busy}>
            Run queue
          </button>
        </div>
        <div className="mt-3 grid gap-2">
          {queue.length ? (
            queue.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
              >
                <div>
                  <div className="text-white/85 font-semibold">{q.title || q.video_id}</div>
                  <div className="text-[12px] text-white/55">{q.status}</div>
                </div>
                <a href={q.video_url} className="text-[12px] text-white/55 hover:text-white/80">
                  Open
                </a>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
              Queue is empty.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
