"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { apiFetch } from "@/lib/api";
import { SocialBrandRow } from "@/components/SocialBrand";

type BillingMode = "monthly" | "yearly";
type OrbitoCheckoutPlan = "free" | "starter" | "creator";
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
}: {
  amount: string;
  suffix: string;
  strike?: string;
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
        <div className="text-4xl font-semibold tracking-tight sm:text-5xl">{amount}</div>
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
          "rounded-full px-4 py-2 text-sm transition",
          mode === "monthly" ? "bg-white text-black" : "text-white/70 hover:text-white"
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => setMode("yearly")}
        className={cn(
          "rounded-full px-4 py-2 text-sm transition",
          mode === "yearly" ? "bg-white text-black" : "text-white/70 hover:text-white"
        )}
      >
        Yearly
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

export default function Page() {
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<BillingMode>("yearly");
  const [creditScale, setCreditScale] = useState(1);
  const [startingCheckout, setStartingCheckout] = useState<null | OrbitoCheckoutPlan>(null);
  const [openBenefits, setOpenBenefits] = useState<Record<BenefitsKey, boolean>>({
    trial: false,
    orbitoStarter: false,
    orbitoCreator: false,
    labsSpark: false,
    labsVelocity: false,
  });

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

  async function startOrbitoCheckout(plan: OrbitoCheckoutPlan) {
    const ok = await requireAuthOrRedirect();
    if (!ok) return;
    try {
      setStartingCheckout(plan);
      const interval = plan === "creator" ? mode : "monthly";
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
  const labsCreatorYearlyScaledMonthly = labsCreatorMonthlyScaledPrice * 0.8;
  const labsCreatorYearlyTotal = Math.round(labsCreatorYearlyScaledMonthly * 12);
  const labsCreatorCredits =
    (mode === "yearly" ? 11880 : 990) * creditScale;

  const labsStarterHref = "/#standard";
  const labsCreatorHref = "/#standard";
  const toggleBenefits = (key: BenefitsKey) =>
    setOpenBenefits((prev) => ({ ...prev, [key]: !prev[key] }));

  const benefits = useMemo(
    () => ({
      trial: [
        "Test Orbito and Labs from one account",
        "No commitment required",
        "Understand your workflow before upgrade",
      ],
      orbitoStarter: [
        "Best for solo clipping and weekly posting",
        "Predictable monthly spend",
        "Clean path to Orbito Creator",
      ],
      orbitoCreator: [
        "Scaled clipping pipeline for daily output",
        "Faster turnaround and advanced publishing",
        "Yearly saves on effective monthly price",
      ],
      labsSpark: [
        "Prompt-to-media generation with Labs credits",
        "Access to Orbito workspace included",
        "Good entry point for AI content testing",
      ],
      labsVelocity: [
        "Higher generation throughput and quality lanes",
        "Designed for routine AI post production",
        "Can be scaled with the credit slider",
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
      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs text-white/50">• Plans + Credits Engine</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-6xl">
              <span className="grad-text">Orbito</span>{" "}
              <span className="text-white/70">+</span>{" "}
              <span className="bg-[linear-gradient(90deg,rgba(255,183,3,1),rgba(251,86,7,1),rgba(58,134,255,1))] bg-clip-text text-transparent">
                Labs
              </span>{" "}
              <span className="text-white/94">Plans</span>
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-white/66 sm:text-base">
              Clean pricing, creative workflows, and one upgrade path. All Labs plans include Orbito access by default.
            </p>
            <div className="mt-4">
              <SocialBrandRow platforms={["youtube", "tiktok", "reels"]} />
            </div>
          </div>
          <ModeToggle mode={mode} setMode={setMode} />
        </div>

        <div className="mt-7 surface-soft rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium text-white/88">Credit scaling system</div>
              <div className="text-xs text-white/56">
                Scale Creator and Labs Velocity throughput from 1x to 8x without changing your plan structure.
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
            <div className="relative grid gap-6 lg:grid-cols-12 lg:items-stretch">
              <div className="lg:col-span-8">
                <FamilyPill label="Free Trial" tone="neutral" />
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="text-2xl font-semibold text-white/92 sm:text-3xl">Free Trial</div>
                  <div className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-xs text-white/75">
                    {formatInt(sharedTrialCredits)} shared credits
                  </div>
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <div className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">$0</div>
                  <div className="pb-2 text-sm text-white/55">/trial</div>
                </div>
                <p className="mt-3 max-w-2xl text-sm text-white/68 sm:text-base">
                  Start with one account across Orbito and Labs, then upgrade only when you need more throughput.
                </p>

                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {[
                    "Clip long videos with Orbito",
                    "Generate AI media in Labs",
                    "Use one shared credit pool",
                    "Keep one publish workflow",
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white/75"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full lg:col-span-4">
                <div className="flex h-full flex-col rounded-2xl border border-white/14 bg-black/25 p-4">
                  <div className="text-[11px] uppercase tracking-[0.08em] text-white/55">Start here</div>
                  <div className="mt-2 text-sm font-semibold text-white/88">Test full workflow before paying</div>
                  <div className="mt-1 text-xs leading-relaxed text-white/62">
                    Validate clipping quality, generation speed, and publish flow in one workspace.
                  </div>

                  <button
                    type="button"
                    onClick={() => startOrbitoCheckout("free")}
                    disabled={startingCheckout !== null}
                    className={cn(
                      "btn-orbito-cta mt-4 inline-flex h-11 w-full items-center justify-center whitespace-nowrap px-3 text-center text-sm font-semibold leading-none",
                      startingCheckout ? "cursor-not-allowed opacity-80" : ""
                    )}
                  >
                    {startingCheckout === "free" ? "Opening Checkout..." : "Start Free Trial"}
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

        <div className="mt-4 grid auto-rows-fr gap-4 lg:grid-cols-4">
          <div className="group surface relative min-h-[560px] overflow-hidden border border-cyan-300/22 p-4">
            <GlowLayer family="orbito" />
            <div className="relative flex h-full flex-col">
              <FamilyPill label="Orbito" tone="orbito" />
              <div className="mt-3 text-xl font-semibold text-white/94">Orbito Starter</div>
              <div className="mt-1 min-h-[20px] text-xs text-white/52">&nbsp;</div>
              <PriceRow amount={`$${formatMoney(orbitoStarterMonthlyPrice)}`} suffix="/mo" />
              <div className="mt-2 min-h-[20px] text-xs text-white/50">&nbsp;</div>
              <Bullets
                items={[
                  `${formatInt(orbitoStarterCredits)} Orbito credits / month`,
                  "Core clipping, editing, publishing",
                  "Starter posting limits",
                  "Monthly billing",
                ]}
              />
              <button
                type="button"
                onClick={() => startOrbitoCheckout("starter")}
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
              <FamilyPill label="Orbito" tone="orbito" />
              <div className="mt-3 text-xl font-semibold text-white/94">Orbito Creator</div>
              <div className="mt-1 min-h-[20px] text-xs text-white/52">&nbsp;</div>
              {mode === "yearly" ? (
                <PriceRow
                  amount={`$${formatMoney(orbitoCreatorYearlyScaledMonthly)}`}
                  suffix="/mo"
                  strike={`$${formatMoney(orbitoCreatorMonthlyScaledPrice)}`}
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
                onClick={() => startOrbitoCheckout("creator")}
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

          <div className="group surface relative min-h-[560px] overflow-hidden border border-amber-300/24 p-4">
            <GlowLayer family="labs" />
            <div className="relative flex h-full flex-col">
              <FamilyPill label="Orbito Labs" tone="labs" />
              <div className="mt-3 text-xl font-semibold text-white/94">Labs Spark</div>
              <div className="mt-1 min-h-[20px] text-xs text-white/52">Renamed from Labs Starter</div>
              <PriceRow amount={`$${formatMoney(labsStarterMonthlyPrice)}`} suffix="/mo" />
              <div className="mt-2 min-h-[20px] text-xs text-white/50">&nbsp;</div>
              <Bullets
                items={[
                  `${formatInt(labsStarterCredits)} Labs credits / month`,
                  "Prompt-to-image/video/voice generation",
                  "Includes Orbito access by default",
                  "Monthly billing",
                ]}
              />
              <Link
                href={labsStarterHref}
                className="btn-clipforge mt-auto inline-flex h-11 w-full items-center justify-center whitespace-nowrap px-3 text-center text-sm font-semibold leading-none"
              >
                Choose Labs Spark
              </Link>
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
              <FamilyPill label="Orbito Labs" tone="labs" />
              <div className="mt-3 text-xl font-semibold text-white/94">Labs Velocity</div>
              <div className="mt-1 min-h-[20px] text-xs text-white/52">Renamed from Labs Creator</div>
              {mode === "yearly" ? (
                <PriceRow
                  amount={`$${formatMoney(labsCreatorYearlyScaledMonthly)}`}
                  suffix="/mo"
                  strike={`$${formatMoney(labsCreatorMonthlyScaledPrice)}`}
                />
              ) : (
                <PriceRow amount={`$${formatMoney(labsCreatorMonthlyScaledPrice)}`} suffix="/mo" />
              )}
              <div className="mt-2 min-h-[20px] text-xs text-white/50">
                {mode === "yearly" ? `Billed yearly ($${formatMoney(labsCreatorYearlyTotal)})` : "Billed monthly"}
              </div>
              <Bullets
                items={[
                  `${formatInt(labsCreatorCredits)} Labs credits ${mode === "yearly" ? "/ year upfront" : "/ month"}`,
                  "HD + 4K generation lanes",
                  "Includes Orbito Creator-level access",
                  `Credit scale applied: ${creditScale}x`,
                ]}
              />
              <Link
                href={labsCreatorHref}
                className="btn-clipforge mt-auto inline-flex h-11 w-full items-center justify-center whitespace-nowrap px-3 text-center text-sm font-semibold leading-none"
              >
                Choose Labs Velocity
              </Link>
              <BenefitsDisclosure
                open={openBenefits.labsVelocity}
                onToggle={() => toggleBenefits("labsVelocity")}
                items={benefits.labsVelocity}
              />
            </div>
          </div>
        </div>

        <section className="mt-10 surface-soft rounded-2xl p-5 sm:p-6">
          <div className="text-xs text-white/50">• Access logic</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white/90">Simple rule set</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-3 text-sm text-cyan-100/95">
              Orbito plans cover clipping + publishing.
            </div>
            <div className="rounded-xl border border-amber-300/24 bg-amber-300/[0.09] px-4 py-3 text-sm text-amber-100/95">
              Every Labs plan includes Orbito access.
            </div>
            <div className="rounded-xl border border-indigo-300/20 bg-indigo-300/[0.1] px-4 py-3 text-sm text-indigo-100/95">
              Labs Velocity unlocks the highest generation throughput.
            </div>
          </div>
        </section>

        <section className="mt-10 surface rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs text-white/50">• Compare included features</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white/92">Everything at a glance</h2>
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
                <div>Labs Spark</div>
                <div>Labs Velocity</div>
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
                label="Labs generation"
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
                label="Labs credits"
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
