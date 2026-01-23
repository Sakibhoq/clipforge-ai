// frontend/app/app/billing/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/* =========================================================
   Orbito — Billing (UI only)
   Goals:
   - Users can change plans anytime (upgrade/downgrade)
   - Users can buy more credits when they run out
   - No Stripe calls yet (wired later)
   - Premium, calm, not intimidating

   Mobile polish:
   - Safe-area padding + svh guards
   - Toast positioned above bottom safe-area
   - Buttons go full-width on small screens
========================================================= */

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
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
  priceLabel: string;
  popular?: boolean;
  valueHint?: string;
};

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
              "radial-gradient(220px 150px at 22% 28%, rgba(167,139,250,0.14), transparent 72%), radial-gradient(240px 170px at 78% 42%, rgba(125,211,252,0.12), transparent 72%), radial-gradient(240px 170px at 50% 88%, rgba(45,212,191,0.10), transparent 72%)",
          }}
        />
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}

function SegToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.02] p-1">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={cx(
          "rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
          value === "monthly"
            ? "bg-white/[0.12] text-white"
            : "text-white/60 hover:text-white/80 hover:bg-white/[0.04]"
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("yearly")}
        className={cx(
          "rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
          value === "yearly"
            ? "bg-white/[0.12] text-white"
            : "text-white/60 hover:text-white/80 hover:bg-white/[0.04]"
        )}
      >
        Yearly
      </button>
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
            "radial-gradient(220px 150px at 22% 28%, rgba(167,139,250,0.16), transparent 72%), radial-gradient(240px 170px at 78% 42%, rgba(125,211,252,0.14), transparent 72%), radial-gradient(240px 170px at 50% 88%, rgba(45,212,191,0.11), transparent 72%)",
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">{pack.name}</div>
            <div className="mt-1 text-sm text-white/60">{pack.credits.toLocaleString()} credits</div>
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
              "radial-gradient(240px 180px at 25% 25%, rgba(167,139,250,0.18), transparent 72%), radial-gradient(260px 200px at 80% 40%, rgba(125,211,252,0.16), transparent 72%), radial-gradient(260px 200px at 55% 90%, rgba(45,212,191,0.12), transparent 72%)",
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

          <div className="mt-3 text-[12px] text-white/45">Stripe will handle payment + tax later when wired.</div>
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

function CreditsCard({ onBuy }: { onBuy: () => void }) {
  // UI-only placeholders (later: fetched from /auth/me or /billing)
  const credits = "—";
  const usedThisPeriod = "—";
  const estRunsLeft = "—";

  return (
    <SoftCard className="p-6" glow>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">Credits balance</div>
          <div className="mt-1 text-sm text-white/60">
            Credits meter uploads, processing, and exports. This becomes real once backend is wired.
          </div>
        </div>
        <Badge>Metered</Badge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-[12px] text-white/55">Current balance</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white/90">{credits}</div>
          <div className="mt-1 text-[12px] text-white/45">credits</div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-[12px] text-white/55">Used this period</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white/90">{usedThisPeriod}</div>
          <div className="mt-1 text-[12px] text-white/45">credits</div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-[12px] text-white/55">Estimated runs left</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white/90">{estRunsLeft}</div>
          <div className="mt-1 text-[12px] text-white/45">varies by length</div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="button" onClick={onBuy} className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto">
          Buy credits
        </button>
        <Link href="/app/upload" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto text-center">
          New upload
        </Link>

        <div className="sm:ml-auto text-[12px] text-white/55">Tip: export-ready packs are perfect for heavy weeks.</div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="text-[12px] font-semibold text-white/80">How credits work</div>
        <div className="mt-2 grid gap-2 text-[12px] text-white/55">
          <div>• Credits decrease when you run processing or export.</div>
          <div>• Plans add recurring or upfront credits (yearly).</div>
          <div>• Packs stack on top of your plan balance.</div>
        </div>
      </div>
    </SoftCard>
  );
}

function BillingHistoryCard() {
  return (
    <SoftCard className="p-6" glow={false}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">Billing history</div>
          <div className="mt-1 text-sm text-white/60">Invoices and receipts will appear here once Stripe is wired.</div>
        </div>
        <Badge tone="neutral">UI-only</Badge>
      </div>

      <div className="mt-5 grid gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3"
          >
            <div className="min-w-0">
              <div className="h-3 w-40 rounded bg-white/[0.06]" />
              <div className="mt-2 h-3 w-24 rounded bg-white/[0.05]" />
            </div>
            <div className="h-9 w-24 rounded-full border border-white/10 bg-white/[0.02]" />
          </div>
        ))}
      </div>

      <div className="mt-4 text-[12px] text-white/45">Later: show invoice PDF links + receipt email delivery status.</div>
    </SoftCard>
  );
}

function StudioCtaCard() {
  return (
    <SoftCard className="p-6" glow>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">Studio / enterprise</div>
          <div className="mt-1 text-sm text-white/60">
            Need team seats, higher volume, or custom workflow? We’ll set you up.
          </div>
        </div>
        <Badge>Custom</Badge>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Link href="/contact" className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto text-center">
          Contact sales
        </Link>
        <Link href="/pricing" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto text-center">
          See Studio details
        </Link>
        <div className="sm:ml-auto text-[12px] text-white/55">Response time: fast (manual for now).</div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-[12px] text-white/55">
        Later: we’ll add “request quote” + “seat management” inside the app.
      </div>
    </SoftCard>
  );
}

export default function BillingPage() {
  // UI-only state (later: fetched from backend)
  const [currentPlan, setCurrentPlan] = useState<PlanKey>("free_trial");
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"plan" | "pack" | "info">("plan");

  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);
  const [pendingPack, setPendingPack] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }

  const plans: Plan[] = useMemo(() => {
    const creatorPrice = interval === "yearly" ? "$— / yr" : "$— / mo";

    return [
      {
        key: "free_trial",
        name: "Free Trial",
        short: "Try the pipeline",
        desc: "Test Orbito and generate your first clips.",
        priceLabel: "$0",
        interval: "monthly",
        note: "Free credits are one-time per email (anti-abuse enforced later).",
      },
      {
        key: "starter",
        name: "Starter",
        short: "Simple monthly plan",
        desc: "Consistent output with predictable billing.",
        priceLabel: "$— / mo",
        interval: "monthly",
        note: "Great for steady monthly creators.",
      },
      {
        key: "creator",
        name: "Creator",
        short: "Scale credits",
        desc: "More output. Credit packs apply here.",
        priceLabel: creatorPrice,
        interval,
        recommended: true,
        highlight: true,
        note:
          interval === "yearly"
            ? "Yearly includes credits upfront (per your pricing rules)."
            : "Monthly includes recurring credits.",
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
    return [
      {
        key: "pack_small",
        name: "Small pack",
        credits: 500,
        priceLabel: "$— one-time",
        valueHint: "Good for a few extra uploads / exports.",
      },
      {
        key: "pack_standard",
        name: "Standard pack",
        credits: 1500,
        priceLabel: "$— one-time",
        popular: true,
        valueHint: "Most picked. Keeps you moving.",
      },
      {
        key: "pack_large",
        name: "Large pack",
        credits: 4000,
        priceLabel: "$— one-time",
        valueHint: "Best for heavy weeks.",
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
      setCurrentPlan(pendingPlan);
      showToast("Plan updated (UI-only).");
      return;
    }
    if (modalMode === "pack" && pendingPack) {
      showToast("Checkout will be added when Stripe is wired.");
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
            <div className="mt-1 text-3xl font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-violet-300 via-sky-300 to-teal-300 bg-clip-text text-transparent">
                Manage plan &amp; credits
              </span>
            </div>
            <div className="mt-1 text-sm text-white/60">
              Upgrade anytime, or top up credits when you run low. Stripe will be wired later.
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-white/55">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Plan changes</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Credit top-ups</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Tax at checkout</span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Link href="/app/settings" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto text-center">
              Settings
            </Link>
            <Link href="/app/upload" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto text-center">
              New upload
            </Link>
          </div>
        </div>
      </SoftCard>

      {/* Credits */}
      <CreditsCard onBuy={() => openPackModal("pack_standard")} />

      {/* Current */}
      <SoftCard className="p-6" glow>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">Current plan</div>
            <div className="mt-1 text-sm text-white/60">This will populate from the backend when billing is wired.</div>
          </div>
          <Badge tone="good">{currentPlanLabel}</Badge>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <StatPill label="Plan" value={currentPlanLabel} />
          <StatPill label="Credits" value="—" />
          <StatPill label="Status" value="—" />
        </div>

        <Divider />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            className="btn-solid-dark text-[12px] px-4 py-2 w-full sm:w-auto"
            onClick={() => openPlanModal(currentPlan)}
          >
            Manage subscription
          </button>
          <div className="text-[12px] text-white/55">Stripe + tax wiring is on the backend checklist.</div>
        </div>
      </SoftCard>

      {/* Plan switching */}
      <SoftCard className="p-6" glow>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white/90">Change plan</div>
            <div className="mt-1 text-sm text-white/60">
              Upgrade anytime. Downgrades can be scheduled to end of period (when wired).
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SegToggle value={interval} onChange={setInterval} />
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
          Tax is calculated at checkout. Plan changes are handled by Stripe once wired.
        </div>
      </SoftCard>

      {/* Credit packs */}
      <SoftCard className="p-6" glow>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">Buy more credits</div>
            <div className="mt-1 text-sm text-white/60">Top up instantly. Credits stack on your balance.</div>
          </div>
          <Badge>One-time purchase</Badge>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {creditPacks.map((p) => (
            <PackCard key={p.key} pack={p} onBuy={openPackModal} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-white/55">
          <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1">Credits add after payment</span>
          <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1">No plan change required</span>
          <span className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1">Receipts via email</span>
        </div>
      </SoftCard>

      {/* Billing history placeholder */}
      <BillingHistoryCard />

      {/* Studio CTA */}
      <StudioCtaCard />

      {/* Modal */}
      <Modal
        open={modalOpen}
        title={
          modalMode === "plan"
            ? "Confirm plan change"
            : modalMode === "pack"
            ? "Confirm credit purchase"
            : "You’re already on this plan"
        }
        desc={
          modalMode === "plan"
            ? "This will go to Stripe Checkout once billing is wired. For now, it updates the UI only."
            : modalMode === "pack"
            ? "This will go to Stripe Checkout once credit packs are wired. For now, it’s UI only."
            : "Nothing to change right now. When billing is wired, this button will open Stripe’s subscription portal."
        }
        confirmLabel={modalMode === "info" ? "Okay" : "Confirm"}
        tone={modalMode === "plan" && pendingIsDowngrade ? "warn" : "neutral"}
        extra={
          modalMode === "plan" && pendingPlan ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-[12px] text-white/60">
              <div className="font-semibold text-white/80">What happens next</div>
              <div className="mt-2 grid gap-2">
                <div>• Upgrades: immediate.</div>
                <div>
                  • Downgrades: <span className="text-white/75">scheduled to end of period</span> (once wired).
                </div>
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
