import Link from "next/link";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Monetize with Whop | Orbito",
  description:
    "Make videos in Orbito, then use Whop later if you want to try earning from them.",
  alternates: {
    canonical: "/whop",
  },
};

const ACTUAL_WHOP_URL = "https://www.whop.com/discover/app/app_QRxsQodZgK1r4D/";

export default function WhopPage() {
  const footerLinks = [
    { label: "How it works", href: "/#how-it-works" },
    { label: "Pricing", href: "/pricing" },
    { label: "Contact", href: "/contact" },
    { label: "Privacy", href: "/privacy-policy" },
    { label: "Terms", href: "/terms-of-service" },
  ];

  return (
    <div className="theme-merged relative overflow-x-hidden">
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+4.5rem)]">
        <section className="studio-frame p-5 sm:p-7 md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(860px 440px at 18% 16%, rgba(255,183,3,0.18), transparent 68%), radial-gradient(920px 480px at 84% 24%, rgba(251,86,7,0.12), transparent 70%), radial-gradient(760px 440px at 50% 92%, rgba(58,134,255,0.10), transparent 72%)",
            }}
          />

          <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
            <div>
              <div className="signal-chip">
                <span className="live-dot" />
                <span>Extra option</span>
              </div>

              <h1 className="mt-4 text-3xl font-semibold leading-[1.06] tracking-tight text-white/95 sm:text-5xl">
                Make the video in Orbito. Use <span className="whop-word">Whop</span> later if you want.
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/72 sm:text-base">
                Orbito is for making videos. Whop is only there if you want to try earning from them.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link href="/app" className="btn-orbito-cta">
                  Open Orbito
                </Link>
                <a href={ACTUAL_WHOP_URL} target="_blank" rel="noreferrer" className="btn-whop">
                  Open <span className="whop-word">Whop</span>
                  <span aria-hidden="true">↗</span>
                </a>
                <Link href="/pricing" className="btn-ghost">
                  See pricing
                </Link>
              </div>

              <p className="mt-4 text-xs text-white/55">
                Whop is a different website. Whop and its sponsors decide the rules and payouts, not Orbito.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  title: "Make",
                  text: "Make clips or AI videos in Orbito.",
                },
                {
                  title: "Post",
                  text: "Get your videos ready for your channels.",
                },
                {
                  title: "Earn",
                  text: "Open Whop later if you want to try it.",
                },
              ].map((item) => (
                <div key={item.title} className="surface-soft motion-card p-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">{item.title}</div>
                  <div className="mt-2 text-lg font-semibold text-white/90">{item.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pt-6">
          <div className="studio-frame p-5 sm:p-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="signal-chip">Clear split</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
                  Keep the jobs separate.
                </h2>
              </div>

              <div className="grid gap-3">
                {[
                  {
                    title: "What Orbito does",
                    text: "Cuts videos, makes AI videos, adds captions, and helps you post.",
                  },
                  {
                    title: "What Whop does",
                    text: "Shows campaigns and handles sponsor rules and payouts on its own site.",
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-[24px] border border-white/10 bg-black/24 p-4">
                    <div className="text-lg font-semibold text-white/90">{item.title}</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="pb-10 pt-14 text-xs text-white/50 sm:pt-16">
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
