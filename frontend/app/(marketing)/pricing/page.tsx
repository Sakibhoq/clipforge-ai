"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

/* =========================================================
   Orbito — Pricing Page (Marketing)
   - 4 tiers: Free Trial / Starter / Creator / Studio
   - Monthly/Yearly toggle (side-by-side, default Yearly)
   - Credit Packs slider at TOP (Creator only)
   - Creator Yearly = 3600 credits upfront (per year)
   - Discount applies ONLY in Yearly mode

   Mobile polish (this pass):
   - Safer small-screen spacing + typography
   - Reduce heavy glow effects on mobile (keep premium feel)
   - Make comparison section scrollable (handled in Part 2)
   - No behavior/logic changes
========================================================= */

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path
        d="M20 7L10.2 16.8 4.8 11.4"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

function Divider() {
  return <div className="h-px w-full bg-white/10" />;
}

function HoverSheen() {
  return (
    <>
      {/* heavy blur sheen hidden on mobile to reduce visual noise + perf */}
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

function MiniPill({ icon, label }: { icon: React.ReactNode; label: string }) {
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
}: {
  was: string;
  now: string;
  suffix: string;
}) {
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <div className="text-base text-white/55 line-through decoration-white/30 sm:text-lg">
          {was}
        </div>
        <div className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {now}
        </div>
        <div className="pb-2 text-sm text-white/55">{suffix}</div>
      </div>
    </div>
  );
}

function BenefitRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="check mt-0.5">
        <CheckIcon />
      </div>
      <div>{text}</div>
    </div>
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
        <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
          {children}
        </div>
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
    <div className="flex items-center">
      <div className="flex w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] p-1">
        <button
          onClick={() => setMode("monthly")}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition sm:px-5",
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
            "rounded-full px-4 py-2 text-sm font-medium transition sm:px-5",
            mode === "yearly"
              ? "bg-white text-black"
              : "text-white/70 hover:text-white"
          )}
        >
          Yearly{" "}
          <span className="ml-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white">
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
      <MiniPill icon={<BoltIcon />} label="Fast processing defaults" />
      <MiniPill icon={<ShieldIcon />} label="Credits = usage currency" />
      <MiniPill icon={<ClockIcon />} label="Scale when it earns" />
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
  /* ===========================
     STATE
  =========================== */
  const [mode, setMode] = useState<BillingMode>("yearly");
  const [pack, setPack] = useState<number>(1);

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

  /* ===========================
     TIERS / CREDITS
  =========================== */
  const trialCredits = 60;

  // Starter: fixed, no packs
  const starterMonthlyCredits = 150;

  // Creator: monthly credits vs yearly credits upfront (packs apply)
  const creatorMonthlyCredits = 300;
  const creatorYearlyCreditsUpfront = 3600;

  const creatorCredits =
    mode === "yearly"
      ? creatorYearlyCreditsUpfront * pack
      : creatorMonthlyCredits * pack;

  /* ===========================
     PRICES
  =========================== */
  const starterMonthlyPrice = 14.99;
  const creatorMonthlyPrice = 29.99;

  // Studio example baseline for internal math (display hidden-ish)
  const studioMonthlyExample = 99.0;

  const yearlyDiscount = 0.51;
  const months = 12;

  const creatorMonthlyWithPack = creatorMonthlyPrice * pack;

  const creatorYearlyMonthlyEq = creatorMonthlyWithPack * (1 - yearlyDiscount);
  const creatorYearlyTotal = Math.round(creatorYearlyMonthlyEq * months);

  const studioMonthlyWithPackExample = studioMonthlyExample * pack;
  const studioYearlyMonthlyEqExample =
    studioMonthlyWithPackExample * (1 - yearlyDiscount);
  const studioYearlyTotalExample = Math.round(
    studioYearlyMonthlyEqExample * months
  );

  /* ===========================
     LINKS
  =========================== */
  const footerLinks = useMemo(
    () => [
      { label: "Features", href: "/features" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
    ],
    []
  );

  /* ===========================
     CONTENT ARRAYS
  =========================== */
  const tierBullets = useMemo(() => {
    return {
      trial: [
        `${trialCredits} credits included`,
        "Full pipeline access",
        "Credit-based usage",
      ],
      starter: [
        `${starterMonthlyCredits} credits / month`,
        "Simple monthly billing",
        "Presets & repeatable formats",
      ],
      creator: [
        mode === "yearly"
          ? `${creatorCredits} credits / year (upfront)`
          : `${creatorCredits} credits / month`,
        "Priority processing",
        "Presets + repeatable formats",
      ],
      studio: ["High-volume credits", "Team seats + roles", "Support + SLA options"],
    };
  }, [trialCredits, starterMonthlyCredits, creatorCredits, mode]);

  const trialBenefits = useMemo(
    () => [
      "Upload long-form once",
      "Generate shorts with structure + pacing",
      "Exports ready for posting",
      "Support via email",
    ],
    []
  );

  const starterBenefits = useMemo(
    () => [
      "Everything in Free Trial",
      "More credits for cadence",
      "Templates + calm defaults",
      "Email support",
    ],
    []
  );

  const creatorBenefits = useMemo(
    () => [
      "Everything in Starter",
      "Higher retention clip generation",
      "Captions + pacing presets",
      "Batch exports + templates",
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
      "Custom credit bundles",
      "Team workspaces + permissions",
      "Shared presets + brand templates",
      "Export rules + QA workflows",
      "Priority support + onboarding",
    ],
    []
  );

  const discountLabel = useMemo(() => "−51%", []);

  return (
    <div className="bg-plain relative">
      {/* PAGE-LEVEL GLOW (softened on mobile) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(1000px_620px_at_50%_10%,rgba(255,255,255,0.06),transparent_62%)]" />
        <div className="absolute inset-0 opacity-[0.50] hidden sm:block">
          <div className="aurora" />
        </div>

        {/* keep blobs on desktop; reduce clutter on mobile */}
        <div className="absolute -top-40 left-[-20%] hidden h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.22),transparent_62%)] blur-3xl sm:block" />
        <div className="absolute top-24 right-[-18%] hidden h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.18),transparent_64%)] blur-3xl sm:block" />
        <div className="absolute bottom-[-18%] left-[10%] hidden h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.14),transparent_65%)] blur-3xl sm:block" />

        <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pb-16 pt-10">
        {/* HEADER ROW */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs text-white/50">• Pricing</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-6xl">
              Credit-based. <span className="grad-text">Scale when it works.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/65 sm:text-base">
              Start free. Upgrade when you’re ready for more throughput. Packs
              scale Creator only.
            </p>
            <TopMetaRow />
          </div>

          <Toggle mode={mode} setMode={setMode} discountLabel={discountLabel} />
        </div>

        {/* TOP PACKS BAR */}
        <PacksBar pack={pack} setPack={setPack} />

        {/* PRICING GRID */}
        <div className="mt-8 grid gap-5 md:grid-cols-4">
          {/* Free Trial */}
          <div className="group surface relative overflow-hidden p-5 sm:p-6 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
            <HoverSheen />
            <div className="relative">
              <TierHeader title="Free Trial" subtitle="Test the full experience" />
              <PlainPrice price="$0" suffix="/trial" />
              <div className="mt-3 text-sm text-white/65">
                Start instantly with credits included.
              </div>

              <FeatureBullets items={tierBullets.trial} />

              <div className="mt-6">
                <Link href="/register" className="btn-aurora w-full">
                  Start free trial
                </Link>
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
                Best for first-time testing.
              </div>
            </div>
          </div>

          {/* Starter */}
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
                Clean and simple — consistent monthly cadence.
              </div>

              <FeatureBullets items={tierBullets.starter} />

              <div className="mt-6">
                <Link
                  href="/register"
                  className="btn-ghost w-full py-3 text-base"
                >
                  Choose Starter
                </Link>
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

          {/* Creator */}
          <div className="group surface relative p-5 sm:p-6 flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
            {/* subtle highlight */}
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
                  />
                  <SmallNote>
                    Billed yearly{" "}
                    <span className="text-white/85">(${creatorYearlyTotal})</span>
                    <span className="ml-2 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/70">
                      save 51%
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
                Priority throughput + packs for scale.
              </div>

              <FeatureBullets items={tierBullets.creator} />

              <div className="mt-6">
                <Link href="/register" className="btn-aurora w-full">
                  Choose Creator
                </Link>
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

          {/* Studio */}
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
                Built for brands, agencies, and teams.
              </div>

              <FeatureBullets items={tierBullets.studio} />

              <div className="mt-6">
                <Link
                  href="/contact"
                  className="btn-ghost w-full py-3 text-base"
                >
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
                Internal reference:{" "}
                <span className="text-white/65">
                  {mode === "yearly"
                    ? `$${formatMoney(
                        studioYearlyMonthlyEqExample
                      )}/mo eq • billed yearly ($${studioYearlyTotalExample})`
                    : `$${formatMoney(studioMonthlyWithPackExample)}/mo eq`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* (Part 2 continues: Comparison, FAQ, CTA, Footer) */}
        {/* COMPARISON */}
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
                    Starter stays simple. Creator adds scale + priority. Studio
                    is built around teams.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-white/60">
                  Showing:{" "}
                  <span className="text-white/80 font-medium">
                    {mode === "yearly" ? "Yearly" : "Monthly"}
                  </span>{" "}
                  +{" "}
                  <span className="text-white/80 font-medium">
                    {pack}× pack
                  </span>
                </div>
              </div>

              {/* mobile-safe horizontal scroll */}
              <div className="mt-6 -mx-4 overflow-x-auto px-4">
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
                <Link href="/register" className="btn-aurora">
                  Start free trial
                </Link>
                <Link href="/contact" className="btn-ghost">
                  Talk to sales
                </Link>
                <div className="text-xs text-white/45">
                  Packs only affect Creator pricing + credits.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
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

        {/* CTA STRIP */}
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
                  Start free.{" "}
                  <span className="grad-text">Scale when it earns.</span>
                </div>
                <div className="mt-2 text-sm text-white/65">
                  Keep it calm. Keep it consistent. Add volume when you want it.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link href="/register" className="btn-aurora">
                  Start free trial
                </Link>
                <Link href="/how-it-works" className="btn-ghost">
                  See how it works
                </Link>
                <Link href="/contact" className="btn-ghost">
                  Contact
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="pb-6 pt-12 text-xs text-white/45">
          <div className="mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>© 2026 • {BRAND.name} by Sakib LLC</div>
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
