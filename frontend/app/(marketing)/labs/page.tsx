"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SocialBrandRow } from "@/components/SocialBrand";
import { BRAND } from "@/lib/brand";

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

type PromptDemo = {
  hook: string;
  text: string;
  duration: string;
  aspect: string;
  style: string;
};

type ClipDemo = {
  title: string;
  src: string;
  duration: string;
  aspect: string;
};

function LabsAura() {
  return (
    <>
      <style>{`
        @keyframes labsGlowFloat {
          0% { transform: translate3d(-2%, -2%, 0) scale(1.01); opacity: 0.62; }
          50% { transform: translate3d(2%, 1%, 0) scale(1.06); opacity: 0.78; }
          100% { transform: translate3d(-2%, -2%, 0) scale(1.01); opacity: 0.62; }
        }
        @keyframes labsSweep {
          0% { transform: translate3d(-18vw, 1vh, 0) rotate(-8deg); opacity: 0.14; }
          52% { transform: translate3d(50vw, -2vh, 0) rotate(7deg); opacity: 0.24; }
          100% { transform: translate3d(110vw, 0vh, 0) rotate(4deg); opacity: 0.14; }
        }
        .labs-grad {
          background-image: linear-gradient(92deg, #ffb703 0%, #fb5607 44%, #7aa2ff 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        @media (prefers-reduced-motion: reduce) {
          .labs-anim {
            animation: none !important;
          }
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="labs-anim absolute -inset-[36%] blur-3xl"
          style={{
            background:
              "radial-gradient(900px 520px at 16% 14%, rgba(255,183,3,0.34), transparent 66%), radial-gradient(920px 560px at 84% 16%, rgba(251,86,7,0.28), transparent 68%), radial-gradient(840px 560px at 56% 88%, rgba(122,162,255,0.26), transparent 70%)",
            mixBlendMode: "screen",
            animation: "labsGlowFloat 16s ease-in-out infinite",
          }}
        />
        <div
          className="labs-anim absolute left-[-28%] top-[8%] h-[420px] w-[760px] blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,183,3,0.30), rgba(251,86,7,0.24), rgba(122,162,255,0.20), transparent 72%)",
            mixBlendMode: "screen",
            animation: "labsSweep 14s ease-in-out infinite",
          }}
        />
      </div>
    </>
  );
}

export default function LabsMarketingPage() {
  const revealRef = useReveal();

  const prompts = useMemo<PromptDemo[]>(
    () => [
      {
        hook: "Scroll-stop opener",
        text: "Build a 35-second vertical clip with immediate hook, fast cut rhythm, and a final CTA screen that drives comments.",
        duration: "35s",
        aspect: "9:16",
        style: "Hook-first",
      },
      {
        hook: "Authority story mode",
        text: "Generate a confident founder narrative with scene direction, dynamic b-roll prompts, and premium voiceover pacing.",
        duration: "50s",
        aspect: "9:16",
        style: "Story-led",
      },
      {
        hook: "Proof-driven explainer",
        text: "Create a concise breakdown with sharp visual beats, proof moments, and high-contrast captions tuned for retention.",
        duration: "42s",
        aspect: "16:9",
        style: "Educational",
      },
      {
        hook: "Product hype drop",
        text: "Turn one product line into a high-energy launch clip with quick benefits, social proof overlays, and an urgency close.",
        duration: "30s",
        aspect: "1:1",
        style: "Launch",
      }
    ],
    []
  );

  const clips = useMemo<ClipDemo[]>(
    () => [
      { title: "Velocity ad cut", src: "https://app.orbito.cc/app/labs/previews/labs-preview-1.mp4", duration: "6s", aspect: "9:16" },
      { title: "Creator story arc", src: "https://app.orbito.cc/app/labs/previews/labs-preview-2.mp4", duration: "8s", aspect: "9:16" },
      { title: "Product teaser loop", src: "https://app.orbito.cc/app/labs/previews/labs-preview-3.mp4", duration: "6s", aspect: "1:1" },
      { title: "Wide cinematic cut", src: "https://app.orbito.cc/app/labs/previews/labs-preview-4.mp4", duration: "10s", aspect: "16:9" },
    ],
    []
  );

  const [index, setIndex] = useState(0);
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((v) => (v + 1) % prompts.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [prompts.length]);

  const activePrompt = prompts[index] || prompts[0]!;
  const activeClip = clips[index % clips.length] || clips[0]!;

  return (
    <div ref={revealRef as any} className="relative overflow-x-hidden">
      <LabsAura />
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div data-reveal className="reveal pt-1">
            <div className="pill border-orange-200/35 bg-[linear-gradient(90deg,rgba(255,183,3,0.12),rgba(251,86,7,0.1),rgba(122,162,255,0.1))]">
              <span className="pill-dot" />
              <span className="text-white/88">AI clip engine</span>
              <span className="text-white/55">for creator growth</span>
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white/95 sm:text-5xl">
              One idea in. <span className="labs-grad">Endless AI hooks out</span>.
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Orbito Labs turns prompts into ready-to-post clips with visuals, voice, captions, and hook-first pacing tuned for social feeds.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="https://app.orbito.cc/app/labs/app/generate" className="btn-clipforge">
                Launch AI Lab
              </Link>
              <Link href="/pricing" className="btn-ghost">
                View plans
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-2">
              <SocialBrandRow platforms={["tiktok", "reels", "shorts", "facebook"]} compact />
              <span className="text-xs text-white/45">Generate, edit, and schedule in one workflow.</span>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="surface-soft border-orange-200/25 p-4">
                <div className="text-xs text-white/60">Prompt Stack</div>
                <div className="mt-1 text-sm font-semibold text-white/92">Hook + scenes + CTA</div>
              </div>
              <div className="surface-soft border-orange-200/25 p-4">
                <div className="text-xs text-white/60">AI Output Modes</div>
                <div className="mt-1 text-sm font-semibold text-white/92">Video • Image • Voice</div>
              </div>
              <div className="surface-soft border-orange-200/25 p-4">
                <div className="text-xs text-white/60">Format Control</div>
                <div className="mt-1 text-sm font-semibold text-white/92">9:16 • 1:1 • 16:9</div>
              </div>
            </div>
          </div>

          <div
            data-reveal
            className="reveal surface relative overflow-hidden border-orange-300/45 p-5 shadow-[0_0_0_1px_rgba(255,183,3,0.28),0_0_30px_rgba(251,146,60,0.22),0_0_36px_rgba(122,162,255,0.18)] sm:p-6"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute -inset-8 opacity-75 blur-2xl bg-[radial-gradient(520px_260px_at_14%_18%,rgba(255,183,3,0.26),transparent_72%),radial-gradient(560px_260px_at_86%_18%,rgba(251,86,7,0.22),transparent_74%),radial-gradient(560px_280px_at_52%_92%,rgba(96,165,250,0.20),transparent_76%)]" />
            </div>

            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-white/55">Active AI hook</div>
                  <div className="mt-1 text-sm font-semibold text-white/92">{activePrompt.hook}</div>
                </div>
                <span className="chip">Preview</span>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="text-[13px] leading-relaxed text-white/82">{activePrompt.text}</div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs text-white/55">Duration</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">{activePrompt.duration}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs text-white/55">Aspect</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">{activePrompt.aspect}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs text-white/55">Style</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">{activePrompt.style}</div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-white/55">{activeClip.title}</div>
                  <div className="text-xs text-white/55">
                    {activeClip.aspect} • {activeClip.duration}
                  </div>
                </div>

                <div className="mt-3 h-[230px] w-full overflow-hidden rounded-xl border border-white/10 bg-black/50">
                  <video
                    src={activeClip.src}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div data-reveal className="reveal surface-inset border-orange-200/30 p-6 sm:p-8">
            <div className="text-xs text-white/60">Live clip previews</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white/94 sm:text-3xl">
              Built for <span className="labs-grad">AI-native short-form marketing</span>.
            </h2>
            <p className="mt-3 max-w-3xl text-sm text-white/68 sm:text-base">
              Every preview below was generated in Labs flow: prompt, visual direction, voice, and publish-ready output.
            </p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {clips.map((clip) => (
                <article
                  key={clip.title}
                  className="group mt-5 overflow-hidden rounded-3xl border border-orange-200/22 bg-[linear-gradient(150deg,rgba(255,183,3,0.06),rgba(251,86,7,0.05),rgba(122,162,255,0.06))] transition hover:-translate-y-0.5 hover:border-orange-200/40 hover:bg-[linear-gradient(150deg,rgba(255,183,3,0.10),rgba(251,86,7,0.07),rgba(122,162,255,0.08))]"
                >
                  <div className="relative h-[180px] overflow-hidden border-b border-white/10 bg-black/40">
                    <video
                      src={clip.src}
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,0.36))]" />
                    <div className="absolute left-3 top-3 flex gap-2">
                      <span className="chip">{clip.aspect}</span>
                      <span className="chip">{clip.duration}</span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-semibold text-white/90">{clip.title}</div>
                    <div className="mt-2 text-xs text-white/60">
                      Hook-led AI output tuned for retention and replay.
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-orange-200/28 bg-[linear-gradient(145deg,rgba(255,183,3,0.10),rgba(251,86,7,0.06),rgba(122,162,255,0.08))] p-4">
                <div className="text-xs text-white/58">AI Script Assist</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Writes scene-by-scene direction</div>
              </div>
              <div className="rounded-2xl border border-orange-200/28 bg-[linear-gradient(145deg,rgba(255,183,3,0.10),rgba(251,86,7,0.06),rgba(122,162,255,0.08))] p-4">
                <div className="text-xs text-white/58">Voice + Caption Layer</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Auto voiceover with style control</div>
              </div>
              <div className="rounded-2xl border border-orange-200/28 bg-[linear-gradient(145deg,rgba(255,183,3,0.10),rgba(251,86,7,0.06),rgba(122,162,255,0.08))] p-4">
                <div className="text-xs text-white/58">Export + Publish</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Send straight into Orbito workflow</div>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="https://app.orbito.cc/app/labs/app/generate" className="btn-clipforge">
                Start in Labs
              </Link>
              <Link href="/contact" className="btn-ghost">
                Talk to support
              </Link>
            </div>
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
