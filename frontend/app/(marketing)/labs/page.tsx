"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SocialBrandPill, SocialBrandRow } from "@/components/SocialBrand";
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

function LabsAura() {
  return (
    <>
      <style>{`
        @keyframes labsPulse {
          0% { transform: translate3d(-2%, -1%, 0) scale(1); opacity: 0.68; }
          50% { transform: translate3d(2%, 1%, 0) scale(1.06); opacity: 0.86; }
          100% { transform: translate3d(-2%, -1%, 0) scale(1); opacity: 0.68; }
        }
        @keyframes labsBorderScan {
          0% { background-position: 0% 50%; }
          100% { background-position: 240% 50%; }
        }
        @keyframes labsCtaPulse {
          0% {
            box-shadow:
              0 0 0 1px rgba(255, 183, 3, 0.24),
              0 10px 26px rgba(0, 0, 0, 0.38),
              0 0 12px rgba(255, 183, 3, 0.18),
              0 0 10px rgba(58, 134, 255, 0.14);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(255, 183, 3, 0.34),
              0 16px 34px rgba(0, 0, 0, 0.44),
              0 0 20px rgba(255, 183, 3, 0.28),
              0 0 16px rgba(58, 134, 255, 0.22);
          }
          100% {
            box-shadow:
              0 0 0 1px rgba(255, 183, 3, 0.24),
              0 10px 26px rgba(0, 0, 0, 0.38),
              0 0 12px rgba(255, 183, 3, 0.18),
              0 0 10px rgba(58, 134, 255, 0.14);
          }
        }
        .labs-grad {
          background: linear-gradient(90deg, #ffb703 0%, #fb5607 46%, #60a5fa 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .labs-surface {
          border-color: rgba(255, 183, 3, 0.28) !important;
          box-shadow:
            0 0 0 1px rgba(255, 183, 3, 0.14),
            0 18px 60px rgba(0, 0, 0, 0.54),
            0 0 24px rgba(251, 86, 7, 0.15),
            0 0 24px rgba(96, 165, 250, 0.14);
        }
        .labs-surface-soft {
          border-color: rgba(255, 183, 3, 0.22) !important;
          box-shadow:
            0 0 0 1px rgba(255, 183, 3, 0.10),
            0 10px 34px rgba(0, 0, 0, 0.42),
            0 0 14px rgba(251, 86, 7, 0.10),
            0 0 14px rgba(96, 165, 250, 0.10);
        }
        .labs-border-run {
          position: relative;
          isolation: isolate;
        }
        .labs-border-run::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(96deg, rgba(255, 183, 3, 0.75), rgba(251, 86, 7, 0.72), rgba(96, 165, 250, 0.70), rgba(255, 183, 3, 0.75));
          background-size: 240% 100%;
          animation: labsBorderScan 4.8s linear infinite;
          opacity: 0.6;
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          z-index: 0;
        }
        .labs-border-run > * { position: relative; z-index: 1; }
        .labs-cta-glow {
          animation: labsCtaPulse 2.8s ease-in-out infinite;
        }
        .labs-cta-glow::before {
          opacity: 0.9 !important;
          animation-duration: 2.2s !important;
        }
        .labs-cta-glow::after {
          opacity: 0.56 !important;
        }
        .labs-cta-glow:hover::after {
          opacity: 0.72 !important;
        }
        .labs-open-ai-cta::before {
          opacity: 0.96 !important;
          animation-duration: 1.9s !important;
        }
        .labs-open-ai-cta:hover::before {
          animation-duration: 1.2s !important;
          opacity: 1 !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .labs-anim,
          .labs-border-run::after,
          .labs-cta-glow {
            animation: none !important;
          }
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,8,0.95),rgba(4,4,8,0.94))]" />
        <div
          className="absolute inset-0 opacity-[0.74]"
          style={{
            background:
              "radial-gradient(1000px 620px at 12% 12%, rgba(255,183,3,0.20), transparent 66%), radial-gradient(1100px 640px at 84% 16%, rgba(96,165,250,0.20), transparent 68%), radial-gradient(980px 620px at 50% 90%, rgba(255,148,74,0.10), transparent 72%)",
          }}
        />
        <div
          className="labs-anim absolute -inset-[32%] blur-3xl"
          style={{
            background:
              "radial-gradient(760px 420px at 12% 16%, rgba(255,183,3,0.26), transparent 68%), radial-gradient(760px 420px at 86% 16%, rgba(96,165,250,0.24), transparent 70%), radial-gradient(780px 420px at 52% 94%, rgba(255,156,92,0.11), transparent 74%)",
            mixBlendMode: "screen",
            animation: "labsPulse 16s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.9]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,0.028) 0px, rgba(255,255,255,0.028) 1px, transparent 1px, transparent 7px)",
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
        hook: "Stop the scroll in 2 seconds",
        text: "Give one simple idea. Labs writes your hook, scene plan, and voiceover script fast.",
        duration: "35s",
        aspect: "9:16",
        style: "Fast Hook",
      },
      {
        hook: "Tell your story fast",
        text: "Labs builds your story one step at a time so people understand and keep watching.",
        duration: "50s",
        aspect: "9:16",
        style: "Story",
      },
      {
        hook: "Teach in under a minute",
        text: "Turn hard topics into short, clear clips with strong captions and clean pacing.",
        duration: "42s",
        aspect: "16:9",
        style: "Teach",
      },
      {
        hook: "Launch your product today",
        text: "Show what your product does, why it helps, and what people should do next.",
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
        text: "Cinematic and clean. Feels premium from frame one.",
        src: "https://app.orbito.cc/app/labs/previews/labs-preview-1.mp4",
        duration: "7s",
        aspect: "9:16",
      },
      {
        title: "Cartoon clip",
        text: "Bright, fun, and impossible to scroll past.",
        src: "https://app.orbito.cc/app/labs/previews/labs-preview-2.mp4",
        duration: "7s",
        aspect: "16:9",
      },
      {
        title: "Anime clip",
        text: "High energy hero style with instant visual punch.",
        src: "https://app.orbito.cc/app/labs/previews/labs-preview-3.mp4",
        duration: "7s",
        aspect: "9:16",
      },
      {
        title: "Comic clip",
        text: "Bold contrast and sharp frames that tell a story fast.",
        src: "https://app.orbito.cc/app/labs/previews/labs-preview-4.mp4",
        duration: "7s",
        aspect: "9:16",
      },
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
  const activePreviewTab = index % 3;

  return (
    <div ref={revealRef as any} className="theme-labs relative overflow-x-hidden">
      <LabsAura />

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        <section className="relative">
          <div data-reveal className="reveal relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-10 -z-10 opacity-70 blur-3xl"
              style={{
                background:
                  "radial-gradient(760px 380px at 16% 16%, rgba(255,183,3,0.20), transparent 68%), radial-gradient(760px 420px at 84% 18%, rgba(96,165,250,0.22), transparent 70%), radial-gradient(760px 420px at 50% 96%, rgba(255,156,92,0.10), transparent 74%)",
              }}
            />

            <div className="surface-soft labs-surface labs-border-run relative overflow-hidden p-5 sm:p-6 md:p-10">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(980px_560px_at_35%_22%,rgba(255,255,255,0.05),transparent_64%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(820px_520px_at_84%_42%,rgba(96,165,250,0.10),transparent_64%)]" />
              </div>

              <div className="relative z-[2] grid gap-6 md:grid-cols-[1.12fr_0.88fr] md:gap-8">
                <div>
                  <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] pl-3 pr-1.5 py-1 text-[12px] text-white/75">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                    <span className="whitespace-nowrap">Prompt in. Clip out.</span>
                    <SocialBrandPill platform="youtube" compact className="-mr-0.5" />
                  </div>

                  <h1 className="mt-5 text-3xl font-semibold leading-[1.06] tracking-tight text-white/95 sm:text-4xl md:text-6xl">
                    <span>
                      Turn <span className="labs-grad">AI</span> clips into <span className="labs-grad">cash</span> -
                    </span>{" "}
                    <span className="text-[0.9em] sm:text-[0.87em] md:text-[0.82em]">
                      your <span className="labs-grad">AI</span> content <span className="labs-grad">engine</span>.
                    </span>
                  </h1>

                  <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-[15px]">
                    Labs gives you the same workflow style as Generator: one prompt, clean settings, preview, and output ready to post.
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <Link href="https://app.orbito.cc/app/labs/app/generate" className="btn-clipforge labs-cta-glow labs-open-ai-cta">
                      Open AI Lab
                    </Link>
                    <Link href="/pricing" className="btn-ghost">
                      View plans
                    </Link>
                    <div className="text-xs text-white/50">Write. Generate. Post.</div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <SocialBrandRow platforms={["tiktok", "reels", "shorts", "facebook"]} compact />
                  </div>

                  <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/62">
                    Start with one idea, pick style and voice, generate, then publish.
                  </div>
                </div>

                <div className="surface-soft labs-surface-soft relative overflow-hidden p-5">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <div>Generator-style preview</div>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
                      active
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {["AI Post", "Video", "Image", "Voiceover"].map((tab, tabIndex) => (
                      <div
                        key={tab}
                        className={[
                          "rounded-xl border px-2 py-2 text-center text-[11px] font-semibold",
                          tabIndex === activePreviewTab
                            ? "border-amber-300/55 bg-amber-400/10 text-amber-100"
                            : "border-white/10 bg-white/[0.03] text-white/70",
                        ].join(" ")}
                      >
                        {tab}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-xs text-white/58">Live hook</div>
                    <div className="mt-1 text-sm font-semibold text-white/90">{activePrompt.hook}</div>
                    <p className="mt-2 text-xs leading-relaxed text-white/68">{activePrompt.text}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-white/56">Length</div>
                      <div className="mt-1 text-white/90">{activePrompt.duration}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-white/56">Aspect</div>
                      <div className="mt-1 text-white/90">{activePrompt.aspect}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-white/56">Style</div>
                      <div className="mt-1 text-white/90">{activePrompt.style}</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-3">
                    <div className="mb-2 flex items-center justify-between text-[11px] text-white/56">
                      <span>{activeClip.title}</span>
                      <span>
                        {activeClip.aspect} - {activeClip.duration}
                      </span>
                    </div>
                    <div className="flex h-[220px] items-center justify-center overflow-hidden rounded-xl border border-white/12 bg-black/50">
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

        <section id="how-it-works" className="pt-14 sm:pt-16">
          <div data-reveal className="reveal">
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl md:text-4xl">How Labs works</h2>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Same clean system feel as Generator, built for AI clip creation.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
            <div data-reveal className="reveal surface-soft labs-surface-soft relative overflow-hidden p-6">
              <div className="relative">
                <div className="text-xl font-semibold text-white/92 sm:text-2xl">Prompt, style, output.</div>
                <p className="mt-3 text-sm leading-relaxed text-white/65">
                  Use one structured flow from idea to rendered clip with voice and captions ready.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <SocialBrandRow platforms={["tiktok", "reels", "shorts", "facebook"]} compact />
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-xs text-white/50">Step 1</div>
                    <div className="mt-1 text-sm font-semibold text-white/88">Write one idea</div>
                    <div className="mt-1 text-xs text-white/62">Labs turns it into a usable prompt.</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-xs text-white/50">Step 2</div>
                    <div className="mt-1 text-sm font-semibold text-white/88">Pick settings</div>
                    <div className="mt-1 text-xs text-white/62">Choose style, voice, and size.</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
                    <div className="text-xs text-white/50">Step 3</div>
                    <div className="mt-1 text-sm font-semibold text-white/88">Generate and publish</div>
                    <div className="mt-1 text-xs text-white/62">Open clips library, review output, then post.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div data-reveal className="reveal surface-soft labs-surface-soft relative overflow-hidden p-5">
                <div className="text-sm font-semibold text-white/92">Built for short-form channels</div>
                <div className="mt-2 text-sm leading-relaxed text-white/65">
                  Make clips for Shorts, Reels, TikTok, and feed posts from one workflow.
                </div>
              </div>

              <div data-reveal className="reveal surface-soft labs-surface-soft relative overflow-hidden p-5">
                <div className="text-sm font-semibold text-white/92">One account, shared credits</div>
                <div className="mt-2 text-sm leading-relaxed text-white/65">
                  Use the same account across Orbito and Labs without switching tools.
                </div>
              </div>

              <div data-reveal className="reveal surface-soft labs-surface-soft relative overflow-hidden p-5">
                <div className="text-sm font-semibold text-white/92">Fast creator loop</div>
                <div className="mt-2 text-sm leading-relaxed text-white/65">
                  Test multiple ideas quickly, keep the winners, and ship faster.
                </div>
                <div className="mt-4">
                  <Link href="https://app.orbito.cc/app/labs/app/generate" className="btn-clipforge text-xs">
                    Open Generator
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div data-reveal className="reveal surface-inset labs-surface p-6 sm:p-8">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-white/62">See it in action</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white/94 sm:text-3xl">
              Hook attention in 1 second. <span className="labs-grad">Keep people watching.</span>
            </h3>
            <p className="mt-3 max-w-3xl text-sm text-white/68 sm:text-base">
              One idea. Four styles. Pick your look and post fast.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {clips.map((clip) => (
                <article key={clip.title} className="surface-soft labs-surface-soft overflow-hidden p-0">
                  <div className="relative flex h-[170px] items-center justify-center overflow-hidden border-b border-white/10 bg-black/55">
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
                    <div className="absolute left-2 top-2 flex gap-2">
                      <span className="chip">{clip.aspect}</span>
                      <span className="chip">{clip.duration}</span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-semibold text-white/90">{clip.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-white/62">{clip.text}</div>
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

        <footer className="pb-10 pt-16 text-xs text-white/50 sm:pt-20">
          <div className="mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>© 2026 - {BRAND.name} by Sakib LLC. All rights reserved.</div>
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
