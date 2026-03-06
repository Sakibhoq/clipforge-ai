// frontend/app/app/billing/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { normalizeAppPlan } from "@/lib/plans";

/* =========================================================
   Orbito Labs — Billing
   Goals:
   - Users can change plans anytime (upgrade/downgrade)
   - Users can buy more credits when they run out
   - Stripe Checkout integration for plan + pack purchases
   - Premium, calm, not intimidating

   Mobile polish:
   - Safe-area padding + svh guards
   - Toast positioned above bottom safe-area
   - Buttons go full-width on small screens
========================================================= */

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function formatMoney(n: number) {
  const fixed = n.toFixed(2);
  return fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed;
}

function formatProjectEstimate(credits: number): string {
  const safe = Math.max(0, Number(credits || 0));
  // 1-minute AI post (image + voice) is typically ~30 credits on default pricing.
  return Math.max(1, Math.floor(safe / 30)).toLocaleString();
}

type PlanKey = "free_trial" | "starter" | "creator" | "studio";
type BillingInterval = "monthly" | "yearly";

type Plan = {
  key: PlanKey;
  name: string;
  short: string;
  desc: string;
  recommended?: boolean;
  interval?: BillingInterval | "custom";
  priceLabel: string;
  note?: string;
  highlight?: boolean;
};

type CreditPack = {
  key: string;
  name: string;
  credits: number;
  packQty: number;
  priceLabel: string;
  popular?: boolean;
  valueHint?: string;
};

type BillingHistoryInvoice = {
  id: string;
  number?: string | null;
  status?: string | null;
  currency: string;
  amount_paid: number;
  amount_due: number;
  created: number;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
};

function formatMoneyFromCents(cents: number, currency: string) {
  const value = (Number(cents || 0) / 100).toFixed(2);
  return `${String(currency || "USD").toUpperCase()} ${value}`;
}

function formatDateFromUnix(ts: number) {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  return new Date(ts * 1000).toLocaleDateString();
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  const t =
    tone === "good"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100/90"
      : tone === "warn"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-100/90"
      : "border-white/10 bg-white/[0.04] text-white/75";

  return (
    <span className={cx("inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold", t)}>
      {children}
    </span>
  );
}

function Divider() {
  return <div className="my-4 h-px w-full bg-white/10" />;
}

function SoftCard({
  children,
  className = "",
  glow = true,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div className={cx("surface-soft relative overflow-hidden", className)}>
      {glow ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-10 opacity-25 blur-2xl"
          style={{
            background:
              "radial-gradient(220px 150px at 22% 28%, rgba(255,183,3,0.14), transparent 72%), radial-gradient(240px 170px at 78% 42%, rgba(58,134,255,0.12), transparent 72%), radial-gradient(240px 170px at 50% 88%, rgba(251,86,7,0.10), transparent 72%)",
          }}
        />
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}

function PlanCard({
  plan,
  active,
  onChoose,
}: {
  plan: Plan;
  active: boolean;
  onChoose: (p: PlanKey) => void;
}) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-6 transition-all duration-300",
        plan.highlight && "border-white/18 bg-white/[0.03]",
        "hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.03]"
      )}
    >
      {plan.highlight ? (
        <div className="pointer-events-none absolute inset-0 rounded-3xl [box-shadow:0_0_0_1px_rgba(255,255,255,0.10),0_25px_100px_rgba(0,0,0,0.55)]" />
      ) : null}

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white/90">{plan.name}</div>
            <div className="mt-1 text-sm text-white/60">{plan.desc}</div>
          </div>

          <div className="flex items-center gap-2">
            {active ? <Badge tone="good">Current</Badge> : null}
            {plan.recommended ? <Badge>Recommended</Badge> : null}
          </div>
        </div>

        <div className="mt-4 text-3xl font-semibold tracking-tight text-white/85">{plan.priceLabel}</div>

        {plan.note ? (
          <div className="mt-2 text-[12px] leading-relaxed text-white/55">{plan.note}</div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {plan.key === "studio" && !active ? (
            <Link href="/contact" className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto text-center">
              Contact support
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => onChoose(plan.key)}
              disabled={active}
              className={cx(
                "btn-aurora text-[12px] px-4 py-2 w-full sm:w-auto",
                active && "opacity-60 cursor-not-allowed"
              )}
            >
              {active ? "Selected" : "Choose"}
            </button>
          )}

          <Link href="/pricing" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto text-center">
            Compare plans
          </Link>
        </div>

        <div className="mt-4 h-px w-full bg-white/10" />

        <div className="mt-3 flex items-center justify-between text-[12px] text-white/55">
          <span>{plan.short}</span>
          <span className="text-white/45">
            {plan.interval === "custom" ? "custom" : plan.interval === "yearly" ? "yearly" : "monthly"}
          </span>
        </div>
      </div>
    </div>
  );
}

function PackCard({
  pack,
  onBuy,
}: {
  pack: CreditPack;
  onBuy: (key: string) => void;
}) {
  const estimatedProjects = formatProjectEstimate(pack.credits || 0);

  return (
    <button
      type="button"
      onClick={() => onBuy(pack.key)}
      className={cx(
        "surface-soft group relative overflow-hidden p-6 text-left transition-all duration-300",
        "hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.03]",
        pack.popular && "border-white/18 bg-white/[0.03]"
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-35"
        style={{
          background:
            "radial-gradient(220px 150px at 22% 28%, rgba(255,183,3,0.16), transparent 72%), radial-gradient(240px 170px at 78% 42%, rgba(58,134,255,0.14), transparent 72%), radial-gradient(240px 170px at 50% 88%, rgba(251,86,7,0.11), transparent 72%)",
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">{pack.name}</div>
            <div className="mt-1 text-sm text-white/60">
              ~{estimatedProjects} x 1-min AI posts <span className="text-white/35">•</span>{" "}
              {pack.credits.toLocaleString()} credits
            </div>
          </div>
          {pack.popular ? <Badge>Popular</Badge> : null}
        </div>

        <div className="mt-4 text-2xl font-semibold tracking-tight text-white/90">{pack.priceLabel}</div>

        <div className="mt-2 text-[12px] text-white/55">
          {pack.valueHint ?? "One-time purchase. Credits add to your balance."}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <span className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto text-center">Buy credits</span>
          <span className="text-[12px] text-white/45">Tax calculated at checkout</span>
        </div>
      </div>
    </button>
  );
}

function Modal({
  open,
  title,
  desc,
  confirmLabel,
  onClose,
  onConfirm,
  tone = "neutral",
  extra,
}: {
  open: boolean;
  title: string;
  desc: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  tone?: "neutral" | "warn";
  extra?: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        aria-label="Close overlay"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="surface relative w-full max-w-md overflow-hidden p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-12 opacity-40 blur-2xl"
          style={{
            background:
              "radial-gradient(240px 180px at 25% 25%, rgba(255,183,3,0.18), transparent 72%), radial-gradient(260px 200px at 80% 40%, rgba(58,134,255,0.16), transparent 72%), radial-gradient(260px 200px at 55% 90%, rgba(251,86,7,0.12), transparent 72%)",
          }}
        />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-semibold text-white/90">{title}</div>
            {tone === "warn" ? <Badge tone="warn">Heads up</Badge> : null}
          </div>
          <div className="mt-2 text-sm leading-relaxed text-white/60">{desc}</div>

          {extra ? <div className="mt-4">{extra}</div> : null}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {confirmLabel}
            </button>
          </div>

      <div className="mt-3 text-[12px] text-white/45">Stripe handles payment + tax at checkout.</div>
        </div>
      </div>
    </div>
  );
}

function Toast({ show, text }: { show: boolean; text: string }) {
  return (
    <div
      className={cx(
        "fixed z-[90] transition-all duration-300",
        "left-4 right-4 sm:left-auto sm:right-6",
        "bottom-[max(16px,env(safe-area-inset-bottom))]",
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      )}
      aria-live="polite"
    >
      <div className="mx-auto sm:mx-0 w-full sm:w-auto rounded-2xl border border-white/10 bg-black/70 backdrop-blur px-4 py-3 text-[12px] text-white/80 shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
        {text}
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/75">
      <span className="text-white/55">{label}:</span> {value}
    </div>
  );
}

function checkoutErrorMessage(e: any): string {
  if (!e) return "Checkout is temporarily unavailable. Please try again.";
  const detail = e?.detail || e?.message || e?.error;
  const detailStr = typeof detail === "string" ? detail : "";
  if (detailStr.toLowerCase().includes("stripe not configured")) {
    return "Checkout isn’t available right now. Please try again later.";
  }
  if (detailStr.toLowerCase().includes("price not configured")) {
    return "Checkout isn’t available right now. Please try again later.";
  }
  if (detailStr.toLowerCase().includes("failed to fetch")) {
    return "Network error. Please refresh and try again.";
  }
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return "Checkout is temporarily unavailable. Please try again.";
  }
}

function CreditsCard({
  credits,
  onBuy,
}: {
  credits: number | null;
  onBuy: () => void;
}) {
  const creditDisplay = credits === null ? "—" : credits.toLocaleString();
  const projectDisplay = credits === null ? "—" : formatProjectEstimate(credits);

  return (
    <SoftCard className="p-6" glow>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">Generation credits balance</div>
          <div className="mt-1 text-sm text-white/60">
            Credits are usage units. AI post mode is optimized for ready-to-post image+voice social clips.
          </div>
        </div>
        <Badge>Metered</Badge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-[12px] text-white/55">Estimated projects</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white/90">{projectDisplay}</div>
          <div className="mt-1 text-[12px] text-white/45">~1-min AI posts <span className="text-white/35">•</span> {creditDisplay} credits</div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-[12px] text-white/55">Used this period</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white/90">—</div>
          <div className="mt-1 text-[12px] text-white/45">Not available yet</div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-[12px] text-white/55">Credits</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white/90">{creditDisplay}</div>
          <div className="mt-1 text-[12px] text-white/45">credits</div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="button" onClick={onBuy} className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto">
          Buy credits
        </button>
        <Link href="/app" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto text-center">
          Open console
        </Link>

        <div className="sm:ml-auto text-[12px] text-white/55">Tip: packs apply to Creator only.</div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="text-[12px] font-semibold text-white/80">How credits work</div>
        <div className="mt-2 grid gap-2 text-[12px] text-white/55">
          <div>• AI post uses image credits + voice credits (1 credit per 300 words).</div>
          <div>• Video generation uses HD or 4K lanes, with style-based pricing.</div>
          <div>• Plans add credits each month.</div>
          <div>• Top-up packs add extra credits on top of Creator.</div>
        </div>
      </div>
    </SoftCard>
  );
}

function BillingHistoryCard({
  invoices,
  loading,
  error,
}: {
  invoices: BillingHistoryInvoice[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <SoftCard className="p-6" glow={false}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">Billing history</div>
          <div className="mt-1 text-sm text-white/60">Invoices appear after your first payment.</div>
        </div>
        <Badge tone="neutral">History</Badge>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02]">
        {loading ? (
          <div className="px-4 py-4 text-sm text-white/60">Loading invoices…</div>
        ) : error ? (
          <div className="px-4 py-4 text-sm text-rose-200/80">{error}</div>
        ) : invoices.length === 0 ? (
          <div className="px-4 py-4 text-sm text-white/60">
            No invoices yet. After checkout, invoices and receipts will appear here.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {invoices.map((inv) => {
              const invoiceUrl = inv.hosted_invoice_url || inv.invoice_pdf || null;
              return (
                <div key={inv.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white/85">
                      {inv.number || inv.id}
                    </div>
                    <div className="mt-1 text-[12px] text-white/55">
                      {formatDateFromUnix(inv.created)} • {String(inv.status || "unknown")}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-sm text-white/75">
                      {formatMoneyFromCents(inv.amount_paid || inv.amount_due, inv.currency)}
                    </div>
                    {invoiceUrl ? (
                      <a
                        href={invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ghost text-[12px] px-3 py-1.5"
                      >
                        View
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SoftCard>
  );
}

export default function BillingPage() {
  type MeResponse = { name?: string | null; email: string; plan: string; credits: number };

  const [currentPlan, setCurrentPlan] = useState<PlanKey>("free_trial");
  const interval: BillingInterval = "monthly";
  const [credits, setCredits] = useState<number | null>(null);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [history, setHistory] = useState<BillingHistoryInvoice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"plan" | "pack" | "info">("plan");

  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);
  const [pendingPack, setPendingPack] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MeResponse>("/auth/me", { method: "GET" })
      .then((me) => {
        if (cancelled) return;
        const plan = normalizeAppPlan(me.plan);
        const mapped: PlanKey =
          plan === "starter"
            ? "starter"
            : plan === "creator"
            ? "creator"
            : plan === "studio"
            ? "studio"
            : "free_trial";
        setCurrentPlan(mapped);
        setCredits(typeof me.credits === "number" ? me.credits : 0);
      })
      .catch(() => {
        if (!cancelled) {
          setCredits(null);
        }
      });

    apiFetch<{ invoices: BillingHistoryInvoice[] }>("/billing/history?limit=20", { method: "GET" })
      .then((res) => {
        if (cancelled) return;
        setHistory(Array.isArray(res?.invoices) ? res.invoices : []);
        setHistoryError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setHistory([]);
        setHistoryError("Could not load billing history right now.");
      })
      .finally(() => {
        if (cancelled) return;
        setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }

  async function startCheckout(plan: "free" | "starter" | "creator", packQty?: number) {
    if (startingCheckout) return;
    setStartingCheckout(true);
    try {
      const payload =
        plan === "creator"
          ? { plan, interval, pack: Math.max(1, Math.min(10, packQty || 1)) }
          : { plan, interval: "monthly" };

      const data = (await apiFetch("/billing/checkout-session", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as any;

      const url = data?.url;
      if (!url) {
        showToast("Checkout failed. Try again.");
        return;
      }
      window.location.href = url;
    } catch (e) {
      showToast(checkoutErrorMessage(e));
    } finally {
      setStartingCheckout(false);
    }
  }

  const plans: Plan[] = useMemo(() => {
    const starterMonthlyPrice = 39.0;
    const creatorMonthlyPrice = 99.0;
    const creatorPrice = `$${formatMoney(creatorMonthlyPrice)} / mo`;

    return [
      {
        key: "free_trial",
        name: "Free Trial",
        short: "Try the workflow",
        desc: "Build your first AI post and test the full flow.",
        priceLabel: "$0",
        interval: "monthly",
        note: "Includes 75 credits one-time. Social posting is locked on Free Trial.",
      },
      {
        key: "starter",
        name: "Starter",
        short: "Simple monthly plan",
        desc: "For consistent AI post publishing.",
        priceLabel: `$${formatMoney(starterMonthlyPrice)} / mo`,
        interval: "monthly",
        note: "Includes 390 credits/month. Social posting: Facebook + Instagram.",
      },
      {
        key: "creator",
        name: "Creator",
        short: "Scale credits",
        desc: "Scale AI post output and unlock the 4K video lane.",
        priceLabel: creatorPrice,
        interval,
        recommended: true,
        highlight: true,
        note: "Includes 990 credits/month. Social posting: all major platforms.",
      },
      {
        key: "studio",
        name: "Studio",
        short: "Teams + enterprise",
        desc: "Workflows for teams and larger volumes.",
        priceLabel: "Custom",
        interval: "custom",
        note: "Contact us for a quote and onboarding.",
      },
    ];
  }, [interval]);

  const creditPacks: CreditPack[] = useMemo(() => {
    const base = 990;
    return [
      {
        key: "pack_1x",
        name: "Creator 1×",
        packQty: 1,
        credits: base * 1,
        priceLabel: "Scales Creator",
        valueHint: "Great for steady weekly publishing.",
      },
      {
        key: "pack_3x",
        name: "Creator 3×",
        packQty: 3,
        credits: base * 3,
        priceLabel: "Scales Creator",
        popular: true,
        valueHint: "Most picked for daily publishing volume.",
      },
      {
        key: "pack_8x",
        name: "Creator 8×",
        packQty: 8,
        credits: base * 8,
        priceLabel: "Scales Creator",
        valueHint: "Best for heavy teams and campaign bursts.",
      },
    ];
  }, []);

  function openPlanModal(p: PlanKey) {
    if (p === currentPlan) {
      setModalMode("info");
      setPendingPlan(null);
      setPendingPack(null);
      setModalOpen(true);
      return;
    }

    setPendingPlan(p);
    setPendingPack(null);
    setModalMode("plan");
    setModalOpen(true);
  }

  function openPackModal(key: string) {
    setPendingPack(key);
    setPendingPlan(null);
    setModalMode("pack");
    setModalOpen(true);
  }

  function confirmAction() {
    if (modalMode === "plan" && pendingPlan) {
      if (pendingPlan === "starter") startCheckout("starter");
      if (pendingPlan === "creator") startCheckout("creator", 1);
      if (pendingPlan === "free_trial") startCheckout("free");
      return;
    }
    if (modalMode === "pack" && pendingPack) {
      const pack = creditPacks.find((p) => p.key === pendingPack);
      if (pack) {
        startCheckout("creator", pack.packQty);
      }
      return;
    }
    if (modalMode === "info") {
      showToast("You’re already on this plan.");
    }
  }

  const currentPlanLabel = plans.find((p) => p.key === currentPlan)?.name ?? "—";

  const isDowngrade = (from: PlanKey, to: PlanKey) => {
    const rank: Record<PlanKey, number> = { free_trial: 0, starter: 1, creator: 2, studio: 3 };
    return rank[to] < rank[from];
  };

  const pendingIsDowngrade = pendingPlan ? isDowngrade(currentPlan, pendingPlan) : false;

  return (
    <div className="min-h-[100svh] pb-[max(16px,env(safe-area-inset-bottom))] grid gap-6">
      {/* Header */}
      <SoftCard className="p-6" glow>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-sky-300/60">• Billing</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight text-white/92">
              Plan and <span className="grad-text">credits</span>
            </div>
            <div className="mt-1 text-sm text-white/60">
              Change your plan or buy more credits anytime.
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-white/55">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Plan changes</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Packs</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Tax in checkout</span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Link href="/app/settings" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto text-center">
              Settings
            </Link>
            <Link href="/app" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto text-center">
              Open console
            </Link>
          </div>
        </div>
      </SoftCard>

      {/* Credits */}
      <CreditsCard credits={credits} onBuy={() => openPackModal("pack_3x")} />

      {/* Current */}
      <SoftCard className="p-6" glow>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">Current plan</div>
            <div className="mt-1 text-sm text-white/60">Your current subscription and credits balance.</div>
          </div>
          <Badge tone="good">{currentPlanLabel}</Badge>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <StatPill label="Plan" value={currentPlanLabel} />
          <StatPill
            label="Est. projects"
            value={credits === null ? "—" : formatProjectEstimate(credits)}
          />
          <StatPill label="Status" value="Active" />
        </div>

        <Divider />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto"
            onClick={() => openPlanModal(currentPlan)}
          >
            Manage plan
          </button>
          <div className="text-[12px] text-white/55">Stripe Checkout handles upgrades and changes.</div>
        </div>
      </SoftCard>

      {/* Plan switching */}
      <SoftCard className="p-6" glow>
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">Change plan</div>
            <div className="mt-1 text-sm text-white/60">
              Upgrade anytime. Downgrades can start at the end of your period.
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {plans
            .filter((p) => p.key !== "free_trial")
            .map((p) => (
              <PlanCard key={p.key} plan={p} active={p.key === currentPlan} onChoose={openPlanModal} />
            ))}
        </div>

        <div className="mt-4 text-[12px] text-white/55">
          Tax is calculated at checkout. Plan changes are handled by Stripe during checkout.
        </div>
        <div className="mt-2 text-[12px] text-white/45">Promo codes can be entered during checkout.</div>
      </SoftCard>

      {/* Packs */}
      <SoftCard className="p-6" glow>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">Buy more credits</div>
            <div className="mt-1 text-sm text-white/60">Add extra credits when you need them.</div>
          </div>
          <Badge>Creator packs</Badge>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {creditPacks.map((p) => (
            <PackCard key={p.key} pack={p} onBuy={openPackModal} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-white/55">
          <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1">Credits add after checkout</span>
          <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1">Creator required</span>
          <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1">Receipts via email</span>
        </div>
      </SoftCard>

      {/* Billing history */}
      <BillingHistoryCard invoices={history} loading={historyLoading} error={historyError} />

      {/* Modal */}
      <Modal
        open={modalOpen}
        title={
          modalMode === "plan"
            ? "Confirm plan change"
            : modalMode === "pack"
            ? "Confirm pack purchase"
            : "You’re already on this plan"
        }
        desc={
          modalMode === "plan"
            ? "This will open Stripe Checkout to confirm your plan."
            : modalMode === "pack"
            ? "This will open Stripe Checkout to add Creator credits."
            : "Nothing to change right now. You’re already on this plan."
        }
        confirmLabel={modalMode === "info" ? "Okay" : "Confirm"}
        tone={modalMode === "plan" && pendingIsDowngrade ? "warn" : "neutral"}
        extra={
          modalMode === "plan" && pendingPlan ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-[12px] text-white/60">
              <div className="font-semibold text-white/80">What happens next</div>
              <div className="mt-2 grid gap-2">
                <div>• Upgrades: immediate.</div>
                <div>• Downgrades: handled in Stripe during checkout.</div>
                <div>• Credits: updated after checkout confirmation.</div>
              </div>
            </div>
          ) : null
        }
        onClose={() => setModalOpen(false)}
        onConfirm={confirmAction}
      />

      <Toast show={!!toast} text={toast ?? ""} />
    </div>
  );
}
