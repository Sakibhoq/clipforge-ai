// frontend/app/how-it-works/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

/* =========================================================
   Orbito — How it works (Marketing)
   FIXES:
   - Bring Navbar back (this route isn't under (marketing) group in your tree)
   - Remove page-level scroll container to eliminate double scrollbars
   - Background layers are FIXED so they never affect layout height
   - Only the document/body scrolls
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
  const steps = [
    {
      n: "01",
      meta: "10 seconds",
      t: (
        <>
          Paste a <H>YouTube</H> link (or upload)
        </>
      ),
      d: (
        <>
          Drop your long-form once. Orbito ingests it, stores it, and runs processing in the background — you can leave
          immediately.
        </>
      ),
      bullets: [
        <>
          Paste <H>YouTube</H> or upload MP4.
        </>,
        <>No downloads or setup.</>,
        <>Dashboard updates automatically.</>,
      ],
    },
    {
      n: "02",
      meta: "Hook-first",
      t: <>Orbito finds the moments</>,
      d: (
        <>
          We detect high-signal segments and shape them into drafts built for <H>Shorts</H>, <H>Reels</H>, and{" "}
          <H>TikTok</H>.
        </>
      ),
      bullets: [<>High-retention moments.</>, <>Tight pacing.</>, <>Clean endings.</>],
    },
    {
      n: "03",
      meta: "Fast edits",
      t: <>Review, polish, export</>,
      d: (
        <>
          Pick the best clips, make quick edits, and export platform-ready outputs — captions, framing, and standards
          already dialed in.
        </>
      ),
      bullets: [<>Premium captions.</>, <>Safe margins.</>, <>Ready-to-post exports.</>],
    },
    {
      n: "04",
      meta: "Hands-off",
      t: (
        <>
          Post manually — or auto-post to <H>Instagram</H> / <H>TikTok</H>
        </>
      ),
      d: (
        <>
          Download and post yourself, or connect socials and let Orbito publish on a schedule. Paste once. Keep posting.
        </>
      ),
      bullets: [<>Download anytime.</>, <>Schedule posts.</>, <>Stay consistent automatically.</>],
    },
  ] as const;

  const signals = [
    <>
      paste <H>YouTube</H>
    </>,
    <>detect hooks</>,
    <>
      forge <H>Shorts</H>
    </>,
    <>
      export <H>Reels</H> / <H>TikTok</H>
    </>,
    <>repeat</>,
  ];

  return (
    <div className="relative overflow-x-hidden bg-transparent">
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

      <main className="relative mx-auto max-w-6xl px-6 pb-24 pt-10 sm:pt-12 [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]">
        <section className="surface relative overflow-hidden p-6 sm:p-8 md:p-12">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="aurora opacity-60" />
            <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
          </div>

          <div className="relative">
            <div className="text-xs text-white/55">• How it works</div>

            <h1 className="mt-3 text-[34px] leading-[1.05] font-semibold tracking-tight sm:text-4xl md:text-6xl">
              Paste once. <span className="grad-text">Keep posting.</span>
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65 md:text-[15px]">
              Orbito turns long-form into short-form — fast. Paste a <H>YouTube</H> link, get ready-to-post clips for{" "}
              <H>TikTok</H>, <H>Instagram Reels</H>, and <H>YouTube Shorts</H>.
            </p>

            {/* SIGNAL STRIP */}
            <div className="mt-7 flex flex-wrap items-center gap-2 text-xs text-white/55">
              {signals.map((x, i) => (
                <span key={i} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                  {x}
                </span>
              ))}
            </div>

            {/* MICRO VALUE */}
            <div className="mt-8 grid gap-2 md:grid-cols-3 text-[11px] text-white/60">
              {[
                { k: "Hands-off", v: "Runs in the background" },
                { k: "Platform-ready", v: "Shorts / Reels / TikTok formats" },
                { k: "Consistent", v: "Batch clips + optional auto-post" },
              ].map((x) => (
                <div key={x.k} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-white/45">{x.k}</div>
                  <div className="mt-1 text-white/75">{x.v}</div>
                </div>
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

              <div className="relative grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                          {x.n === "04" ? "done →" : "continue →"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-12 sm:mt-14 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <Link href="/register" className="btn-aurora w-full sm:w-auto text-center active:scale-[0.99]">
                Start free trial
              </Link>
              <Link href="/pricing" className="btn-ghost w-full sm:w-auto text-center active:scale-[0.99]">
                Pricing
              </Link>
              <Link href="/features" className="btn-ghost w-full sm:w-auto text-center active:scale-[0.99]">
                See features
              </Link>
              <div className="text-xs text-white/45 sm:pl-2">Credit-based billing. Scale when it works.</div>
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
