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

export default function Page() {
  const revealRef = useReveal();

  const prompts = useMemo<PromptDemo[]>(
    () => [
      {
        title: "Product launch shot",
        text: "Slow dolly-in on a matte-black sneaker on a wet street, neon reflections, cinematic lighting, 35mm film look.",
        duration: "6s",
        aspect: "9:16",
        style: "Cinematic",
      },
      {
        title: "Micro travel scene",
        text: "Golden-hour drone flyover of a coastal cliff path, soft haze, gentle camera shake, warm color grade, people walking.",
        duration: "8s",
        aspect: "16:9",
        style: "Warm",
      },
      {
        title: "Story opener",
        text: "Close-up of coffee being poured into a glass, macro detail, natural window light, smooth motion, subtle film grain.",
        duration: "5s",
        aspect: "1:1",
        style: "Clean",
      },
    ],
    []
  );

  const sampleClips = useMemo<PromptDemo[]>(
    () => [
      {
        title: "Coffee pour macro",
        text: "Close-up of espresso pouring into a glass, warm window light, shallow depth of field, subtle film grain.",
        duration: "6s",
        aspect: "9:16",
        style: "Warm",
      },
      {
        title: "Neon street b-roll",
        text: "Slow dolly-in on a neon-lit street at night, rain reflections, moody cinematic lighting, soft haze.",
        duration: "8s",
        aspect: "9:16",
        style: "Cinematic",
      },
      {
        title: "Minimal product spin",
        text: "Matte-black sneaker on clean studio backdrop, slow turntable rotation, crisp highlights, premium look.",
        duration: "6s",
        aspect: "1:1",
        style: "Clean",
      },
      {
        title: "Golden-hour travel",
        text: "Drone flyover of a coastal cliff path at golden hour, soft fog, gentle camera motion, warm grade.",
        duration: "10s",
        aspect: "16:9",
        style: "Warm",
      },
      {
        title: "Food steam loop",
        text: "Close-up of ramen bowl with steam rising, handheld micro-movement, cozy lighting, shallow focus.",
        duration: "6s",
        aspect: "9:16",
        style: "Cozy",
      },
      {
        title: "Tech teaser",
        text: "Abstract macro of glowing circuit lines, quick focus pulls, high contrast, sleek sci‑fi vibe.",
        duration: "6s",
        aspect: "16:9",
        style: "Futuristic",
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

  return (
    <div ref={revealRef as any} className="relative bg-transparent overflow-x-hidden">
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        {/* HERO */}
        <section className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="pt-2">
            <div className="pill">
              <span className="pill-dot" />
              <span className="text-white/85">AI video generation</span>
              <span className="text-white/45">Built for short-form</span>
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white/95 sm:text-5xl">
              Turn a prompt into a <span className="grad-text">scroll-stopping video</span>.
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              {BRAND.product} is {BRAND.name}&rsquo;s video generation lab: prompt in, MP4 out. Generate, download, and publish
              to your connected channels.
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
                <div className="text-xs text-white/55">Fast iterations</div>
                <div className="mt-1 text-sm font-semibold text-white/90">Prompt, tweak, reroll</div>
                <div className="mt-1 text-xs text-white/60">Small changes, big differences.</div>
              </div>
              <div className="surface-soft p-4">
                <div className="text-xs text-white/55">Aspect presets</div>
                <div className="mt-1 text-sm font-semibold text-white/90">9:16, 1:1, 16:9</div>
                <div className="mt-1 text-xs text-white/60">Made for the feed.</div>
              </div>
              <div className="surface-soft p-4">
                <div className="text-xs text-white/55">Export ready</div>
                <div className="mt-1 text-sm font-semibold text-white/90">MP4 downloads</div>
                <div className="mt-1 text-xs text-white/60">Post anywhere.</div>
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

                <div className="mt-3 h-[180px] w-full overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(120deg,rgba(255,183,3,0.20),rgba(251,86,7,0.16),rgba(58,134,255,0.18))]">
                  <div className="h-full w-full bg-[radial-gradient(520px_220px_at_30%_30%,rgba(255,255,255,0.10),transparent_60%)]" />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href="/app/generate" className="btn-solid-dark">
                    Open generator
                  </Link>
                  <Link href="/register" className="btn-ghost">
                    Create account
                  </Link>
                </div>

                <div className="mt-3 text-xs text-white/50">
                  Tip: Keep prompts specific. Mention camera, motion, lighting, and the subject.
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
                Tell the model what you want to see. Add motion, camera, lighting, and the vibe.
              </p>
              <div className="mt-4 font-mono text-xs text-white/55">“handheld, soft haze, warm grade…”</div>
            </div>

            <div data-reveal className="reveal surface-soft p-6">
              <div className="text-xs text-white/55">Step 2</div>
              <div className="mt-2 text-lg font-semibold text-white/90">Generate variants</div>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Pick an aspect ratio and duration. Reroll until it feels right.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="chip">9:16</span>
                <span className="chip">6s</span>
                <span className="chip">Cinematic</span>
              </div>
            </div>

            <div data-reveal className="reveal surface-soft p-6">
              <div className="text-xs text-white/55">Step 3</div>
              <div className="mt-2 text-lg font-semibold text-white/90">Download or post</div>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Save the MP4 and publish. If you connected channels in Studio, you can post from one place.
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
                  <div className="relative h-[160px] border-b border-white/10 bg-[linear-gradient(120deg,rgba(255,183,3,0.22),rgba(251,86,7,0.14),rgba(58,134,255,0.18))]">
                    <div className="absolute inset-0 bg-[radial-gradient(900px_260px_at_22%_22%,rgba(255,255,255,0.10),transparent_60%)]" />

                    <div className="absolute left-4 top-4 flex gap-2">
                      <span className="chip">{ex.aspect}</span>
                      <span className="chip">{ex.duration}</span>
                    </div>
                    <div className="absolute right-4 top-4 chip">{ex.style}</div>

                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full border border-white/15 bg-black/40 px-4 py-2 text-[12px] font-semibold text-white/80">
                        Sample clip
                      </div>
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
                © {new Date().getFullYear()} • {BRAND.product} by {BRAND.company}
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
