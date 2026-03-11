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

type MetaPageOption = {
  page_id: string;
  page_name: string;
  has_page_access_token?: boolean;
  instagram_user_id?: string | null;
  instagram_username?: string | null;
  selected_for_facebook?: boolean;
  selected_for_instagram?: boolean;
};

type MetaPagesResponse = {
  pages?: MetaPageOption[];
};

type MeResponse = {
  plan?: string | null;
};

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
  const [metaPages, setMetaPages] = useState<MetaPageOption[]>([]);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);
  const [metaBusy, setMetaBusy] = useState<string | null>(null);
  const [socialMsg, setSocialMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<AppPlan>("free");

  async function refreshSummary() {
    setLoading(true);
    setError(null);
    try {
      const [sa, mp] = await Promise.allSettled([
        apiFetch<SocialAccount[]>("/social/accounts", { method: "GET" }),
        apiFetch<MetaPagesResponse>("/social/meta/pages", { method: "GET" }),
      ]);
      if (sa.status === "fulfilled") setSocialAccounts(Array.isArray(sa.value) ? sa.value : []);
      if (sa.status === "rejected") setSocialAccounts([]);
      if (mp.status === "fulfilled") setMetaPages(Array.isArray(mp.value?.pages) ? mp.value.pages : []);
      if (mp.status === "rejected") setMetaPages([]);
    } catch {
      setError("Could not load data right now. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSummary();
    apiFetch<MeResponse>("/auth/me", { method: "GET" })
      .then((me) => {
        setCurrentPlan(normalizeAppPlan(me?.plan));
      })
      .catch(() => {
        setCurrentPlan("free");
      });
  }, []);

  const postingAccessLabel = useMemo(() => {
    if (currentPlan === "starter") return "Posting access: Facebook + Instagram";
    if (currentPlan === "creator" || currentPlan === "studio") return "Posting access: all platforms";
    return "Posting access: upgrade required";
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

  async function refreshMetaPages() {
    try {
      const data = await apiFetch<MetaPagesResponse>("/social/meta/pages", { method: "GET" });
      setMetaPages(Array.isArray(data?.pages) ? data.pages : []);
    } catch {
      setMetaPages([]);
    }
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
      await Promise.all([refreshSocialAccounts(), refreshMetaPages()]);
    } catch (e: any) {
      setSocialMsg(e?.detail || e?.message || `Failed to disconnect ${provider}.`);
    } finally {
      setSocialBusy(null);
    }
  }

  async function selectMetaTarget(provider: "facebook" | "instagram", pageId: string) {
    if (socialBusy || metaBusy) return;
    const pid = String(pageId || "").trim();
    if (!pid) return;
    setSocialMsg(null);
    setMetaBusy(provider);
    try {
      const res = (await apiFetch<{ page_name?: string }>(`/social/accounts/${provider}/meta-target`, {
        method: "POST",
        body: { page_id: pid },
      })) as any;
      const targetLabel = provider === "facebook" ? "Facebook Page" : "Instagram Page";
      setSocialMsg(`${targetLabel} set to ${res?.page_name || pid}`);
      await Promise.all([refreshSocialAccounts(), refreshMetaPages()]);
    } catch (e: any) {
      setSocialMsg(e?.detail || e?.message || `Failed to select ${provider} page.`);
    } finally {
      setMetaBusy(null);
    }
  }

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 620px at 10% 10%, rgba(255,183,3,0.14), transparent 66%), radial-gradient(860px 620px at 90% 14%, rgba(58,134,255,0.14), transparent 66%), radial-gradient(840px 560px at 20% 88%, rgba(251,86,7,0.12), transparent 68%), radial-gradient(820px 560px at 82% 84%, rgba(155,140,255,0.12), transparent 68%), radial-gradient(760px 520px at 50% 48%, rgba(70,215,255,0.08), transparent 70%)",
        }}
      />
      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-12">
        <section className="surface relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-45 blur-3xl"
            style={{
              background:
                "radial-gradient(260px 170px at 14% 24%, rgba(255,183,3,0.22), transparent 70%), radial-gradient(300px 210px at 82% 28%, rgba(58,134,255,0.2), transparent 72%), radial-gradient(260px 190px at 58% 92%, rgba(251,86,7,0.16), transparent 72%), radial-gradient(250px 170px at 30% 70%, rgba(155,140,255,0.16), transparent 73%), radial-gradient(230px 160px at 72% 72%, rgba(70,215,255,0.14), transparent 74%)",
            }}
          />

          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Connections</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/92">
                Social <span className="grad-text">Connections</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                Connect your social accounts, manage status, and publish clips from one place.
              </p>
              <p className="mt-2 max-w-2xl text-xs text-white/50">
                Connect accounts once, then publish your generated clips from one place.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatPill label="Connected" value={`${connectedCount}/${SOCIAL_PROVIDERS.length}`} />
                <StatPill label="Publishing" value={postingAccessLabel} />
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Link href="/app" className="btn-ghost text-center text-[12px] px-4 py-2">
                Open console
              </Link>
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
                "radial-gradient(240px 160px at 18% 24%, rgba(255,183,3,0.18), transparent 70%), radial-gradient(280px 180px at 76% 36%, rgba(58,134,255,0.15), transparent 72%), radial-gradient(240px 170px at 56% 92%, rgba(251,86,7,0.13), transparent 72%), radial-gradient(220px 150px at 26% 74%, rgba(155,140,255,0.12), transparent 74%), radial-gradient(210px 140px at 74% 74%, rgba(70,215,255,0.1), transparent 74%)",
            }}
          />

          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white/90">Connections</h2>
                <p className="mt-1 text-sm text-white/65">
                  Connect each platform once. Posting access follows your plan (Free Trial locked, Starter: Facebook + Instagram, Creator+: all).
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
                const isMetaProvider = provider.key === "facebook" || provider.key === "instagram";
                const eligiblePages = isMetaProvider
                  ? metaPages.filter((page) =>
                      provider.key === "facebook" ? Boolean(page.has_page_access_token) : Boolean(page.instagram_user_id)
                    )
                  : [];
                const selectedMetaPage = isMetaProvider
                  ? eligiblePages.find((page) =>
                      provider.key === "facebook" ? Boolean(page.selected_for_facebook) : Boolean(page.selected_for_instagram)
                    ) || null
                  : null;
                const metaSelectionBusy = metaBusy === provider.key;
                const metaSelectedText = selectedMetaPage
                  ? `${selectedMetaPage.page_name} (${selectedMetaPage.page_id})`
                  : "No page selected";
                const pageOptionLabel = (page: MetaPageOption) => {
                  if (provider.key === "instagram") {
                    const ig = String(page.instagram_username || "").trim();
                    return ig ? `${page.page_name} (${page.page_id}) · @${ig}` : `${page.page_name} (${page.page_id})`;
                  }
                  return `${page.page_name} (${page.page_id})`;
                };

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
                        {connected && isMetaProvider ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                            <div className="text-[11px] text-white/55">
                              {provider.key === "facebook"
                                ? "Publishing Page (required for Facebook posts)"
                                : "Linked Facebook Page for Instagram publishing"}
                            </div>
                            {eligiblePages.length > 0 ? (
                              <>
                                <div className="mt-2 text-[11px] text-white/65">
                                  Selected: <span className="text-white/85">{metaSelectedText}</span>
                                </div>
                                <select
                                  value={selectedMetaPage?.page_id || ""}
                                  onChange={(e) => void selectMetaTarget(provider.key as "facebook" | "instagram", e.target.value)}
                                  disabled={!!socialBusy || !!metaBusy}
                                  className="mt-2 h-10 w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white/90 outline-none focus:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <option value="" disabled>
                                    Select a Page
                                  </option>
                                  {eligiblePages.map((page) => (
                                    <option key={page.page_id} value={page.page_id}>
                                      {pageOptionLabel(page)}
                                    </option>
                                  ))}
                                </select>
                                <div className="mt-2 text-[11px] text-white/52">
                                  Use this selector in your Meta review recording to show list + single Page selection.
                                </div>
                              </>
                            ) : (
                              <div className="mt-2 text-[11px] text-amber-200/85">
                                {provider.key === "facebook"
                                  ? "No publishable Pages found yet. Reconnect and approve Page access."
                                  : "No Instagram Professional account is linked to your Pages yet."}
                              </div>
                            )}
                            {metaSelectionBusy ? (
                              <div className="mt-2 text-[11px] text-white/55">Saving selection...</div>
                            ) : null}
                          </div>
                        ) : null}
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
                            disabled={!!socialBusy}
                            className="inline-flex items-center rounded-full border px-4 py-2 text-[12px] font-semibold transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                            style={connectButtonStyle(provider.key)}
                          >
                            {busyConnecting ? "Connecting..." : "Connect"}
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
              <p className="mt-1 text-xs text-white/60">Generate in Generator and review outputs in Clips.</p>
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
