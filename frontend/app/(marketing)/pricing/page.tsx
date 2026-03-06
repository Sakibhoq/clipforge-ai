// frontend/app/(marketing)/pricing/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { apiFetch } from "@/lib/api";
import { SocialBrandRow } from "@/components/SocialBrand";

/* =========================================================
   Orbito — Pricing Page (Marketing)

   FIXES:
   - Sticky navbar compatibility:
     DO NOT set overflow on the page root (overflow-x-hidden breaks sticky).
   - Double-scrollbar compatibility:
     No page-level vertical scroll container; background is fixed.

   Mobile polish:
   - Softer glows on mobile
   - Comparison horizontally scrollable only

   Stripe wiring (Step 1 lifecycle verification):
   - Starter/Creator buttons now POST to /billing/checkout and redirect to Stripe
   - Expected response: { url: "https://checkout.stripe.com/..." }
========================================================= */

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path
        d="M13 2L3 14h8l-1 8 11-14h-8l0-6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path
        d="M12 2 20 6v7c0 5-3.5 9-8 9s-8-4-8-9V6l8-4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path
        d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 6v6l4 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type BillingMode = "monthly" | "yearly";

function formatMoney(n: number) {
  const fixed = n.toFixed(2);
  if (fixed.endsWith(".00")) return fixed.slice(0, -3);
  return fixed;
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function H({ children }: { children: React.ReactNode }) {
  return <span className="grad-text font-semibold tracking-tight">{children}</span>;
}

function Divider() {
  return <div className="h-px w-full bg-white/10" />;
}

function HoverSheen() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 hidden opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:block"
        style={{
          background:
            "radial-gradient(120px 120px at 20% 25%, rgba(167,139,250,0.20), transparent 60%), radial-gradient(140px 140px at 80% 30%, rgba(125,211,252,0.18), transparent 62%), radial-gradient(140px 140px at 55% 85%, rgba(45,212,191,0.14), transparent 62%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)",
        }}
      />
    </>
  );
}

function MiniPill({ icon, label }: { icon: React.ReactNode; label: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-white/70">
      <span className="text-white/70">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function PlainPrice({ price, suffix }: { price: string; suffix: string }) {
  return (
    <div className="mt-5 flex items-end gap-2">
      <div className="text-4xl font-semibold tracking-tight sm:text-5xl">
        {price}
      </div>
      <div className="pb-2 text-sm text-white/55">{suffix}</div>
    </div>
  );
}

function StrikePrice({
  was,
  now,
  suffix,
  emphasize,
}: {
  was: string;
  now: string;
  suffix: string;
  emphasize?: boolean;
}) {
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <div className="text-base text-white/55 line-through decoration-white/30 sm:text-lg">
          {was}
        </div>
        <div
          className={cn(
            "text-4xl font-semibold tracking-tight sm:text-5xl",
            emphasize ? "price-glow" : ""
          )}
        >
          {now}
        </div>
        <div className="pb-2 text-sm text-white/55">{suffix}</div>
      </div>
    </div>
  );
}

function BenefitRow({ text }: { text: string }) {
  return (
    <li className="relative pl-4 text-sm leading-relaxed text-white/78">
      <span
        aria-hidden="true"
        className="absolute left-0 top-[0.6rem] h-1.5 w-1.5 rounded-full bg-white/55"
      />
      {text}
    </li>
  );
}

function Disclosure({
  open,
  onToggle,
  title,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/75 hover:bg-white/[0.04]"
      >
        <span>{title}</span>
        <span className="text-white/50">{open ? "–" : "+"}</span>
      </button>

      <div className={cn("benefits mt-3", open && "open")}>
        <ul className="space-y-2.5 rounded-2xl border border-white/10 bg-black/30 p-4">
          {children}
        </ul>
      </div>
    </div>
  );
}

function Toggle({
  mode,
  setMode,
  discountLabel,
}: {
  mode: BillingMode;
  setMode: (m: BillingMode) => void;
  discountLabel: string;
}) {
  return (
    <div className="flex w-full items-center md:w-auto md:justify-end">
      <div className="flex w-full max-w-[380px] items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 sm:w-auto sm:gap-2">
        <button
          onClick={() => setMode("monthly")}
          className={cn(
            "inline-flex min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-medium transition sm:flex-none sm:px-5 sm:text-sm",
            mode === "monthly"
              ? "bg-white text-black"
              : "text-white/70 hover:text-white"
          )}
        >
          Monthly
        </button>

        <button
          onClick={() => setMode("yearly")}
          className={cn(
            "inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-medium transition sm:flex-none sm:gap-2 sm:px-5 sm:text-sm",
            mode === "yearly"
              ? "bg-white text-black"
              : "text-white/70 hover:text-white"
          )}
        >
          <span>Yearly</span>
          <span className="inline-flex shrink-0 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white sm:px-2 sm:text-[11px]">
            {discountLabel}
          </span>
        </button>
      </div>
    </div>
  );
}

function PacksBar({
  pack,
  setPack,
}: {
  pack: number;
  setPack: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <div className="mt-8 group surface-soft relative overflow-hidden p-4 sm:p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
      <HoverSheen />
      <div className="relative">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium text-white/85">
              Credit packs <span className="text-white/45">(Creator only)</span>
            </div>
            <div className="text-xs text-white/55">
              Scale Creator credits (and Creator price) without changing your
              workflow. Choose 1× to 10×.
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
              Pack: <span className="font-semibold text-white">{pack}×</span>
            </div>

            <div className="flex items-center gap-3">
              <input
                aria-label="Creator credit pack multiplier"
                type="range"
                min={1}
                max={10}
                step={1}
                value={pack}
                onChange={(e) => setPack(parseInt(e.target.value, 10))}
                className="w-full min-w-[170px] max-w-[420px] accent-white md:w-56"
              />

              <div className="flex gap-2">
                <button
                  className="btn-ghost"
                  onClick={() => setPack((p) => Math.max(1, p - 1))}
                >
                  −
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setPack((p) => Math.min(10, p + 1))}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-[11px] text-white/45">
          Packs only affect <span className="text-white/70">Creator</span>.
          Starter stays fixed and simple.
        </div>
      </div>
    </div>
  );
}

function TopMetaRow() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <MiniPill
        icon={<BoltIcon />}
        label={
          <>
            Built for <H>YOUTUBE</H>, <H>TIKTOK</H>, <H>REELS</H>
          </>
        }
      />
      <MiniPill icon={<ShieldIcon />} label={<>Credits map to real output</>} />
      <MiniPill icon={<ClockIcon />} label={<>Post consistently, not occasionally</>} />
    </div>
  );
}

function TierHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {subtitle ? (
          <div className="mt-1 text-xs text-white/55">{subtitle}</div>
        ) : null}
      </div>
      {badge ? (
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70">
          {badge}
        </div>
      ) : null}
    </div>
  );
}

function SmallNote({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 text-sm text-white/60">{children}</div>;
}

function FeatureBullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2 text-sm text-white/70">
      {items.map((t) => (
        <li key={t} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
          {t}
        </li>
      ))}
    </ul>
  );
}

function ComparisonRow({
  label,
  trial,
  starter,
  creator,
  studio,
}: {
  label: string;
  trial: string;
  starter: string;
  creator: string;
  studio: string;
}) {
  return (
    <div className="grid grid-cols-5 gap-3 py-3 text-sm">
      <div className="text-white/75">{label}</div>
      <div className="text-white/60">{trial}</div>
      <div className="text-white/60">{starter}</div>
      <div className="text-white/60">{creator}</div>
      <div className="text-white/60">{studio}</div>
    </div>
  );
}

function FAQItem({
  q,
  a,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.02] p-4 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.03]">
      <HoverSheen />
      <button
        onClick={onToggle}
        className="relative flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="text-sm font-semibold text-white/85">{q}</div>
        <div className="shrink-0 text-white/50">{open ? "–" : "+"}</div>
      </button>

      {open ? (
        <div className="relative mt-3 text-sm leading-relaxed text-white/65">
          {a}
        </div>
      ) : null}
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const pathname = usePathname();

  const [mode, setMode] = useState<BillingMode>("yearly");
  const [pack, setPack] = useState<number>(1);

  const [startingCheckout, setStartingCheckout] = useState<
    null | "free" | "starter" | "creator"
  >(null);

  // STEP 1: auth gate for ALL plan CTAs
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
    const fetchFailed = String(e?.message || "").toLowerCase().includes("failed to fetch");

    if (!status && fetchFailed) {
      return "Network error reaching billing. Please refresh and try again.";
    }
    if (lower.includes("stripe not configured")) {
      return "Checkout isn’t live yet. Please try again shortly.";
    }
    if (lower.includes("price not configured") || lower.includes("no such price")) {
      return "Pricing isn’t fully configured yet. Please contact support.";
    }
    if (status === 401) {
      return "Your session expired. Please sign in again.";
    }
    if (status >= 500 && !detailStr) {
      return "Billing service is temporarily unavailable. Please try again in a minute.";
    }
    if (detailStr) return detailStr;
    try {
      return JSON.stringify(detail);
    } catch {
      return "Checkout is temporarily unavailable. Please try again.";
    }
  }

async function startCheckout(plan: "free" | "starter" | "creator") {
  const ok = await requireAuthOrRedirect();
  if (!ok) return;

  try {
    setStartingCheckout(plan);

    const safePack = Math.max(1, Math.min(10, Number(pack) || 1));

    // Free trial is monthly-only
    const interval =
      plan === "free" ? "monthly" : plan === "starter" ? "monthly" : mode;

    const payload =
      plan === "creator"
        ? { plan, interval, pack: safePack }
        : { plan, interval };

    const data = (await apiFetch("/billing/checkout-session", {
      method: "POST",
      body: payload,
    })) as any;

    const url = data?.url;

    if (!url) {
      console.error("checkout_failed_no_url", { data, payload });
      alert("Checkout failed. Please try again.");
      return;
    }

    window.location.href = url;
  } catch (e) {
    console.error("checkout_failed", e);
    alert(checkoutErrorMessage(e));
  } finally {
    setStartingCheckout(null);
  }
}


  const [openBenefits, setOpenBenefits] = useState({
    trial: false,
    starter: false,
    creator: false,
    studio: false,
  });

  const [faqOpen, setFaqOpen] = useState<Record<string, boolean>>({
    credits: true,
    packs: false,
    yearly: false,
    trial: false,
    cancel: false,
    studio: false,
  });

  const toggleBenefits = (k: keyof typeof openBenefits) =>
    setOpenBenefits((p) => ({ ...p, [k]: !p[k] }));
  const toggleFaq = (k: string) => setFaqOpen((p) => ({ ...p, [k]: !p[k] }));

  const trialCredits = 60;
  const starterMonthlyCredits = 150;

  const creatorMonthlyCredits = 300;
  const creatorYearlyCreditsUpfront = 3600;

  const creatorCredits =
    mode === "yearly"
      ? creatorYearlyCreditsUpfront * pack
      : creatorMonthlyCredits * pack;

  const starterMonthlyPrice = 10.0;
  const creatorMonthlyPrice = 20.0;

  const yearlyDiscount = 0.25;
  const months = 12;

  const creatorMonthlyWithPack = creatorMonthlyPrice * pack;
  const creatorYearlyMonthlyEq = creatorMonthlyWithPack * (1 - yearlyDiscount);
  const creatorYearlyTotal = Math.round(creatorYearlyMonthlyEq * months);

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

  const tierBullets = useMemo(() => {
    return {
      trial: [
        `${trialCredits} credits included`,
        "Full pipeline access",
        "Social access: 0 channels",
        "Downloads: up to 20 (1 credit each)",
      ],
      starter: [
        `${starterMonthlyCredits} credits / month`,
        "Simple monthly billing",
        "Social access: 2 channels",
        "Downloads: up to 50 / month (1 credit each)",
      ],
      creator: [
        mode === "yearly"
          ? `${creatorCredits} credits / year (upfront)`
          : `${creatorCredits} credits / month`,
        "Priority processing",
        "Social access: full channels",
        "Unlimited downloads included",
      ],
      studio: [
        "High-volume credits",
        "Team seats + roles",
        "Support + SLA options",
      ],
    };
  }, [trialCredits, starterMonthlyCredits, creatorCredits, mode]);

  const trialBenefits = useMemo(
    () => [
      "Upload once and generate polished shorts",
      "Clean pacing and caption-ready structure",
      "Social publishing channels: 0",
      "Editor tools locked on Free Trial",
      "Up to 20 downloads total (1 credit per download)",
      "Email support",
    ],
    []
  );

  const starterBenefits = useMemo(
    () => [
      "Everything in Free Trial",
      "Higher monthly credit allowance",
      "Editor access unlocked",
      "Social publishing channels: up to 2",
      "Up to 50 downloads per month (1 credit per download)",
      "Production-ready templates",
      "Email support",
    ],
    []
  );

  const creatorBenefits = useMemo(
    () => [
      "Everything in Starter",
      "Higher quality and retention-focused output",
      "Full editor access",
      "Social publishing channels: full access",
      "Unlimited downloads included",
      "Advanced caption and pacing presets",
      "Batch exports and reusable templates",
      "Priority queue throughput",
      mode === "yearly"
        ? "Yearly credits delivered upfront"
        : "Monthly credits refresh automatically",
    ],
    [mode]
  );

  const studioBenefits = useMemo(
    () => [
      "Everything in Creator",
      "Custom credit bundles at team scale",
      "Team workspaces and role permissions",
      "Shared presets and brand templates",
      "Export rules and QA workflows",
      "Priority support and onboarding",
    ],
    []
  );

  const discountLabel = useMemo(() => "−25%", []);

  return (
    // IMPORTANT: no overflow on the page root (keeps navbar sticky working)
    <div className="relative">
      {/* FIXED PAGE BACKGROUND (no layout height impact) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(1000px_620px_at_50%_10%,rgba(255,255,255,0.06),transparent_62%)]" />
        <div className="absolute inset-0 hidden opacity-[0.50] sm:block">
          <div className="aurora" />
        </div>

        <div className="absolute -top-40 left-[-20%] hidden h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.22),transparent_62%)] blur-3xl sm:block" />
        <div className="absolute top-24 right-[-18%] hidden h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.18),transparent_64%)] blur-3xl sm:block" />
        <div className="absolute bottom-[-18%] left-[10%] hidden h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.14),transparent_65%)] blur-3xl sm:block" />
      </div>

      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs text-white/50">• Pricing</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-6xl">
              Credit-based. <span className="grad-text">Scale when it works.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/65 sm:text-base">
              Start free, test real outputs, then scale when your workflow proves itself.
            </p>
            <div className="mt-3">
              <SocialBrandRow platforms={["youtube", "tiktok", "reels"]} />
            </div>
            <TopMetaRow />
            <div className="mt-2 text-xs text-white/45">
              Promo codes are accepted at checkout.
            </div>
          </div>

          <Toggle mode={mode} setMode={setMode} discountLabel={discountLabel} />
        </div>

        <PacksBar pack={pack} setPack={setPack} />

        <div className="mt-8 grid gap-5 md:grid-cols-4">
          <div className="group surface relative overflow-hidden p-5 sm:p-6 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
            <HoverSheen />
            <div className="relative">
              <TierHeader title="Free Trial" subtitle="Test the full experience" />
              <PlainPrice price="$0" suffix="/trial" />
              <div className="mt-3 text-sm text-white/65">
                Start now and ship your first post-quality clips.
              </div>

              <FeatureBullets items={tierBullets.trial} />

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => startCheckout("free")}
                  disabled={startingCheckout !== null}
                  className={cn(
                    "btn-orbito-cta w-full",
                    startingCheckout ? "opacity-80 cursor-not-allowed" : ""
                  )}
                >
                  Start free
                </button>
              </div>

              <Disclosure
                open={openBenefits.trial}
                onToggle={() => toggleBenefits("trial")}
                title="See benefits"
              >
                {trialBenefits.map((t) => (
                  <BenefitRow key={t} text={t} />
                ))}
              </Disclosure>

              <div className="mt-6 text-xs text-white/40">
                Best for a first pass.
              </div>
            </div>
          </div>

          <div className="group surface relative overflow-hidden p-5 sm:p-6 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
            <HoverSheen />
            <div className="relative">
              <TierHeader title="Starter" subtitle="Monthly only" />
              <PlainPrice
                price={`$${formatMoney(starterMonthlyPrice)}`}
                suffix="/mo"
              />
              <SmallNote>
                <span className="text-white/80">Monthly only</span>{" "}
                <span className="text-white/50">• no yearly billing</span>
              </SmallNote>

              <div className="mt-4 text-sm text-white/70">
                A clean monthly plan for consistent publishing.
              </div>

              <FeatureBullets items={tierBullets.starter} />

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => startCheckout("starter")}
                  disabled={startingCheckout !== null}
                  className={cn(
                    "btn-ghost w-full py-3 text-base",
                    startingCheckout ? "opacity-70 cursor-not-allowed" : ""
                  )}
                >
                  {startingCheckout === "starter"
                    ? "Opening Checkout…"
                    : "Choose Starter"}
                </button>
              </div>

              <Disclosure
                open={openBenefits.starter}
                onToggle={() => toggleBenefits("starter")}
                title="See benefits"
              >
                {starterBenefits.map((t) => (
                  <BenefitRow key={t} text={t} />
                ))}
              </Disclosure>

              <div className="mt-6 text-xs text-white/40">
                Starter stays fixed — no packs.
              </div>
            </div>
          </div>

          <div className="group surface creator-highlight relative p-5 sm:p-6 flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
            <div className="pointer-events-none absolute -inset-10 opacity-70">
              <div className="absolute inset-0 bg-[radial-gradient(520px_280px_at_40%_25%,rgba(167,139,250,0.18),transparent_62%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(520px_280px_at_70%_45%,rgba(125,211,252,0.14),transparent_62%)]" />
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-3xl [box-shadow:0_0_0_1px_rgba(255,255,255,0.08),0_30px_120px_rgba(0,0,0,0.55)]" />
            <HoverSheen />

            <div className="relative">
              <TierHeader
                title="Creator"
                subtitle="Best for consistent posting"
                badge="most popular"
              />

              {mode === "yearly" ? (
                <>
                  <StrikePrice
                    was={`$${formatMoney(creatorMonthlyWithPack)}`}
                    now={`$${formatMoney(creatorYearlyMonthlyEq)}`}
                    suffix="/mo"
                    emphasize
                  />
                  <SmallNote>
                    Billed yearly{" "}
                    <span className="text-white/85">(${creatorYearlyTotal})</span>
                    <span className="ml-2 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/70">
                      save 25%
                    </span>
                  </SmallNote>
                </>
              ) : (
                <>
                  <PlainPrice
                    price={`$${formatMoney(creatorMonthlyWithPack)}`}
                    suffix="/mo"
                  />
                  <SmallNote>
                    Billed monthly{" "}
                    <span className="text-white/50">• no discount</span>
                  </SmallNote>
                </>
              )}

              <div className="mt-4 text-sm text-white/70">
                More throughput for teams posting at serious volume.
              </div>

              <FeatureBullets items={tierBullets.creator} />

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => startCheckout("creator")}
                  disabled={startingCheckout !== null}
                  className={cn(
                    "btn-orbito-cta w-full",
                    startingCheckout ? "opacity-80 cursor-not-allowed" : ""
                  )}
                >
                  {startingCheckout === "creator"
                    ? "Opening Checkout…"
                    : "Choose Creator"}
                </button>
              </div>

              <Disclosure
                open={openBenefits.creator}
                onToggle={() => toggleBenefits("creator")}
                title="See benefits"
              >
                {creatorBenefits.map((t) => (
                  <BenefitRow key={t} text={t} />
                ))}
              </Disclosure>

              <div className="mt-6 text-xs text-white/45">
                Packs:{" "}
                <span className="text-white/75 font-medium">{pack}×</span>{" "}
                <span className="text-white/50">• scales Creator only</span>
              </div>
            </div>
          </div>

          <div className="group surface relative overflow-hidden p-5 sm:p-6 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
            <HoverSheen />
            <div className="relative">
              <TierHeader title="Studio" subtitle="Teams & high volume" />

              <div className="mt-5">
                <div className="flex items-end gap-2">
                  <div className="text-4xl font-semibold tracking-tight sm:text-5xl">
                    Custom
                  </div>
                </div>
                <SmallNote>Sized to your seats, volume, and workflow.</SmallNote>
              </div>

              <div className="mt-4 text-sm text-white/70">
                Built for brands and teams running multi-channel output.
              </div>

              <FeatureBullets items={tierBullets.studio} />

              <div className="mt-6">
                <Link href="/contact" className="btn-ghost w-full py-3 text-base">
                  Contact sales
                </Link>
              </div>

              <Disclosure
                open={openBenefits.studio}
                onToggle={() => toggleBenefits("studio")}
                title="See benefits"
              >
                {studioBenefits.map((t) => (
                  <BenefitRow key={t} text={t} />
                ))}
              </Disclosure>

              <div className="mt-4 text-xs text-white/40">
                Built for teams with custom onboarding and managed rollout.
              </div>
            </div>
          </div>
        </div>

        <section className="mt-14">
          <div className="group surface relative overflow-hidden p-5 sm:p-6 md:p-8 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
            <HoverSheen />
            <div className="relative">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-xs text-white/50">• Compare</div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
                    What’s included —{" "}
                    <span className="grad-text">at a glance</span>
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-white/65">
                    Starter keeps it simple. Creator adds speed and scale. Studio is tailored for teams.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-white/60">
                  Showing:{" "}
                  <span className="text-white/80 font-medium">
                    {mode === "yearly" ? "Yearly" : "Monthly"}
                  </span>{" "}
                  +{" "}
                  <span className="text-white/80 font-medium">{pack}× pack</span>
                </div>
              </div>

              <div className="mt-6 -mx-4 overflow-x-auto overflow-y-hidden px-4">
                <div className="min-w-[760px] rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="grid grid-cols-5 gap-3 pb-3 text-xs text-white/55">
                    <div className="text-white/65">Feature</div>
                    <div>Trial</div>
                    <div>Starter</div>
                    <div>Creator</div>
                    <div>Studio</div>
                  </div>
                  <Divider />

                  <ComparisonRow
                    label="Credits"
                    trial={`${trialCredits}`}
                    starter={`${starterMonthlyCredits}/mo`}
                    creator={
                      mode === "yearly"
                        ? `${creatorCredits}/yr upfront`
                        : `${creatorCredits}/mo`
                    }
                    studio="Custom"
                  />
                  <Divider />

                  <ComparisonRow
                    label="Processing priority"
                    trial="Standard"
                    starter="Standard+"
                    creator="Priority"
                    studio="Priority+"
                  />
                  <Divider />

                  <ComparisonRow
                    label="Social access"
                    trial="0 channels"
                    starter="2 channels"
                    creator="Full access"
                    studio="Custom"
                  />
                  <Divider />

                  <ComparisonRow
                    label="Editor access"
                    trial="Locked"
                    starter="Enabled"
                    creator="Full"
                    studio="Full + team workflows"
                  />
                  <Divider />

                  <ComparisonRow
                    label="Download policy"
                    trial="20 max • 1 credit each"
                    starter="50 / month • 1 credit each"
                    creator="Unlimited"
                    studio="Unlimited + controls"
                  />
                  <Divider />

                  <ComparisonRow
                    label="Presets & templates"
                    trial="Basic"
                    starter="Yes"
                    creator="Advanced"
                    studio="Team presets"
                  />
                  <Divider />

                  <ComparisonRow
                    label="Support"
                    trial="Email"
                    starter="Email"
                    creator="Priority email"
                    studio="Dedicated"
                  />
                  <Divider />

                  <ComparisonRow
                    label="Team seats"
                    trial="—"
                    starter="—"
                    creator="—"
                    studio="Yes"
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => startCheckout("free")}
                  disabled={startingCheckout !== null}
                  className={cn(
                    "btn-orbito-cta",
                    startingCheckout ? "opacity-80 cursor-not-allowed" : ""
                  )}
                >
                  Start free
                </button>
                <Link href="/contact" className="btn-ghost">
                  Talk to sales
                </Link>
                <div className="text-xs text-white/45">
                  Packs only affect Creator credits and pricing.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14">
          <div className="surface p-5 sm:p-6 md:p-8">
            <div className="text-xs text-white/50">• FAQ</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
              Answers, <span className="grad-text">no fluff</span>
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-white/65">
              Credits are your usage currency. Packs scale Creator only. Yearly
              delivers Creator credits upfront.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <FAQItem
                q="What are credits?"
                a="Credits are your usage currency for processing. When you generate outputs, you spend credits. Billing stays aligned with volume."
                open={!!faqOpen.credits}
                onToggle={() => toggleFaq("credits")}
              />
              <FAQItem
                q="What do credit packs do?"
                a="Packs scale Creator only: both credits and Creator pricing. Starter stays fixed."
                open={!!faqOpen.packs}
                onToggle={() => toggleFaq("packs")}
              />
              <FAQItem
                q="How does yearly billing work on Creator?"
                a="Yearly Creator delivers the full year's credits upfront (3600 × pack). Monthly refresh is replaced by upfront delivery."
                open={!!faqOpen.yearly}
                onToggle={() => toggleFaq("yearly")}
              />
              <FAQItem
                q="What do I get on the free trial?"
                a="You get 60 credits to run the full flow end-to-end. Upgrade only if you want more volume."
                open={!!faqOpen.trial}
                onToggle={() => toggleFaq("trial")}
              />
              <FAQItem
                q="Can I cancel?"
                a="Yes. Monthly stops renewing anytime. Yearly keeps the delivered credits for the billing period."
                open={!!faqOpen.cancel}
                onToggle={() => toggleFaq("cancel")}
              />
              <FAQItem
                q="What is Studio?"
                a="Studio is for teams. We size it around seats, volume, workflows, and support needs."
                open={!!faqOpen.studio}
                onToggle={() => toggleFaq("studio")}
              />
            </div>
          </div>
        </section>

        <section className="mt-14">
          <div className="group surface relative overflow-hidden p-5 sm:p-6 md:p-8 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
            <div className="absolute inset-0 hidden sm:block">
              <div className="aurora opacity-60" />
            </div>
            <HoverSheen />

            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs text-white/50">• Next</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
                  Orbito is live now.{" "}
                  <span className="grad-text">Start posting today.</span>
                </div>
                <div className="mt-2 text-sm text-white/65">
                  Want AI video generation too? Open Orbito Labs from your Orbito account.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => startCheckout("free")}
                  disabled={startingCheckout !== null}
                  className={cn(
                    "btn-orbito-cta",
                    startingCheckout ? "opacity-80 cursor-not-allowed" : ""
                  )}
                >
                  Start free
                </button>
                <Link href="/features" className="btn-ghost">
                  See how it works
                </Link>
                <Link href="/contact" className="btn-ghost">
                  Contact
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="pb-6 pt-12 text-xs text-white/45">
          <div className="mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>© 2026 • {BRAND.name} by Sakib LLC. All rights reserved.</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {footerLinks.map((i) => (
                <a key={i.href} href={i.href} className="hover:text-white/70">
                  {i.label}
                </a>
              ))}
            </div>
          </div>

          <div className="mt-6 text-[11px] text-white/35">
            Starter is monthly-only. Packs scale Creator credits + pricing only.
            Creator yearly delivers credits upfront for the year.
          </div>
        </footer>
      </section>
    </div>
  );
}
