"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { apiFetch } from "@/lib/api";
import { SocialBrandRow } from "@/components/SocialBrand";

export const dynamic = "force-dynamic";

type BillingMode = "monthly" | "yearly";
type CheckoutPlan = "free" | "starter" | "creator" | "labs_spark" | "labs_velocity";

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
    <div className="mt-5">
      {strike ? <div className="text-sm text-white/42 line-through">{strike}</div> : <div className="h-[20px]" />}
      <div className="mt-1 flex items-end gap-2">
        <div className="text-4xl font-semibold tracking-tight text-white/96 sm:text-5xl">{amount}</div>
        <div className="pb-2 text-sm text-white/54">{suffix}</div>
      </div>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-2 text-sm text-white/74">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <span className="mt-[0.42rem] h-1.5 w-1.5 rounded-full bg-white/50" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
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
        <span className="ml-2 rounded-full border border-emerald-300/60 bg-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-black">
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

function HeadingLine({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`heading-line mt-4 h-[3px] w-24 rounded-full bg-[linear-gradient(90deg,rgba(82,152,255,0.98),rgba(255,186,77,0.94),rgba(44,206,173,0.92))] shadow-[0_0_24px_rgba(82,152,255,0.24)] ${className}`}
    />
  );
}

function ChoiceCard({
  tone,
  title,
  text,
  href,
}: {
  tone: "orbito" | "labs";
  title: string;
  text: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "group rounded-[24px] border p-4 transition-all duration-200 hover:-translate-y-0.5",
        tone === "orbito"
          ? "border-cyan-300/18 bg-cyan-300/[0.08] hover:border-cyan-300/28"
          : "border-amber-300/18 bg-amber-300/[0.08] hover:border-amber-300/28"
      )}
    >
      <div className="text-lg font-semibold tracking-tight text-white/92">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-white/64">{text}</div>
      <div className="mt-4 text-sm font-medium text-white/82">See plans</div>
    </a>
  );
}

function PlanCard({
  family,
  eyebrow,
  title,
  subtitle,
  badge,
  amount,
  suffix,
  strike,
  billingLabel,
  facts,
  highlights,
  ctaClassName,
  ctaLabel,
  ctaLoadingLabel,
  ctaDisabled,
  ctaLoading,
  onChoose,
}: {
  family: "orbito" | "labs";
  eyebrow: string;
  title: string;
  subtitle: string;
  badge?: string;
  amount: string;
  suffix: string;
  strike?: string;
  billingLabel: string;
  facts: string[];
  highlights: string[];
  ctaClassName: string;
  ctaLabel: string;
  ctaLoadingLabel: string;
  ctaDisabled: boolean;
  ctaLoading: boolean;
  onChoose: () => void;
}) {
  return (
    <div
      className={cn(
        "motion-card relative overflow-hidden rounded-[32px] border bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]",
        family === "orbito" ? "border-cyan-300/20" : "border-amber-300/20"
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            family === "orbito"
              ? "radial-gradient(720px 220px at 14% 0%, rgba(82,152,255,0.10), transparent 60%), radial-gradient(520px 280px at 84% 18%, rgba(44,206,173,0.08), transparent 72%)"
              : "radial-gradient(720px 220px at 14% 0%, rgba(255,186,77,0.10), transparent 60%), radial-gradient(520px 280px at 84% 18%, rgba(251,86,7,0.08), transparent 72%)",
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <FamilyPill label={eyebrow} tone={family} />
            <div className="mt-3 text-[28px] font-semibold tracking-tight text-white/94">{title}</div>
            <div className="mt-2 max-w-md text-sm leading-relaxed text-white/64">{subtitle}</div>
          </div>
          {badge ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em]",
                family === "orbito"
                  ? "border-cyan-300/20 bg-cyan-300/[0.12] text-cyan-100"
                  : "border-amber-300/20 bg-amber-300/[0.12] text-amber-100"
              )}
            >
              {badge}
            </span>
          ) : null}
        </div>

        <PriceRow amount={amount} suffix={suffix} strike={strike} />
        <div className="mt-2 text-sm text-white/54">{billingLabel}</div>

        <div className="mt-5 flex flex-wrap gap-2">
          {facts.map((item) => (
            <div key={item} className="signal-chip">
              <span className="live-dot" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        <Bullets items={highlights} />

        <button
          type="button"
          onClick={onChoose}
          disabled={ctaDisabled}
          className={cn(
            `${ctaClassName} mt-6 inline-flex h-11 w-full items-center justify-center whitespace-nowrap px-3 text-center text-sm font-semibold leading-none`,
            ctaDisabled ? "cursor-not-allowed opacity-80" : ""
          )}
        >
          {ctaLoading ? ctaLoadingLabel : ctaLabel}
        </button>
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
  const orbitoCreatorCredits = (mode === "yearly" ? 3600 : 300) * creditScale;

  const labsStarterMonthlyPrice = 39;
  const labsStarterCredits = 390;

  const labsCreatorMonthlyBasePrice = 99;
  const labsCreatorMonthlyScaledPrice = labsCreatorMonthlyBasePrice * creditScale;
  const labsCreatorYearlyScaledMonthly = labsCreatorMonthlyScaledPrice * 0.75;
  const labsCreatorYearlyTotal = Math.round(labsCreatorYearlyScaledMonthly * 12);
  const labsCreatorCredits = (mode === "yearly" ? 11880 : 990) * creditScale;

  const freeTrialLocked = !meLoading && Boolean(me?.trial_used);

  const footerLinks = useMemo(
    () => [
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy-policy" },
      { label: "Terms", href: "/terms-of-service" },
    ],
    []
  );

  return (
    <div className="relative theme-merged">
      <section className="relative mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6">
        {trialLockNotice ? (
          <div className="mb-6 rounded-xl border border-amber-300/35 bg-amber-300/12 px-4 py-3 text-sm text-amber-100">
            {trialLockNotice}
          </div>
        ) : null}

        <section>
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div>
              <FamilyPill label="One account" tone="full" />
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white/95 sm:text-5xl md:text-6xl">
                Start free. Pick Clip or Generate when you are ready.
              </h1>
              <HeadingLine className="w-28" />
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/66 sm:text-base">
                Choose Clip if you already have a long video. Choose Generate if you want AI to make the video for you.
              </p>
              <div className="mt-5">
                <SocialBrandRow platforms={["youtube", "tiktok", "reels", "shorts"]} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Try both first", "Clear pricing", "Upgrade later"].map((item) => (
                  <div key={item} className="signal-chip">
                    <span className="live-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
                <div className="text-sm font-medium text-white/88">How to choose</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ChoiceCard
                    tone="orbito"
                    title="I already have a video"
                    text="Clip helps you find the best parts, add captions, and post them."
                    href="#clip-plans"
                  />
                  <ChoiceCard
                    tone="labs"
                    title="I only have an idea"
                    text="Generate makes the video with AI, then you can post it from the same account."
                    href="#generate-plans"
                  />
                </div>
              </div>

              <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-medium text-white/88">Pick how you want to pay</div>
                    <div className="text-xs text-white/56">Yearly saves 25%.</div>
                  </div>
                  <ModeToggle mode={mode} setMode={setMode} />
                </div>

                <div className="mt-5 rounded-[24px] border border-white/10 bg-black/24 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-sm font-medium text-white/88">Need more credits?</div>
                      <div className="text-xs text-white/56">Use the slider on bigger plans.</div>
                    </div>
                    <div className="signal-chip">{creditScale}x credits</div>
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
          </div>
        </section>

        <section className="pt-10">
          <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <FamilyPill label="Free trial" tone="neutral" />
                <div className="mt-3 text-3xl font-semibold tracking-tight text-white/92">Try both first.</div>
                <HeadingLine className="w-20" />
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/66 sm:text-base">
                  Start with {formatInt(sharedTrialCredits)} shared credits. See if Orbito fits your workflow before you pay.
                </p>
              </div>

              <div className="min-w-[280px] rounded-[24px] border border-white/14 bg-black/28 p-4">
                <div className="text-sm font-semibold text-white/88">Good if you are still trying it out</div>
                <div className="mt-2 text-sm leading-relaxed text-white/62">Use Clip and Generate first. Pick a paid plan later if you need more.</div>

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
                    ? "Opening checkout..."
                    : freeTrialLocked
                      ? "Trial already used"
                      : "Start free trial"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="clip-plans" className="pt-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <FamilyPill label="Clip" tone="orbito" />
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
                If you already have a long video
              </h2>
              <HeadingLine className="w-20" />
              <p className="mt-2 max-w-xl text-sm text-white/64 sm:text-base">
                Use Clip to find the best parts, clean them up, and get them ready to post.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2 lg:items-start">
            <PlanCard
              family="orbito"
              eyebrow="Clip"
              title="Starter"
              subtitle="A simple plan for one person making clips each week."
              amount={`$${formatMoney(orbitoStarterMonthlyPrice)}`}
              suffix="/mo"
              billingLabel="Pay monthly"
              facts={[
                `${formatInt(orbitoStarterCredits)} credits / mo`,
                "Best for weekly clips",
                "Simple monthly plan",
              ]}
              highlights={[
                "Turn long videos into short clips",
                "Edit, caption, and post from one place",
                "Good if you want a simple start",
              ]}
              ctaClassName="btn-orbito-cta"
              ctaLabel="Get Clip Starter"
              ctaLoadingLabel="Opening checkout..."
              ctaDisabled={startingCheckout !== null}
              ctaLoading={startingCheckout === "starter"}
              onChoose={() => startCheckout("starter")}
            />

            <PlanCard
              family="orbito"
              eyebrow="Clip"
              title="Creator"
              subtitle="More credits for people who post more often."
              badge="Most popular"
              amount={`$${formatMoney(mode === "yearly" ? orbitoCreatorYearlyScaledMonthly : orbitoCreatorMonthlyScaledPrice)}`}
              suffix="/mo"
              strike={mode === "yearly" ? `$${formatMoney(orbitoCreatorMonthlyScaledPrice)}` : undefined}
              billingLabel={mode === "yearly" ? `Pay yearly ($${formatMoney(orbitoCreatorYearlyTotal)})` : "Pay monthly"}
              facts={[
                `${formatInt(orbitoCreatorCredits)} credits / ${mode === "yearly" ? "yr" : "mo"}`,
                `${creditScale}x credits`,
                "Best for regular posting",
              ]}
              highlights={[
                "More room to make clips every day",
                "Faster exports and more output",
                "Good if short videos are part of your routine",
              ]}
              ctaClassName="btn-orbito-cta"
              ctaLabel="Get Clip Creator"
              ctaLoadingLabel="Opening checkout..."
              ctaDisabled={startingCheckout !== null}
              ctaLoading={startingCheckout === "creator"}
              onChoose={() => startCheckout("creator")}
            />
          </div>
        </section>

        <section id="generate-plans" className="pt-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <FamilyPill label="Generate" tone="labs" />
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
                If you want AI to make the video
              </h2>
              <HeadingLine className="w-20" />
              <p className="mt-2 max-w-xl text-sm text-white/64 sm:text-base">
                Use Generate when you want to start with an idea instead of raw footage.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2 lg:items-start">
            <PlanCard
              family="labs"
              eyebrow="Generate"
              title="Starter"
              subtitle="A good plan if you want to try AI video without going too big."
              amount={`$${formatMoney(labsStarterMonthlyPrice)}`}
              suffix="/mo"
              billingLabel="Pay monthly"
              facts={[
                `${formatInt(labsStarterCredits)} credits / mo`,
                "Includes Clip Creator",
                "Good for trying AI video",
              ]}
              highlights={[
                "Make AI videos, images, and voice",
                "Also includes the bigger Clip plan",
                "Good if you want to learn the tool first",
              ]}
              ctaClassName="btn-clipforge"
              ctaLabel="Get Generate Starter"
              ctaLoadingLabel="Opening checkout..."
              ctaDisabled={startingCheckout !== null}
              ctaLoading={startingCheckout === "labs_spark"}
              onChoose={() => startCheckout("labs_spark")}
            />

            <PlanCard
              family="labs"
              eyebrow="Generate"
              title="Creator"
              subtitle="More credits for people making AI videos often."
              badge="Scale"
              amount={`$${formatMoney(mode === "yearly" ? labsCreatorYearlyScaledMonthly : labsCreatorMonthlyScaledPrice)}`}
              suffix="/mo"
              strike={mode === "yearly" ? `$${formatMoney(labsCreatorMonthlyScaledPrice)}` : undefined}
              billingLabel={mode === "yearly" ? `Pay yearly ($${formatMoney(labsCreatorYearlyTotal)})` : "Pay monthly"}
              facts={[
                `${formatInt(labsCreatorCredits)} credits / ${mode === "yearly" ? "yr" : "mo"}`,
                `${creditScale}x credits`,
                "Includes Clip Creator",
              ]}
              highlights={[
                "Make more AI videos each month",
                "Use bigger credit packs on this plan",
                "Best if AI video is a regular part of your work",
              ]}
              ctaClassName="btn-clipforge"
              ctaLabel="Get Generate Creator"
              ctaLoadingLabel="Opening checkout..."
              ctaDisabled={startingCheckout !== null}
              ctaLoading={startingCheckout === "labs_velocity"}
              onChoose={() => startCheckout("labs_velocity")}
            />
          </div>
        </section>

        <section className="pt-12">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[24px] border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-4 text-sm leading-relaxed text-cyan-100/95">
              Clip is for long videos you already have.
            </div>
            <div className="rounded-[24px] border border-amber-300/24 bg-amber-300/[0.09] px-4 py-4 text-sm leading-relaxed text-amber-100/95">
              Generate is for ideas you want AI to turn into videos.
            </div>
            <div className="rounded-[24px] border border-indigo-300/20 bg-indigo-300/[0.10] px-4 py-4 text-sm leading-relaxed text-indigo-100/95">
              Bigger plans can scale credits with the slider above.
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
