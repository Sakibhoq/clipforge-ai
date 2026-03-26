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
        text: "Write the idea once. Generate helps make the hook, scenes, and voice fast.",
        duration: "35s",
        aspect: "9:16",
        style: "Fast Hook",
      },
      {
        hook: "Tell your story fast",
        text: "Make a short story video when you do not have footage ready.",
        duration: "50s",
        aspect: "9:16",
        style: "Story",
      },
      {
        hook: "Teach it in under a minute",
        text: "Turn a hard idea into a short video with voice and captions.",
        duration: "42s",
        aspect: "16:9",
        style: "Teach",
      },
      {
        hook: "Launch your product today",
        text: "Show what your product does and tell people what to do next.",
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
        text: "Clean and polished for product videos.",
        src: "https://app.orbito.cc/app/labs/previews/labs-preview-1.mp4",
        duration: "7s",
        aspect: "9:16",
      },
      {
        title: "Cartoon clip",
        text: "Bright and fun for fast social posts.",
        src: "https://app.orbito.cc/app/labs/previews/labs-preview-2.mp4",
        duration: "7s",
        aspect: "16:9",
      },
      {
        title: "Anime clip",
        text: "More energy for stronger hooks.",
        src: "https://app.orbito.cc/app/labs/previews/labs-preview-3.mp4",
        duration: "7s",
        aspect: "9:16",
      },
      {
        title: "Comic clip",
        text: "Bold and clear for story or promo videos.",
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

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+4.5rem)]">
        <section className="relative">
          <div data-reveal className="reveal">
            <div className="studio-frame px-5 py-6 sm:px-7 sm:py-7 md:px-8 md:py-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(920px 420px at 16% 14%, rgba(255,186,77,0.15), transparent 70%), radial-gradient(860px 420px at 88% 16%, rgba(82,152,255,0.14), transparent 72%), radial-gradient(720px 360px at 50% 100%, rgba(255,128,72,0.08), transparent 74%)",
                }}
              />

              <div className="grid gap-6 lg:grid-cols-[0.98fr_1.02fr]">
                <div>
                  <SectionKicker>Orbito Generate</SectionKicker>
                  <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white/96 sm:text-5xl md:text-6xl">
                    Make short videos without filming first.
                  </h1>
                  <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/68 sm:text-base">
                    Type an idea and let Orbito make the video. It uses the same account as Clip.
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <Link href={labsGeneratorHref} className="btn-clipforge">
                      Open Generate
                    </Link>
                    <Link href="/pricing" className="btn-ghost">
                      See pricing
                    </Link>
                    <Link href="/" className="btn-ghost">
                      Back to Clip
                    </Link>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <SocialBrandRow platforms={["tiktok", "reels", "shorts", "facebook"]} compact />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {["Type an idea", "Same account", "Ready to post"].map((item) => (
                      <div key={item} className="signal-chip">
                        <span className="live-dot" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="studio-frame p-4 sm:p-5">
                  <div className="flex items-center justify-between text-xs text-white/54">
                    <span>Generate</span>
                    <span className="signal-chip border-amber-300/22 bg-amber-300/[0.10] text-amber-100">
                      <span className="live-dot" />
                      Rendering
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-[0.92fr_1.08fr]">
                    <div className="rounded-[24px] border border-white/10 bg-black/26 p-4">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-white/44">Prompt</div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-white/92">{activePrompt.hook}</div>
                      <p className="mt-2 text-sm leading-relaxed text-white/66">{activePrompt.text}</p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                        <div className="metric-chip">
                          <div className="value">{activePrompt.duration}</div>
                          <div className="label">Length</div>
                        </div>
                        <div className="metric-chip">
                          <div className="value">{activePrompt.aspect}</div>
                          <div className="label">Aspect</div>
                        </div>
                        <div className="metric-chip">
                          <div className="value">{activePrompt.style}</div>
                          <div className="label">Style</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-amber-300/18 bg-[#130d0a] p-3">
                      <div className="mb-2 flex items-center justify-between text-[11px] text-white/56">
                        <span>{activeClip.title}</span>
                        <span>
                          {activeClip.aspect} • {activeClip.duration}
                        </span>
                      </div>
                      <div className="flex h-[292px] items-center justify-center overflow-hidden rounded-2xl border border-white/12 bg-black/60">
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
          </div>
        </section>

        <section className="pt-12">
          <div data-reveal className="reveal">
            <div className="studio-frame p-5 sm:p-6">
              <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
                <div>
                  <SectionKicker>Where Generate Fits</SectionKicker>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                    Generate is part of Orbito.
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-white/66 sm:text-base">
                    Use Clip when you have a video. Use Generate when you only have an idea.
                  </p>
                </div>

                <div className="section-rail space-y-5">
                  {[
                    {
                      title: "Same account",
                      text: "Open Generate from the same Orbito account and keep everything in one place.",
                    },
                    {
                      title: "Made for short videos",
                      text: "The styles and sizes are built for TikTok, Reels, and Shorts.",
                    },
                    {
                      title: "Type it. Make it.",
                      text: "Start with an idea, keep the best version, then post it.",
                    },
                  ].map((item, index) => (
                    <div key={item.title} className="relative pl-8">
                      <div className="absolute left-0 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-white/14 bg-white/[0.05] text-[10px] font-semibold text-white/70">
                        {index + 1}
                      </div>
                      <div className="text-lg font-semibold tracking-tight text-white/90">{item.title}</div>
                      <div className="mt-1.5 text-sm leading-relaxed text-white/64">{item.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pt-12">
          <div data-reveal className="reveal">
            <div className="studio-frame p-5 sm:p-6">
              <SectionKicker>Prompt To Publish</SectionKicker>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                Four easy steps.
              </h2>

              <div className="mt-6 grid gap-3 md:grid-cols-4">
                {[
                  { step: "01", title: "Write the idea", text: "Say what the video should be about." },
                  { step: "02", title: "Pick the look", text: "Choose the style and size you want." },
                  { step: "03", title: "Make the video", text: "Let Orbito make a few versions fast." },
                  { step: "04", title: "Post it", text: "Pick the best one and get it ready to post." },
                ].map((item) => (
                  <div key={item.step} className="surface-soft motion-card p-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">{item.step}</div>
                    <div className="mt-2 text-lg font-semibold text-white/90">{item.title}</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pt-12">
          <div data-reveal className="reveal">
            <div className="studio-frame p-5 sm:p-6">
              <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
                <div>
                  <SectionKicker>Output Styles</SectionKicker>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                    Different looks. Same tool.
                  </h2>
                  <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/66 sm:text-base">
                    You can change the style, but the way you use it stays simple.
                  </p>

                  <div className="mt-5 rounded-[28px] border border-white/10 bg-black/40 p-4">
                    <div className="mb-3 flex items-center justify-between text-xs text-white/56">
                      <span>{activeClip.title}</span>
                      <span>
                        {activeClip.aspect} • {activeClip.duration}
                      </span>
                    </div>
                    <div className="flex h-[380px] items-center justify-center overflow-hidden rounded-[22px] border border-white/10 bg-black/60">
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

                <div className="grid gap-3">
                  {clips.map((clip, clipIndex) => {
                    const active = clip.title === activeClip.title && clipIndex === index % clips.length;
                    return (
                      <div
                        key={clip.title}
                        className={[
                          "rounded-[24px] border p-4 transition-all duration-300",
                          active
                            ? "border-amber-300/24 bg-amber-300/[0.08]"
                            : "border-white/10 bg-white/[0.03]",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold text-white/90">{clip.title}</div>
                            <div className="mt-1.5 text-sm leading-relaxed text-white/64">{clip.text}</div>
                          </div>
                          {active ? <span className="live-dot" /> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <div className="signal-chip">{clip.aspect}</div>
                          <div className="signal-chip">{clip.duration}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href={labsGeneratorHref} className="btn-clipforge">
                  Open Generate
                </Link>
                <Link href="/pricing" className="btn-ghost">
                  See pricing
                </Link>
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
