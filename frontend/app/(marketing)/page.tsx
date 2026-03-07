// frontend/app/(marketing)/page.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { SocialBrandPill, SocialBrandRow } from "@/components/SocialBrand";

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

function PricingCardGlow({ tone }: { tone: "orbito" | "labs" | "full" }) {
  const background =
    tone === "orbito"
      ? "radial-gradient(520px 280px at 18% 14%, rgba(155,140,255,0.24), transparent 68%), radial-gradient(560px 320px at 85% 36%, rgba(70,215,255,0.22), transparent 70%), radial-gradient(520px 320px at 52% 96%, rgba(53,242,166,0.16), transparent 72%)"
      : tone === "labs"
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

function HeroBorderStyles() {
  return (
    <style>{`
      @keyframes heroBorderSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .orbito-hero-border {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        border-radius: var(--r-xl);
        padding: 3px;
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.08),
          0 0 22px rgba(56, 189, 248, 0.18),
          0 0 34px rgba(251, 146, 60, 0.12);
      }
      .orbito-hero-border::before {
        content: "";
        position: absolute;
        inset: -58%;
        border-radius: 50%;
        background: conic-gradient(
          from 0deg,
          rgba(37, 99, 235, 1),
          rgba(56, 189, 248, 1),
          rgba(45, 212, 191, 1),
          rgba(251, 146, 60, 1),
          rgba(129, 140, 248, 1),
          rgba(167, 139, 250, 1),
          rgba(37, 99, 235, 1)
        );
        animation: heroBorderSpin 4.2s linear infinite;
        filter: saturate(1.12) brightness(1.06);
        opacity: 0.98;
        pointer-events: none;
        z-index: 0;
        will-change: transform;
      }
      .orbito-hero-border::after {
        content: "";
        position: absolute;
        inset: 3px;
        border-radius: 19px;
        background: linear-gradient(135deg, rgba(8, 12, 20, 0.94), rgba(7, 11, 18, 0.92));
        box-shadow:
          0 0 12px rgba(125, 211, 252, 0.18),
          0 0 20px rgba(167, 139, 250, 0.14);
        pointer-events: none;
        z-index: 1;
      }
      .orbito-hero-border > .orbito-hero-inner {
        position: relative;
        z-index: 2;
        border-radius: 20px;
      }
      @media (max-width: 900px), (pointer: coarse) {
        .orbito-hero-border {
          padding: 2px;
        }
        .orbito-hero-border::before {
          inset: -86%;
          animation: none !important;
          opacity: 0.74;
        }
        .orbito-hero-border::after {
          inset: 2px;
          border-radius: 18px;
          box-shadow:
            0 0 8px rgba(125, 211, 252, 0.16),
            0 0 14px rgba(167, 139, 250, 0.12);
        }
        .orbito-hero-border > .orbito-hero-inner {
          border-radius: 18px;
        }
      }
    `}</style>
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
      { x: "10%", y: "10%", s: 560, blur: 60, a: 0.24, d: 0.0, t: 22, h: 250 },
      { x: "78%", y: "12%", s: 520, blur: 58, a: 0.22, d: 1.1, t: 24, h: 210 },
      { x: "55%", y: "2%", s: 420, blur: 52, a: 0.18, d: 2.2, t: 20, h: 165 },

      // mid / hero
      { x: "6%", y: "38%", s: 620, blur: 70, a: 0.2, d: 0.8, t: 28, h: 225 },
      { x: "86%", y: "42%", s: 680, blur: 74, a: 0.19, d: 1.8, t: 30, h: 290 },
      { x: "52%", y: "44%", s: 760, blur: 86, a: 0.18, d: 2.7, t: 34, h: 190 },

      // lower sections
      { x: "14%", y: "72%", s: 760, blur: 88, a: 0.16, d: 1.6, t: 36, h: 240 },
      { x: "86%", y: "78%", s: 860, blur: 96, a: 0.14, d: 3.2, t: 38, h: 205 },
      { x: "46%", y: "88%", s: 940, blur: 110, a: 0.12, d: 2.4, t: 40, h: 175 },
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
        @keyframes washFloat {
          0% { transform: translate3d(-2%, -1%, 0) scale(1.04); opacity: 0.14; }
          100% { transform: translate3d(2.5%, 1.5%, 0) scale(1.12); opacity: 0.22; }
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
        @media (max-width: 900px), (pointer: coarse) {
          .orbito-fx-heavy {
            display: none !important;
          }
        }
      `}</style>

      {/* FX layer ABOVE base background but BELOW content */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {/* brighter base wash */}
        <div
          className="orbito-anim orbito-fx-heavy absolute -inset-[45%] blur-3xl"
          style={{
            background:
              "radial-gradient(900px 520px at 18% 18%, rgba(56,130,246,0.48), transparent 64%), radial-gradient(920px 540px at 82% 22%, rgba(129,90,255,0.44), transparent 64%), radial-gradient(980px 580px at 55% 88%, rgba(20,184,166,0.38), transparent 66%)",
            mixBlendMode: "screen",
            opacity: 0.22,
            animation: "washFloat 16s ease-in-out infinite alternate",
            willChange: "transform, opacity",
          }}
        />

        {/* primary orbs */}
        {orbs.map((o, i) => (
          <div
            key={i}
            className="orbito-anim orbito-fx-heavy absolute rounded-full"
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
                hsla(${o.h}, 96%, 52%, 0.94), transparent 56%),
                radial-gradient(circle at 70% 55%,
                hsla(${(o.h + 110) % 360}, 92%, 46%, 0.82), transparent 58%),
                radial-gradient(circle at 45% 70%,
                hsla(${(o.h + 220) % 360}, 88%, 40%, 0.66), transparent 60%)`,
              mixBlendMode: "screen",
              filter: `blur(${o.blur}px)`,
              animation: `orbDrift ${o.t}s ease-in-out infinite, orbPulse ${o.t + 10}s ease-in-out infinite`,
              animationDelay: `${o.d}s, ${o.d * 0.8}s`,
              transform: "translateZ(0)",
              willChange: "transform, opacity",
            }}
          />
        ))}

        {/* sweeping highlight */}
        <div
          className="orbito-anim orbito-fx-heavy absolute left-[-30%] top-[6%] h-[420px] w-[720px] blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(180,210,255,0.48), rgba(56,130,246,0.34), rgba(129,90,255,0.22), transparent 72%)",
            mixBlendMode: "screen",
            opacity: 0.12,
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
        <div className="absolute inset-0 opacity-[0.12] orbito-grain orbito-fx-heavy" />
      </div>

      {/* base background (slightly brighter) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(1050px_650px_at_50%_10%,rgba(255,255,255,0.03),transparent_66%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_12%_18%,rgba(56,130,246,0.12),transparent_58%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_86%_22%,rgba(129,90,255,0.12),transparent_58%)]" />
        <div className="absolute inset-0 opacity-[0.72] hidden sm:block">
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
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy-policy" },
      { label: "Terms", href: "/terms-of-service" },
    ],
    []
  );

  const heroSteps = useMemo(
    () => [
      {
        id: "paste",
        t: (
          <>
            Add your video
          </>
        ),
        d: (
          <>
            Paste a YouTube link or upload a file.
          </>
        ),
      },
      {
        id: "generate",
        t: <>Pick your clips</>,
        d: <>Orbito finds strong moments. You approve the ones you want.</>,
      },
      {
        id: "export",
        t: (
          <>
            Share anywhere directly from orbito.
          </>
        ),
        d: (
          <>
            <SocialBrandRow platforms={["tiktok", "reels", "shorts"]} compact />
          </>
        ),
      },
    ],
    []
  );

  return (
    // IMPORTANT: no overflow-y/scroll containers here — only document scroll
    <div ref={revealRef as any} className="relative bg-transparent overflow-x-hidden">
      <HeroBorderStyles />
      {/* Content ABOVE FX */}
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        {/* HERO */}
        <section className="relative">
          <div data-reveal className="reveal orbito-hero-border">
            <div className="orbito-hero-inner relative overflow-hidden p-5 sm:p-6 md:p-10">
              <PricingCardGlow tone="full" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <div className="aurora opacity-38 sm:opacity-48 hidden sm:block" />
                <div className="absolute inset-0 bg-[radial-gradient(980px_560px_at_35%_25%,rgba(255,255,255,0.05),transparent_64%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(800px_520px_at_80%_40%,rgba(125,211,252,0.045),transparent_64%)]" />
              </div>

              <div className="relative grid gap-6 md:gap-8 md:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-white/75">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                    <span>Long videos in. Short clips out.</span>
                    <SocialBrandPill platform="youtube" compact />
                  </div>

                  <h1 className="mt-5 text-3xl font-semibold leading-[1.06] tracking-tight sm:text-4xl md:text-6xl">
                    Stop editing. Start <H>earning</H>.
                  </h1>

                  <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-[15px]">
                    One account, one workflow: clip long-form content in Orbito, then generate new AI clips in Orbito Labs.
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <a href="/start-trial" className="btn-orbito-cta">
                      Start free
                    </a>
                    <a href={BRAND.whopUrl} target="_blank" rel="noreferrer" className="btn-whop">
                      Get paid with <span className="whop-word">Whop</span>
                    </a>
                    <div className="text-xs text-white/50">Less editing. More posting.</div>
                  </div>

                  <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-xs text-white/60">
                    <span className="text-white/75">
                      Upload once
                    </span>{" "}
                    → pick clips → post
                    <span className="text-white/35"> • </span>
                    <span className="text-white/70">or open Labs for prompt-to-clip generation.</span>
                  </div>
                </div>

                {/* RIGHT PANEL */}
                <div className="group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04] md:hover:-translate-y-1">
                  <HoverSheen />

                  <div className="relative">
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <div>Your simple workflow</div>
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                        active
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
                        { k: "Start", v: "First clip in minutes" },
                        { k: "Channels", v: "TikTok • Reels • Shorts" },
                        { k: "Routine", v: "Post more often" },
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
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="pt-14 sm:pt-16">
          <div data-reveal className="reveal">
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              How it works. <H>Simple and fast.</H>
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              One upload, more clips, and faster posting.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
            <div
              data-reveal
              className="reveal group surface-soft relative overflow-hidden p-6 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04] md:hover:-translate-y-1"
            >
              <PricingCardGlow tone="orbito" />
              <HoverSheen />
              <div className="relative">
                <div className="text-xs text-white/50">Flow</div>
                <div className="mt-2 text-xl font-semibold text-white/90 sm:text-2xl">Upload, pick, post.</div>
                <p className="mt-3 text-sm leading-relaxed text-white/65">Use one clear flow from source video to final post.</p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <SocialBrandRow platforms={["youtube", "tiktok", "instagram", "facebook"]} compact />
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-xs text-white/50">Step 1</div>
                    <div className="mt-1 text-sm font-semibold text-white/85">Upload once</div>
                    <div className="mt-1 text-xs text-white/60">Paste a link or upload a file.</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-xs text-white/50">Step 2</div>
                    <div className="mt-1 text-sm font-semibold text-white/85">Pick your clips</div>
                    <div className="mt-1 text-xs text-white/60">Keep the good moments only.</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
                    <div className="text-xs text-white/50">Step 3</div>
                    <div className="mt-1 text-sm font-semibold text-white/85">Post now or schedule later</div>
                    <div className="mt-1 text-xs text-white/60">
                      Post to one platform, or all connected platforms at the same time.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div
                data-reveal
                className="reveal group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04]"
              >
                <HoverSheen />
                <div className="relative">
                  <div className="text-xs text-white/50">Connected channels</div>
                  <div className="mt-2 text-sm font-semibold text-white/90">YouTube, TikTok, Instagram, Facebook</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/65">
                    Connect once in Studio. Then schedule clips across all selected channels.
                  </div>
                </div>
              </div>

              <div
                data-reveal
                className="reveal group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04] md:hover:-translate-y-1"
              >
                <HoverSheen />
                <div className="relative">
                  <div className="text-xs text-white/50">Cross-platform publishing</div>
                  <div className="mt-2 text-sm font-semibold text-white/90">Publish the same clip everywhere</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/65">
                    Connect channels once, then send approved clips to all selected destinations from one workflow.
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-[11px] text-white/55">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80 animate-pulse" />
                    Studio ready
                  </div>
                </div>
              </div>

              <div
                data-reveal
                className="reveal group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04]"
              >
                <HoverSheen />
                <div className="relative">
                  <div className="text-xs text-white/50">Monetization</div>
                  <div className="mt-2 text-sm font-semibold text-white/90">Turn your clips into payouts with Whop</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/65">
                    Publish strong clips, join campaigns, and start earning from the content you already create.
                  </div>
                  <div className="mt-4">
                    <a href={BRAND.whopUrl} target="_blank" rel="noreferrer" className="btn-whop text-xs">
                      Open <span className="whop-word">Whop</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/start-trial" className="btn-orbito-cta">
              Start free
            </a>
            <a href="/pricing" className="btn-ghost">
              View pricing
            </a>
            <a href="/contact" className="btn-ghost">
              Contact
            </a>
          </div>
        </section>

        <section id="standard" className="pt-12 sm:pt-14">
          <div
            data-reveal
            className="reveal relative overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(120deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-[1px]"
          >
            <div
              aria-hidden="true"
              className="absolute -inset-10 opacity-70 blur-2xl"
              style={{
                background:
                  "conic-gradient(from 120deg, rgba(255,183,3,0.26), rgba(251,86,7,0.22), rgba(58,134,255,0.22), rgba(255,183,3,0.26))",
              }}
            />
            <div className="relative rounded-[22px] bg-black/70 p-6 md:p-7">
              <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">Orbito Labs</span>
                <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1">
                  Orbito Labs • AI video generation
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                Want to generate AI clips? Visit Orbito Labs.
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
                Orbito Labs is the AI video generation workspace. One login, shared connections, and one place to create prompt-to-clip content.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[
                  {
                    t: "Prompt-to-video",
                    d: "Create scroll-stopping clips from a single prompt.",
                  },
                  {
                    t: "Export + publish",
                    d: "Download MP4s or publish to your connected channels.",
                  },
                ].map((x) => (
                  <div key={x.t} className="surface-soft relative overflow-hidden p-5">
                    <div className="text-sm font-semibold">{x.t}</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/65">{x.d}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href={BRAND.clipforgeUrl} className="btn-clipforge">
                  Go to Orbito Labs
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="pb-10 pt-16 text-xs text-white/50 sm:pt-20">
          <div className="mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>© 2026 • {BRAND.name} by Sakib LLC. All rights reserved.</div>
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
