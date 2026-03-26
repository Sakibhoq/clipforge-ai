"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { apiFetch } from "@/lib/api";
import { SocialBrandRow } from "@/components/SocialBrand";

export const dynamic = "force-dynamic";

type BillingMode = "monthly" | "yearly";
type CheckoutPlan = "free" | "starter" | "creator" | "labs_spark" | "labs_velocity";
type BenefitsKey =
  | "trial"
  | "orbitoStarter"
  | "orbitoCreator"
  | "labsSpark"
  | "labsVelocity";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatMoney(n: number) {
  const fixed = n.toFixed(2);
  return fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed;
}

function formatInt(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(n)));
}

type MeResponse = {
  name?: string | null;
  email: string;
  plan: string;
  credits: number;
  trial_used: boolean;
};

function GlowLayer({ family }: { family: "orbito" | "labs" | "full" }) {
  const background =
    family === "orbito"
      ? "radial-gradient(520px 280px at 18% 14%, rgba(155,140,255,0.24), transparent 68%), radial-gradient(560px 320px at 85% 36%, rgba(70,215,255,0.22), transparent 70%), radial-gradient(520px 320px at 52% 96%, rgba(53,242,166,0.16), transparent 72%)"
      : family === "labs"
      ? "radial-gradient(520px 280px at 18% 14%, rgba(255,183,3,0.24), transparent 68%), radial-gradient(560px 320px at 85% 36%, rgba(251,86,7,0.20), transparent 70%), radial-gradient(520px 320px at 52% 96%, rgba(58,134,255,0.16), transparent 72%)"
      : "radial-gradient(520px 280px at 18% 14%, rgba(255,183,3,0.20), transparent 68%), radial-gradient(560px 320px at 85% 36%, rgba(136,120,255,0.20), transparent 70%), radial-gradient(520px 320px at 52% 96%, rgba(70,215,255,0.16), transparent 72%)";
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -inset-12 opacity-75"
      style={{ background }}
    />
  );
}

function PriceRow({
  amount,
  suffix,
  strike,
  glowTone,
}: {
  amount: string;
  suffix: string;
  strike?: string;
  glowTone?: "orbito" | "labs";
}) {
  return (
    <div className="mt-4">
      <div
        className={cn(
          "text-sm line-through decoration-white/35 min-h-[20px]",
          strike ? "text-white/45" : "invisible"
        )}
      >
        {strike || "$0"}
      </div>
      <div className="mt-1 flex items-end gap-2">
        <div
          className={cn(
            "text-4xl font-semibold tracking-tight sm:text-5xl",
            glowTone ? "price-amount-animated" : "",
            glowTone === "orbito" ? "price-amount-orbito" : "",
            glowTone === "labs" ? "price-amount-labs" : ""
          )}
        >
          {amount}
        </div>
        {suffix ? <div className="pb-2 text-sm text-white/55">{suffix}</div> : null}
      </div>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2 text-sm text-white/74">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <span className="mt-[0.42rem] h-1.5 w-1.5 rounded-full bg-white/50" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function BenefitsDisclosure({
  open,
  onToggle,
  items,
}: {
  open: boolean;
  onToggle: () => void;
  items: string[];
}) {
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-2.5 text-xs text-white/78 transition hover:bg-white/[0.06]"
      >
        <span>See benefits</span>
        <span className="text-white/55">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <ul className="mt-3 list-disc space-y-2 rounded-2xl border border-white/10 bg-black/25 p-4 pl-8 text-xs text-white/70 marker:text-white/45">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: BillingMode;
  setMode: (m: BillingMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
      <button
        type="button"
        onClick={() => setMode("monthly")}
        className={cn(
          "inline-flex items-center rounded-full px-4 py-2 text-sm transition",
          mode === "monthly" ? "bg-white text-black" : "text-white/70 hover:text-white"
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => setMode("yearly")}
        className={cn(
          "inline-flex items-center rounded-full px-4 py-2 text-sm transition",
          mode === "yearly" ? "bg-white text-black" : "text-white/70 hover:text-white"
        )}
      >
        Yearly
        <span
          className={cn(
            "ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
            mode === "yearly"
              ? "yearly-discount-badge border-emerald-300/70 bg-emerald-200 !text-black"
              : "border-emerald-300/60 bg-emerald-200/90 !text-black"
          )}
        >
          -25%
        </span>
      </button>
    </div>
  );
}

function FamilyPill({
  label,
  tone,
}: {
  label: string;
  tone: "orbito" | "labs" | "full" | "neutral";
}) {
  const cls =
    tone === "orbito"
      ? "border-cyan-300/30 bg-cyan-300/[0.12] text-cyan-100"
      : tone === "labs"
      ? "border-amber-300/30 bg-amber-300/[0.14] text-amber-100"
      : tone === "full"
      ? "border-indigo-300/30 bg-indigo-300/[0.14] text-indigo-100"
      : "border-white/15 bg-white/[0.07] text-white/80";
  return <div className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px]", cls)}>{label}</div>;
}

function CompareRow({
  label,
  trial,
  orbitoStarter,
  orbitoCreator,
  labsSpark,
  labsVelocity,
}: {
  label: string;
  trial: string;
  orbitoStarter: string;
  orbitoCreator: string;
  labsSpark: string;
  labsVelocity: string;
}) {
  return (
    <div className="grid grid-cols-6 gap-3 py-3 text-sm">
      <div className="text-white/78">{label}</div>
      <div className="text-white/62">{trial}</div>
      <div className="text-white/62">{orbitoStarter}</div>
      <div className="text-white/62">{orbitoCreator}</div>
      <div className="text-white/62">{labsSpark}</div>
      <div className="text-white/62">{labsVelocity}</div>
    </div>
  );
}

function PricingMotionStyles() {
  return (
    <style>{`
      @keyframes priceGradientShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes priceGlowPulseOrbito {
        0%, 100% { filter: drop-shadow(0 0 8px rgba(70,215,255,0.30)); }
        50% { filter: drop-shadow(0 0 16px rgba(53,242,166,0.38)); }
      }
      @keyframes priceGlowPulseLabs {
        0%, 100% { filter: drop-shadow(0 0 8px rgba(255,183,3,0.30)); }
        50% { filter: drop-shadow(0 0 16px rgba(251,86,7,0.40)); }
      }
      @keyframes yearlyBadgePulse {
        0%, 100% { box-shadow: 0 0 0 rgba(52, 211, 153, 0); }
        50% { box-shadow: 0 0 12px rgba(52, 211, 153, 0.45); }
      }
      .price-amount-animated {
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        background-size: 220% 220%;
        animation: priceGradientShift 5.5s linear infinite;
      }
      .price-amount-orbito {
        background-image: linear-gradient(
          92deg,
          rgba(155,140,255,1),
          rgba(70,215,255,1),
          rgba(53,242,166,1),
          rgba(155,140,255,1)
        );
        animation: priceGradientShift 5.5s linear infinite, priceGlowPulseOrbito 3.2s ease-in-out infinite;
      }
      .price-amount-labs {
        background-image: linear-gradient(
          92deg,
          rgba(255,183,3,1),
          rgba(251,86,7,1),
          rgba(58,134,255,1),
          rgba(255,183,3,1)
        );
        animation: priceGradientShift 5.5s linear infinite, priceGlowPulseLabs 3.2s ease-in-out infinite;
      }
      .yearly-discount-badge {
        animation: yearlyBadgePulse 2.4s ease-in-out infinite;
        color: #000000;
      }
    `}</style>
  );
}

function PlanCard({
  family,
  pillTone,
  eyebrow,
  title,
  subtitle,
  badge,
  amount,
  suffix,
  strike,
  glowTone,
  billingLabel,
  throughput,
  throughputLabel,
  metrics,
  highlights,
  ctaClassName,
  ctaLabel,
  ctaLoadingLabel,
  ctaDisabled,
  ctaLoading,
  onChoose,
  benefitsOpen,
  onToggleBenefits,
  benefitsItems,
}: {
  family: "orbito" | "labs";
  pillTone: "orbito" | "labs";
  eyebrow: string;
  title: string;
  subtitle: string;
  badge?: string;
  amount: string;
  suffix: string;
  strike?: string;
  glowTone?: "orbito" | "labs";
  billingLabel: string;
  throughput: string;
  throughputLabel: string;
  metrics: Array<{ label: string; value: string }>;
  highlights: string[];
  ctaClassName: string;
  ctaLabel: string;
  ctaLoadingLabel: string;
  ctaDisabled: boolean;
  ctaLoading: boolean;
  onChoose: () => void;
  benefitsOpen: boolean;
  onToggleBenefits: () => void;
  benefitsItems: string[];
}) {
  const toneBorder = family === "orbito" ? "border-cyan-300/24" : "border-amber-300/24";

  return (
    <div
      className={cn(
        "group motion-card relative self-start overflow-hidden rounded-[32px] border bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.36)]",
        toneBorder
      )}
    >
      <GlowLayer family={family} />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <FamilyPill label={eyebrow} tone={pillTone} />
            <div className="mt-3 text-[26px] font-semibold tracking-tight text-white/94 sm:text-[30px]">{title}</div>
            <div className="mt-2 max-w-md text-sm leading-relaxed text-white/62">{subtitle}</div>
          </div>
          {badge ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                family === "orbito"
                  ? "border-sky-300/20 bg-sky-300/[0.12] text-sky-100"
                  : "border-amber-300/20 bg-amber-300/[0.12] text-amber-100"
              )}
            >
              {badge}
            </span>
          ) : null}
        </div>

        <PriceRow amount={amount} suffix={suffix} strike={strike} glowTone={glowTone} />
        <div className="mt-2 text-xs text-white/50">{billingLabel}</div>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-black/24 p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/44">
            <span>Throughput</span>
            <span>{throughputLabel}</span>
          </div>
          <div className="mt-3 live-bar">
            <span style={{ width: throughput }} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {metrics.map((item) => (
              <div key={item.label} className="metric-chip">
                <div className="value">{item.value}</div>
                <div className="label">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {highlights.map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/74">
              {item}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onChoose}
          disabled={ctaDisabled}
          className={cn(
            `${ctaClassName} mt-5 inline-flex h-11 w-full items-center justify-center whitespace-nowrap px-3 text-center text-sm font-semibold leading-none`,
            ctaDisabled ? "cursor-not-allowed opacity-80" : ""
          )}
        >
          {ctaLoading ? ctaLoadingLabel : ctaLabel}
        </button>

        <BenefitsDisclosure open={benefitsOpen} onToggle={onToggleBenefits} items={benefitsItems} />
      </div>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const pathname = usePathname();
  const [trialNotice, setTrialNotice] = useState<string | null>(null);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState<boolean>(false);
  const [mode, setMode] = useState<BillingMode>("yearly");
  const [creditScale, setCreditScale] = useState(1);
  const [startingCheckout, setStartingCheckout] = useState<null | CheckoutPlan>(null);
  const [openBenefits, setOpenBenefits] = useState<Record<BenefitsKey, boolean>>({
    trial: false,
    orbitoStarter: false,
    orbitoCreator: false,
    labsSpark: false,
    labsVelocity: false,
  });

  const trialLockNotice =
    trialNotice === "locked"
      ? "Your free trial has already been used. Please choose a paid plan."
      : trialNotice === "error"
        ? "Trial checkout is currently unavailable. Please try again later."
        : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTrialNotice(new URLSearchParams(window.location.search).get("trial"));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      setMeLoading(true);
      try {
        const meData = await apiFetch<MeResponse>("/auth/me", { method: "GET" });
        if (!cancelled) setMe(meData);
      } catch {
        if (!cancelled) setMe(null);
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  async function requireAuthOrRedirect(): Promise<boolean> {
    try {
      await apiFetch("/auth/me", { method: "GET" });
      return true;
    } catch {
      const next = encodeURIComponent(pathname || "/pricing");
      router.push(`/register?next=${next}`);
      return false;
    }
  }

  function checkoutErrorMessage(e: any): string {
    if (!e) return "Checkout is temporarily unavailable. Please try again.";
    const status = Number(e?.status || 0);
    const detail = e?.detail ?? e?.message ?? e?.error;
    const detailStr = typeof detail === "string" ? detail.trim() : "";
    const lower = detailStr.toLowerCase();
    if (!status && String(e?.message || "").toLowerCase().includes("failed to fetch")) {
      return "Network error reaching billing. Please refresh and try again.";
    }
    if (lower.includes("stripe not configured")) return "Checkout is not configured yet.";
    if (lower.includes("price not configured") || lower.includes("no such price")) return "Pricing is not configured yet.";
    if (status === 401) return "Your session expired. Please sign in again.";
    if (detailStr) return detailStr;
    return "Checkout is temporarily unavailable. Please try again.";
  }

  async function startCheckout(plan: CheckoutPlan) {
    const ok = await requireAuthOrRedirect();
    if (!ok) return;
    if (plan === "free" && me?.trial_used) {
      alert("Your free trial has already been used. Please choose a paid plan.");
      return;
    }
    try {
      setStartingCheckout(plan);
      const interval = plan === "creator" || plan === "labs_velocity" ? mode : "monthly";
      const data = (await apiFetch("/billing/checkout-session", {
        method: "POST",
        body: { plan, interval },
      })) as any;
      const url = String(data?.url || "").trim();
      if (!url) throw new Error("No checkout URL returned.");
      window.location.href = url;
    } catch (e: any) {
      alert(checkoutErrorMessage(e));
    } finally {
      setStartingCheckout(null);
    }
  }

  const sharedTrialCredits = 65;

  const orbitoStarterMonthlyPrice = 15;
  const orbitoStarterCredits = 150;

  const orbitoCreatorMonthlyBasePrice = 30;
  const orbitoCreatorMonthlyScaledPrice = orbitoCreatorMonthlyBasePrice * creditScale;
  const orbitoCreatorYearlyScaledMonthly = orbitoCreatorMonthlyScaledPrice * 0.75;
  const orbitoCreatorYearlyTotal = Math.round(orbitoCreatorYearlyScaledMonthly * 12);
  const orbitoCreatorCredits =
    (mode === "yearly" ? 3600 : 300) * creditScale;

  const labsStarterMonthlyPrice = 39;
  const labsStarterCredits = 390;

  const labsCreatorMonthlyBasePrice = 99;
  const labsCreatorMonthlyScaledPrice = labsCreatorMonthlyBasePrice * creditScale;
  const labsCreatorYearlyScaledMonthly = labsCreatorMonthlyScaledPrice * 0.75;
  const labsCreatorYearlyTotal = Math.round(labsCreatorYearlyScaledMonthly * 12);
  const labsCreatorCredits =
    (mode === "yearly" ? 11880 : 990) * creditScale;

  const toggleBenefits = (key: BenefitsKey) =>
    setOpenBenefits((prev) => ({ ...prev, [key]: !prev[key] }));

  const freeTrialLocked = !meLoading && Boolean(me?.trial_used);

  const benefits = useMemo(
    () => ({
      trial: [
        "Test clip mode and generate mode from one account",
        "No commitment required",
        "Understand your workflow before upgrade",
      ],
      orbitoStarter: [
        "Best for solo clipping and weekly posting",
        "Predictable monthly spend",
        "Clean path to Orbito Creator",
        "Cancel anytime",
      ],
      orbitoCreator: [
        "Scaled clipping pipeline for daily output",
        "Faster turnaround and advanced publishing",
        "Yearly saves on effective monthly price",
        "Cancel anytime",
      ],
      labsSpark: [
        "Prompt-to-media generation with Generate credits",
        "Includes full Orbito Creator-level access",
        "Good entry point for AI content testing",
        "Cancel anytime",
      ],
      labsVelocity: [
        "Higher generation throughput and quality lanes",
        "Designed for routine AI post production",
        "Can be scaled with the credit slider",
        "Cancel anytime",
      ],
    }),
    []
  );

  const footerLinks = useMemo(
    () => [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy-policy" },
      { label: "Terms", href: "/terms-of-service" },
    ],
    []
  );

  return (
    <div className="relative theme-merged">
      <PricingMotionStyles />
      <section className="relative mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6">
        {trialLockNotice ? (
          <div className="mb-6 rounded-xl border border-amber-300/35 bg-amber-300/12 px-4 py-3 text-sm text-amber-100">
            {trialLockNotice}
          </div>
        ) : null}

        <div className="grid gap-10 lg:grid-cols-[0.84fr_1.16fr] lg:items-start">
          <div>
            <FamilyPill label="One Platform" tone="full" />
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white/95 sm:text-5xl md:text-6xl">
              Pricing that matches how you create.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/66 sm:text-base">
              Clip mode is for footage-first workflows. Generate mode is for AI-first workflows. Both stay inside Orbito.
            </p>
            <div className="mt-4">
              <SocialBrandRow platforms={["youtube", "tiktok", "reels", "shorts"]} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {["Start free", "Scale later", "One account"].map((item) => (
                <div key={item} className="signal-chip">
                  <span className="live-dot" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="metric-chip">
                <div className="value">{formatInt(sharedTrialCredits)}</div>
                <div className="label">Trial Credits</div>
              </div>
              <div className="metric-chip">
                <div className="value">25%</div>
                <div className="label">Yearly Savings</div>
              </div>
              <div className="metric-chip">
                <div className="value">{creditScale}x</div>
                <div className="label">Creator Scale</div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-medium text-white/88">Billing view</div>
                <div className="text-xs text-white/56">Switch monthly or yearly, then tune creator throughput.</div>
              </div>
              <ModeToggle mode={mode} setMode={setMode} />
            </div>

            <div className="mt-4 rounded-[24px] border border-white/10 bg-black/24 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-medium text-white/88">Throughput scale</div>
                  <div className="text-xs text-white/56">Applies to Orbito Creator and Generate Creator.</div>
                </div>
                <div className="signal-chip">Scale {creditScale}x</div>
              </div>

              <div className="mt-3">
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={creditScale}
                  onChange={(e) => setCreditScale(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                  className="w-full accent-white"
                  aria-label="Credit scaling multiplier"
                />
              </div>
            </div>
          </div>
        </div>

        <section className="pt-10">
          <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <FamilyPill label="Free Trial" tone="neutral" />
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="text-2xl font-semibold text-white/92 sm:text-3xl">Try both modes first.</div>
                  <div className="signal-chip">{formatInt(sharedTrialCredits)} shared credits</div>
                </div>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/66 sm:text-base">
                  Make sure clipping, generation, and publishing fit your workflow before you upgrade.
                </p>
              </div>

              <div className="min-w-[280px] rounded-[24px] border border-white/14 bg-black/28 p-4">
                <div className="text-sm font-semibold text-white/88">Best for first-time evaluation</div>
                <div className="mt-2 text-xs leading-relaxed text-white/62">Start free, test both modes, then move into the plan that fits.</div>

                <button
                  type="button"
                  onClick={() => startCheckout("free")}
                  disabled={startingCheckout !== null || freeTrialLocked || meLoading}
                  className={cn(
                    "btn-orbito-cta mt-4 inline-flex h-11 w-full items-center justify-center whitespace-nowrap px-3 text-center text-sm font-semibold leading-none",
                    startingCheckout ? "cursor-not-allowed opacity-80" : ""
                  )}
                >
                  {startingCheckout === "free"
                    ? "Opening Checkout..."
                    : freeTrialLocked
                      ? "Trial already used"
                      : "Start Free Trial"}
                </button>

                <BenefitsDisclosure open={openBenefits.trial} onToggle={() => toggleBenefits("trial")} items={benefits.trial} />
              </div>
            </div>
          </div>
        </section>

        <section className="pt-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <FamilyPill label="Clip Mode" tone="orbito" />
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
                For footage-first creators
              </h2>
              <p className="mt-2 max-w-xl text-sm text-white/64 sm:text-base">
                Start here if your main job is turning long-form video into short clips.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <PlanCard
              family="orbito"
              pillTone="orbito"
              eyebrow="Orbito Clip"
              title="Starter"
              subtitle="A clean entry point for steady weekly clipping."
              amount={`$${formatMoney(orbitoStarterMonthlyPrice)}`}
              suffix="/mo"
              billingLabel="Monthly billing"
              throughput="36%"
              throughputLabel="Steady weekly output"
              metrics={[
                { value: formatInt(orbitoStarterCredits), label: "Credits / mo" },
                { value: "Core", label: "Workflow" },
                { value: "Weekly", label: "Cadence" },
              ]}
              highlights={[
                "Long-form to short-form clipping",
                "Editing, captions, and publishing",
                "Simple spend with no scaling",
              ]}
              ctaClassName="btn-orbito-cta"
              ctaLabel="Choose Orbito Starter"
              ctaLoadingLabel="Opening Checkout..."
              ctaDisabled={startingCheckout !== null}
              ctaLoading={startingCheckout === "starter"}
              onChoose={() => startCheckout("starter")}
              benefitsOpen={openBenefits.orbitoStarter}
              onToggleBenefits={() => toggleBenefits("orbitoStarter")}
              benefitsItems={benefits.orbitoStarter}
            />

            <PlanCard
              family="orbito"
              pillTone="orbito"
              eyebrow="Orbito Clip"
              title="Creator"
              subtitle="More throughput for daily clipping and faster publishing cycles."
              badge="Recommended"
              amount={`$${formatMoney(mode === "yearly" ? orbitoCreatorYearlyScaledMonthly : orbitoCreatorMonthlyScaledPrice)}`}
              suffix="/mo"
              strike={mode === "yearly" ? `$${formatMoney(orbitoCreatorMonthlyScaledPrice)}` : undefined}
              glowTone={mode === "yearly" ? "orbito" : undefined}
              billingLabel={mode === "yearly" ? `Billed yearly ($${formatMoney(orbitoCreatorYearlyTotal)})` : "Billed monthly"}
              throughput={`${Math.min(94, 42 + creditScale * 8)}%`}
              throughputLabel={`Scale ${creditScale}x`}
              metrics={[
                { value: formatInt(orbitoCreatorCredits), label: mode === "yearly" ? "Credits / yr" : "Credits / mo" },
                { value: `${creditScale}x`, label: "Scale" },
                { value: "Daily", label: "Cadence" },
              ]}
              highlights={[
                "Priority clipping and exports",
                "Higher publish throughput",
                "Best fit for consistent output",
              ]}
              ctaClassName="btn-orbito-cta"
              ctaLabel="Choose Orbito Creator"
              ctaLoadingLabel="Opening Checkout..."
              ctaDisabled={startingCheckout !== null}
              ctaLoading={startingCheckout === "creator"}
              onChoose={() => startCheckout("creator")}
              benefitsOpen={openBenefits.orbitoCreator}
              onToggleBenefits={() => toggleBenefits("orbitoCreator")}
              benefitsItems={benefits.orbitoCreator}
            />
          </div>
        </section>

        <section className="pt-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <FamilyPill label="Generate Mode" tone="labs" />
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
                For AI-first creators
              </h2>
              <p className="mt-2 max-w-xl text-sm text-white/64 sm:text-base">
                Choose this path if prompt-to-video and AI output are central to the workflow.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <PlanCard
              family="labs"
              pillTone="labs"
              eyebrow="Orbito Generate"
              title="Starter"
              subtitle="A strong entry point for testing AI-led content production."
              amount={`$${formatMoney(labsStarterMonthlyPrice)}`}
              suffix="/mo"
              billingLabel="Monthly billing"
              throughput="44%"
              throughputLabel="Prompt-first starter"
              metrics={[
                { value: formatInt(labsStarterCredits), label: "Credits / mo" },
                { value: "Included", label: "Clip Access" },
                { value: "Starter", label: "Cadence" },
              ]}
              highlights={[
                "Prompt-to-image, video, and voice",
                "Includes Orbito Creator-level access",
                "Best for testing AI workflows",
              ]}
              ctaClassName="btn-clipforge"
              ctaLabel="Choose Generate Starter"
              ctaLoadingLabel="Opening Checkout..."
              ctaDisabled={startingCheckout !== null}
              ctaLoading={startingCheckout === "labs_spark"}
              onChoose={() => startCheckout("labs_spark")}
              benefitsOpen={openBenefits.labsSpark}
              onToggleBenefits={() => toggleBenefits("labsSpark")}
              benefitsItems={benefits.labsSpark}
            />

            <PlanCard
              family="labs"
              pillTone="labs"
              eyebrow="Orbito Generate"
              title="Creator"
              subtitle="Higher volume, faster iteration, and access to the heavier generation lanes."
              badge="Scale"
              amount={`$${formatMoney(mode === "yearly" ? labsCreatorYearlyScaledMonthly : labsCreatorMonthlyScaledPrice)}`}
              suffix="/mo"
              strike={mode === "yearly" ? `$${formatMoney(labsCreatorMonthlyScaledPrice)}` : undefined}
              glowTone={mode === "yearly" ? "labs" : undefined}
              billingLabel={mode === "yearly" ? `Billed yearly ($${formatMoney(labsCreatorYearlyTotal)})` : "Billed monthly"}
              throughput={`${Math.min(96, 48 + creditScale * 7)}%`}
              throughputLabel={`Scale ${creditScale}x`}
              metrics={[
                { value: formatInt(labsCreatorCredits), label: mode === "yearly" ? "Credits / yr" : "Credits / mo" },
                { value: "4K", label: "Top Lane" },
                { value: `${creditScale}x`, label: "Scale" },
              ]}
              highlights={[
                "Higher generation throughput",
                "Includes Orbito Creator-level access",
                "Best fit for routine AI posting",
              ]}
              ctaClassName="btn-clipforge"
              ctaLabel="Choose Generate Creator"
              ctaLoadingLabel="Opening Checkout..."
              ctaDisabled={startingCheckout !== null}
              ctaLoading={startingCheckout === "labs_velocity"}
              onChoose={() => startCheckout("labs_velocity")}
              benefitsOpen={openBenefits.labsVelocity}
              onToggleBenefits={() => toggleBenefits("labsVelocity")}
              benefitsItems={benefits.labsVelocity}
            />
          </div>
        </section>

        <section className="pt-12">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[24px] border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-4 text-sm leading-relaxed text-cyan-100/95">
              Clip plans are for clipping, editing, and publishing.
            </div>
            <div className="rounded-[24px] border border-amber-300/24 bg-amber-300/[0.09] px-4 py-4 text-sm leading-relaxed text-amber-100/95">
              Every Generate plan includes Orbito Creator-level clip access.
            </div>
            <div className="rounded-[24px] border border-indigo-300/20 bg-indigo-300/[0.10] px-4 py-4 text-sm leading-relaxed text-indigo-100/95">
              Creator plans scale with the throughput slider.
            </div>
          </div>
        </section>

        <footer className="pb-6 pt-12 text-xs text-white/45">
          <div className="mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>© 2026 • {BRAND.name} by Sakib LLC. All rights reserved.</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {footerLinks.map((item) => (
                <a key={item.href} href={item.href} className="hover:text-white/70">
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
