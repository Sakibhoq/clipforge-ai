"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { apiFetch } from "@/lib/api";
import { SocialBrandRow } from "@/components/SocialBrand";

type BillingMode = "monthly" | "yearly";
type OrbitoCheckoutPlan = "free" | "starter" | "creator";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatMoney(n: number) {
  const fixed = n.toFixed(2);
  return fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed;
}

function GlowLayer({ orbito }: { orbito: boolean }) {
  const background = orbito
    ? "radial-gradient(520px 260px at 15% 12%, rgba(155,140,255,0.24), transparent 66%), radial-gradient(520px 260px at 82% 35%, rgba(70,215,255,0.20), transparent 66%), radial-gradient(520px 280px at 48% 95%, rgba(53,242,166,0.16), transparent 68%)"
    : "radial-gradient(520px 260px at 15% 12%, rgba(255,183,3,0.22), transparent 66%), radial-gradient(520px 260px at 82% 35%, rgba(251,86,7,0.20), transparent 66%), radial-gradient(520px 280px at 48% 95%, rgba(58,134,255,0.16), transparent 68%)";
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -inset-10 opacity-75"
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
      {strike ? (
        <div className="text-sm text-white/45 line-through decoration-white/35">{strike}</div>
      ) : null}
      <div className="mt-1 flex items-end gap-2">
        <div className="text-4xl font-semibold tracking-tight sm:text-5xl">{amount}</div>
        <div className="pb-2 text-sm text-white/55">{suffix}</div>
      </div>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2 text-sm text-white/72">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <span className="mt-[0.42rem] h-1.5 w-1.5 rounded-full bg-white/45" />
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
  setMode: (next: BillingMode) => void;
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

export default function Page() {
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<BillingMode>("yearly");
  const [startingCheckout, setStartingCheckout] = useState<null | OrbitoCheckoutPlan>(null);

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
    if (lower.includes("stripe not configured")) {
      return "Checkout is not configured yet. Please try again shortly.";
    }
    if (lower.includes("price not configured") || lower.includes("no such price")) {
      return "Pricing is not configured yet. Contact support.";
    }
    if (status === 401) {
      return "Your session expired. Please sign in again.";
    }
    if (detailStr) return detailStr;
    return "Checkout is temporarily unavailable. Please try again.";
  }

  async function startOrbitoCheckout(plan: OrbitoCheckoutPlan) {
    const ok = await requireAuthOrRedirect();
    if (!ok) return;
    try {
      setStartingCheckout(plan);
      const interval = plan === "creator" ? mode : "monthly";
      const payload = { plan, interval };
      const data = (await apiFetch("/billing/checkout-session", {
        method: "POST",
        body: payload,
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

  const orbitoStarterMonthly = 10;
  const orbitoCreatorMonthly = 20;
  const orbitoCreatorYearlyMonthly = orbitoCreatorMonthly * 0.75;
  const orbitoCreatorYearlyTotal = Math.round(orbitoCreatorYearlyMonthly * 12);

  const labsStarterMonthly = 39;
  const labsCreatorMonthly = 99;
  const labsCreatorYearlyMonthly = labsCreatorMonthly * 0.8;
  const labsCreatorYearlyTotal = Math.round(labsCreatorYearlyMonthly * 12);

  const orbitoCreatorCredits = mode === "yearly" ? 3600 : 300;
  const labsCreatorCredits = mode === "yearly" ? 11880 : 990;

  const labsStarterHref = "/app/labs/app/billing?source=pricing&plan=starter";
  const labsCreatorHref = `/app/labs/app/billing?source=pricing&plan=creator&interval=${mode}`;

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
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(980px_620px_at_50%_8%,rgba(255,255,255,0.06),transparent_65%)]" />
        <div className="absolute inset-0 opacity-[0.50]">
          <div className="aurora" />
        </div>
      </div>

      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs text-white/50">• Unified pricing</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-6xl">
              Orbito + Orbito Labs. <span className="grad-text">One pricing surface.</span>
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-white/65 sm:text-base">
              Pick an Orbito plan, a Labs plan, or Full Access. Orbito and Labs credits are separate by
              default and combine only on Full Access.
            </p>
            <div className="mt-4">
              <SocialBrandRow platforms={["youtube", "tiktok", "reels"]} />
            </div>
          </div>
          <ModeToggle mode={mode} setMode={setMode} />
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/62">
          Creator cards use {mode} pricing. Starter cards stay monthly.
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="group surface relative overflow-hidden p-5 sm:p-6">
            <div className="relative">
              <div className="text-xs uppercase tracking-[0.12em] text-white/50">Unified Trial</div>
              <div className="mt-2 text-xl font-semibold text-white/90">Orbito + Labs Free Trial</div>
              <PriceRow amount="$0" suffix="/trial" />
              <Bullets
                items={[
                  "Orbito trial credits: 60",
                  "Labs trial credits: 75",
                  "Try clipping + AI generation",
                  "Upgrade to unlock full posting volume",
                ]}
              />
              <button
                type="button"
                onClick={() => startOrbitoCheckout("free")}
                disabled={startingCheckout !== null}
                className={cn(
                  "btn-orbito-cta mt-6 w-full",
                  startingCheckout ? "cursor-not-allowed opacity-80" : ""
                )}
              >
                {startingCheckout === "free" ? "Opening Checkout..." : "Start Free Trial"}
              </button>
            </div>
          </div>

          <div className="group surface relative overflow-hidden border border-cyan-300/20 p-5 sm:p-6">
            <GlowLayer orbito />
            <div className="relative">
              <div className="text-xs uppercase tracking-[0.12em] text-cyan-200/75">Orbito</div>
              <div className="mt-2 text-xl font-semibold text-white/92">Orbito Starter</div>
              <PriceRow amount={`$${formatMoney(orbitoStarterMonthly)}`} suffix="/mo" />
              <Bullets
                items={[
                  "150 Orbito credits / month",
                  "Clip + edit + schedule workflow",
                  "Starter publishing limits",
                  "Monthly only",
                ]}
              />
              <button
                type="button"
                onClick={() => startOrbitoCheckout("starter")}
                disabled={startingCheckout !== null}
                className={cn(
                  "btn-orbito-cta mt-6 w-full",
                  startingCheckout ? "cursor-not-allowed opacity-80" : ""
                )}
              >
                {startingCheckout === "starter" ? "Opening Checkout..." : "Choose Orbito Starter"}
              </button>
            </div>
          </div>

          <div className="group surface relative overflow-hidden border border-amber-300/25 p-5 sm:p-6">
            <GlowLayer orbito={false} />
            <div className="relative">
              <div className="text-xs uppercase tracking-[0.12em] text-amber-200/80">Orbito Labs</div>
              <div className="mt-2 text-xl font-semibold text-white/92">Labs Starter</div>
              <PriceRow amount={`$${formatMoney(labsStarterMonthly)}`} suffix="/mo" />
              <Bullets
                items={[
                  "390 Labs credits / month",
                  "1-minute AI post generation",
                  "Image/video/voice pipelines",
                  "Monthly only",
                ]}
              />
              <Link href={labsStarterHref} className="btn-clipforge mt-6 w-full text-center">
                Choose Labs Starter
              </Link>
            </div>
          </div>

          <div className="group surface relative overflow-hidden border border-cyan-300/25 p-5 sm:p-6">
            <GlowLayer orbito />
            <div className="relative">
              <div className="inline-flex rounded-full border border-cyan-200/35 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-100">
                Popular
              </div>
              <div className="mt-3 text-xs uppercase tracking-[0.12em] text-cyan-200/75">Orbito</div>
              <div className="mt-2 text-xl font-semibold text-white/92">Orbito Creator</div>
              {mode === "yearly" ? (
                <PriceRow
                  amount={`$${formatMoney(orbitoCreatorYearlyMonthly)}`}
                  suffix="/mo"
                  strike={`$${formatMoney(orbitoCreatorMonthly)}`}
                />
              ) : (
                <PriceRow amount={`$${formatMoney(orbitoCreatorMonthly)}`} suffix="/mo" />
              )}
              <div className="mt-2 text-xs text-white/50">
                {mode === "yearly" ? `Billed yearly ($${orbitoCreatorYearlyTotal})` : "Billed monthly"}
              </div>
              <Bullets
                items={[
                  `${orbitoCreatorCredits} Orbito credits ${mode === "yearly" ? "/ year upfront" : "/ month"}`,
                  "Priority clipping + exports",
                  "Advanced posting lanes",
                  "Unlimited downloads",
                ]}
              />
              <button
                type="button"
                onClick={() => startOrbitoCheckout("creator")}
                disabled={startingCheckout !== null}
                className={cn(
                  "btn-orbito-cta mt-6 w-full",
                  startingCheckout ? "cursor-not-allowed opacity-80" : ""
                )}
              >
                {startingCheckout === "creator" ? "Opening Checkout..." : "Choose Orbito Creator"}
              </button>
            </div>
          </div>

          <div className="group surface relative overflow-hidden border border-amber-300/25 p-5 sm:p-6">
            <GlowLayer orbito={false} />
            <div className="relative">
              <div className="text-xs uppercase tracking-[0.12em] text-amber-200/80">Orbito Labs</div>
              <div className="mt-2 text-xl font-semibold text-white/92">Labs Creator</div>
              {mode === "yearly" ? (
                <PriceRow
                  amount={`$${formatMoney(labsCreatorYearlyMonthly)}`}
                  suffix="/mo"
                  strike={`$${formatMoney(labsCreatorMonthly)}`}
                />
              ) : (
                <PriceRow amount={`$${formatMoney(labsCreatorMonthly)}`} suffix="/mo" />
              )}
              <div className="mt-2 text-xs text-white/50">
                {mode === "yearly" ? `Billed yearly ($${labsCreatorYearlyTotal})` : "Billed monthly"}
              </div>
              <Bullets
                items={[
                  `${labsCreatorCredits} Labs credits ${mode === "yearly" ? "/ year upfront" : "/ month"}`,
                  "HD + 4K generation lanes",
                  "Faster queue priority",
                  "Advanced AI post pipeline",
                ]}
              />
              <Link href={labsCreatorHref} className="btn-clipforge mt-6 w-full text-center">
                Choose Labs Creator
              </Link>
            </div>
          </div>

          <div className="group surface relative overflow-hidden border border-white/20 bg-white/[0.05] p-5 sm:p-6">
            <div className="relative">
              <div className="text-xs uppercase tracking-[0.12em] text-white/60">Bundle</div>
              <div className="mt-2 text-xl font-semibold text-white/94">Full Access</div>
              <PriceRow amount="Custom" suffix="" />
              <Bullets
                items={[
                  "Orbito + Labs under one commercial plan",
                  "Unified access strategy for both products",
                  "Bundled credit model and custom limits",
                  "Priority onboarding and support",
                ]}
              />
              <Link href="/contact?plan=full-access" className="btn-ghost mt-6 w-full text-center">
                Request Full Access
              </Link>
            </div>
          </div>
        </div>

        <section className="mt-10 surface-soft rounded-2xl p-5 sm:p-6">
          <div className="text-xs text-white/50">• Credit system</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white/90">How credits work now</h2>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-white/78">
              Orbito plans spend Orbito credits.
            </div>
            <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-4 py-3 text-white/78">
              Labs plans spend Labs credits.
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white/70 md:col-span-2">
              Full Access can combine access and bundled credit strategy.
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
