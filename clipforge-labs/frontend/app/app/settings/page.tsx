// frontend/app/app/settings/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

/* =========================================================
   Clipforge Labs — Settings (Launch-Ready)
   - Calm premium app-chrome
   - Local-only preferences (persisted in localStorage)
   - Real logout calls /auth/logout (cookie-auth) + fallback cookie clear
   - /auth/me hydration for email/plan/credits (graceful fallback if unavailable)
   - Mobile polish: safe-area padding, svh height, responsive button layout
========================================================= */

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function Icon({
  name,
  className = "",
}: {
  name:
    | "user"
    | "bolt"
    | "shield"
    | "mail"
    | "chev"
    | "warn"
    | "check"
    | "info"
    | "card";
  className?: string;
}) {
  const common = `inline-block ${className}`;

  if (name === "user") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12Z"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="1.6"
        />
        <path
          d="M4.8 21a7.2 7.2 0 0 1 14.4 0"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "bolt") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M13 2 3 14h8l-1 8 11-14h-8l0-6Z"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "shield") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M12 2 20 6v7c0 5-3.5 9-8 9s-8-4-8-9V6l8-4Z"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9 12l2 2 4-5"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "card") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <rect
          x="3"
          y="6"
          width="18"
          height="12"
          rx="2.5"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1.6"
        />
        <path d="M3 10h18" stroke="rgba(255,255,255,0.5)" strokeWidth="1.6" />
      </svg>
    );
  }

  if (name === "mail") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M4 6h16v12H4V6Z"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="m5 7 7 6 7-6"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "warn") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M12 3 2.8 20h18.4L12 3Z"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M12 9v5"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M12 17h.01"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M20 7L10.2 16.8 4.8 11.4"
          stroke="rgba(167,255,220,0.9)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "info") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.6"
        />
        <path
          d="M12 10.5v6"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12 7.5h.01"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // chev
  return (
    <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M9 6l6 6-6 6"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Divider() {
  return <div className="h-px w-full bg-white/10" />;
}

function Section({
  icon,
  title,
  desc,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-soft relative overflow-hidden p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 opacity-30 blur-2xl"
        style={{
          background:
            "radial-gradient(180px 140px at 25% 30%, rgba(255,183,3,0.16), transparent 72%), radial-gradient(200px 160px at 80% 45%, rgba(58,134,255,0.14), transparent 72%), radial-gradient(200px 160px at 50% 88%, rgba(251,86,7,0.10), transparent 72%)",
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {icon ? (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                  {icon}
                </span>
              ) : null}
              <div>
                <div className="text-sm font-semibold text-white/90">{title}</div>
                <div className="mt-1 text-sm text-white/60">{desc}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  right,
}: {
  label: string;
  hint?: string;
  right: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white/85">{label}</div>
        {hint ? <div className="mt-1 text-sm text-white/55">{hint}</div> : null}
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cx(
        "relative inline-flex h-9 w-[62px] items-center rounded-full border transition",
        value ? "border-white/16 bg-white/[0.10]" : "border-white/10 bg-white/[0.03]"
      )}
      aria-label={label}
    >
      <span
        className={cx(
          "absolute left-1 top-1 h-7 w-7 rounded-full border transition",
          value
            ? "translate-x-[26px] border-white/14 bg-white/[0.14]"
            : "translate-x-0 border-white/10 bg-white/[0.06]"
        )}
      />
    </button>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-white/70">
      {children}
    </span>
  );
}

/**
 * Fallback cookie clearing (helps if backend logout fails / cookies stuck).
 * We avoid hardcoding domain; path-only is safest across envs.
 */
function clearCookieEverywhere(name: string) {
  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";
  const base = `${name}=; expires=${expires}; Max-Age=0; SameSite=Lax;`;

  // Common paths
  document.cookie = `${base} path=/;`;
  document.cookie = `${base} path=/app;`;
}

type LocalPrefs = {
  emailReports: boolean;
  productTips: boolean;
  autoPlayPreviews: boolean;
  receiptsEnabled: boolean;
  processingAlertsEnabled: boolean;
};

type SettingsPreferencesResponse = {
  email_reports: boolean;
  product_tips: boolean;
  auto_play_previews: boolean;
  receipts_enabled: boolean;
  processing_alerts_enabled: boolean;
};

const DEFAULT_PREFS: LocalPrefs = {
  emailReports: true,
  productTips: false,
  autoPlayPreviews: true,
  receiptsEnabled: true,
  processingAlertsEnabled: false,
};

type MeResponse = {
  name?: string | null;
  email: string;
  plan: string;
  credits: number;
};

export default function SettingsPage() {
  const router = useRouter();

  // Account prefs
  const [emailReports, setEmailReports] = useState(DEFAULT_PREFS.emailReports);
  const [productTips, setProductTips] = useState(DEFAULT_PREFS.productTips);
  const [autoPlayPreviews, setAutoPlayPreviews] = useState(DEFAULT_PREFS.autoPlayPreviews);
  const [receiptsEnabled, setReceiptsEnabled] = useState(DEFAULT_PREFS.receiptsEnabled);
  const [processingAlertsEnabled, setProcessingAlertsEnabled] = useState(DEFAULT_PREFS.processingAlertsEnabled);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);

  const [saveState, setSaveState] = useState<null | "saved" | "error">(null);

  // /auth/me hydration (graceful)
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [billingBusy, setBillingBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const name = me?.name ?? "—";
  const email = me?.email ?? "—";
  const plan = me?.plan ?? "—";
  const credits = typeof me?.credits === "number" ? String(me.credits) : "—";
  const status = meLoading ? "Loading…" : me ? "Active" : "—";

  useEffect(() => {
    // hydrate /auth/me (optional; if fails we stay UI-only)
    let mounted = true;
    setMeLoading(true);
    apiFetch<MeResponse>("/auth/me", { method: "GET" })
      .then((d) => {
        if (!mounted) return;
        setMe(d);
      })
      .catch(() => {
        if (!mounted) return;
        setMe(null);
      })
      .finally(() => {
        if (!mounted) return;
        setMeLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setPrefsLoading(true);
    apiFetch<SettingsPreferencesResponse>("/settings/preferences", { method: "GET" })
      .then((p) => {
        if (!mounted) return;
        setEmailReports(!!p?.email_reports);
        setProductTips(!!p?.product_tips);
        setAutoPlayPreviews(!!p?.auto_play_previews);
        setReceiptsEnabled(!!p?.receipts_enabled);
        setProcessingAlertsEnabled(!!p?.processing_alerts_enabled);
      })
      .catch(() => {
        if (!mounted) return;
        setEmailReports(DEFAULT_PREFS.emailReports);
        setProductTips(DEFAULT_PREFS.productTips);
        setAutoPlayPreviews(DEFAULT_PREFS.autoPlayPreviews);
        setReceiptsEnabled(DEFAULT_PREFS.receiptsEnabled);
        setProcessingAlertsEnabled(DEFAULT_PREFS.processingAlertsEnabled);
      })
      .finally(() => {
        if (!mounted) return;
        setPrefsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Even if backend call fails, we still force-leave app UI.
    }

    // Fallback: clear common cookie name used by backend
    // (If your cookie name differs, update here.)
    clearCookieEverywhere("cf_token");

    router.push("/login");
    router.refresh();
  }

  async function cancelSubscription() {
    if (billingBusy) return;
    setBillingBusy(true);
    setActionMsg(null);
    try {
      const res = (await apiFetch<{ status: string }>("/billing/cancel", { method: "POST" })) as any;
      setActionMsg(res?.status ? `Subscription: ${res.status}` : "Subscription update requested.");
    } catch (e: any) {
      setActionMsg(e?.detail || e?.message || "Failed to cancel subscription.");
    } finally {
      setBillingBusy(false);
    }
  }

  async function deleteAccount() {
    if (deleteBusy) return;
    const ok = window.confirm(
      "Delete your account? You will lose access right away."
    );
    if (!ok) return;
    setDeleteBusy(true);
    setActionMsg(null);
    try {
      await apiFetch("/auth/delete", { method: "POST" });
      clearCookieEverywhere("cf_token");
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setActionMsg(e?.detail || e?.message || "Failed to delete account.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function savePrefs() {
    if (prefsSaving) return;
    setPrefsSaving(true);
    try {
      const payload = {
        email_reports: emailReports,
        product_tips: productTips,
        auto_play_previews: autoPlayPreviews,
        receipts_enabled: receiptsEnabled,
        processing_alerts_enabled: processingAlertsEnabled,
      };
      const saved = await apiFetch<SettingsPreferencesResponse>("/settings/preferences", {
        method: "PUT",
        body: payload,
      });
      setEmailReports(!!saved?.email_reports);
      setProductTips(!!saved?.product_tips);
      setAutoPlayPreviews(!!saved?.auto_play_previews);
      setReceiptsEnabled(!!saved?.receipts_enabled);
      setProcessingAlertsEnabled(!!saved?.processing_alerts_enabled);
      setSaveState("saved");
      setTimeout(() => setSaveState(null), 1600);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState(null), 2200);
    } finally {
      setPrefsSaving(false);
    }
  }

  async function resetPrefs() {
    if (prefsSaving) return;
    setEmailReports(DEFAULT_PREFS.emailReports);
    setProductTips(DEFAULT_PREFS.productTips);
    setAutoPlayPreviews(DEFAULT_PREFS.autoPlayPreviews);
    setReceiptsEnabled(DEFAULT_PREFS.receiptsEnabled);
    setProcessingAlertsEnabled(DEFAULT_PREFS.processingAlertsEnabled);
    setPrefsSaving(true);
    try {
      const saved = await apiFetch<SettingsPreferencesResponse>("/settings/preferences", {
        method: "PUT",
        body: {
          email_reports: DEFAULT_PREFS.emailReports,
          product_tips: DEFAULT_PREFS.productTips,
          auto_play_previews: DEFAULT_PREFS.autoPlayPreviews,
          receipts_enabled: DEFAULT_PREFS.receiptsEnabled,
          processing_alerts_enabled: DEFAULT_PREFS.processingAlertsEnabled,
        },
      });
      setEmailReports(!!saved?.email_reports);
      setProductTips(!!saved?.product_tips);
      setAutoPlayPreviews(!!saved?.auto_play_previews);
      setReceiptsEnabled(!!saved?.receipts_enabled);
      setProcessingAlertsEnabled(!!saved?.processing_alerts_enabled);
      setSaveState("saved");
      setTimeout(() => setSaveState(null), 1600);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState(null), 2200);
    } finally {
      setPrefsSaving(false);
    }
  }

  const saveChip = useMemo(() => {
    if (saveState === "saved") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[12px] text-emerald-100/90">
          <Icon name="check" />
          Saved to account
        </span>
      );
    }
    if (saveState === "error") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[12px] text-amber-100/90">
          <Icon name="warn" />
          Couldn’t save
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-[12px] text-white/55">
        <Icon name="info" />
        {prefsLoading ? "Loading settings…" : "Saved to account"}
      </span>
    );
  }, [prefsLoading, saveState]);

  return (
    <div className="min-h-[100svh] pb-[max(16px,env(safe-area-inset-bottom))] grid gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-white/90">Settings</div>
          <div className="mt-1 text-sm text-white/60">Manage your account and app preferences.</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/billing" className="btn-solid-dark text-[12px] px-4 py-2">
            Billing
          </Link>
          <Link href="/app" className="btn-ghost text-[12px] px-4 py-2">
            Overview
          </Link>
        </div>
      </div>
      {actionMsg && (
        <div className="text-[12px] text-white/60">{actionMsg}</div>
      )}

      {/* Profile strip */}
      <div className="surface-soft relative overflow-hidden p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-10 opacity-35 blur-2xl"
          style={{
            background:
              "radial-gradient(260px 160px at 22% 30%, rgba(255,183,3,0.18), transparent 72%), radial-gradient(280px 180px at 78% 40%, rgba(58,134,255,0.16), transparent 72%), radial-gradient(280px 180px at 52% 88%, rgba(251,86,7,0.12), transparent 72%)",
          }}
        />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-8 opacity-70 blur-2xl"
                style={{
                  background:
                    "radial-gradient(70px 70px at 35% 35%, rgba(255,183,3,0.35), transparent 70%), radial-gradient(80px 80px at 75% 45%, rgba(58,134,255,0.28), transparent 72%), radial-gradient(80px 80px at 55% 85%, rgba(251,86,7,0.18), transparent 72%)",
                }}
              />
              <span className="relative text-white/85">
                <Icon name="user" />
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-white/90">Account</div>
                <span className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-0.5 text-[11px] text-white/55 inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                  {me ? "Live" : "Fallback"}
                </span>
              </div>

              <div className="mt-1 text-sm text-white/60">
                Name <span className="text-white/80">{name}</span>
              </div>
              <div className="mt-1 text-sm text-white/60">
                Email <span className="text-white/80">{email}</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Pill>Plan: {plan}</Pill>
                <Pill>Credits: {credits}</Pill>
                <Pill>Status: {status}</Pill>
              </div>

              {!me ? (
                <div className="mt-2 text-[12px] text-white/45">
                  Account details will load when your session is available.
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full md:w-auto">
            <Link href="/app/upload" className="btn-aurora text-[12px] px-4 py-2 w-full sm:w-auto">
              New upload
            </Link>
            <button
              type="button"
              onClick={logout}
              className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto"
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      {/* Billing controls */}
      <Section icon={<Icon name="card" />} title="Billing controls" desc="Manage your subscription.">
        <div className="rounded-3xl border border-white/10 bg-black/20 px-5">
          <Row
            label="Cancel subscription"
            hint="Stops future renewals at the end of your current billing period."
            right={
              <button
                type="button"
                onClick={cancelSubscription}
                disabled={billingBusy}
                className="btn-ghost text-[12px] px-4 py-2 disabled:opacity-60"
              >
                {billingBusy ? "Canceling…" : "Cancel"}
              </button>
            }
          />
        </div>
      </Section>

      {/* Preferences */}
      <Section icon={<Icon name="bolt" />} title="Preferences" desc="These settings are saved to your account.">
        <div className="rounded-3xl border border-white/10 bg-black/20 px-5">
          <Row
            label="Autoplay clip previews"
            hint="Play previews automatically in the Clips page."
            right={<Toggle label="Autoplay previews" value={autoPlayPreviews} onChange={setAutoPlayPreviews} />}
          />
          <Divider />
          <Row
            label="Email reports"
            hint="Weekly summary email."
            right={<Toggle label="Email reports" value={emailReports} onChange={setEmailReports} />}
          />
          <Divider />
          <Row
            label="Product tips"
            hint="Short tips to improve clip quality."
            right={<Toggle label="Product tips" value={productTips} onChange={setProductTips} />}
          />
        </div>

        <div className="mt-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
          <button
            type="button"
            className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto"
            onClick={() => void savePrefs()}
            disabled={prefsSaving || prefsLoading}
          >
            {prefsSaving ? "Saving…" : "Save preferences"}
          </button>
          <button
            type="button"
            className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto"
            onClick={() => void resetPrefs()}
            disabled={prefsSaving || prefsLoading}
          >
            Reset
          </button>

          <div className="sm:ml-auto flex items-center justify-start sm:justify-end">{saveChip}</div>
        </div>
      </Section>

      {/* Security */}
      <Section icon={<Icon name="shield" />} title="Security" desc="Password and session controls.">
        <div className="rounded-3xl border border-white/10 bg-black/20 px-5">
          <Row
            label="Password"
            hint="Update your account password."
            right={
              <Link
                href="/app/settings/password"
                className="btn-ghost text-[12px] px-4 py-2 inline-flex items-center gap-2"
              >
                Change
                <Icon name="chev" className="opacity-70" />
              </Link>
            }
          />

          <Divider />

          <Row
            label="Active session"
            hint="Sign out from this device."
            right={
              <button type="button" onClick={logout} className="btn-solid-dark text-[12px] px-4 py-2">
                Log out
              </button>
            }
          />
        </div>

      </Section>

      {/* Notifications */}
      <Section icon={<Icon name="mail" />} title="Notifications" desc="Delivery and noise controls.">
        <div className="rounded-3xl border border-white/10 bg-black/20 px-5">
          <Row
            label="Receipts"
            hint="Payment receipts by email."
            right={<Toggle label="Receipts" value={receiptsEnabled} onChange={setReceiptsEnabled} />}
          />
          <Divider />
          <Row
            label="Processing alerts"
            hint="Get notified when jobs finish."
            right={
              <Toggle
                label="Processing alerts"
                value={processingAlertsEnabled}
                onChange={setProcessingAlertsEnabled}
              />
            }
          />
        </div>

        <div className="mt-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
          <Link href="/contact" className="btn-ghost text-[12px] px-4 py-2 inline-flex items-center gap-2 w-full sm:w-auto">
            Contact support
            <Icon name="chev" className="opacity-70" />
          </Link>
          <div className="text-[12px] text-white/55">Save preferences to apply notification changes.</div>
        </div>
      </Section>

      {/* Danger zone */}
      <div className="surface-soft relative overflow-hidden p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-10 opacity-25 blur-2xl"
          style={{
            background:
              "radial-gradient(220px 150px at 22% 28%, rgba(255,183,3,0.12), transparent 72%), radial-gradient(240px 170px at 78% 42%, rgba(58,134,255,0.10), transparent 72%), radial-gradient(240px 170px at 50% 88%, rgba(251,86,7,0.08), transparent 72%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
            <Icon name="warn" />
            Danger zone
          </div>
          <div className="mt-1 text-sm text-white/60">
            Deleting your account removes access right away.
          </div>

          <div className="mt-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={deleteAccount}
              disabled={deleteBusy}
              className="btn-ghost text-[12px] px-4 py-2 disabled:opacity-50 w-full sm:w-auto"
            >
              {deleteBusy ? "Deleting…" : "Delete account"}
            </button>
            <div className="text-[12px] text-white/55">This cannot be undone.</div>
          </div>

          <div className="mt-3 text-[12px] text-white/45">
            Some account records may stay for fraud and legal reasons.
          </div>
        </div>
      </div>
    </div>
  );
}
