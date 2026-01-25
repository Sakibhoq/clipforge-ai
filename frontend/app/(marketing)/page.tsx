// frontend/app/(marketing)/page.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { BRAND } from "@/lib/brand";

/* =========================================================
   Orbito — Landing (Marketing)
   GOALS (your notes):
   - Much brighter overall (like how-it-works)
   - Animated glows/orbs everywhere (but premium, not noisy)
   - No extra Navbar here (MarketingLayout owns it)
   - Never create double-scrollbars

   FIX (this pass):
   - REMOVE styled-jsx usage (<style jsx global>) to avoid Next App Router
     "client-only" / Server Component parent build error.
   - Use a plain <style> tag instead (safe in Client Components).
   - Keep FX layers fixed and non-layout-affecting.
========================================================= */

function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const items = Array.from(el.querySelectorAll("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.14 }
    );

    items.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return ref;
}

function H({ children }: { children: React.ReactNode }) {
  return <span className="grad-text font-semibold tracking-tight">{children}</span>;
}

function HoverSheen() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 hidden opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:block"
        style={{
          background:
            "radial-gradient(120px 120px at 20% 25%, rgba(167,139,250,0.18), transparent 60%), radial-gradient(140px 140px at 80% 30%, rgba(125,211,252,0.15), transparent 62%), radial-gradient(140px 140px at 55% 85%, rgba(45,212,191,0.12), transparent 62%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.24), transparent)",
        }}
      />
    </>
  );
}

/**
 * Brighter, more obvious ambient glows:
 * - FX is fixed (does not affect layout height)
 * - Content is above it
 * - No overflow-y / no scroll containers created here
 */
function AmbientFX() {
  const orbs = useMemo(
    () => [
      // top area
      { x: "10%", y: "10%", s: 560, blur: 60, a: 0.26, d: 0.0, t: 22, h: 280 },
      { x: "78%", y: "12%", s: 520, blur: 58, a: 0.24, d: 1.1, t: 24, h: 180 },
      { x: "55%", y: "2%", s: 420, blur: 52, a: 0.18, d: 2.2, t: 20, h: 120 },

      // mid / hero
      { x: "6%", y: "38%", s: 620, blur: 70, a: 0.18, d: 0.8, t: 28, h: 40 },
      { x: "86%", y: "42%", s: 680, blur: 74, a: 0.16, d: 1.8, t: 30, h: 220 },
      { x: "52%", y: "44%", s: 760, blur: 86, a: 0.14, d: 2.7, t: 34, h: 300 },

      // lower sections
      { x: "14%", y: "72%", s: 760, blur: 88, a: 0.14, d: 1.6, t: 36, h: 160 },
      { x: "86%", y: "78%", s: 860, blur: 96, a: 0.12, d: 3.2, t: 38, h: 80 },
      { x: "46%", y: "88%", s: 940, blur: 110, a: 0.10, d: 2.4, t: 40, h: 260 },
    ],
    []
  );

  const motes = useMemo(() => {
    const pts: Array<{ x: string; y: string; d: number; t: number; o: number; s: number }> = [];
    const seed = [
      [8, 18],
      [16, 28],
      [26, 14],
      [34, 34],
      [44, 22],
      [56, 16],
      [66, 28],
      [76, 18],
      [88, 26],
      [18, 56],
      [30, 50],
      [42, 60],
      [58, 54],
      [72, 62],
      [86, 56],
      [22, 86],
      [44, 84],
      [66, 82],
      [86, 88],
    ];
    for (let i = 0; i < seed.length; i++) {
      const [x, y] = seed[i];
      pts.push({
        x: `${x}%`,
        y: `${y}%`,
        d: (i % 9) * 0.55,
        t: 6.8 + (i % 6) * 1.2,
        o: 0.22 + (i % 4) * 0.06,
        s: 1.5 + (i % 3) * 0.7,
      });
    }
    return pts;
  }, []);

  return (
    <>
      {/* IMPORTANT: plain <style> (NOT styled-jsx) */}
      <style>{`
        @keyframes orbDrift {
          0% { transform: translate3d(-12px, -12px, 0) scale(0.98); }
          50% { transform: translate3d(16px, 10px, 0) scale(1.06); }
          100% { transform: translate3d(-12px, -12px, 0) scale(0.98); }
        }
        @keyframes orbPulse {
          0% { opacity: 0; }
          14% { opacity: var(--orb-a); }
          55% { opacity: calc(var(--orb-a) * 0.92); }
          100% { opacity: 0; }
        }
        @keyframes orbHue {
          0% { filter: blur(var(--orb-blur)) hue-rotate(0deg); }
          100% { filter: blur(var(--orb-blur)) hue-rotate(240deg); }
        }
        @keyframes washFloat {
          0% { transform: translate3d(-2%, -1%, 0) scale(1.04); opacity: 0.18; }
          100% { transform: translate3d(2.5%, 1.5%, 0) scale(1.12); opacity: 0.28; }
        }
        @keyframes sweep {
          0% { transform: translate3d(-28vw, -4vh, 0) rotate(-10deg); opacity: 0.06; }
          55% { transform: translate3d(72vw, 10vh, 0) rotate(10deg); opacity: 0.18; }
          100% { transform: translate3d(120vw, 0vh, 0) rotate(6deg); opacity: 0.06; }
        }
        @keyframes mote {
          0% { opacity: 0; transform: translate3d(0, 0, 0) scale(0.85); }
          18% { opacity: var(--m-o); }
          60% { opacity: calc(var(--m-o) * 0.55); }
          100% { opacity: 0; transform: translate3d(0, -12px, 0) scale(1.25); }
        }
        .orbito-grain {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
          background-size: 180px 180px;
          mix-blend-mode: overlay;
        }
        @media (prefers-reduced-motion: reduce) {
          .orbito-anim { animation: none !important; }
        }
      `}</style>

      {/* FX layer ABOVE base background but BELOW content */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {/* brighter base wash */}
        <div
          className="orbito-anim absolute -inset-[45%] blur-3xl"
          style={{
            background:
              "radial-gradient(900px 520px at 18% 18%, rgba(125,211,252,0.55), transparent 64%), radial-gradient(920px 540px at 82% 22%, rgba(167,139,250,0.52), transparent 64%), radial-gradient(980px 580px at 55% 88%, rgba(45,212,191,0.44), transparent 66%)",
            mixBlendMode: "screen",
            opacity: 0.26,
            animation: "washFloat 16s ease-in-out infinite alternate",
            willChange: "transform, opacity",
          }}
        />

        {/* primary orbs */}
        {orbs.map((o, i) => (
          <div
            key={i}
            className="orbito-anim absolute rounded-full"
            style={{
              left: o.x,
              top: o.y,
              width: o.s,
              height: o.s,
              opacity: 0,
              // @ts-ignore
              ["--orb-a" as any]: o.a,
              // @ts-ignore
              ["--orb-blur" as any]: `${o.blur}px`,
              background: `radial-gradient(circle at 40% 35%,
                hsla(${o.h}, 95%, 72%, 0.92), transparent 56%),
                radial-gradient(circle at 70% 55%,
                hsla(${(o.h + 110) % 360}, 92%, 68%, 0.78), transparent 58%),
                radial-gradient(circle at 45% 70%,
                hsla(${(o.h + 220) % 360}, 90%, 62%, 0.64), transparent 60%)`,
              mixBlendMode: "screen",
              filter: `blur(${o.blur}px)`,
              animation: `orbDrift ${o.t}s ease-in-out infinite, orbPulse ${o.t + 10}s ease-in-out infinite, orbHue ${Math.max(
                26,
                o.t + 14
              )}s linear infinite`,
              animationDelay: `${o.d}s, ${o.d * 0.8}s, ${o.d * 0.4}s`,
              transform: "translateZ(0)",
              willChange: "transform, opacity, filter",
            }}
          />
        ))}

        {/* sweeping highlight */}
        <div
          className="orbito-anim absolute left-[-30%] top-[6%] h-[420px] w-[720px] blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,255,255,0.90), rgba(125,211,252,0.45), rgba(167,139,250,0.24), transparent 72%)",
            mixBlendMode: "screen",
            opacity: 0.14,
            animation: "sweep 14s ease-in-out infinite",
            willChange: "transform, opacity",
          }}
        />

        {/* motes */}
        <div className="hidden sm:block">
          {motes.map((p, idx) => (
            <span
              key={idx}
              className="orbito-anim absolute rounded-full"
              style={{
                left: p.x,
                top: p.y,
                width: p.s,
                height: p.s,
                background: "rgba(255,255,255,0.92)",
                boxShadow:
                  "0 0 14px rgba(125,211,252,0.50), 0 0 22px rgba(167,139,250,0.40), 0 0 34px rgba(45,212,191,0.30)",
                opacity: 0,
                // @ts-ignore
                ["--m-o" as any]: p.o,
                animation: `mote ${p.t}s ease-in-out infinite`,
                animationDelay: `${p.d}s`,
                willChange: "transform, opacity",
              }}
            />
          ))}
        </div>

        {/* grain */}
        <div className="absolute inset-0 opacity-[0.12] orbito-grain" />
      </div>

      {/* base background (slightly brighter) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(1050px_650px_at_50%_10%,rgba(255,255,255,0.09),transparent_62%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_12%_18%,rgba(125,211,252,0.08),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_86%_22%,rgba(167,139,250,0.08),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.70] hidden sm:block">
          <div className="aurora" />
        </div>
      </div>
    </>
  );
}

export default function Page() {
  const revealRef = useReveal();

  const footerLinks = useMemo(
    () => [
      { label: "Features", href: "/features" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
    ],
    []
  );

  const heroSteps = useMemo(
    () => [
      {
        id: "paste",
        t: (
          <>
            Paste <H>YouTube</H> (or upload)
          </>
        ),
        d: <>One link in — your clip machine starts.</>,
      },
      {
        id: "generate",
        t: (
          <>
            Generate <H>Shorts</H> automatically
          </>
        ),
        d: <>Orbito finds the moments, hooks them, and formats them.</>,
      },
      {
        id: "autopost",
        t: (
          <>
            Auto-post to <H>TikTok</H> / <H>Reels</H> / <H>Shorts</H>
          </>
        ),
        d: <>Schedule once. Stay consistent while you sleep.</>,
      },
    ],
    []
  );

  const featureCards = useMemo(
    () => [
      {
        id: "moments",
        title: (
          <>
            AI finds your best moments from <H>YouTube</H>
          </>
        ),
        desc: <>Highlights, hooks, and clean segments — automatically.</>,
      },
      {
        id: "formats",
        title: (
          <>
            Built for <H>Reels</H>, <H>TikTok</H>, and <H>Shorts</H>
          </>
        ),
        desc: <>Captions + pacing that feels native on every platform.</>,
      },
      {
        id: "autopublish",
        title: (
          <>
            Auto-post to <H>Instagram</H>, <H>TikTok</H> & <H>YouTube</H>
          </>
        ),
        desc: <>Set a cadence once. Orbito keeps you consistent every week.</>,
      },
    ],
    []
  );

  const howItWorks = useMemo(
    () => [
      {
        id: "hiw-1",
        n: "1",
        title: "Start your free trial",
        desc: "Create an account and get credits to process your first videos.",
      },
      {
        id: "hiw-2",
        n: "2",
        title: (
          <>
            Paste <H>YouTube</H> or upload
          </>
        ),
        desc: (
          <>
            Drop a <H>YouTube</H> link or upload long-form once.
          </>
        ),
      },
      {
        id: "hiw-3",
        n: "3",
        title: "Review & edit (optional)",
        desc: "Approve clips, tweak captions, export — or keep it hands-off.",
      },
      {
        id: "hiw-4",
        n: "4",
        title: (
          <>
            Auto-post to <H>TikTok</H>, <H>Reels</H> & <H>Shorts</H>
          </>
        ),
        desc: (
          <>
            Schedule <H>TikTok</H>, <H>Instagram</H> <H>Reels</H>, and <H>YouTube Shorts</H>.
          </>
        ),
      },
    ],
    []
  );

  return (
    // IMPORTANT: no overflow-y/scroll containers here — only document scroll
    <div ref={revealRef as any} className="relative bg-transparent overflow-x-hidden">
      <AmbientFX />

      {/* Content ABOVE FX */}
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        {/* HERO */}
        <section className="relative">
          <div data-reveal className="reveal surface relative overflow-hidden p-5 sm:p-6 md:p-10">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="aurora opacity-80 sm:opacity-90" />
              <div className="absolute inset-0 bg-[radial-gradient(980px_560px_at_35%_25%,rgba(255,255,255,0.085),transparent_62%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(800px_520px_at_80%_40%,rgba(125,211,252,0.06),transparent_62%)]" />
            </div>

            <div className="relative grid gap-6 md:gap-8 md:grid-cols-[1.15fr_0.85fr]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-white/75">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                  Turn <H>YouTube</H> into <H>Shorts</H>, <H>Reels</H> & <H>TikToks</H>
                </div>

                <h1 className="mt-5 text-3xl font-semibold leading-[1.06] tracking-tight sm:text-4xl md:text-6xl">
                  Paste a <H>YouTube</H> link.
                  <br />
                  Get <H>Shorts</H> ready to post.
                </h1>

                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-[15px]">
                  {BRAND.name} finds your best moments, formats them for <H>TikTok</H>, <H>Instagram</H>{" "}
                  <H>Reels</H>, and <H>YouTube Shorts</H> — then you edit, download, or auto-post.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <a href="/register" className="btn-aurora">
                    Start free trial
                  </a>
                  <a href="/how-it-works" className="btn-ghost">
                    See how it works
                  </a>
                  <div className="text-xs text-white/50">Credits only when you generate clips.</div>
                </div>

                <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-xs text-white/60">
                  <span className="text-white/75">
                    Paste <H>YouTube</H> / upload
                  </span>{" "}
                  → AI clips → quick review → schedule <H>TikTok</H> / <H>Reels</H> / <H>Shorts</H>
                </div>
              </div>

              {/* RIGHT PANEL */}
              <div className="group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04] md:hover:-translate-y-1">
                <HoverSheen />

                <div className="relative">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <div>Your posting loop</div>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                      running
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {heroSteps.map((x) => (
                      <div
                        key={x.id}
                        className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-300 hover:border-white/20 md:hover:-translate-y-0.5"
                      >
                        <div className="text-sm font-semibold">{x.t}</div>
                        <div className="mt-1 text-xs text-white/60">{x.d}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 text-[11px] text-white/65 sm:grid-cols-3">
                    {[
                      { k: "Speed", v: "Shorts in minutes" },
                      { k: "Reach", v: "Every platform" },
                      { k: "Consistency", v: "Schedule & forget" },
                    ].map((x) => (
                      <div
                        key={x.k}
                        className="group/mini relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-300 hover:border-white/20 md:hover:-translate-y-0.5"
                      >
                        <HoverSheen />
                        <div className="relative">
                          <div className="text-white/50">{x.k}</div>
                          <div className="mt-1 text-white/80">{x.v}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* /RIGHT PANEL */}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="pt-14 sm:pt-16">
          <div data-reveal className="reveal">
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Make <H>Shorts</H> that win attention —
              <br className="hidden md:block" />
              and post them everywhere.
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              {BRAND.name} is built for creators who want team-level output without hours in an editor.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {featureCards.map((c) => (
              <div
                key={c.id}
                data-reveal
                className="reveal group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04] md:hover:-translate-y-1"
              >
                <HoverSheen />
                <div className="relative">
                  <div className="text-sm font-semibold">{c.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/65">{c.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/features" className="btn-ghost">
              Explore all features
            </a>
            <a href="/pricing" className="btn-aurora">
              View pricing
            </a>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="pt-14 sm:pt-16">
          <div data-reveal className="reveal">
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Set it up once. <span className="grad-text">Then ship daily.</span>
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              One link becomes a steady stream of <H>Shorts</H> — with control when you want it.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {howItWorks.map((s) => (
              <div
                key={s.id}
                data-reveal
                className="reveal group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04] md:hover:-translate-y-1"
              >
                <HoverSheen />
                <div className="relative">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">{s.n}</div>
                    <div>step</div>
                  </div>
                  <div className="mt-3 text-sm font-semibold">{s.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/65">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/how-it-works" className="btn-ghost">
              See full workflow
            </a>
            <a href="/register" className="btn-aurora">
              Start free trial
            </a>
            <a href="/contact" className="btn-ghost">
              Contact
            </a>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="pb-10 pt-16 text-xs text-white/50 sm:pt-20">
          <div className="mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>© 2026 • {BRAND.name} by Sakib LLC</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {footerLinks.map((i) => (
                <a key={i.href} href={i.href} className="hover:text-white/75">
                  {i.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
