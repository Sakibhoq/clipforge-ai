// frontend/app/how-it-works/page.tsx
"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

/* =========================================================
   Orbito — How it works (Marketing)

   FIX (behavior, not layout):
   - Your Navbar is FIXED on marketing pages and already renders a spacer.
   - This page also renders <Navbar /> manually, which is correct (route is not under (marketing)),
     BUT we must ensure we DO NOT create a second spacer or an extra scroll container.
   - Keep ONLY document/body scrolling (no page-level scroll wrappers).
   - Background layers remain FIXED and never affect layout height.
========================================================= */

function H({ children }: { children: React.ReactNode }) {
  return <span className="grad-text font-semibold">{children}</span>;
}

function HoverSheen() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(120px 120px at 20% 25%, rgba(167,139,250,0.20), transparent 60%), radial-gradient(140px 140px at 80% 30%, rgba(125,211,252,0.18), transparent 62%), radial-gradient(140px 140px at 55% 85%, rgba(45,212,191,0.14), transparent 62%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)",
        }}
      />
    </>
  );
}

export default function HowItWorksPage() {
  // Safety: if something elsewhere accidentally set body overflow hidden, fix it for this route.
  // (Doesn't change layout; just ensures scroll works.)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const steps = [
    {
      n: "01",
      meta: "Step 1",
      t: (
        <>
          Add one video
        </>
      ),
      d: (
        <>
          Paste a <H>YouTube</H> link or upload a file.
        </>
      ),
      bullets: [<>MP4 or YouTube.</>, <>No setup.</>, <>Starts fast.</>],
    },
    {
      n: "02",
      meta: "Step 2",
      t: <>Review your clips</>,
      d: (
        <>
          Orbito finds strong moments and makes drafts for <H>TikTok</H>, <H>Reels</H>, and <H>Shorts</H>.
        </>
      ),
      bullets: [<>Clear cuts.</>, <>Speaker-first framing.</>, <>Easy review.</>],
    },
    {
      n: "03",
      meta: "Step 3",
      t: <>Export and post</>,
      d: (
        <>
          Pick your best clips, make quick edits, and post.
        </>
      ),
      bullets: [<>Captions ready.</>, <>Safe margins.</>, <>Ready-to-post exports.</>],
    },
  ] as const;

  const signals = [
    <>
      upload video
    </>,
    <>pick clips</>,
    <>
      add captions
    </>,
    <>export</>,
    <>repeat</>,
  ];

  return (
    <div className="relative bg-transparent overflow-x-hidden">
      {/* FIXED PAGE BACKGROUND (never affects layout height / never creates scroll containers) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_10%,rgba(255,255,255,0.06),transparent_62%)]" />
        <div className="absolute inset-0 opacity-[0.55]">
          <div className="aurora" />
        </div>

        {/* blobs */}
        <div className="absolute -top-36 left-[-24%] h-[420px] w-[420px] sm:h-[520px] sm:w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.22),transparent_62%)] blur-3xl" />
        <div className="absolute top-20 right-[-24%] h-[460px] w-[460px] sm:h-[560px] sm:w-[560px] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.18),transparent_64%)] blur-3xl" />
        <div className="absolute bottom-[-22%] left-[6%] h-[520px] w-[520px] sm:h-[640px] sm:w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.14),transparent_65%)] blur-3xl" />

        <div className="hidden sm:block absolute inset-0 opacity-[0.08] mix-blend-overlay [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      {/* Navbar (needed here because this route isn't under (marketing)/layout.tsx) */}
      <Navbar />

      {/* IMPORTANT: no inner scroll container here. */}
      <main className="relative mx-auto max-w-6xl px-6 pb-24 pt-10 sm:pt-12 [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]">
        <section className="surface relative overflow-hidden p-6 sm:p-8 md:p-12">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="aurora opacity-60" />
            <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
          </div>

          <div className="relative">
            <div className="text-xs text-white/55">• How it works</div>

            <h1 className="mt-3 text-[34px] leading-[1.05] font-semibold tracking-tight sm:text-4xl md:text-6xl">
              Upload once. <span className="grad-text">Post faster.</span>
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65 md:text-[15px]">
              Orbito turns long videos into short clips. You upload, review, and post.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55 md:text-[15px]">
              Built for creators who want simple steps and good results.
            </p>

            <div className="mt-6 relative overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(120deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-[1px]">
              <div
                aria-hidden="true"
                className="absolute -inset-8 opacity-70 blur-2xl"
                style={{
                  background:
                    "conic-gradient(from 120deg, rgba(45,212,191,0.22), rgba(125,211,252,0.22), rgba(167,139,250,0.2), rgba(45,212,191,0.22))",
                }}
              />
              <div className="relative rounded-[14px] bg-black/70 px-5 py-4 text-sm text-white/75">
                Start with one video and let Orbito handle the heavy work.
              </div>
            </div>

            {/* SIGNAL STRIP */}
            <div className="mt-7 flex flex-wrap items-center gap-2 text-xs text-white/55">
              {signals.map((x, i) => (
                <span key={i} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                  {x}
                </span>
              ))}
            </div>

            {/* STEPS */}
            <div className="mt-10 sm:mt-12 relative">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[420px] blur-3xl hidden md:block"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(167,139,250,0.18), rgba(125,211,252,0.16), rgba(45,212,191,0.14))",
                  opacity: 0.35,
                }}
              />

              <div className="relative grid gap-3 sm:gap-4 md:grid-cols-3">
                {steps.map((x) => (
                  <div
                    key={x.n}
                    className="group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]"
                  >
                    <HoverSheen />

                    <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <div className="inline-flex items-center gap-2">
                          <div className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/75">
                            {x.n}
                          </div>
                          <div className="text-[11px] text-white/45">step</div>
                        </div>
                        <div className="text-[11px] text-white/45">{x.meta}</div>
                      </div>

                      <div className="mt-3 text-sm font-semibold">{x.t}</div>
                      <div className="mt-2 text-sm leading-relaxed text-white/60">{x.d}</div>

                      <ul className="mt-4 space-y-2 text-[13px] text-white/58">
                        {x.bullets.map((b, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-4 h-px w-full bg-white/10" />
                      <div className="mt-3 flex items-center justify-between text-[11px] text-white/45">
                        <span>result</span>
                        <span className="text-white/55 group-hover:text-white/70 transition-colors">
                          next →
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* NEXT UP */}
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
                <HoverSheen />
                <div className="relative">
                  <div className="text-xs text-white/45">• Output</div>
                  <div className="mt-2 text-sm font-semibold">Made for social video</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/60">
                    Exports are tuned for <H>YouTube</H>, <H>TikTok</H>, and <H>Reels</H>.
                  </div>
                </div>
              </div>
              <div className="group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
                <HoverSheen />
                <div className="relative">
                  <div className="text-xs text-white/45">• Help</div>
                  <div className="mt-2 text-sm font-semibold">Need a hand?</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/60">
                    Reach out if you need help with setup, billing, or workflow.
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-12 sm:mt-14 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <Link href="/start-trial" className="btn-aurora w-full sm:w-auto text-center active:scale-[0.99]">
                Start free
              </Link>
              <Link href="/pricing" className="btn-ghost w-full sm:w-auto text-center active:scale-[0.99]">
                Pricing
              </Link>
              <Link href="/features" className="btn-ghost w-full sm:w-auto text-center active:scale-[0.99]">
                See features
              </Link>
              <div className="text-xs text-white/45 sm:pl-2">Simple credit-based billing.</div>
            </div>

            {/* FOOTER */}
            <footer className="pt-16 sm:pt-20 text-xs text-white/45">
              <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>© 2026 • Orbito by Sakib LLC</div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {[
                    { label: "Features", href: "/features" },
                    { label: "How it works", href: "/how-it-works" },
                    { label: "Pricing", href: "/pricing" },
                    { label: "Contact", href: "/contact" },
                    { label: "Privacy", href: "/privacy-policy" },
                    { label: "Terms", href: "/terms-of-service" },
                  ].map((i) => (
                    <a key={i.href} href={i.href} className="hover:text-white/70">
                      {i.label}
                    </a>
                  ))}
                </div>
              </div>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
