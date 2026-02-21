// frontend/app/(marketing)/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
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
  title: string;
  text: string;
  duration: string;
  aspect: string;
  style: string;
};

type SampleClip = {
  title: string;
  text: string;
  duration: string;
  aspect: string;
  style: string;
  src: string;
};

export default function Page() {
  const revealRef = useReveal();

  const prompts = useMemo<PromptDemo[]>(
    () => [
      {
        title: "1-minute motivational post",
        text: "Build a 1-minute vertical story with 12 cinematic frames: sunrise city, close-up hands writing goals, gym silhouettes, progress montage, and a confident end card.",
        duration: "1 min",
        aspect: "9:16",
        style: "Image + Voice",
      },
      {
        title: "2-minute storytelling post",
        text: "Create a two-minute founder story with 20 clean visual scenes, modern editorial style, subtle motion, and a calm conversational narration.",
        duration: "2 min",
        aspect: "9:16",
        style: "Editorial",
      },
      {
        title: "Educational explainer",
        text: "Generate a concise explainer with scene-by-scene visuals for each idea, clear hierarchy, high-contrast text moments, and social-safe composition.",
        duration: "1 min",
        aspect: "16:9",
        style: "Explainer",
      },
    ],
    []
  );

  const sampleClips = useMemo<SampleClip[]>(
    () => [
      {
        title: "Coffee pour macro",
        text: "Close-up of espresso pouring into a glass, warm window light, shallow depth of field, subtle film grain.",
        duration: "6s",
        aspect: "9:16",
        style: "Warm",
        src: "/previews/labs-preview-1.mp4",
      },
      {
        title: "Neon street b-roll",
        text: "Slow dolly-in on a neon-lit street at night, rain reflections, moody cinematic lighting, soft haze.",
        duration: "8s",
        aspect: "9:16",
        style: "Cinematic",
        src: "/previews/labs-preview-2.mp4",
      },
      {
        title: "Minimal product spin",
        text: "Matte-black sneaker on clean studio backdrop, slow turntable rotation, crisp highlights, premium look.",
        duration: "6s",
        aspect: "1:1",
        style: "Clean",
        src: "/previews/labs-preview-3.mp4",
      },
      {
        title: "Golden-hour travel",
        text: "Drone flyover of a coastal cliff path at golden hour, soft fog, gentle camera motion, warm grade.",
        duration: "10s",
        aspect: "16:9",
        style: "Warm",
        src: "/previews/labs-preview-4.mp4",
      },
      {
        title: "Food steam loop",
        text: "Close-up of ramen bowl with steam rising, handheld micro-movement, cozy lighting, shallow focus.",
        duration: "6s",
        aspect: "9:16",
        style: "Cozy",
        src: "/previews/labs-preview-1.mp4",
      },
      {
        title: "Tech teaser",
        text: "Abstract macro of glowing circuit lines, quick focus pulls, high contrast, sleek sci‑fi vibe.",
        duration: "6s",
        aspect: "16:9",
        style: "Futuristic",
        src: "/previews/labs-preview-2.mp4",
      },
    ],
    []
  );

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => (i + 1) % prompts.length), 4200);
    return () => window.clearInterval(t);
  }, [prompts.length]);

  const p = prompts[idx] || prompts[0]!;
  const heroClip = sampleClips[idx % sampleClips.length] || sampleClips[0]!;

  return (
    <div ref={revealRef as any} className="relative bg-transparent overflow-x-hidden">
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        {/* HERO */}
        <section className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="pt-2">
            <div className="pill">
              <span className="pill-dot" />
              <span className="text-white/85">AI post generator</span>
              <span className="text-white/45">1–2 minute image + voice workflow</span>
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white/95 sm:text-5xl">
              Create <span className="grad-text">1–2 minute social clips</span> in one flow.
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              {BRAND.product} is {BRAND.name}&rsquo;s post studio: generate image sequences, add natural voiceover, edit on a
              timeline, and publish to your channels.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link className="btn-aurora" href="/register">
                Start generating
              </Link>
              <Link className="btn-ghost" href="/#how-it-works">
                See how it works
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-2">
              <SocialBrandRow platforms={["tiktok", "reels", "shorts", "facebook"]} compact />
              <span className="text-xs text-white/45">Sign in, connect channels, and publish.</span>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <div className="surface-soft p-4">
                <div className="text-xs text-white/55">Generation lanes</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Relax + Fast modes</div>
                <div className="mt-1 text-xs text-white/60">Cost-efficient drafts or priority output.</div>
              </div>
              <div className="surface-soft p-4">
                <div className="text-xs text-white/55">Aspect presets</div>
                <div className="mt-1 text-sm font-semibold text-white/90">9:16, 1:1, 16:9</div>
                <div className="mt-1 text-xs text-white/60">Made for the feed.</div>
              </div>
              <div className="surface-soft p-4">
                <div className="text-xs text-white/55">Editor workflow</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Review, polish, export</div>
                <div className="mt-1 text-xs text-white/60">Production-ready assets in one workspace.</div>
              </div>
            </div>
          </div>

          {/* DEMO */}
          <div data-reveal className="reveal surface relative overflow-hidden p-5 sm:p-6">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-80">
              <div className="aurora" />
              <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_50%_0%,rgba(255,255,255,0.08),transparent_60%)]" />
            </div>

            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <div>
              <div className="text-xs text-white/55">Prompt</div>
              <div className="mt-1 text-sm font-semibold text-white/92">{p.title}</div>
                </div>
                <span className="chip">Preview</span>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="font-mono text-[13px] leading-relaxed text-white/80">{p.text}</div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs text-white/55">Duration</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">{p.duration}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs text-white/55">Aspect</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">{p.aspect}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs text-white/55">Style</div>
                  <div className="mt-1 text-sm font-semibold text-white/90">{p.style}</div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-white/55">Output</div>
                  <div className="text-xs text-white/55">MP4 • ready to post</div>
                </div>

                <div className="mt-3 h-[220px] w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  <video
                    src={heroClip.src}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href="/app/generate" className="btn-solid-dark">
                    Open AI Post Studio
                  </Link>
                  <Link href="/register" className="btn-ghost">
                    Create account
                  </Link>
                </div>

                <div className="mt-3 text-xs text-white/50">
                  Sample preview from the labs gallery. Build your own 1–2 minute post in the generator.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="mt-14 scroll-mt-24">
          <div data-reveal className="reveal flex items-end justify-between gap-6">
            <div>
              <div className="text-xs text-white/55">How it works</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
                Three steps. One flow.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
                Describe what you want, generate a clip, then publish where your audience already is.
              </p>
            </div>
            <div className="hidden sm:block text-xs text-white/45">Designed for short-form.</div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div data-reveal className="reveal surface-soft p-6">
              <div className="text-xs text-white/55">Step 1</div>
              <div className="mt-2 text-lg font-semibold text-white/90">Write a prompt</div>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Write your visual brief plus a voiceover script. The system generates scene-by-scene images and narration.
              </p>
              <div className="mt-4 font-mono text-xs text-white/55">“handheld, soft haze, warm grade…”</div>
            </div>

            <div data-reveal className="reveal surface-soft p-6">
              <div className="text-xs text-white/55">Step 2</div>
              <div className="mt-2 text-lg font-semibold text-white/90">Generate variants</div>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Generate a full 1–2 minute image+voice post, then tweak with timeline editing before export.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="chip">9:16</span>
                <span className="chip">1–2 min</span>
                <span className="chip">AI Post</span>
              </div>
            </div>

            <div data-reveal className="reveal surface-soft p-6">
              <div className="text-xs text-white/55">Step 3</div>
              <div className="mt-2 text-lg font-semibold text-white/90">Download or post</div>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Export your final MP4 and publish. Connected channels let you post from one place.
              </p>
              <div className="mt-4">
                <SocialBrandRow platforms={["tiktok", "instagram", "youtube", "facebook"]} compact />
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="mt-14">
          <div data-reveal className="reveal surface-inset p-6 sm:p-8">
            <div className="text-xs text-white/55">Built for creators</div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {sampleClips.map((ex) => (
                <div
                  key={ex.title}
                  className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] transition hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.03]"
                >
                  <div className="relative h-[190px] overflow-hidden border-b border-white/10 bg-black/30">
                    <video
                      src={ex.src}
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.00),rgba(0,0,0,0.35))]" />

                    <div className="absolute left-4 top-4 flex gap-2">
                      <span className="chip">{ex.aspect}</span>
                      <span className="chip">{ex.duration}</span>
                    </div>
                    <div className="absolute right-4 top-4 chip">{ex.style}</div>
                    <div className="absolute bottom-3 left-4 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[11px] text-white/85">
                      Generated preview
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="text-sm font-semibold text-white/90">{ex.title}</div>
                    <div className="mt-2 text-[13px] leading-relaxed text-white/60">{ex.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SISTER SITE */}
        <section className="mt-14">
          <div
            data-reveal
            className="reveal relative overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(120deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-[1px]"
          >
            <div
              aria-hidden="true"
              className="absolute -inset-10 opacity-70 blur-2xl"
              style={{
                background:
                  "conic-gradient(from 120deg, rgba(53,242,166,0.18), rgba(70,215,255,0.20), rgba(155,140,255,0.20), rgba(53,242,166,0.18))",
              }}
            />
            <div className="relative rounded-[22px] bg-black/70 p-6 md:p-7">
              <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">{BRAND.orbitoName}</span>
                <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1">
                  {BRAND.orbitoUrl.replace(/^https?:\/\//, "")} • AI clipping
                </span>
              </div>

              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                Have long videos? Clip them with Orbito.
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
                Orbito is Clipforge&apos;s sister site for AI video clipping. Turn long-form into share-ready clips with smart
                reframing, captions, and scheduling.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[
                  { t: "Smart reframing", d: "Keep the subject centered for 9:16, 1:1, and 16:9." },
                  { t: "Captions + pipeline", d: "Generate, review, and publish clips across your channels." },
                ].map((x) => (
                  <div key={x.t} className="surface-soft relative overflow-hidden p-5">
                    <div className="text-sm font-semibold">{x.t}</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/65">{x.d}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a href={BRAND.orbitoUrl} target="_blank" rel="noreferrer" className="btn-orbito">
                  Visit Orbito
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-14">
          <div data-reveal className="reveal surface relative overflow-hidden p-6 sm:p-8">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-80">
              <div className="aurora" />
            </div>
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs text-white/55">Ready?</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
                  Generate your first clip today.
                </div>
                <div className="mt-2 text-sm text-white/65">No complicated setup. Just prompt and go.</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link className="btn-aurora" href="/register">
                  Create account
                </Link>
                <Link className="btn-ghost" href="/login">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="mt-14 border-t border-white/10 pt-8 text-xs text-white/55">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-1">
              <div>
                © {new Date().getFullYear()} • {BRAND.product} by {BRAND.company}. All Rights Reserved.
              </div>
              <div className="text-[11px] text-white/45">
                Sister site of{" "}
                <a href={BRAND.orbitoUrl} target="_blank" rel="noreferrer" className="hover:text-white/80">
                  {BRAND.orbitoName}
                </a>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link href="/pricing" className="hover:text-white/80">
                Pricing
              </Link>
              <Link href="/contact" className="hover:text-white/80">
                Contact
              </Link>
              <Link href="/privacy-policy" className="hover:text-white/80">
                Privacy
              </Link>
              <Link href="/terms-of-service" className="hover:text-white/80">
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
