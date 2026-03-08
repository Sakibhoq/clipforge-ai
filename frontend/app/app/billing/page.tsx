// frontend/app/app/billing/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type BillingInterval = "monthly" | "yearly";
type PlanFamily = "orbito" | "labs" | "enterprise";
type PlanKey = "free_trial" | "starter" | "creator" | "labs_spark" | "labs_velocity" | "studio";
type CheckoutPlan = "free" | "starter" | "creator" | "labs_spark" | "labs_velocity";

type MeResponse = {
  name?: string | null;
  email: string;
  plan: string;
  credits: number;
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

type PlanDef = {
  key: PlanKey;
  family: PlanFamily;
  name: string;
  summary: string;
  monthlyPrice: number | null;
  yearlyMonthlyPrice?: number;
  yearlyTotal?: number;
  supportsYearly?: boolean;
  monthlyCredits?: number;
  yearlyCredits?: number;
  badge: string;
};

const PLAN_DEFS: PlanDef[] = [
  {
    key: "free_trial",
    family: "orbito",
    name: "Free Trial",
    summary: "Test Orbito + Labs from one account.",
    monthlyPrice: 0,
    monthlyCredits: 65,
    badge: "Shared",
  },
  {
    key: "starter",
    family: "orbito",
    name: "Orbito Starter",
    summary: "Simple clipping workflow and steady posting.",
    monthlyPrice: 15,
    monthlyCredits: 150,
    badge: "Orbito",
  },
  {
    key: "creator",
    family: "orbito",
    name: "Orbito Creator",
    summary: "Higher output and stronger publishing throughput.",
    monthlyPrice: 30,
    yearlyMonthlyPrice: 22.5,
    yearlyTotal: 270,
    supportsYearly: true,
    monthlyCredits: 300,
    yearlyCredits: 3600,
    badge: "Orbito",
  },
  {
    key: "labs_spark",
    family: "labs",
    name: "Labs Spark",
    summary: "Generator + AI clips with full Orbito Creator-level access.",
    monthlyPrice: 39,
    monthlyCredits: 390,
    badge: "Labs",
  },
  {
    key: "labs_velocity",
    family: "labs",
    name: "Labs Velocity",
    summary: "Higher AI generation throughput with full Orbito Creator-level access.",
    monthlyPrice: 99,
    monthlyCredits: 990,
    badge: "Labs",
  },
  {
    key: "studio",
    family: "enterprise",
    name: "Studio / Enterprise",
    summary: "Custom workflows, onboarding, and volume support.",
    monthlyPrice: null,
    badge: "Enterprise",
  },
];

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function canonicalPlan(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function planKeyFromRaw(raw: string | null | undefined): PlanKey {
  const plan = canonicalPlan(raw);
  if (!plan) return "free_trial";

  if (plan === "labs_spark" || plan === "labs_starter") return "labs_spark";
  if (plan === "labs_velocity" || plan === "labs_creator") return "labs_velocity";
  if (plan.startsWith("labs_spark") || plan.includes("labs_spark")) return "labs_spark";
  if (plan.startsWith("labs_velocity") || plan.includes("labs_velocity")) return "labs_velocity";

  if (plan === "starter" || plan.startsWith("starter")) return "starter";
  if (plan === "creator" || plan.startsWith("creator") || plan.startsWith("pro")) return "creator";
  if (plan === "studio" || plan.startsWith("studio")) return "studio";
  if (plan === "free" || plan === "trial" || plan === "free_trial") return "free_trial";

  if (plan.includes("starter")) return "starter";
  if (plan.includes("creator")) return "creator";
  if (plan.includes("studio")) return "studio";

  return "free_trial";
}

function formatMoney(n: number) {
  const fixed = n.toFixed(2);
  return fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed;
}

function formatInt(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(n)));
}

function formatMoneyFromCents(cents: number, currency: string) {
  const value = (Number(cents || 0) / 100).toFixed(2);
  return `${String(currency || "USD").toUpperCase()} ${value}`;
}

function formatDateFromUnix(ts: number) {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  return new Date(ts * 1000).toLocaleDateString();
}

function checkoutErrorMessage(e: any): string {
  if (!e) return "Checkout is temporarily unavailable. Please try again.";
  const status = Number(e?.status || 0);
  const detail = e?.detail ?? e?.message ?? e?.error;
  const detailStr = typeof detail === "string" ? detail.trim() : "";
  const lower = detailStr.toLowerCase();
  const fetchFailed = String(e?.message || "").toLowerCase().includes("failed to fetch");

  if (!status && fetchFailed) return "Network error reaching billing. Please refresh and try again.";
  if (lower.includes("stripe not configured")) return "Checkout is not configured yet.";
  if (lower.includes("price not configured") || lower.includes("no such price")) return "Pricing is not configured yet.";
  if (status === 401) return "Your session expired. Please sign in again.";
  if (detailStr) return detailStr;
  return "Checkout is temporarily unavailable. Please try again.";
}

function supportsYearly(def: PlanDef) {
  return !!def.supportsYearly && typeof def.yearlyMonthlyPrice === "number";
}

function creditsFor(def: PlanDef, interval: BillingInterval) {
  if (interval === "yearly" && supportsYearly(def)) {
    return def.yearlyCredits ?? (typeof def.monthlyCredits === "number" ? def.monthlyCredits * 12 : null);
  }
  return typeof def.monthlyCredits === "number" ? def.monthlyCredits : null;
}

function intervalLabelFor(def: PlanDef, interval: BillingInterval) {
  if (def.monthlyPrice === null) return "Custom";
  if (interval === "yearly" && supportsYearly(def)) {
    if (typeof def.yearlyTotal === "number") return `Billed yearly ($${formatMoney(def.yearlyTotal)})`;
    return "Billed yearly";
  }
  return "Billed monthly";
}

function FamilyBadge({ family, label }: { family: PlanFamily; label: string }) {
  const cls =
    family === "orbito"
      ? "border-cyan-300/30 bg-cyan-300/[0.12] text-cyan-100"
      : family === "labs"
      ? "border-amber-300/35 bg-amber-300/[0.14] text-amber-100"
      : "border-white/16 bg-white/[0.08] text-white/82";
  return <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-[11px]", cls)}>{label}</span>;
}

function IntervalToggle({ interval, setInterval }: { interval: BillingInterval; setInterval: (v: BillingInterval) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
      <button
        type="button"
        onClick={() => setInterval("monthly")}
        className={cx(
          "inline-flex items-center rounded-full px-4 py-2 text-sm transition",
          interval === "monthly" ? "bg-white text-black" : "text-white/70 hover:text-white"
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => setInterval("yearly")}
        className={cx(
          "inline-flex items-center rounded-full px-4 py-2 text-sm transition",
          interval === "yearly" ? "bg-white text-black" : "text-white/70 hover:text-white"
        )}
      >
        Yearly
        <span className="ml-2 rounded-full border border-emerald-300/65 bg-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-black">
          -25%
        </span>
      </button>
    </div>
  );
}

function PlanCard({
  def,
  interval,
  active,
  busy,
  emphasize,
  onChoose,
}: {
  def: PlanDef;
  interval: BillingInterval;
  active: boolean;
  busy: boolean;
  emphasize?: boolean;
  onChoose: (key: PlanKey) => void;
}) {
  const yearly = interval === "yearly" && supportsYearly(def);
  const shownPrice =
    def.monthlyPrice === null
      ? null
      : yearly && typeof def.yearlyMonthlyPrice === "number"
      ? def.yearlyMonthlyPrice
      : def.monthlyPrice;

  const strike = yearly && typeof def.monthlyPrice === "number" ? `$${formatMoney(def.monthlyPrice)} / mo` : null;
  const credits = creditsFor(def, interval);

  const cardTone =
    def.family === "labs"
      ? "border-amber-300/24 bg-[linear-gradient(145deg,rgba(26,18,8,0.94),rgba(21,15,10,0.92),rgba(12,16,30,0.90))]"
      : def.family === "orbito"
      ? "border-cyan-300/20 bg-[linear-gradient(145deg,rgba(16,24,40,0.96),rgba(13,21,35,0.92),rgba(10,22,28,0.90))]"
      : "border-white/16 bg-[linear-gradient(145deg,rgba(26,26,30,0.94),rgba(20,21,27,0.92),rgba(14,16,22,0.90))]";

  const glow =
    def.family === "labs"
      ? "radial-gradient(300px_170px_at_18%_20%,rgba(255,183,3,0.18),transparent_72%), radial-gradient(340px_200px_at_86%_30%,rgba(251,86,7,0.16),transparent_74%), radial-gradient(340px_200px_at_55%_95%,rgba(58,134,255,0.14),transparent_74%)"
      : def.family === "orbito"
      ? "radial-gradient(300px_170px_at_18%_20%,rgba(155,140,255,0.18),transparent_72%), radial-gradient(340px_200px_at_86%_30%,rgba(70,215,255,0.16),transparent_74%), radial-gradient(340px_200px_at_55%_95%,rgba(53,242,166,0.14),transparent_74%)"
      : "radial-gradient(300px_170px_at_18%_20%,rgba(255,255,255,0.10),transparent_72%), radial-gradient(340px_200px_at_86%_30%,rgba(255,255,255,0.08),transparent_74%)";

  return (
    <div className={cx("surface-soft relative overflow-hidden rounded-3xl p-5 sm:p-6", cardTone, emphasize && "ring-1 ring-amber-300/45")}> 
      <div aria-hidden="true" className="pointer-events-none absolute -inset-10 opacity-60 blur-2xl" style={{ background: glow }} />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <FamilyBadge family={def.family} label={def.badge} />
            <div className="mt-3 text-xl font-semibold text-white/94">{def.name}</div>
          </div>
          {active ? <span className="rounded-full border border-emerald-300/40 bg-emerald-300/15 px-2.5 py-1 text-[11px] text-emerald-100">Current</span> : null}
        </div>

        <p className="mt-3 text-sm text-white/66">{def.summary}</p>

        {def.monthlyPrice === null ? (
          <div className="mt-5 text-4xl font-semibold tracking-tight text-white/90">Custom</div>
        ) : (
          <div className="mt-5">
            <div className={cx("text-sm min-h-[20px]", strike ? "text-white/45 line-through" : "invisible")}>{strike || "$0"}</div>
            <div className="mt-1 flex items-end gap-2">
              <div className={cx("text-4xl font-semibold tracking-tight sm:text-5xl", def.family === "labs" ? "text-amber-100" : "text-cyan-100")}>
                ${formatMoney(shownPrice || 0)}
              </div>
              <div className="pb-2 text-sm text-white/55">/mo</div>
            </div>
          </div>
        )}

        <div className="mt-2 text-xs text-white/52">{intervalLabelFor(def, interval)}</div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/70">
          {credits !== null ? `${formatInt(credits)} credits ${yearly ? "per year" : "per month"}` : "Managed credits and custom limits"}
        </div>

        <div className="mt-5" />
        {def.key === "studio" ? (
          <Link href="/contact" className="btn-ghost mt-auto inline-flex h-11 w-full items-center justify-center text-sm font-semibold">
            Contact support
          </Link>
        ) : (
          <button
            type="button"
            disabled={busy || active}
            onClick={() => onChoose(def.key)}
            className={cx(
              def.family === "labs" ? "btn-clipforge" : "btn-orbito-cta",
              "mt-auto inline-flex h-11 w-full items-center justify-center whitespace-nowrap px-3 text-sm font-semibold leading-none",
              (busy || active) && "cursor-not-allowed opacity-70"
            )}
          >
            {active ? "Current plan" : busy ? "Opening checkout..." : `Choose ${def.name}`}
          </button>
        )}
      </div>
    </div>
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
    <div className="surface-soft p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">Billing history</div>
          <div className="mt-1 text-sm text-white/60">Invoices appear after your first successful payment.</div>
        </div>
        <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs text-white/70">History</span>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02]">
        {loading ? (
          <div className="px-4 py-4 text-sm text-white/60">Loading invoices...</div>
        ) : error ? (
          <div className="px-4 py-4 text-sm text-rose-200/85">{error}</div>
        ) : invoices.length === 0 ? (
          <div className="px-4 py-4 text-sm text-white/60">No invoices yet.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {invoices.map((inv) => {
              const invoiceUrl = inv.hosted_invoice_url || inv.invoice_pdf || null;
              return (
                <div key={inv.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white/85">{inv.number || inv.id}</div>
                    <div className="mt-1 text-[12px] text-white/55">
                      {formatDateFromUnix(inv.created)} • {String(inv.status || "unknown")}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-sm text-white/75">{formatMoneyFromCents(inv.amount_paid || inv.amount_due, inv.currency)}</div>
                    {invoiceUrl ? (
                      <a href={invoiceUrl} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-[12px]">
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
    </div>
  );
}

export default function BillingPage() {
  const labsSectionRef = useRef<HTMLDivElement | null>(null);

  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [currentPlan, setCurrentPlan] = useState<PlanKey>("free_trial");
  const [credits, setCredits] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [startingCheckout, setStartingCheckout] = useState<CheckoutPlan | null>(null);
  const [history, setHistory] = useState<BillingHistoryInvoice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [labsIntent] = useState(() => {
    if (typeof window === "undefined") return false;
    const raw = String(new URLSearchParams(window.location.search).get("intent") || "").trim().toLowerCase();
    return raw === "labs";
  });

  useEffect(() => {
    let cancelled = false;

    apiFetch<MeResponse>("/auth/me", { method: "GET" })
      .then((me) => {
        if (cancelled) return;
        setCurrentPlan(planKeyFromRaw(me?.plan));
        setCredits(typeof me?.credits === "number" ? me.credits : 0);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentPlan("free_trial");
        setCredits(null);
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
    };
  }, []);

  useEffect(() => {
    if (!labsIntent) return;
    const id = window.setTimeout(() => {
      labsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [labsIntent]);

  async function startCheckout(plan: CheckoutPlan, chosenInterval: BillingInterval) {
    if (startingCheckout) return;
    setActionError(null);
    setStartingCheckout(plan);
    try {
      const data = (await apiFetch("/billing/checkout-session", {
        method: "POST",
        body: { plan, interval: chosenInterval },
      })) as any;

      const url = String(data?.url || "").trim();
      if (!url) throw new Error("Checkout URL missing");
      window.location.href = url;
    } catch (e) {
      setActionError(checkoutErrorMessage(e));
    } finally {
      setStartingCheckout(null);
    }
  }

  function choosePlan(key: PlanKey) {
    if (key === "free_trial") {
      startCheckout("free", "monthly");
      return;
    }
    if (key === "starter") {
      startCheckout("starter", "monthly");
      return;
    }
    if (key === "creator") {
      startCheckout("creator", interval === "yearly" ? "yearly" : "monthly");
      return;
    }
    if (key === "labs_spark") {
      startCheckout("labs_spark", "monthly");
      return;
    }
    if (key === "labs_velocity") {
      startCheckout("labs_velocity", interval === "yearly" ? "yearly" : "monthly");
    }
  }

  const currentPlanLabel = useMemo(() => PLAN_DEFS.find((p) => p.key === currentPlan)?.name ?? "Free Trial", [currentPlan]);
  const currentPlanCredits = useMemo(() => {
    const def = PLAN_DEFS.find((p) => p.key === currentPlan);
    if (!def) return null;
    return creditsFor(def, interval);
  }, [currentPlan, interval]);

  const orbitoPlans = useMemo(() => PLAN_DEFS.filter((p) => p.family === "orbito"), []);
  const labsPlans = useMemo(() => PLAN_DEFS.filter((p) => p.family === "labs"), []);
  const enterprisePlans = useMemo(() => PLAN_DEFS.filter((p) => p.family === "enterprise"), []);

  return (
    <div className="grid min-h-[100svh] gap-6 pb-[max(16px,env(safe-area-inset-bottom))]">
      <section className="surface-soft p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs text-white/55">• Billing</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/92 sm:text-4xl">
              <span className="grad-text">Orbito</span>
              <span className="mx-2 text-white/62">+</span>
              <span className="bg-[linear-gradient(90deg,#ffb703_0%,#fb5607_46%,#3a86ff_100%)] bg-clip-text text-transparent">Labs</span>
              <span className="text-white/92"> plans</span>
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-white/62 sm:text-base">
              One account, clear plan families, and checkout paths for both Orbito and Orbito Labs.
            </p>
          </div>
          <IntervalToggle interval={interval} setInterval={setInterval} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[12px] text-white/55">Current plan</div>
            <div className="mt-1 text-lg font-semibold text-white/90">{currentPlanLabel}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[12px] text-white/55">Current credits</div>
            <div className="mt-1 text-lg font-semibold text-white/90">{credits === null ? "—" : formatInt(credits)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[12px] text-white/55">Plan cycle view</div>
            <div className="mt-1 text-lg font-semibold text-white/90">{interval === "yearly" ? "Yearly" : "Monthly"}</div>
          </div>
        </div>

        <div className="mt-4 text-xs text-white/52">
          {currentPlanCredits !== null
            ? `${formatInt(currentPlanCredits)} credits shown for your selected ${interval} view.`
            : "Managed credits are customized for enterprise plans."}
        </div>

        {actionError ? (
          <div className="mt-4 rounded-2xl border border-rose-300/35 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{actionError}</div>
        ) : null}
      </section>

      <BillingHistoryCard invoices={history} loading={historyLoading} error={historyError} />

      <section className="surface-soft p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">Orbito plans</div>
            <div className="mt-1 text-sm text-white/60">Clipping, editing, and publishing workflows.</div>
          </div>
          <span className="rounded-full border border-cyan-300/28 bg-cyan-300/[0.12] px-3 py-1 text-xs text-cyan-100">Orbito</span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {orbitoPlans.map((def) => (
            <PlanCard
              key={def.key}
              def={def}
              interval={interval}
              active={currentPlan === def.key}
              busy={startingCheckout !== null}
              onChoose={choosePlan}
            />
          ))}
        </div>
      </section>

      <section ref={labsSectionRef} className={cx("surface-soft p-6", labsIntent && "ring-1 ring-amber-300/45")}> 
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">Orbito Labs plans</div>
            <div className="mt-1 text-sm text-white/60">AI generation plans that stay connected to Orbito.</div>
          </div>
          <span className="rounded-full border border-amber-300/35 bg-amber-300/[0.14] px-3 py-1 text-xs text-amber-100">Labs</span>
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/62">
          All Labs plans include full Orbito Creator-level access. Labs plans are monthly right now.
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {labsPlans.map((def) => (
            <PlanCard
              key={def.key}
              def={def}
              interval={interval}
              active={currentPlan === def.key}
              busy={startingCheckout !== null}
              emphasize={labsIntent}
              onChoose={choosePlan}
            />
          ))}
        </div>
      </section>

      <section className="surface-soft p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">Enterprise</div>
            <div className="mt-1 text-sm text-white/60">Managed setup for teams and high-volume ops.</div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-1">
          {enterprisePlans.map((def) => (
            <PlanCard
              key={def.key}
              def={def}
              interval={interval}
              active={currentPlan === def.key}
              busy={false}
              onChoose={choosePlan}
            />
          ))}
        </div>
      </section>

      <section className="surface-soft p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">Need help choosing?</div>
            <div className="mt-1 text-sm text-white/60">Tell us your output goals and we will map the right Orbito + Labs setup.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/contact" className="btn-ghost px-4 py-2 text-xs">Contact support</Link>
            <Link href="/pricing" className="btn-ghost px-4 py-2 text-xs">View pricing page</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
