import Link from "next/link";
import type { Metadata } from "next";
import { SocialBrandRow } from "@/components/SocialBrand";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Monetize with Whop | Orbito",
  description:
    "Create clips in Orbito, publish them, and monetize through Whop campaigns. Whop is a third-party platform.",
  alternates: {
    canonical: "/whop",
  },
};

const stats = [
  { value: "842+", label: "Live campaigns" },
  { value: "$0.50-$20", label: "Per 1,000 views" },
  { value: "$100M+", label: "Paid out to creators" },
];

const steps = [
  {
    icon: "🎬",
    title: "Create clips",
    text: "Use Orbito to turn long videos into short clips built for discovery.",
  },
  {
    icon: "💼",
    title: "Join campaigns",
    text: "Pick reward campaigns on Whop that match your niche and posting style.",
  },
  {
    icon: "💸",
    title: "Get paid",
    text: "Publish your content and earn when campaign requirements are met.",
  },
];

export default function WhopPage() {
  return (
    <div className="relative overflow-x-hidden">
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        <section className="surface relative overflow-hidden p-6 sm:p-8 md:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(850px 440px at 18% 16%, rgba(255,183,3,0.20), transparent 68%), radial-gradient(960px 520px at 84% 26%, rgba(251,86,7,0.18), transparent 70%), radial-gradient(760px 440px at 50% 92%, rgba(58,134,255,0.14), transparent 72%)",
            }}
          />

          <div className="relative z-[1]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
              <span>Monetize with</span>
              <span className="whop-word font-semibold">Whop</span>
            </div>

            <h1 className="mt-5 text-3xl font-semibold leading-[1.08] tracking-tight text-white/95 sm:text-5xl">
              Monetize your clips with <span className="whop-word">Whop</span>
            </h1>

            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/72 sm:text-base">
              Turn your Orbito clips into campaign-ready content and earn through Whop rewards.
              Build once, publish across platforms, then track payout opportunities in one workflow.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={BRAND.whopUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-whop"
              >
                Start earning on <span className="whop-word">Whop</span>
                <span aria-hidden="true">↗</span>
              </a>
              <Link href="/pricing" className="btn-ghost">
                View pricing
              </Link>
            </div>

            <p className="mt-4 text-xs text-white/55">
              Whop is a third-party platform and is not owned or operated by Orbito.
              Campaign terms, rates, and payouts are set by Whop and campaign sponsors.
            </p>
          </div>
        </section>

        <section className="mt-7 grid gap-4 md:grid-cols-3">
          {stats.map((item) => (
            <article key={item.label} className="surface-soft p-5 text-center">
              <div className="text-3xl font-semibold text-[#ff944a]">{item.value}</div>
              <div className="mt-2 text-sm text-white/70">{item.label}</div>
            </article>
          ))}
        </section>

        <section id="how-it-works" className="mt-7 surface-soft p-6 sm:p-8">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">How it works</h2>
            <div className="hidden sm:block">
              <SocialBrandRow platforms={["tiktok", "reels", "shorts", "facebook"]} compact />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {steps.map((step) => (
              <article key={step.title} className="surface-inset p-5">
                <div className="text-3xl" aria-hidden="true">
                  {step.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white/92">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/68">{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-7 surface-soft p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-white/95 sm:text-2xl">
            Keep your posting workflow inside Orbito
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/72 sm:text-[15px]">
            Orbito handles clipping, formatting, and output. Whop handles campaign matching and payouts.
            You can move from idea to clip to monetization without rebuilding your process.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/app" className="btn-orbito-cta">
              Open Orbito Console
            </Link>
            <a
              href={BRAND.whopUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-whop"
            >
              Open <span className="whop-word">Whop</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
