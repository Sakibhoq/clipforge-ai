"use client";

import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Channel = { id: number; channel_id: string; channel_title?: string | null; last_polled_at?: string | null };
type QueueItem = { id: number; youtube_url: string; status: string };
type Rule = { id: number; name: string; trigger: string; action: string; enabled: boolean };
type Storefront = {
  id?: number;
  handle?: string | null;
  display_name?: string | null;
  headline?: string | null;
  description?: string | null;
};

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-soft relative overflow-hidden rounded-3xl p-6 md:p-7">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-12 opacity-40 blur-2xl"
        style={{
          background:
            "radial-gradient(220px 160px at 20% 25%, rgba(167,139,250,0.18), transparent 70%), radial-gradient(260px 180px at 70% 35%, rgba(125,211,252,0.14), transparent 72%), radial-gradient(260px 180px at 55% 95%, rgba(45,212,191,0.12), transparent 72%)",
        }}
      />
      <div className="relative">
        <div className="text-xs text-white/55">• Studio</div>
        <div className="mt-2 text-lg font-semibold text-white/90">{title}</div>
        {desc && <div className="mt-1 text-sm text-white/60">{desc}</div>}
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

export default function StudioPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [storefront, setStorefront] = useState<Storefront | null>(null);
  const [loading, setLoading] = useState(false);

  const [channelInput, setChannelInput] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [storefrontForm, setStorefrontForm] = useState<Storefront>({});
  const [status, setStatus] = useState<string | null>(null);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);

  async function refreshAll() {
    setLoading(true);
    setStatus(null);
    try {
      const [ch, q, r, sf] = await Promise.allSettled([
        apiFetch<Channel[]>("/youtube/channels", { method: "GET" }),
        apiFetch<QueueItem[]>("/youtube/ingest/queue", { method: "GET" }),
        apiFetch<Rule[]>("/automations/rules", { method: "GET" }),
        apiFetch<Storefront>("/storefront/me", { method: "GET" }),
      ]);

      if (ch.status === "fulfilled") setChannels(ch.value || []);
      if (q.status === "fulfilled") setQueue(q.value || []);
      if (r.status === "fulfilled") setRules(r.value || []);
      if (sf.status === "fulfilled") {
        setStorefront(sf.value || null);
        setStorefrontForm(sf.value || {});
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  async function subscribeChannel() {
    if (!channelInput.trim()) return;
    setStatus(null);
    try {
      await apiFetch("/youtube/channels/subscribe", {
        method: "POST",
        body: { channel_id: channelInput.trim() },
      });
      setChannelInput("");
      setStatus("Channel subscribed.");
      refreshAll();
    } catch (e: any) {
      setStatus(e?.detail || e?.message || "Failed to subscribe.");
    }
  }

  async function connectSocial(provider: string) {
    if (socialBusy) return;
    setSocialBusy(provider);
    setStatus(null);
    try {
      const data = (await apiFetch(`/social/connect/${provider}/start`, { method: "POST" })) as any;
      const url = data?.url;
      if (!url || typeof url !== "string") throw new Error("Connect URL missing");
      window.location.assign(url);
    } catch (e: any) {
      setStatus(e?.detail || e?.message || "Could not start social connect.");
      setSocialBusy(null);
    }
  }

  async function connectOwnedChannels() {
    setStatus(null);
    try {
      const rows = await apiFetch<Channel[]>("/youtube/channels/connect-owned", { method: "POST" });
      setStatus(`Added ${Array.isArray(rows) ? rows.length : 0} connected channel(s).`);
      refreshAll();
    } catch (e: any) {
      setStatus(e?.detail || e?.message || "Failed to add connected channels.");
    }
  }

  async function pollChannel(id: number) {
    setStatus(null);
    try {
      await apiFetch(`/youtube/channels/${id}/poll`, { method: "POST" });
      setStatus("Polling started.");
      refreshAll();
    } catch (e: any) {
      setStatus(e?.detail || e?.message || "Poll failed.");
    }
  }

  async function queueIngest() {
    if (!youtubeUrl.trim()) return;
    setStatus(null);
    try {
      await apiFetch("/youtube/ingest", { method: "POST", body: { url: youtubeUrl.trim() } });
      setYoutubeUrl("");
      setStatus("Queued for ingest.");
      refreshAll();
    } catch (e: any) {
      setStatus(e?.detail || e?.message || "Queue failed.");
    }
  }

  async function dispatchQueue() {
    setStatus(null);
    try {
      await apiFetch("/youtube/ingest/dispatch?limit=2", { method: "POST" });
      setStatus("Dispatch started.");
      refreshAll();
    } catch (e: any) {
      setStatus(e?.detail || e?.message || "Dispatch failed.");
    }
  }

  async function dispatchPosts() {
    setStatus(null);
    try {
      await apiFetch("/social/posts/dispatch", { method: "POST" });
      setStatus("Dispatching scheduled posts.");
    } catch (e: any) {
      setStatus(e?.detail || e?.message || "Dispatch failed.");
    }
  }

  async function saveStorefront() {
    setStatus(null);
    try {
      const res = await apiFetch<Storefront>("/storefront/me", {
        method: "PUT",
        body: storefrontForm,
      });
      setStorefront(res);
      setStatus("Storefront saved.");
    } catch (e: any) {
      setStatus(e?.detail || e?.message || "Save failed.");
    }
  }

  const queueSummary = useMemo(() => {
    if (!queue.length) return "No queued items yet.";
    const running = queue.filter((q) => q.status === "processing").length;
    const pending = queue.filter((q) => q.status === "queued").length;
    return `${pending} queued • ${running} processing`;
  }, [queue]);

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-12">
        <div className="surface relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-40 blur-3xl"
            style={{
              background:
                "radial-gradient(240px 160px at 18% 28%, rgba(167,139,250,0.20), transparent 70%), radial-gradient(260px 180px at 78% 35%, rgba(125,211,252,0.16), transparent 72%), radial-gradient(260px 180px at 55% 92%, rgba(45,212,191,0.12), transparent 72%)",
            }}
          />
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Studio</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/90">
                YouTube + Automations + Storefront
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                This is the unified control room for ingest, scheduling, and monetization.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshAll}
              className="btn-ghost text-[12px] px-4 py-2 w-full md:w-auto"
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh data"}
            </button>
          </div>
          {status && <div className="mt-4 text-xs text-white/60">{status}</div>}
        </div>

        <div className="mt-6 grid gap-6">
          <Section
            title="YouTube Ingest"
            desc="Subscribe channels, queue videos, and dispatch ingestion jobs."
          >
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => connectSocial("youtube")}
                  className="btn-solid-dark text-[12px] px-4 py-2"
                  disabled={!!socialBusy}
                >
                  {socialBusy === "youtube" ? "Connecting..." : "Connect YouTube"}
                </button>
                <button
                  type="button"
                  onClick={connectOwnedChannels}
                  className="btn-ghost text-[12px] px-4 py-2"
                >
                  Add my connected channels
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                  placeholder="Channel ID (UC...) or @handle"
                  className="h-11 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white/85 outline-none focus:border-white/25"
                />
                <button type="button" onClick={subscribeChannel} className="btn-solid-dark text-[12px] px-4 py-2">
                  Subscribe
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <input
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="YouTube video URL"
                  className="h-11 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white/85 outline-none focus:border-white/25"
                />
                <button type="button" onClick={queueIngest} className="btn-ghost text-[12px] px-4 py-2">
                  Queue
                </button>
                <button type="button" onClick={dispatchQueue} className="btn-ghost text-[12px] px-4 py-2">
                  Dispatch
                </button>
              </div>

              <div className="text-xs text-white/55">{queueSummary}</div>

              {channels.length > 0 ? (
                <div className="grid gap-2">
                  {channels.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="text-sm text-white/80">
                        {c.channel_title || c.channel_id}
                        <div className="text-[11px] text-white/45">{c.channel_id}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => pollChannel(c.id)}
                        className="btn-ghost text-[12px] px-3 py-2"
                      >
                        Poll
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-white/55">No channels yet.</div>
              )}
            </div>
          </Section>

          <Section title="Automations" desc="Auto-post clips and schedule distribution.">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={dispatchPosts} className="btn-ghost text-[12px] px-4 py-2">
                Dispatch scheduled posts
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {rules.length > 0 ? (
                rules.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75">
                    <div className="font-semibold text-white/85">{r.name}</div>
                    <div className="text-[11px] text-white/55">
                      {r.trigger} → {r.action} {r.enabled ? "• Enabled" : "• Disabled"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-white/55">No automation rules yet.</div>
              )}
            </div>
          </Section>

          <Section title="Creator Storefront" desc="Monetize clips and bundles in one profile.">
            <div className="grid gap-3">
              <input
                value={storefrontForm.display_name || ""}
                onChange={(e) => setStorefrontForm((s) => ({ ...s, display_name: e.target.value }))}
                placeholder="Display name"
                className="h-11 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white/85 outline-none focus:border-white/25"
              />
              <input
                value={storefrontForm.handle || ""}
                onChange={(e) => setStorefrontForm((s) => ({ ...s, handle: e.target.value }))}
                placeholder="Handle (e.g. orbito)"
                className="h-11 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white/85 outline-none focus:border-white/25"
              />
              <input
                value={storefrontForm.headline || ""}
                onChange={(e) => setStorefrontForm((s) => ({ ...s, headline: e.target.value }))}
                placeholder="Headline"
                className="h-11 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white/85 outline-none focus:border-white/25"
              />
              <textarea
                value={storefrontForm.description || ""}
                onChange={(e) => setStorefrontForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="About you"
                className="min-h-[120px] rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/85 outline-none focus:border-white/25"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={saveStorefront} className="btn-solid-dark text-[12px] px-4 py-2">
                  Save storefront
                </button>
                {storefront?.handle && (
                  <div className="text-xs text-white/55">Public URL: /storefront/{storefront.handle}</div>
                )}
              </div>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
