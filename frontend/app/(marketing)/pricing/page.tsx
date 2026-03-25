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
    <div className="relative">
      <PricingMotionStyles />
      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        {trialLockNotice ? (
          <div className="mb-6 rounded-xl border border-amber-300/35 bg-amber-300/12 px-4 py-3 text-sm text-amber-100">
            {trialLockNotice}
          </div>
        ) : null}
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <FamilyPill label="One Platform" tone="full" />
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white/95 sm:text-5xl md:text-6xl">
              One account. Two ways to create.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/66 sm:text-base">
              Pick the mode that matches how you create. Clip plans are built for long-form-to-short workflows, and Generate plans add
              AI video creation while staying inside the same Orbito account.
            </p>
            <div className="mt-5">
              <SocialBrandRow platforms={["youtube", "tiktok", "reels", "shorts"]} />
            </div>
          </div>

          <div className="surface-soft rounded-3xl p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-sky-300/22 bg-sky-300/[0.09] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100/82">Clip Mode</div>
                <div className="mt-2 text-lg font-semibold text-white/92">Orbito plans</div>
                <div className="mt-2 text-sm leading-relaxed text-white/66">
                  For turning long videos into short clips, editing them, and publishing them faster.
                </div>
              </div>
              <div className="rounded-2xl border border-amber-300/24 bg-amber-300/[0.09] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/82">Generate Mode</div>
                <div className="mt-2 text-lg font-semibold text-white/92">Orbito Generate plans</div>
                <div className="mt-2 text-sm leading-relaxed text-white/66">
                  For prompt-to-video, image, and voice generation, with Orbito Creator-level access included.
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-medium text-white/88">Billing view</div>
                <div className="text-xs text-white/56">Switch monthly or yearly and tune creator throughput with the scale control.</div>
              </div>
              <ModeToggle mode={mode} setMode={setMode} />
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-medium text-white/88">Credit scaling system</div>
                  <div className="text-xs text-white/56">
                    Scale Creator and Generate Creator throughput from 1x to 8x without changing your plan structure.
                  </div>
                </div>
                <div className="inline-flex rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-sm text-white/82">
                  Scale: <span className="ml-1 font-semibold">{creditScale}x</span>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
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

        <div className="mt-8">
          <div className="group surface relative overflow-hidden p-5 sm:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background:
                  "radial-gradient(620px 320px at 18% 26%, rgba(70,215,255,0.18), transparent 72%), radial-gradient(640px 340px at 84% 24%, rgba(255,183,3,0.18), transparent 74%), radial-gradient(680px 360px at 52% 98%, rgba(136,120,255,0.14), transparent 74%)",
              }}
            />
            <div className="relative grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch">
              <div>
                <FamilyPill label="Free Trial" tone="neutral" />
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="text-2xl font-semibold text-white/92 sm:text-3xl">Start with the full workflow before paying</div>
                  <div className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-xs text-white/75">
                    {formatInt(sharedTrialCredits)} shared credits
                  </div>
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <div className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">$0</div>
                  <div className="pb-2 text-sm text-white/55">/trial</div>
                </div>
                <p className="mt-3 max-w-2xl text-sm text-white/68 sm:text-base">
                  Test clip mode and generate mode from one account, then upgrade only when you need more output or more throughput.
                </p>

                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {[
                    "Clip long videos with Orbito",
                    "Generate AI media inside Orbito",
                    "Use one shared credit pool",
                    "Keep one publishing workflow",
                  ].map((item) => (
                    <div key={item} className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white/75">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full">
                <div className="flex h-full flex-col rounded-2xl border border-white/14 bg-black/25 p-4">
                  <div className="text-sm font-semibold text-white/88">Test the full workflow before you commit</div>
                  <div className="mt-2 text-xs leading-relaxed text-white/62">
                    Check clipping quality, test AI generation, and make sure the publish flow fits your workflow before upgrading.
                  </div>

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
                  <BenefitsDisclosure
                    open={openBenefits.trial}
                    onToggle={() => toggleBenefits("trial")}
                    items={benefits.trial}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <FamilyPill label="Clip Mode" tone="orbito" />
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">Plans for clipping and publishing</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/64 sm:text-base">
                Start here if your main workflow is turning long-form video into short clips and shipping content faster.
              </p>
            </div>
          </div>

          <div className="mt-5 grid auto-rows-fr gap-4 lg:grid-cols-2">
            <div className="group surface relative min-h-[560px] overflow-hidden border border-cyan-300/22 p-4">
              <GlowLayer family="orbito" />
              <div className="relative flex h-full flex-col">
                <FamilyPill label="Orbito Clip" tone="orbito" />
                <div className="mt-3 text-xl font-semibold text-white/94">Orbito Starter</div>
                <div className="mt-1 min-h-[20px] text-xs text-white/52">Best for steady weekly clipping and posting.</div>
                <PriceRow amount={`$${formatMoney(orbitoStarterMonthlyPrice)}`} suffix="/mo" />
                <div className="mt-2 min-h-[20px] text-xs text-white/50">Monthly billing</div>
                <Bullets
                  items={[
                    `${formatInt(orbitoStarterCredits)} Orbito credits / month`,
                    "Core clipping, editing, publishing",
                    "Starter posting limits",
                    "Good first paid plan",
                  ]}
                />
                <button
                  type="button"
                  onClick={() => startCheckout("starter")}
                  disabled={startingCheckout !== null}
                  className={cn(
                    "btn-orbito-cta mt-auto inline-flex h-11 w-full items-center justify-center whitespace-nowrap px-3 text-center text-sm font-semibold leading-none",
                    startingCheckout ? "cursor-not-allowed opacity-80" : ""
                  )}
                >
                  {startingCheckout === "starter" ? "Opening Checkout..." : "Choose Orbito Starter"}
                </button>
                <BenefitsDisclosure
                  open={openBenefits.orbitoStarter}
                  onToggle={() => toggleBenefits("orbitoStarter")}
                  items={benefits.orbitoStarter}
                />
              </div>
            </div>

            <div className="group surface relative min-h-[560px] overflow-hidden border border-cyan-300/26 p-4">
              <GlowLayer family="orbito" />
              <div className="relative flex h-full flex-col">
                <FamilyPill label="Orbito Clip" tone="orbito" />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xl font-semibold text-white/94">Orbito Creator</div>
                  <span className="rounded-full border border-sky-300/20 bg-sky-300/[0.12] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100">
                    Recommended
                  </span>
                </div>
                <div className="mt-1 min-h-[20px] text-xs text-white/52">For daily clipping, faster export cycles, and higher publish throughput.</div>
                {mode === "yearly" ? (
                  <PriceRow
                    amount={`$${formatMoney(orbitoCreatorYearlyScaledMonthly)}`}
                    suffix="/mo"
                    strike={`$${formatMoney(orbitoCreatorMonthlyScaledPrice)}`}
                    glowTone="orbito"
                  />
                ) : (
                  <PriceRow amount={`$${formatMoney(orbitoCreatorMonthlyScaledPrice)}`} suffix="/mo" />
                )}
                <div className="mt-2 min-h-[20px] text-xs text-white/50">
                  {mode === "yearly" ? `Billed yearly ($${formatMoney(orbitoCreatorYearlyTotal)})` : "Billed monthly"}
                </div>
                <Bullets
                  items={[
                    `${formatInt(orbitoCreatorCredits)} Orbito credits ${mode === "yearly" ? "/ year upfront" : "/ month"}`,
                    "Priority clipping and exports",
                    "Advanced publish throughput",
                    `Credit scale applied: ${creditScale}x`,
                  ]}
                />
                <button
                  type="button"
                  onClick={() => startCheckout("creator")}
                  disabled={startingCheckout !== null}
                  className={cn(
                    "btn-orbito-cta mt-auto inline-flex h-11 w-full items-center justify-center whitespace-nowrap px-3 text-center text-sm font-semibold leading-none",
                    startingCheckout ? "cursor-not-allowed opacity-80" : ""
                  )}
                >
                  {startingCheckout === "creator" ? "Opening Checkout..." : "Choose Orbito Creator"}
                </button>
                <BenefitsDisclosure
                  open={openBenefits.orbitoCreator}
                  onToggle={() => toggleBenefits("orbitoCreator")}
                  items={benefits.orbitoCreator}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <FamilyPill label="Generate Mode" tone="labs" />
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">Plans for AI video generation</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/64 sm:text-base">
                Choose these if prompt-to-video generation is part of your main workflow. Every Generate plan includes full Orbito Creator-level access.
              </p>
            </div>
          </div>

          <div className="mt-5 grid auto-rows-fr gap-4 lg:grid-cols-2">
            <div className="group surface relative min-h-[560px] overflow-hidden border border-amber-300/24 p-4">
              <GlowLayer family="labs" />
              <div className="relative flex h-full flex-col">
                <FamilyPill label="Orbito Generate" tone="labs" />
                <div className="mt-3 text-xl font-semibold text-white/94">Generate Starter</div>
                <div className="mt-1 min-h-[20px] text-xs text-white/52">Best for testing AI-led content creation without leaving Orbito.</div>
                <PriceRow amount={`$${formatMoney(labsStarterMonthlyPrice)}`} suffix="/mo" />
                <div className="mt-2 min-h-[20px] text-xs text-white/50">Monthly billing</div>
                <Bullets
                  items={[
                    `${formatInt(labsStarterCredits)} Generate credits / month`,
                    "Prompt-to-image, video, and voice generation",
                    "Includes full Orbito Creator-level access",
                    "Good entry point for new workflows",
                  ]}
                />
                <button
                  type="button"
                  onClick={() => startCheckout("labs_spark")}
                  disabled={startingCheckout !== null}
                  className={cn(
                    "btn-clipforge mt-auto inline-flex h-11 w-full items-center justify-center whitespace-nowrap px-3 text-center text-sm font-semibold leading-none",
                    startingCheckout ? "cursor-not-allowed opacity-80" : ""
                  )}
                >
                  {startingCheckout === "labs_spark" ? "Opening Checkout..." : "Choose Generate Starter"}
                </button>
                <BenefitsDisclosure
                  open={openBenefits.labsSpark}
                  onToggle={() => toggleBenefits("labsSpark")}
                  items={benefits.labsSpark}
                />
              </div>
            </div>

            <div className="group surface relative min-h-[560px] overflow-hidden border border-amber-300/28 p-4">
              <GlowLayer family="labs" />
              <div className="relative flex h-full flex-col">
                <FamilyPill label="Orbito Generate" tone="labs" />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xl font-semibold text-white/94">Generate Creator</div>
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.12] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                    Scale
                  </span>
                </div>
                <div className="mt-1 min-h-[20px] text-xs text-white/52">For heavier AI generation volume, higher quality lanes, and faster iteration.</div>
                {mode === "yearly" ? (
                  <PriceRow
                    amount={`$${formatMoney(labsCreatorYearlyScaledMonthly)}`}
                    suffix="/mo"
                    strike={`$${formatMoney(labsCreatorMonthlyScaledPrice)}`}
                    glowTone="labs"
                  />
                ) : (
                  <PriceRow amount={`$${formatMoney(labsCreatorMonthlyScaledPrice)}`} suffix="/mo" />
                )}
                <div className="mt-2 min-h-[20px] text-xs text-white/50">
                  {mode === "yearly" ? `Billed yearly ($${formatMoney(labsCreatorYearlyTotal)})` : "Billed monthly"}
                </div>
                <Bullets
                  items={[
                    `${formatInt(labsCreatorCredits)} Generate credits ${mode === "yearly" ? "/ year upfront" : "/ month"}`,
                    "HD + 4K generation lanes",
                    "Includes Orbito Creator-level access",
                    `Credit scale applied: ${creditScale}x`,
                  ]}
                />
                <button
                  type="button"
                  onClick={() => startCheckout("labs_velocity")}
                  disabled={startingCheckout !== null}
                  className={cn(
                    "btn-clipforge mt-auto inline-flex h-11 w-full items-center justify-center whitespace-nowrap px-3 text-center text-sm font-semibold leading-none",
                    startingCheckout ? "cursor-not-allowed opacity-80" : ""
                  )}
                >
                  {startingCheckout === "labs_velocity" ? "Opening Checkout..." : "Choose Generate Creator"}
                </button>
                <BenefitsDisclosure
                  open={openBenefits.labsVelocity}
                  onToggle={() => toggleBenefits("labsVelocity")}
                  items={benefits.labsVelocity}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 surface-soft rounded-2xl p-5 sm:p-6">
          <h2 className="text-2xl font-semibold tracking-tight text-white/90">Simple rule set</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-3 text-sm text-cyan-100/95">
              Orbito plans cover clipping + publishing.
            </div>
            <div className="rounded-xl border border-amber-300/24 bg-amber-300/[0.09] px-4 py-3 text-sm text-amber-100/95">
              Every Generate plan includes full Orbito Creator-level access.
            </div>
            <div className="rounded-xl border border-indigo-300/20 bg-indigo-300/[0.1] px-4 py-3 text-sm text-indigo-100/95">
              Generate Creator unlocks the highest generation throughput.
            </div>
          </div>
        </section>

        <section className="mt-10 surface rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white/92">Everything at a glance</h2>
              <p className="mt-2 text-sm text-white/62">
                Side-by-side view of access, credits, and capabilities across all plans.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/62">
              Showing: {mode} • scale {creditScale}x
            </div>
          </div>

          <div className="mt-6 -mx-3 overflow-x-auto px-3">
            <div className="min-w-[980px] rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="grid grid-cols-6 gap-3 pb-3 text-xs text-white/52">
                <div className="text-white/65">Feature</div>
                <div>Trial</div>
                <div>Orbito Starter</div>
                <div>Orbito Creator</div>
                <div>Generate Starter</div>
                <div>Generate Creator</div>
              </div>
              <div className="h-px bg-white/10" />

              <CompareRow
                label="Orbito access"
                trial="Included"
                orbitoStarter="Included"
                orbitoCreator="Included"
                labsSpark="Included"
                labsVelocity="Included"
              />
              <div className="h-px bg-white/10" />
              <CompareRow
                label="Generate mode"
                trial="Included"
                orbitoStarter="-"
                orbitoCreator="-"
                labsSpark="Included"
                labsVelocity="Included"
              />
              <div className="h-px bg-white/10" />
              <CompareRow
                label="Orbito credits"
                trial={`${formatInt(sharedTrialCredits)} shared`}
                orbitoStarter={`${formatInt(orbitoStarterCredits)}/mo`}
                orbitoCreator={`${formatInt(orbitoCreatorCredits)} ${mode === "yearly" ? "/yr" : "/mo"}`}
                labsSpark="Included access"
                labsVelocity="Included access"
              />
              <div className="h-px bg-white/10" />
              <CompareRow
                label="Generate credits"
                trial={`${formatInt(sharedTrialCredits)} shared`}
                orbitoStarter="-"
                orbitoCreator="-"
                labsSpark={`${formatInt(labsStarterCredits)}/mo`}
                labsVelocity={`${formatInt(labsCreatorCredits)} ${mode === "yearly" ? "/yr" : "/mo"}`}
              />
              <div className="h-px bg-white/10" />
              <CompareRow
                label="4K generation lanes"
                trial="-"
                orbitoStarter="-"
                orbitoCreator="-"
                labsSpark="-"
                labsVelocity="Yes"
              />
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
