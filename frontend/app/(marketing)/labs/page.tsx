"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SocialBrandRow } from "@/components/SocialBrand";

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

export default function LabsMarketingPage() {
  const revealRef = useReveal();

  const prompts = useMemo<PromptDemo[]>(
    () => [
      {
        hook: "Gym comeback story",
        text: "Create a 60-second vertical post with cinematic training cuts, intense pacing, and a confident end card with strong CTA energy.",
        duration: "1 min",
        aspect: "9:16",
        style: "Image + Voice",
      },
      {
        hook: "Founder build log",
        text: "Generate a clean founder narrative with 12 scenes, modern editorial motion, and calm documentary voiceover tone.",
        duration: "1 min",
        aspect: "9:16",
        style: "Editorial",
      },
      {
        hook: "Fast educational explainer",
        text: "Build a concise explainer with scene-by-scene visuals and simple high-contrast caption moments for shorts feeds.",
        duration: "45s",
        aspect: "16:9",
        style: "Explainer",
      },
    ],
    []
  );

  const clips = useMemo<ClipDemo[]>(
    () => [
      { title: "Backyard challenge", src: "https://app.orbito.cc/app/labs/previews/labs-preview-1.mp4", duration: "6s", aspect: "9:16" },
      { title: "Closet walkthrough", src: "https://app.orbito.cc/app/labs/previews/labs-preview-2.mp4", duration: "8s", aspect: "9:16" },
      { title: "Square social cut", src: "https://app.orbito.cc/app/labs/previews/labs-preview-3.mp4", duration: "6s", aspect: "1:1" },
      { title: "Kitchen setup", src: "https://app.orbito.cc/app/labs/previews/labs-preview-4.mp4", duration: "10s", aspect: "16:9" },
    ],
    []
  );

  const [index, setIndex] = useState(0);

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
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div data-reveal className="reveal pt-1">
            <div className="pill">
              <span className="pill-dot" />
              <span className="text-white/85">AI-first video engine</span>
              <span className="text-white/45">for short-form growth</span>
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white/95 sm:text-5xl">
              Orbito Labs builds <span className="grad-text">AI clips that hook fast</span>.
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Prompt once, generate instantly, review in one clean flow, then publish directly to your connected channels.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="https://app.orbito.cc/app/labs/app/generate" className="btn-clipforge">
                Open Orbito Labs
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
              <div className="surface-soft p-4">
                <div className="text-xs text-white/55">Generation</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Prompt + voice + visuals</div>
              </div>
              <div className="surface-soft p-4">
                <div className="text-xs text-white/55">Formats</div>
                <div className="mt-1 text-sm font-semibold text-white/90">9:16 • 1:1 • 16:9</div>
              </div>
              <div className="surface-soft p-4">
                <div className="text-xs text-white/55">Output</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Ready-to-post MP4</div>
              </div>
            </div>
          </div>

          <div
            data-reveal
            className="reveal surface relative overflow-hidden p-5 sm:p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_26px_rgba(251,146,60,0.16),0_0_34px_rgba(96,165,250,0.12)]"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute -inset-8 opacity-75 blur-2xl bg-[radial-gradient(520px_260px_at_14%_18%,rgba(255,183,3,0.26),transparent_72%),radial-gradient(560px_260px_at_86%_18%,rgba(251,86,7,0.22),transparent_74%),radial-gradient(560px_280px_at_52%_92%,rgba(96,165,250,0.20),transparent_76%)]" />
            </div>

            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-white/55">Active hook</div>
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
          <div data-reveal className="reveal surface-inset p-6 sm:p-8">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {clips.map((clip) => (
                <article
                  key={clip.title}
                  className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] transition hover:-translate-y-0.5 hover:border-white/18 hover:bg-white/[0.03]"
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
                      AI-generated preview designed for hook-first feeds.
                    </div>
                  </div>
                </article>
              ))}
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
      </main>
    </div>
  );
}
