"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Channel = { id: number };
type QueueItem = { status: string };
type Rule = { id: number; enabled: boolean };
type Storefront = {
  handle?: string | null;
  published?: boolean | null;
};
type SocialAccount = {
  id: number;
  provider: string;
  account_id?: string | null;
  account_name?: string | null;
  status?: string | null;
};

const SOCIAL_PROVIDERS = [
  { key: "youtube", label: "YouTube", hint: "Post to YouTube Shorts." },
  { key: "tiktok", label: "TikTok", hint: "Connect for scheduled posts." },
  { key: "instagram", label: "Instagram", hint: "Connect for scheduled posts." },
  { key: "facebook", label: "Facebook", hint: "Connect for scheduled posts." },
] as const;

function StudioCard({
  title,
  desc,
  details,
  href,
  cta,
}: {
  title: string;
  desc: string;
  details: string[];
  href: string;
  cta: string;
}) {
  return (
    <section className="surface-soft relative overflow-hidden rounded-3xl p-6 md:p-7">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-12 opacity-35 blur-2xl"
        style={{
          background:
            "radial-gradient(200px 140px at 20% 25%, rgba(167,139,250,0.16), transparent 70%), radial-gradient(240px 170px at 70% 35%, rgba(125,211,252,0.12), transparent 72%), radial-gradient(220px 160px at 60% 90%, rgba(45,212,191,0.10), transparent 72%)",
        }}
      />
      <div className="relative">
        <h2 className="text-lg font-semibold text-white/90">{title}</h2>
        <p className="mt-2 text-sm text-white/65">{desc}</p>
        <div className="mt-4 grid gap-1 text-sm text-white/70">
          {details.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <Link href={href} className="btn-solid-dark mt-5 inline-flex text-[12px] px-4 py-2">
          {cta}
        </Link>
      </div>
    </section>
  );
}

export default function StudioPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [storefront, setStorefront] = useState<Storefront | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);
  const [socialMsg, setSocialMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshSummary() {
    setLoading(true);
    setError(null);
    try {
      const [ch, q, r, sf, sa] = await Promise.allSettled([
        apiFetch<Channel[]>("/youtube/channels", { method: "GET" }),
        apiFetch<QueueItem[]>("/youtube/ingest/queue", { method: "GET" }),
        apiFetch<Rule[]>("/automations/rules", { method: "GET" }),
        apiFetch<Storefront>("/storefront/me", { method: "GET" }),
        apiFetch<SocialAccount[]>("/social/accounts", { method: "GET" }),
      ]);

      if (ch.status === "fulfilled") setChannels(Array.isArray(ch.value) ? ch.value : []);
      if (q.status === "fulfilled") setQueue(Array.isArray(q.value) ? q.value : []);
      if (r.status === "fulfilled") setRules(Array.isArray(r.value) ? r.value : []);
      if (sf.status === "fulfilled") setStorefront(sf.value || null);
      if (sa.status === "fulfilled") setSocialAccounts(Array.isArray(sa.value) ? sa.value : []);

      const failed = [ch, q, r, sf, sa].filter((res) => res.status === "rejected").length;
      if (failed === 5) setError("Could not load data right now. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSummary();
  }, []);

  const queueSummary = useMemo(() => {
    const queued = queue.filter((item) => item.status === "queued").length;
    const processing = queue.filter((item) => item.status === "processing").length;
    return { queued, processing, total: queue.length };
  }, [queue]);

  const activeRules = useMemo(() => rules.filter((rule) => rule.enabled).length, [rules]);

  const socialByProvider = useMemo(() => {
    const out: Record<string, SocialAccount | null> = {};
    for (const provider of SOCIAL_PROVIDERS) out[provider.key] = null;
    for (const acc of socialAccounts) {
      const p = String(acc.provider || "").toLowerCase();
      if (!p || !(p in out)) continue;
      const prev = out[p];
      const isConnected = String(acc.status || "").toLowerCase() === "connected";
      const prevConnected = String(prev?.status || "").toLowerCase() === "connected";
      if (!prev || (isConnected && !prevConnected) || (acc.id > (prev.id || 0) && isConnected === prevConnected)) {
        out[p] = acc;
      }
    }
    return out;
  }, [socialAccounts]);

  async function refreshSocialAccounts() {
    const data = await apiFetch<SocialAccount[]>("/social/accounts", { method: "GET" });
    setSocialAccounts(Array.isArray(data) ? data : []);
  }

  async function connectSocial(provider: string) {
    if (socialBusy) return;
    setSocialMsg(null);
    setSocialBusy(provider);
    try {
      const data = (await apiFetch(`/social/connect/${provider}/start`, { method: "POST" })) as any;
      const url = data?.url;
      if (!url) throw new Error("Missing OAuth URL");
      window.location.href = url;
    } catch (e: any) {
      setSocialMsg(e?.detail || e?.message || `Failed to connect ${provider}.`);
      setSocialBusy(null);
    }
  }

  async function disconnectSocial(provider: string) {
    if (socialBusy) return;
    setSocialMsg(null);
    setSocialBusy(`disconnect:${provider}`);
    try {
      const res = (await apiFetch<{ status: string }>(`/social/accounts/${provider}/disconnect`, {
        method: "POST",
      })) as any;
      setSocialMsg(res?.status ? `${provider} ${res.status}` : `${provider} disconnected`);
      await refreshSocialAccounts();
    } catch (e: any) {
      setSocialMsg(e?.detail || e?.message || `Failed to disconnect ${provider}.`);
    } finally {
      setSocialBusy(null);
    }
  }

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
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/90">Studio</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                This is your control center. Pick one task and open the right tool.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshSummary}
              className="btn-ghost text-[12px] px-4 py-2 w-full md:w-auto"
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh data"}
            </button>
          </div>
          {error && <div className="mt-4 text-xs text-red-200/80">{error}</div>}
        </div>

        <section className="surface-soft relative mt-6 overflow-hidden rounded-3xl p-6 md:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-30 blur-2xl"
            style={{
              background:
                "radial-gradient(200px 140px at 20% 25%, rgba(167,139,250,0.16), transparent 70%), radial-gradient(240px 170px at 70% 35%, rgba(125,211,252,0.12), transparent 72%), radial-gradient(220px 160px at 60% 90%, rgba(45,212,191,0.10), transparent 72%)",
            }}
          />
          <div className="relative">
            <h2 className="text-lg font-semibold text-white/90">Social Connections</h2>
            <p className="mt-2 text-sm text-white/65">
              Connect and manage publishing accounts here.
            </p>
            <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 px-5">
              {SOCIAL_PROVIDERS.map((provider, idx) => {
                const account = socialByProvider[provider.key];
                const connected = String(account?.status || "").toLowerCase() === "connected";
                const busyConnecting = socialBusy === provider.key;
                const busyDisconnecting = socialBusy === `disconnect:${provider.key}`;
                return (
                  <React.Fragment key={provider.key}>
                    <div className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white/85">{provider.label}</div>
                        <div className="mt-1 text-sm text-white/55">
                          {connected
                            ? account?.account_name || account?.account_id || "Connected"
                            : provider.hint}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {connected ? (
                          <>
                            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] text-white/70">
                              Connected
                            </span>
                            <button
                              type="button"
                              onClick={() => void disconnectSocial(provider.key)}
                              disabled={!!socialBusy}
                              className="btn-ghost text-[12px] px-4 py-2"
                            >
                              {busyDisconnecting ? "Disconnecting..." : "Disconnect"}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void connectSocial(provider.key)}
                            disabled={!!socialBusy}
                            className="btn-solid-dark text-[12px] px-4 py-2"
                          >
                            {busyConnecting ? "Connecting..." : "Connect"}
                          </button>
                        )}
                      </div>
                    </div>
                    {idx < SOCIAL_PROVIDERS.length - 1 ? <div className="h-px w-full bg-white/10" /> : null}
                  </React.Fragment>
                );
              })}
            </div>
            {socialMsg ? <div className="mt-4 text-[12px] text-white/60">{socialMsg}</div> : null}
          </div>
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <StudioCard
            title="YouTube Ingest"
            desc="Add channels and import videos to turn them into clips."
            details={[
              `Connected channels: ${channels.length}`,
              `Queue: ${queueSummary.total} total`,
              `Now running: ${queueSummary.processing} processing, ${queueSummary.queued} queued`,
            ]}
            href="/app/youtube"
            cta="Open YouTube ingest"
          />

          <StudioCard
            title="Automations"
            desc="Set rules so posting can run on its own."
            details={[
              `Rules: ${rules.length} total`,
              `Active rules: ${activeRules}`,
              "Tip: start with one simple rule first.",
            ]}
            href="/app/automations"
            cta="Open automations"
          />

          <StudioCard
            title="Creator Storefront"
            desc="Edit your public profile page for clients and viewers."
            details={[
              `Handle: ${storefront?.handle || "Not set"}`,
              `Published: ${storefront?.published ? "Yes" : "No"}`,
              storefront?.handle ? `URL: /storefront/${storefront.handle}` : "Set a handle to get a URL.",
            ]}
            href="/app/storefront"
            cta="Open storefront"
          />
        </div>
      </main>
    </div>
  );
}
