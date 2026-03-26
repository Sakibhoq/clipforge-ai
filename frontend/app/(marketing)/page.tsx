// frontend/app/(marketing)/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { apiFetch } from "@/lib/api";
import { SocialBrandPill, SocialBrandRow } from "@/components/SocialBrand";

const ORBITO_WHOP_MARKETING_URL = "/whop";

const GENERATE_PREVIEWS = [
  {
    title: "Real",
    text: "Clean and polished for product videos.",
    src: "https://app.orbito.cc/app/labs/previews/labs-preview-1.mp4",
    aspect: "9:16",
  },
  {
    title: "Cartoon",
    text: "Bright and fun for fast social posts.",
    src: "https://app.orbito.cc/app/labs/previews/labs-preview-2.mp4",
    aspect: "16:9",
  },
  {
    title: "Anime",
    text: "More energy for stronger hooks.",
    src: "https://app.orbito.cc/app/labs/previews/labs-preview-3.mp4",
    aspect: "9:16",
  },
  {
    title: "Comic",
    text: "Bold and clear for story or promo videos.",
    src: "https://app.orbito.cc/app/labs/previews/labs-preview-4.mp4",
    aspect: "9:16",
  },
] as const;

type MeResponse = {
  name?: string | null;
  email: string;
  plan: string;
  credits: number;
  trial_used: boolean;
};

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

function LandingFX() {
  const orbs = useMemo(
    () => [
      { x: "10%", y: "10%", s: 560, blur: 60, a: 0.22, d: 0.0, t: 22, h: 250 },
      { x: "78%", y: "12%", s: 520, blur: 58, a: 0.2, d: 1.1, t: 24, h: 210 },
      { x: "6%", y: "38%", s: 620, blur: 70, a: 0.18, d: 0.8, t: 28, h: 225 },
      { x: "86%", y: "42%", s: 680, blur: 74, a: 0.18, d: 1.8, t: 30, h: 290 },
      { x: "16%", y: "78%", s: 740, blur: 90, a: 0.15, d: 1.6, t: 36, h: 240 },
      { x: "82%", y: "82%", s: 820, blur: 96, a: 0.12, d: 3.2, t: 38, h: 205 },
    ],
    []
  );

  return (
    <>
      <style>{`
        @keyframes orbDrift {
          0% { transform: translate3d(-12px, -12px, 0) scale(0.98); }
          50% { transform: translate3d(16px, 10px, 0) scale(1.06); }
          100% { transform: translate3d(-12px, -12px, 0) scale(0.98); }
        }
        @keyframes orbPulse {
          0% { opacity: 0; }
          16% { opacity: var(--orb-a); }
          60% { opacity: calc(var(--orb-a) * 0.92); }
          100% { opacity: 0; }
        }
        @keyframes washFloat {
          0% { transform: translate3d(-2%, -1%, 0) scale(1.04); opacity: 0.14; }
          100% { transform: translate3d(2.5%, 1.5%, 0) scale(1.12); opacity: 0.22; }
        }
        @keyframes lineShift {
          0% { background-position: 0% 50%; }
          100% { background-position: 260% 50%; }
        }
        @keyframes lineHue {
          0% { filter: hue-rotate(0deg) saturate(1); }
          50% { filter: hue-rotate(55deg) saturate(1.14); }
          100% { filter: hue-rotate(0deg) saturate(1); }
        }
        @keyframes lineFloatA {
          0%, 100% { transform: translate3d(-8px, 0, 0); }
          50% { transform: translate3d(16px, -12px, 0); }
        }
        @keyframes lineFloatB {
          0%, 100% { transform: translate3d(10px, 0, 0); }
          50% { transform: translate3d(-18px, 12px, 0); }
        }
        @keyframes lineTrace {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -240; }
        }
        @keyframes previewGlow {
          0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 0 26px rgba(251,146,60,0.12); }
          50% { box-shadow: 0 0 0 1px rgba(255,255,255,0.10), 0 0 36px rgba(125,211,252,0.14), 0 0 48px rgba(251,146,60,0.16); }
        }
        @keyframes panelBreath {
          0%, 100% { transform: translateY(0); box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 18px 46px rgba(0,0,0,0.28); }
          50% { transform: translateY(-4px); box-shadow: 0 0 0 1px rgba(255,255,255,0.10), 0 26px 64px rgba(0,0,0,0.36), 0 0 26px rgba(96,165,250,0.08); }
        }
        .orbito-grain {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
          background-size: 180px 180px;
          mix-blend-mode: overlay;
        }
        .orbito-hero-rail {
          background: linear-gradient(90deg, rgba(125,211,252,0.95), rgba(167,139,250,0.88), rgba(251,146,60,0.92), rgba(45,212,191,0.88), rgba(125,211,252,0.95));
          background-size: 220% 100%;
          animation: lineShift 6.2s linear infinite, lineHue 11s ease-in-out infinite;
        }
        .orbito-line-scene {
          animation: lineHue 9s ease-in-out infinite;
        }
        .orbito-line-a { animation: lineFloatA 7.5s ease-in-out infinite; }
        .orbito-line-b { animation: lineFloatB 8.5s ease-in-out infinite; }
        .orbito-line-c { animation: lineFloatA 10.5s ease-in-out infinite reverse; }
        .orbito-line-path {
          stroke-dasharray: 180 28;
          animation: lineTrace 6.5s linear infinite;
          will-change: stroke-dashoffset;
        }
        .orbito-line-path-alt {
          stroke-dasharray: 220 32;
          animation: lineTrace 8.4s linear infinite reverse;
          will-change: stroke-dashoffset;
        }
        .orbito-line-path-soft {
          stroke-dasharray: 140 24;
          animation: lineTrace 11s linear infinite;
          will-change: stroke-dashoffset;
        }
        .orbito-preview-shell {
          animation: previewGlow 5.2s ease-in-out infinite, panelBreath 8.5s ease-in-out infinite;
        }
        .orbito-breath {
          animation: panelBreath 8.5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .orbito-anim,
          .orbito-hero-rail,
          .orbito-line-scene,
          .orbito-line-a,
          .orbito-line-b,
          .orbito-line-c,
          .orbito-line-path,
          .orbito-line-path-alt,
          .orbito-line-path-soft,
          .orbito-preview-shell,
          .orbito-breath {
            animation: none !important;
          }
        }
        @media (max-width: 900px), (pointer: coarse) {
          .orbito-fx-heavy {
            display: none !important;
          }
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
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
              ["--orb-a" as any]: o.a,
              background: `radial-gradient(circle at 40% 35%, hsla(${o.h}, 96%, 52%, 0.94), transparent 56%), radial-gradient(circle at 70% 55%, hsla(${(o.h + 110) % 360}, 92%, 46%, 0.82), transparent 58%), radial-gradient(circle at 45% 70%, hsla(${(o.h + 220) % 360}, 88%, 40%, 0.66), transparent 60%)`,
              mixBlendMode: "screen",
              filter: `blur(${o.blur}px)`,
              animation: `orbDrift ${o.t}s ease-in-out infinite, orbPulse ${o.t + 10}s ease-in-out infinite`,
              animationDelay: `${o.d}s, ${o.d * 0.8}s`,
              transform: "translateZ(0)",
              willChange: "transform, opacity",
            }}
          />
        ))}

        <div className="absolute inset-0 opacity-[0.12] orbito-grain orbito-fx-heavy" />
      </div>

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

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
      <span>{children}</span>
    </div>
  );
}

function FlowLines() {
  return (
    <div className="relative h-[150px] overflow-hidden">
      <div className="orbito-line-scene absolute inset-0">
        <svg viewBox="0 0 1200 160" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="orb-line-a" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="35%" stopColor="#a78bfa" />
              <stop offset="70%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#facc15" />
            </linearGradient>
            <linearGradient id="orb-line-b" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#facc15" />
              <stop offset="45%" stopColor="#fb7185" />
              <stop offset="75%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#7dd3fc" />
            </linearGradient>
            <filter id="orb-line-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g className="orbito-line-a">
            <path
              d="M-40 54 C 170 94, 360 112, 610 88 S 1030 44, 1240 70"
              stroke="url(#orb-line-a)"
              strokeWidth="4"
              fill="none"
              filter="url(#orb-line-glow)"
              opacity="0.94"
              className="orbito-line-path"
            />
          </g>
          <g className="orbito-line-b">
            <path
              d="M-20 126 C 220 92, 390 60, 650 86 S 1010 132, 1230 104"
              stroke="url(#orb-line-b)"
              strokeWidth="5"
              fill="none"
              filter="url(#orb-line-glow)"
              opacity="0.92"
              className="orbito-line-path-alt"
            />
          </g>
          <g className="orbito-line-c">
            <path
              d="M-10 100 C 180 68, 390 128, 640 116 S 1020 74, 1240 90"
              stroke="url(#orb-line-a)"
              strokeWidth="2.5"
              fill="none"
              opacity="0.46"
              className="orbito-line-path-soft"
            />
          </g>
        </svg>
      </div>

      <div className="absolute left-1/2 top-1/2 w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 px-4">
        <div className="surface-soft mx-auto rounded-[24px] bg-black/35 px-6 py-4 text-center shadow-[0_22px_60px_rgba(0,0,0,0.36)]">
          <div className="text-lg font-semibold text-white/92">Set the source. Keep the clips moving.</div>
          <div className="mt-1 text-sm text-white/66">One upload can turn into days of posts.</div>
        </div>
      </div>
    </div>
  );
}

function HeroShowcase() {
  return (
    <div className="group orbito-breath surface-soft relative overflow-hidden rounded-[28px] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.34)]">
      <HoverSheen />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-10 right-[-18%] w-[46%] rounded-full bg-orange-300/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-8 left-[-16%] w-[42%] rounded-full bg-sky-300/10 blur-3xl"
      />
      <div className="orbito-hero-rail absolute inset-x-6 top-4 h-[3px] rounded-full opacity-90" />

      <div className="relative pt-5">
        <div className="flex items-center justify-between text-xs text-white/58">
          <span>Live clip workflow</span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
            active
          </span>
        </div>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between text-xs text-white/52">
            <span>Source scan</span>
            <span>12:47 video</span>
          </div>

          <div className="mt-4 space-y-4">
            {[
              { label: "Best hook", width: "30%" },
              { label: "Story payoff", width: "58%" },
              { label: "Call to action", width: "76%" },
            ].map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 text-xs text-white/52">{item.label}</div>
                <div className="h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="orbito-hero-rail h-full rounded-full"
                    style={{ width: item.width }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1.02fr_0.98fr]">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between text-xs text-white/52">
              <span>Clips ready</span>
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                live queue
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {["Hook clip", "Story clip", "CTA clip"].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/80">
                  <span>{item}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-orange-300/20 bg-[linear-gradient(140deg,rgba(255,183,3,0.08),rgba(251,86,7,0.06),rgba(96,165,250,0.06))] p-4">
            <div className="text-xs text-white/52">More ways to earn</div>
            <div className="mt-2 text-lg font-semibold text-white/92">Post more. Open more payout chances.</div>
            <div className="mt-2 text-sm leading-relaxed text-white/66">
              Use Whop when you want the money side. Keep Orbito as the clean clip workflow.
            </div>
            <div className="mt-4">
              <Link href={ORBITO_WHOP_MARKETING_URL} className="btn-whop text-xs">
                Open Whop
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/65">
          {[
            { k: "Start", v: "First clip in minutes" },
            { k: "Reach", v: "TikTok • Reels • Shorts" },
            { k: "Goal", v: "Post more. Earn more." },
          ].map((item) => (
            <div key={item.k} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-white/45">{item.k}</span>
              <span className="mx-2 text-white/25">•</span>
              <span className="text-white/80">{item.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GenerateStage({
  previewIndex,
  setPreviewIndex,
}: {
  previewIndex: number;
  setPreviewIndex: React.Dispatch<React.SetStateAction<number>>;
}) {
  const activePreview = GENERATE_PREVIEWS[previewIndex] || GENERATE_PREVIEWS[0];

  return (
    <div className="orbito-breath relative overflow-hidden rounded-3xl border border-orange-300/50 bg-[linear-gradient(120deg,rgba(255,183,3,0.18),rgba(251,86,7,0.14),rgba(96,165,250,0.14))] p-[1px] shadow-[0_0_0_1px_rgba(251,146,60,0.18),0_0_24px_rgba(251,86,7,0.16),0_0_24px_rgba(96,165,250,0.12)]">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70 blur-2xl"
        style={{
          background:
            "conic-gradient(from 120deg, rgba(255,183,3,0.24), rgba(251,86,7,0.20), rgba(96,165,250,0.20), rgba(255,183,3,0.24))",
        }}
      />
      <div className="relative rounded-[22px] bg-[linear-gradient(140deg,rgba(16,12,8,0.88),rgba(8,10,20,0.86))] p-6 md:p-7">
        <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:items-start">
          <div>
            <SectionKicker>Need fresh clips too?</SectionKicker>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Generate them.
            </h2>
            <p className="mt-3 max-w-xl text-sm text-white/70 sm:text-base">
              Type it once. See one preview at a time. Keep the one that feels right.
            </p>

            <div className="mt-5 grid gap-3">
              {[
                "Write one simple prompt",
                "Watch styles rotate live",
                "Keep your favorite and post it",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/12 bg-[linear-gradient(140deg,rgba(255,183,3,0.08),rgba(251,86,7,0.06),rgba(96,165,250,0.08))] px-4 py-3 text-sm text-white/78"
                >
                  <span className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-emerald-300/80 shadow-[0_0_14px_rgba(52,211,153,0.65)]" />
                    <span>{item}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="https://app.orbito.cc/app/labs/app/generate" className="btn-clipforge">
                Open Generate
              </Link>
              <Link href="/pricing" className="btn-ghost">
                View pricing
              </Link>
            </div>
          </div>

          <div className="group surface-soft orbito-preview-shell relative overflow-hidden rounded-[26px] p-4 transition-all duration-300 hover:border-white/18 hover:bg-white/[0.04]">
            <HoverSheen />
            <div className="relative">
              <div className="flex items-center justify-between text-xs text-white/58">
                <span>{activePreview.title} preview</span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
                  {activePreview.aspect}
                </span>
              </div>
              <div className="orbito-hero-rail mt-3 h-[3px] rounded-full opacity-90" />

              <div className="mt-4 overflow-hidden rounded-[24px] border border-white/12 bg-black/60">
                <video
                  key={activePreview.src}
                  src={activePreview.src}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  className="h-[440px] w-full"
                  style={{ objectFit: "cover", objectPosition: "center center" }}
                />
              </div>

              <div className="mt-4">
                <div className="text-lg font-semibold text-white/90">{activePreview.title} style</div>
                <div className="mt-1 text-sm leading-relaxed text-white/66">{activePreview.text}</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GENERATE_PREVIEWS.map((preview, index) => {
                  const active = index === previewIndex;
                  return (
                    <button
                      key={preview.title}
                      type="button"
                      onClick={() => setPreviewIndex(index)}
                      className={[
                        "rounded-xl border px-3 py-2 text-left text-xs transition-all",
                        active
                          ? "border-orange-300/50 bg-orange-300/[0.12] text-white"
                          : "border-white/10 bg-white/[0.03] text-white/62 hover:border-white/20 hover:text-white/82",
                      ].join(" ")}
                    >
                      {preview.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const revealRef = useReveal();

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPreviewIndex((value) => (value + 1) % GENERATE_PREVIEWS.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  const trialLocked = Boolean(me?.trial_used);

  const startTrialCta = useMemo(
    () => (className: string) => {
      if (meLoading) {
        return (
          <button
            type="button"
            disabled
            className={`${className} disabled:cursor-not-allowed disabled:opacity-70`}
          >
            Checking trial…
          </button>
        );
      }
      if (trialLocked) {
        return (
          <button
            type="button"
            disabled
            className={`${className} disabled:cursor-not-allowed disabled:opacity-70`}
            title="Your free trial has already been used. Upgrade to a paid plan."
          >
            Trial already used
          </button>
        );
      }
      return (
        <a href="/start-trial" className={className}>
          Start free
        </a>
      );
    },
    [meLoading, trialLocked]
  );

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

  return (
    <div ref={revealRef as any} className="relative overflow-x-hidden bg-transparent">
      <LandingFX />

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        <section className="relative">
          <div data-reveal className="reveal">
            <div className="surface-soft relative overflow-hidden rounded-[32px] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_rgba(125,211,252,0.20),0_0_44px_rgba(251,146,60,0.14)] sm:p-7 md:p-10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(960px_560px_at_20%_18%,rgba(255,183,3,0.10),transparent_68%), radial-gradient(860px_520px_at_82%_22%,rgba(136,120,255,0.12),transparent_70%), radial-gradient(820px_520px_at_50%_100%,rgba(70,215,255,0.10),transparent_72%)",
                }}
              />

              <div className="relative grid gap-8 md:grid-cols-[1.02fr_0.98fr] md:items-center">
                <div>
                  <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] pl-3 pr-1.5 py-1 text-[12px] text-white/75">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                    <span className="whitespace-nowrap">Long videos in. Short clips out.</span>
                    <SocialBrandPill platform="youtube" compact className="-mr-0.5" />
                  </div>

                  <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-[1.02] tracking-tight sm:text-4xl md:text-6xl">
                    Stop editing.
                    <br />
                    Start <H>making clips that pay</H>.
                  </h1>

                  <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-[15px]">
                    Upload one long video. Orbito finds the best moments, turns them into short posts, and gives you more chances to earn with Whop.
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    {startTrialCta("btn-orbito-cta")}
                    <Link href={ORBITO_WHOP_MARKETING_URL} className="btn-whop">
                      Get paid with <span className="whop-word">Whop</span>
                    </Link>
                    <Link href="/pricing" className="btn-ghost">
                      View pricing
                    </Link>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <SocialBrandRow platforms={["youtube", "tiktok", "reels", "shorts"]} compact />
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/64">
                    Upload once. Pick the clips. Post everywhere.
                    <span className="text-white/40"> Then open Generate when you want fresh footage too.</span>
                  </div>
                </div>

                <HeroShowcase />
              </div>
            </div>
          </div>
        </section>

        <section className="pt-8 sm:pt-10">
          <div data-reveal className="reveal">
            <FlowLines />
          </div>
        </section>

        <section id="how-it-works" className="pt-10 sm:pt-12">
          <div data-reveal className="reveal">
            <SectionKicker>How it works</SectionKicker>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white/94 sm:text-3xl md:text-4xl">
              One upload. More clips. Better odds.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/68 sm:text-base">
              Orbito keeps the workflow simple. You bring the long video. Orbito helps you turn it into more chances to post and earn.
            </p>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-2">
            <div
              data-reveal
              className="reveal group surface-soft relative overflow-hidden rounded-[28px] p-6 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04]"
            >
              <HoverSheen />
              <div className="orbito-hero-rail absolute inset-x-6 top-4 h-[3px] rounded-full opacity-80" />

              <div className="relative pt-5">
                <div className="text-xl font-semibold text-white/92 sm:text-2xl">Upload, pick, post.</div>
                <p className="mt-3 text-sm leading-relaxed text-white/66">
                  Use one clean flow from source video to final post.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    { step: "01", title: "Upload once", text: "Paste a link or upload a file." },
                    { step: "02", title: "Pick your clips", text: "Keep the good moments only." },
                    { step: "03", title: "Post now or later", text: "Send clips where you want them." },
                  ].map((item, index) => (
                    <div
                      key={item.title}
                      className={[
                        "rounded-2xl border border-white/10 bg-white/[0.03] p-4",
                        index === 2 ? "sm:col-span-2" : "",
                      ].join(" ")}
                    >
                      <div className="text-xs text-white/45">{item.step}</div>
                      <div className="mt-1 text-sm font-semibold text-white/86">{item.title}</div>
                      <div className="mt-1 text-xs text-white/60">{item.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {[
                {
                  title: "Post to every channel that matters",
                  text: "YouTube, TikTok, Reels, and Shorts can all sit inside the same routine.",
                },
                {
                  title: "Keep the money angle in the workflow",
                  text: "Push your best clips toward Whop campaigns when you want to turn views into payouts.",
                },
                {
                  title: "Generate new clips when you need them",
                  text: "If you run out of footage, Generate can make new social-ready videos from a prompt.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  data-reveal
                  className="reveal group surface-soft relative overflow-hidden rounded-[24px] p-5 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <HoverSheen />
                  <div className="relative">
                    <div className="text-lg font-semibold text-white/90">{item.title}</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {startTrialCta("btn-orbito-cta")}
            <Link href="/pricing" className="btn-ghost">
              View pricing
            </Link>
            <Link href="/contact" className="btn-ghost">
              Contact
            </Link>
          </div>
        </section>

        <section id="generate" className="scroll-mt-28 pt-12 sm:pt-14">
          <div data-reveal className="reveal">
            <GenerateStage previewIndex={previewIndex} setPreviewIndex={setPreviewIndex} />
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
