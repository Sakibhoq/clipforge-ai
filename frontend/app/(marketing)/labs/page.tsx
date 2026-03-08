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
          0% { transform: translate3d(-2%, -2%, 0) scale(1.01); opacity: 0.72; }
          50% { transform: translate3d(2%, 1%, 0) scale(1.07); opacity: 0.9; }
          100% { transform: translate3d(-2%, -2%, 0) scale(1.01); opacity: 0.72; }
        }
        @keyframes labsSweep {
          0% { transform: translate3d(-18vw, 1vh, 0) rotate(-8deg); opacity: 0.2; }
          52% { transform: translate3d(50vw, -2vh, 0) rotate(7deg); opacity: 0.34; }
          100% { transform: translate3d(110vw, 0vh, 0) rotate(4deg); opacity: 0.2; }
        }
        .labs-grad {
          background-image: linear-gradient(92deg, #ffb703 0%, #fb5607 44%, #7aa2ff 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .labs-page .labs-card {
          border-color: rgba(251, 86, 7, 0.5) !important;
          box-shadow:
            0 0 0 1px rgba(255, 183, 3, 0.18),
            0 14px 36px rgba(0, 0, 0, 0.52),
            0 0 30px rgba(251, 86, 7, 0.2);
        }
        .labs-page .labs-card-strong {
          border-color: rgba(251, 86, 7, 0.62) !important;
          box-shadow:
            0 0 0 1px rgba(255, 183, 3, 0.24),
            0 20px 48px rgba(0, 0, 0, 0.56),
            0 0 42px rgba(251, 86, 7, 0.28);
        }
        @media (prefers-reduced-motion: reduce) {
          .labs-anim {
            animation: none !important;
          }
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,8,0.96),rgba(4,4,8,0.94))]" />
        <div
          className="absolute inset-0 opacity-[0.78]"
          style={{
            background:
              "radial-gradient(1200px 720px at 18% 12%, rgba(255,183,3,0.28), transparent 64%), radial-gradient(1200px 740px at 82% 14%, rgba(251,86,7,0.34), transparent 66%), radial-gradient(980px 620px at 54% 84%, rgba(251,86,7,0.24), transparent 68%), radial-gradient(820px 500px at 62% 42%, rgba(58,134,255,0.12), transparent 70%)",
          }}
        />
        <div
          className="labs-anim absolute -inset-[36%] blur-3xl"
          style={{
            background:
              "radial-gradient(900px 520px at 16% 14%, rgba(255,183,3,0.5), transparent 66%), radial-gradient(920px 560px at 84% 16%, rgba(251,86,7,0.45), transparent 68%), radial-gradient(840px 560px at 56% 88%, rgba(122,162,255,0.2), transparent 70%)",
            mixBlendMode: "screen",
            animation: "labsGlowFloat 16s ease-in-out infinite",
          }}
        />
        <div
          className="labs-anim absolute left-[-28%] top-[8%] h-[420px] w-[760px] blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,183,3,0.38), rgba(251,86,7,0.3), rgba(122,162,255,0.16), transparent 72%)",
            mixBlendMode: "screen",
            animation: "labsSweep 14s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(251,86,7,0.20) 0 1px, transparent 1px 34px), repeating-linear-gradient(to right, rgba(255,183,3,0.10) 0 1px, transparent 1px 92px)",
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
        hook: "Make people stop scrolling",
        text: "Write one idea. Labs turns it into a short video with a strong first line and fast cuts.",
        duration: "35s",
        aspect: "9:16",
        style: "Fast Hook",
      },
      {
        hook: "Tell your story fast",
        text: "Labs builds your story step by step so people understand it in seconds.",
        duration: "50s",
        aspect: "9:16",
        style: "Story",
      },
      {
        hook: "Teach in under a minute",
        text: "Turn hard topics into simple clips with clear words and clean captions.",
        duration: "42s",
        aspect: "16:9",
        style: "Teach",
      },
      {
        hook: "Sell one product now",
        text: "Show what it does, why it helps, and tell people what to do next.",
        duration: "30s",
        aspect: "1:1",
        style: "Launch",
      },
    ],
    []
  );

  const clips = useMemo<ClipDemo[]>(
    () => [
      { title: "Quick hook ad", src: "https://app.orbito.cc/app/labs/previews/labs-preview-1.mp4", duration: "6s", aspect: "9:16" },
      { title: "Story clip", src: "https://app.orbito.cc/app/labs/previews/labs-preview-2.mp4", duration: "8s", aspect: "9:16" },
      { title: "Product teaser", src: "https://app.orbito.cc/app/labs/previews/labs-preview-3.mp4", duration: "6s", aspect: "1:1" },
      { title: "Wide promo", src: "https://app.orbito.cc/app/labs/previews/labs-preview-4.mp4", duration: "10s", aspect: "16:9" },
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
    <div ref={revealRef as any} className="labs-page relative overflow-x-hidden">
      <LabsAura />
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div data-reveal className="reveal pt-1">
            <div className="pill border-orange-200/35 bg-[linear-gradient(90deg,rgba(255,183,3,0.14),rgba(251,86,7,0.14),rgba(122,162,255,0.08))]">
              <span className="pill-dot" />
              <span className="text-white/90">AI video lab</span>
              <span className="text-white/62">built for creators</span>
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white/95 sm:text-5xl">
              Type one idea. <span className="labs-grad">Get a video people watch</span>.
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              No camera setup. No long edit. Labs writes the flow, builds the scenes, and gives you a post-ready clip.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="https://app.orbito.cc/app/labs/app/generate" className="btn-clipforge">
                Open AI Lab
              </Link>
              <Link href="/pricing" className="btn-ghost">
                View plans
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-2">
              <SocialBrandRow platforms={["tiktok", "reels", "shorts", "facebook"]} compact />
              <span className="text-xs text-white/55">Make it. Fix it. Post it.</span>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="surface-soft labs-card p-4">
                <div className="text-xs text-white/60">Step 1</div>
                <div className="mt-1 text-sm font-semibold text-white/92">Tell Labs your idea</div>
              </div>
              <div className="surface-soft labs-card p-4">
                <div className="text-xs text-white/60">Step 2</div>
                <div className="mt-1 text-sm font-semibold text-white/92">Pick a style and voice</div>
              </div>
              <div className="surface-soft labs-card p-4">
                <div className="text-xs text-white/60">Step 3</div>
                <div className="mt-1 text-sm font-semibold text-white/92">Export and post</div>
              </div>
            </div>
          </div>

          <div
            data-reveal
            className="reveal surface labs-card labs-card-strong relative overflow-hidden p-5 sm:p-6"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute -inset-8 opacity-85 blur-2xl bg-[radial-gradient(520px_260px_at_14%_18%,rgba(255,183,3,0.3),transparent_72%),radial-gradient(560px_260px_at_86%_18%,rgba(251,86,7,0.3),transparent_74%),radial-gradient(560px_280px_at_52%_92%,rgba(96,165,250,0.16),transparent_76%)]" />
            </div>

            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-white/62">Today&apos;s hook</div>
                  <div className="mt-1 text-sm font-semibold text-white/92">{activePrompt.hook}</div>
                </div>
                <span className="chip">Preview</span>
              </div>

              <div className="labs-card mt-4 rounded-2xl border bg-black/45 p-4">
                <div className="text-[13px] leading-relaxed text-white/82">{activePrompt.text}</div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="labs-card rounded-2xl border bg-white/[0.03] p-4">
                  <div className="text-xs text-white/62">Length</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">{activePrompt.duration}</div>
                </div>
                <div className="labs-card rounded-2xl border bg-white/[0.03] p-4">
                  <div className="text-xs text-white/62">Size</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">{activePrompt.aspect}</div>
                </div>
                <div className="labs-card rounded-2xl border bg-white/[0.03] p-4">
                  <div className="text-xs text-white/55">Style</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">{activePrompt.style}</div>
                </div>
              </div>

              <div className="labs-card mt-5 rounded-2xl border bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-white/55">{activeClip.title}</div>
                  <div className="text-xs text-white/55">
                    {activeClip.aspect} • {activeClip.duration}
                  </div>
                </div>

                <div className="labs-card mt-3 h-[230px] w-full overflow-hidden rounded-xl border bg-black/50">
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
          <div data-reveal className="reveal surface-inset labs-card labs-card-strong p-6 sm:p-8">
            <div className="text-xs text-white/62">Real clips made in Labs</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white/94 sm:text-3xl">
              Make fast clips with a <span className="labs-grad">real AI workflow</span>.
            </h2>
            <p className="mt-3 max-w-3xl text-sm text-white/68 sm:text-base">
              These previews were made with one prompt, smart visuals, and auto voice. You can do this in minutes.
            </p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {clips.map((clip) => (
                <article
                  key={clip.title}
                  className="group labs-card mt-5 overflow-hidden rounded-3xl border bg-[linear-gradient(150deg,rgba(255,183,3,0.08),rgba(251,86,7,0.08),rgba(122,162,255,0.06))] transition hover:-translate-y-0.5"
                >
                  <div className="relative h-[180px] overflow-hidden border-b border-[#fb560788] bg-black/40">
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
                      Simple, clear, and made to hook fast.
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="labs-card rounded-2xl border bg-[linear-gradient(145deg,rgba(255,183,3,0.10),rgba(251,86,7,0.08),rgba(122,162,255,0.08))] p-4">
                <div className="text-xs text-white/58">Smart script help</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Labs writes your plan</div>
              </div>
              <div className="labs-card rounded-2xl border bg-[linear-gradient(145deg,rgba(255,183,3,0.10),rgba(251,86,7,0.08),rgba(122,162,255,0.08))] p-4">
                <div className="text-xs text-white/58">Voice and captions</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Auto speech and text</div>
              </div>
              <div className="labs-card rounded-2xl border bg-[linear-gradient(145deg,rgba(255,183,3,0.10),rgba(251,86,7,0.08),rgba(122,162,255,0.08))] p-4">
                <div className="text-xs text-white/58">Post everywhere</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Send to your channels</div>
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
