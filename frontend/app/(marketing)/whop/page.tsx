import Link from "next/link";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Monetize with Whop | Orbito",
  description:
    "Create in Orbito, then use Whop as an optional third-party monetization partner when it fits your workflow.",
  alternates: {
    canonical: "/whop",
  },
};

const ACTUAL_WHOP_URL = "https://www.whop.com/discover/app/app_QRxsQodZgK1r4D/";

const lanes = [
  {
    title: "Create inside Orbito",
    text: "Clip long videos or generate new AI videos first. Monetization should not distract from the core product value.",
  },
  {
    title: "Join the right campaigns",
    text: "Open Whop when you want an optional earnings channel and choose campaigns that match your audience and posting style.",
  },
  {
    title: "Keep one workflow",
    text: "Use Orbito for creation and publishing, then use Whop for campaign discovery and payout tracking.",
  },
];

const boundaries = [
  {
    title: "What Orbito handles",
    text: "Clipping, AI generation, editing, captions, formatting, and publishing workflows for short-form content.",
  },
  {
    title: "What Whop handles",
    text: "Campaign listings, sponsor terms, reward rules, and payout processing on a third-party platform.",
  },
  {
    title: "What stays clear",
    text: "Orbito is the creation platform. Whop is the optional monetization partner. Users should understand the difference immediately.",
  },
];

export default function WhopPage() {
  const footerLinks = [
    { label: "How it works", href: "/#how-it-works" },
    { label: "Pricing", href: "/pricing" },
    { label: "Contact", href: "/contact" },
    { label: "Privacy", href: "/privacy-policy" },
    { label: "Terms", href: "/terms-of-service" },
  ];

  return (
    <div className="relative overflow-x-hidden">
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        <section className="surface relative overflow-hidden p-6 sm:p-8 md:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(850px 440px at 18% 16%, rgba(255,183,3,0.20), transparent 68%), radial-gradient(960px 520px at 84% 26%, rgba(251,86,7,0.14), transparent 70%), radial-gradient(760px 440px at 50% 92%, rgba(58,134,255,0.10), transparent 72%)",
            }}
          />

          <div className="relative z-[1] grid gap-8 lg:grid-cols-[1fr_0.92fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                <span>Optional partner</span>
                <span className="whop-word font-semibold">Whop</span>
              </div>

              <h1 className="mt-5 text-3xl font-semibold leading-[1.08] tracking-tight text-white/95 sm:text-5xl">
                Create in Orbito. Monetize through <span className="whop-word">Whop</span> when it fits.
              </h1>

              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/72 sm:text-base">
                Orbito stays focused on creation: clip long videos, generate new AI videos, and publish faster. Whop is an optional
                third-party partner you can use later if you want campaign-based earnings.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link href="/app" className="btn-orbito-cta">
                  Open Orbito
                </Link>
                <a href={ACTUAL_WHOP_URL} target="_blank" rel="noreferrer" className="btn-whop">
                  Open <span className="whop-word">Whop</span>
                  <span aria-hidden="true">↗</span>
                </a>
                <Link href="/pricing" className="btn-ghost">
                  View pricing
                </Link>
              </div>

              <p className="mt-4 text-xs text-white/55">
                Whop is a third-party platform and is not owned or operated by Orbito. Campaign terms, rates, and payouts are set by
                Whop and campaign sponsors.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="surface-soft p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Core product</div>
                <div className="mt-3 text-lg font-semibold text-white/92">Orbito is where the content gets made.</div>
                <div className="mt-3 text-sm leading-relaxed text-white/66">
                  Use Clip mode for long-form footage or Generate for prompt-to-video output. Both stay inside the same short-form
                  workflow.
                </div>
              </div>
              <div className="surface-soft p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Partner channel</div>
                <div className="mt-3 text-lg font-semibold text-white/92">Whop is there when you want to monetize.</div>
                <div className="mt-3 text-sm leading-relaxed text-white/66">
                  Join campaigns, review payout terms, and add a monetization layer after your content engine is already working.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mt-7 grid gap-4 md:grid-cols-3">
          {lanes.map((lane) => (
            <article key={lane.title} className="surface-soft p-5">
              <h2 className="text-lg font-semibold tracking-tight text-white/92">{lane.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/68">{lane.text}</p>
            </article>
          ))}
        </section>

        <section className="mt-7 surface-soft p-6 sm:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/66">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
              <span>Clear roles</span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
              Keep the creation workflow inside Orbito.
            </h2>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {boundaries.map((item) => (
              <article key={item.title} className="surface-inset p-5">
                <h3 className="text-lg font-semibold text-white/92">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/68">{item.text}</p>
              </article>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link href="/" className="btn-orbito-cta">
              Back to Orbito
            </Link>
            <a href={ACTUAL_WHOP_URL} target="_blank" rel="noreferrer" className="btn-whop">
              Open <span className="whop-word">Whop</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>

        <footer className="pb-10 pt-16 text-xs text-white/50 sm:pt-20">
          <div className="mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>© 2026 • {BRAND.name} by Sakib LLC. All rights reserved.</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {footerLinks.map((item) => (
                <a key={item.href} href={item.href} className="hover:text-white/75">
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
