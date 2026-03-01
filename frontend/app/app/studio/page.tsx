"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AppPlan, normalizeAppPlan } from "@/lib/plans";
import { SocialBrandPill, SocialPlatform, socialBrandTheme } from "@/components/SocialBrand";

type SocialAccount = {
  id: number;
  provider: string;
  account_id?: string | null;
  account_name?: string | null;
  status?: string | null;
};

type MeResponse = {
  plan?: string | null;
};

type StudioPlan = AppPlan;

function allowedSocialProvidersForPlan(plan: StudioPlan): SocialProviderKey[] {
  if (plan === "starter") return ["instagram", "facebook"];
  if (plan === "creator" || plan === "studio") return SOCIAL_PROVIDERS.map((p) => p.key);
  return [];
}

const SOCIAL_PROVIDERS = [
  { key: "youtube", label: "YouTube", hint: "Connect to publish Shorts directly." },
  { key: "tiktok", label: "TikTok", hint: "Connect to publish from Clips." },
  { key: "instagram", label: "Instagram", hint: "Connect your Instagram business account." },
  { key: "facebook", label: "Facebook", hint: "Connect your Facebook Page for posting." },
] as const;

type SocialProviderKey = (typeof SOCIAL_PROVIDERS)[number]["key"];

function connectButtonStyle(provider: SocialProviderKey): React.CSSProperties {
  const theme = socialBrandTheme(provider as SocialPlatform);
  return {
    background: theme.iconBackground,
    borderColor: theme.iconBorder,
    color: "#ffffff",
  };
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70">
      <span className="text-white/55">{label}:</span> <span className="font-semibold text-white/85">{value}</span>
    </div>
  );
}

export default function StudioPage() {
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);
  const [socialMsg, setSocialMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<StudioPlan>("free");

  async function refreshSummary() {
    setLoading(true);
    setError(null);
    try {
      const [sa] = await Promise.allSettled([apiFetch<SocialAccount[]>("/social/accounts", { method: "GET" })]);
      if (sa.status === "fulfilled") setSocialAccounts(Array.isArray(sa.value) ? sa.value : []);
      if (sa.status === "rejected") setError("Could not load data right now. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSummary();
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MeResponse>("/auth/me", { method: "GET" })
      .then((me) => {
        if (cancelled) return;
        setCurrentPlan(normalizeAppPlan(me?.plan));
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentPlan("free");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allowedProviderSet = useMemo(
    () => new Set<SocialProviderKey>(allowedSocialProvidersForPlan(currentPlan)),
    [currentPlan]
  );

  const socialAccessLabel = useMemo(() => {
    const count = allowedSocialProvidersForPlan(currentPlan).length;
    return `${count} channel${count === 1 ? "" : "s"}`;
  }, [currentPlan]);

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

  const connectedCount = useMemo(() => {
    return SOCIAL_PROVIDERS.filter((provider) => {
      const account = socialByProvider[provider.key];
      return String(account?.status || "").toLowerCase() === "connected";
    }).length;
  }, [socialByProvider]);

  async function refreshSocialAccounts() {
    const data = await apiFetch<SocialAccount[]>("/social/accounts", { method: "GET" });
    setSocialAccounts(Array.isArray(data) ? data : []);
  }

  async function connectSocial(provider: string) {
    if (socialBusy) return;
    if (!allowedProviderSet.has(provider as SocialProviderKey)) {
      setSocialMsg(
        currentPlan === "free"
          ? "Social connections are locked on Free Trial. Upgrade to Starter or Creator."
          : "This channel is locked on your current plan. Upgrade to Creator for full social access."
      );
      return;
    }
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
        <section className="surface relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-45 blur-3xl"
            style={{
              background:
                "radial-gradient(240px 160px at 16% 28%, rgba(167,139,250,0.22), transparent 70%), radial-gradient(280px 200px at 80% 34%, rgba(125,211,252,0.18), transparent 72%), radial-gradient(260px 180px at 58% 90%, rgba(45,212,191,0.14), transparent 72%)",
            }}
          />

          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Studio</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/92">
                Social <span className="grad-text">Studio</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                Connect your social accounts, manage status, and publish clips from one place.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatPill label="Connected" value={`${connectedCount}/${SOCIAL_PROVIDERS.length}`} />
                <StatPill label="Social access" value={socialAccessLabel} />
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Link href="/app/clips" className="btn-solid-dark text-center text-[12px] px-4 py-2">
                Open clips
              </Link>
              <button
                type="button"
                onClick={refreshSummary}
                className="btn-ghost text-[12px] px-4 py-2"
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh data"}
              </button>
            </div>
          </div>

          {error ? <div className="relative mt-4 text-xs text-red-200/80">{error}</div> : null}
        </section>

        <section className="surface-soft relative mt-6 overflow-hidden rounded-3xl p-6 md:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-35 blur-2xl"
            style={{
              background:
                "radial-gradient(220px 150px at 20% 25%, rgba(167,139,250,0.16), transparent 70%), radial-gradient(260px 180px at 74% 38%, rgba(125,211,252,0.13), transparent 72%), radial-gradient(230px 160px at 58% 92%, rgba(45,212,191,0.10), transparent 72%)",
            }}
          />

          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white/90">Connections</h2>
                <p className="mt-1 text-sm text-white/65">
                  Connect each platform once. Free Trial: 0 channels, Starter: 2 channels, Creator+: full access.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/65">
                {connectedCount} connected
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {SOCIAL_PROVIDERS.map((provider) => {
                const theme = socialBrandTheme(provider.key as SocialPlatform);
                const account = socialByProvider[provider.key];
                const connected = String(account?.status || "").toLowerCase() === "connected";
                const busyConnecting = socialBusy === provider.key;
                const busyDisconnecting = socialBusy === `disconnect:${provider.key}`;
                const canConnect = allowedProviderSet.has(provider.key);

                return (
                  <div
                    key={provider.key}
                    className="rounded-2xl border border-white/10 px-4 py-4 md:px-5"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
                    }}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <SocialBrandPill platform={provider.key as SocialPlatform} label={provider.label} />
                          {connected ? (
                            <span
                              className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                              style={{
                                color: theme.text,
                                borderColor: theme.border,
                                background: `${theme.border}1f`,
                              }}
                            >
                              Connected
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-white/60">
                          {connected
                            ? account?.account_name || account?.account_id || "Connected"
                            : provider.hint}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {connected ? (
                          <button
                            type="button"
                            onClick={() => void disconnectSocial(provider.key)}
                            disabled={!!socialBusy}
                            className="btn-ghost text-[12px] px-4 py-2"
                          >
                            {busyDisconnecting ? "Disconnecting..." : "Disconnect"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void connectSocial(provider.key)}
                            disabled={!!socialBusy || !canConnect}
                            className="inline-flex items-center rounded-full border px-4 py-2 text-[12px] font-semibold transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                            style={connectButtonStyle(provider.key)}
                            title={canConnect ? "Connect" : "Upgrade to unlock this channel"}
                          >
                            {!canConnect
                              ? "Upgrade"
                              : busyConnecting
                                ? "Connecting..."
                                : "Connect"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {socialMsg ? <div className="mt-4 text-[12px] text-white/60">{socialMsg}</div> : null}
          </div>
        </section>

        <section className="surface-soft relative mt-6 overflow-hidden rounded-3xl p-6 md:p-7">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <div className="text-xs text-white/50">Step 1</div>
              <div className="mt-1 text-sm font-semibold text-white/85">Connect accounts</div>
              <p className="mt-1 text-xs text-white/60">Authorize each platform once from this page.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <div className="text-xs text-white/50">Step 2</div>
              <div className="mt-1 text-sm font-semibold text-white/85">Create clips</div>
              <p className="mt-1 text-xs text-white/60">Generate clips in Upload and review in Clips.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <div className="text-xs text-white/50">Step 3</div>
              <div className="mt-1 text-sm font-semibold text-white/85">Post faster</div>
              <p className="mt-1 text-xs text-white/60">Pick your destination and schedule from Clips.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
