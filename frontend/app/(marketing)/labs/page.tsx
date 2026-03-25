"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SocialBrandRow } from "@/components/SocialBrand";
import { BRAND } from "@/lib/brand";
import { apiFetch } from "@/lib/api";

function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const items = Array.from(el.querySelectorAll("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.14 }
    );

    items.forEach((node) => io.observe(node));
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
  text: string;
  src: string;
  duration: string;
  aspect: string;
};

function GenerateBackdrop() {
  return (
    <>
      <style>{`
        @keyframes orbitoGenerateFloat {
          0% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -12px, 0) scale(1.04); }
          100% { transform: translate3d(0, 0, 0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .orbito-generate-anim {
            animation: none !important;
          }
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(900px_560px_at_12%_10%,rgba(255,186,77,0.16),transparent_68%),radial-gradient(920px_560px_at_88%_10%,rgba(82,152,255,0.18),transparent_70%),radial-gradient(780px_440px_at_50%_88%,rgba(255,128,72,0.10),transparent_72%)]" />
        <div
          className="orbito-generate-anim absolute left-[-8%] top-[8%] h-[360px] w-[360px] rounded-full blur-3xl"
          style={{
            background: "radial-gradient(circle, rgba(255,186,77,0.16) 0%, rgba(255,186,77,0.05) 42%, transparent 72%)",
            animation: "orbitoGenerateFloat 17s ease-in-out infinite",
          }}
        />
        <div
          className="orbito-generate-anim absolute right-[-8%] top-[10%] h-[360px] w-[360px] rounded-full blur-3xl"
          style={{
            background: "radial-gradient(circle, rgba(82,152,255,0.18) 0%, rgba(82,152,255,0.05) 42%, transparent 72%)",
            animation: "orbitoGenerateFloat 19s ease-in-out infinite reverse",
          }}
        />
      </div>
    </>
  );
}

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/62">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
      <span>{children}</span>
    </div>
  );
}

export default function LabsMarketingPage() {
  const revealRef = useReveal();
  const [credits, setCredits] = useState<number | null>(null);
  const [index, setIndex] = useState(0);

  const prompts = useMemo<PromptDemo[]>(
    () => [
      {
        hook: "Stop the scroll in 2 seconds",
        text: "Give one simple idea. Generate writes the hook, scene plan, and voiceover direction fast.",
        duration: "35s",
        aspect: "9:16",
        style: "Fast Hook",
      },
      {
        hook: "Tell your story fast",
        text: "Build short-form story flow with cleaner pacing and clearer payoff when you do not have source footage.",
        duration: "50s",
        aspect: "9:16",
        style: "Story",
      },
      {
        hook: "Teach in under a minute",
        text: "Turn a hard idea into a clear AI-generated short with voice, captions, and a tighter structure.",
        duration: "42s",
        aspect: "16:9",
        style: "Teach",
      },
      {
        hook: "Launch your product today",
        text: "Show what a product does, why it matters, and what people should do next with a single prompt.",
        duration: "30s",
        aspect: "1:1",
        style: "Launch",
      },
    ],
    []
  );

  const clips = useMemo<ClipDemo[]>(
    () => [
      {
        title: "Real clip",
        text: "Cinematic and clean for premium-feeling short-form output.",
        src: "https://app.orbito.cc/app/labs/previews/labs-preview-1.mp4",
        duration: "7s",
        aspect: "9:16",
      },
      {
        title: "Cartoon clip",
        text: "Bright visual style for fast, scroll-stopping social posts.",
        src: "https://app.orbito.cc/app/labs/previews/labs-preview-2.mp4",
        duration: "7s",
        aspect: "16:9",
      },
      {
        title: "Anime clip",
        text: "High-energy style for stronger visual punch.",
        src: "https://app.orbito.cc/app/labs/previews/labs-preview-3.mp4",
        duration: "7s",
        aspect: "9:16",
      },
      {
        title: "Comic clip",
        text: "Bold framing and contrast for story-led short-form scenes.",
        src: "https://app.orbito.cc/app/labs/previews/labs-preview-4.mp4",
        duration: "7s",
        aspect: "9:16",
      },
    ],
    []
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % prompts.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [prompts.length]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const me = await apiFetch<{ credits?: number }>("/auth/me", { method: "GET" });
        if (!canceled && Number.isFinite(me?.credits as number)) {
          setCredits(Number(me?.credits));
        }
      } catch {
        if (!canceled) setCredits(null);
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  const activePrompt = prompts[index] || prompts[0]!;
  const activeClip = clips[index % clips.length] || clips[0]!;
  const labsGeneratorHref =
    credits != null && credits <= 0 ? "/pricing?intent=labs" : "https://app.orbito.cc/app/labs/app/generate";

  return (
    <div ref={revealRef} className="theme-labs relative overflow-x-hidden">
      <GenerateBackdrop />

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        <section className="relative">
          <div data-reveal className="reveal">
            <div className="surface relative overflow-hidden p-6 sm:p-8 md:p-10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(920px 420px at 16% 14%, rgba(255,186,77,0.15), transparent 70%), radial-gradient(860px 420px at 88% 16%, rgba(82,152,255,0.14), transparent 72%), radial-gradient(720px 360px at 50% 100%, rgba(255,128,72,0.08), transparent 74%)",
                }}
              />

              <div className="relative grid gap-8 lg:grid-cols-[1.02fr_0.98fr]">
                <div>
                  <SectionKicker>Orbito Generate</SectionKicker>
                  <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white/96 sm:text-5xl md:text-6xl">
                    The AI video generation mode inside <span className="grad-text">Orbito</span>.
                  </h1>
                  <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/68">
                    Generate is how Orbito creates fresh short-form content when you do not have source footage. Same account, same
                    platform, same goal: help you make more short-form content without more editing.
                  </p>

                  <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <Link href={labsGeneratorHref} className="btn-clipforge">
                      Open Generate
                    </Link>
                    <Link href="/pricing" className="btn-ghost">
                      View plans
                    </Link>
                    <Link href="/" className="btn-ghost">
                      Back to Clip mode
                    </Link>
                  </div>

                  <div className="mt-7 flex flex-wrap items-center gap-2">
                    <SocialBrandRow platforms={["tiktok", "reels", "shorts", "facebook"]} compact />
                  </div>

                  <div className="mt-6 grid gap-2 sm:grid-cols-2">
                    {[
                      "One prompt to output",
                      "Shared Orbito account",
                      "Built for short-form formats",
                      "Publish flow stays connected",
                    ].map((item) => (
                      <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/74">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="surface-soft p-5">
                  <div className="flex items-center justify-between text-xs text-white/54">
                    <span>Prompt-to-video preview</span>
                    <span className="rounded-full border border-amber-300/22 bg-amber-300/[0.10] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                      Live
                    </span>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-xs uppercase tracking-[0.12em] text-white/48">Active prompt</div>
                    <div className="mt-2 text-xl font-semibold text-white/92">{activePrompt.hook}</div>
                    <p className="mt-3 text-sm leading-relaxed text-white/66">{activePrompt.text}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-white/50">Length</div>
                      <div className="mt-1 text-white/90">{activePrompt.duration}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-white/50">Aspect</div>
                      <div className="mt-1 text-white/90">{activePrompt.aspect}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-white/50">Style</div>
                      <div className="mt-1 text-white/90">{activePrompt.style}</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-3">
                    <div className="mb-2 flex items-center justify-between text-[11px] text-white/56">
                      <span>{activeClip.title}</span>
                      <span>
                        {activeClip.aspect} • {activeClip.duration}
                      </span>
                    </div>
                    <div className="flex h-[220px] items-center justify-center overflow-hidden rounded-xl border border-white/12 bg-black/60">
                      <video
                        src={activeClip.src}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="metadata"
                        className="max-h-full max-w-full"
                        style={{ objectFit: "contain", objectPosition: "center center" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="pt-16">
          <div data-reveal className="reveal">
            <SectionKicker>How Generate Fits Orbito</SectionKicker>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Start with a prompt. Finish with a video ready to post.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/66 sm:text-base">
              Generate gives you a second way to create inside Orbito. Use it when you need fresh footage, faster concept testing, or
              AI-led production without leaving the same publishing workflow.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Same workspace",
                text: "Open Generate from the same Orbito account and keep your content, credits, and workflow in one place.",
              },
              {
                title: "Built for short-form",
                text: "Choose styles, pacing, and formats designed for TikTok, Reels, Shorts, and other social outputs.",
              },
              {
                title: "Prompt in, content out",
                text: "Start with an idea instead of raw footage, then review and publish without switching tools.",
              },
            ].map((item) => (
              <div key={item.title} data-reveal className="reveal surface-soft p-5">
                <div className="text-lg font-semibold text-white/92">{item.title}</div>
                <div className="mt-3 text-sm leading-relaxed text-white/64">{item.text}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-16">
          <div data-reveal className="reveal surface-inset p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
              <div>
                <SectionKicker>Prompt To Publish</SectionKicker>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  One idea. Structured output. Fast iteration.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-white/66 sm:text-base">
                  Use Generate when you want to test multiple concepts quickly, create videos for products or stories, or build fresh
                  short-form assets without recording new footage first.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    title: "Write one idea",
                    text: "Start with the topic, hook, or outcome you want the short to land.",
                  },
                  {
                    title: "Pick settings",
                    text: "Choose visual style, shape the pacing, and decide how you want the output to feel.",
                  },
                  {
                    title: "Generate and post",
                    text: "Review the output, keep the best versions, and move into the same publishing workflow.",
                  },
                ].map((item) => (
                  <div key={item.title} className="surface-soft p-5">
                    <div className="text-sm font-semibold text-white/90">{item.title}</div>
                    <div className="mt-3 text-sm leading-relaxed text-white/64">{item.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pt-16">
          <div data-reveal className="reveal">
            <SectionKicker>Output Styles</SectionKicker>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Same product, wider creative range.
            </h2>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {clips.map((clip) => (
              <article key={clip.title} data-reveal className="reveal surface-soft overflow-hidden p-0">
                <div className="relative flex h-[180px] items-center justify-center overflow-hidden border-b border-white/10 bg-black/60">
                  <video
                    src={clip.src}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    className="max-h-full max-w-full"
                    style={{ objectFit: "contain", objectPosition: "center center" }}
                  />
                  <div className="absolute left-3 top-3 flex gap-2">
                    <span className="chip">{clip.aspect}</span>
                    <span className="chip">{clip.duration}</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-sm font-semibold text-white/90">{clip.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/62">{clip.text}</div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={labsGeneratorHref} className="btn-clipforge">
              Start with Generate
            </Link>
            <Link href="/pricing" className="btn-ghost">
              Compare plans
            </Link>
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
