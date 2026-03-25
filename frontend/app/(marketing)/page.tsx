"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { apiFetch } from "@/lib/api";
import { SocialBrandRow } from "@/components/SocialBrand";

const ORBITO_WHOP_MARKETING_URL = "/whop";

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

function LandingBackdrop() {
  return (
    <>
      <style>{`
        @keyframes orbitoStudioFloat {
          0% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -10px, 0) scale(1.03); }
          100% { transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes orbitoStudioGlow {
          0% { opacity: 0.38; }
          50% { opacity: 0.62; }
          100% { opacity: 0.38; }
        }
        @media (prefers-reduced-motion: reduce) {
          .orbito-studio-anim {
            animation: none !important;
          }
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_16%_10%,rgba(82,152,255,0.18),transparent_68%),radial-gradient(780px_460px_at_84%_12%,rgba(255,186,77,0.16),transparent_70%),radial-gradient(920px_480px_at_54%_86%,rgba(44,206,173,0.08),transparent_72%)]" />
        <div
          className="orbito-studio-anim absolute left-[-12%] top-[4%] h-[420px] w-[420px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(82,152,255,0.20) 0%, rgba(82,152,255,0.06) 38%, transparent 72%)",
            animation: "orbitoStudioFloat 16s ease-in-out infinite, orbitoStudioGlow 8s ease-in-out infinite",
          }}
        />
        <div
          className="orbito-studio-anim absolute right-[-8%] top-[10%] h-[380px] w-[380px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(255,186,77,0.18) 0%, rgba(255,186,77,0.05) 40%, transparent 72%)",
            animation: "orbitoStudioFloat 18s ease-in-out infinite reverse, orbitoStudioGlow 9s ease-in-out infinite",
          }}
        />
      </div>
    </>
  );
}

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/62">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
      <span>{children}</span>
    </div>
  );
}

function ModeLane({
  eyebrow,
  title,
  summary,
  bullets,
  href,
  cta,
  accent,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  bullets: string[];
  href: string;
  cta: string;
  accent: "clip" | "generate";
}) {
  const accentClasses =
    accent === "clip"
      ? {
          ring: "border-sky-300/22",
          pill: "border-sky-300/24 bg-sky-300/[0.12] text-sky-100",
          button: "btn-orbito-cta",
        }
      : {
          ring: "border-amber-300/24",
          pill: "border-amber-300/24 bg-amber-300/[0.12] text-amber-100",
          button: "btn-clipforge",
        };

  return (
    <article className={`surface relative overflow-hidden border ${accentClasses.ring} p-6`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            accent === "clip"
              ? "radial-gradient(520px 240px at 14% 16%, rgba(82,152,255,0.16), transparent 68%), radial-gradient(560px 280px at 86% 20%, rgba(44,206,173,0.10), transparent 72%)"
              : "radial-gradient(520px 240px at 14% 16%, rgba(255,186,77,0.18), transparent 68%), radial-gradient(560px 280px at 86% 20%, rgba(255,128,72,0.12), transparent 72%)",
        }}
      />
      <div className="relative">
        <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${accentClasses.pill}`}>{eyebrow}</div>
        <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white/94">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-white/68">{summary}</p>
        <div className="mt-5 grid gap-2">
          {bullets.map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/76">
              {item}
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link href={href} className={accentClasses.button}>
            {cta}
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function Page() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(false);
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

  const proofPills = useMemo(
    () => [
      "Clip long-form content",
      "Generate AI video ideas",
      "Publish from one workflow",
      "Optional Whop monetization",
    ],
    []
  );

  const sharedSystem = useMemo(
    () => [
      {
        title: "One account",
        text: "Move between clipping and AI generation without making users understand two different products.",
      },
      {
        title: "Shared credits",
        text: "The free trial and plan structure already support a combined workflow instead of separate tool identities.",
      },
      {
        title: "One publish layer",
        text: "Connected channels, posting flow, and review process should feel consistent no matter how the clip was created.",
      },
      {
        title: "Monetize when it fits",
        text: "Use Whop later if you want a campaign-based earnings channel. The core value still comes from creating faster inside Orbito.",
      },
    ],
    []
  );

  const workflow = useMemo(
    () => [
      {
        title: "Clip mode",
        text: "Paste a YouTube link or upload a file. Orbito finds strong moments and gets you to ready-to-post clips faster.",
      },
      {
        title: "Generate mode",
        text: "Open Orbito Generate to turn one idea into prompt-to-video output with voice, captions, and short-form pacing.",
      },
      {
        title: "Publish everywhere",
        text: "Use one clear output layer for TikTok, Reels, Shorts, and the rest of your connected destinations.",
      },
    ],
    []
  );

  return (
    <div ref={revealRef} className="relative overflow-x-hidden">
      <LandingBackdrop />

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        <section className="relative">
          <div data-reveal className="reveal">
            <div className="surface relative overflow-hidden p-6 sm:p-8 md:p-10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(920px 420px at 18% 14%, rgba(82,152,255,0.14), transparent 70%), radial-gradient(860px 420px at 88% 16%, rgba(255,186,77,0.12), transparent 72%), radial-gradient(720px 360px at 50% 100%, rgba(44,206,173,0.08), transparent 74%)",
                }}
              />

              <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
                <div>
                  <SectionKicker>One Platform, Two Creation Modes</SectionKicker>
                  <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white/96 sm:text-5xl md:text-6xl">
                    Clip long videos. Generate new ones with AI. <span className="grad-text">Publish from one workflow.</span>
                  </h1>
                  <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/68">
                    {BRAND.name} is your short-form content studio. Start with long-form video when you have footage, or open
                    Generate when you need fresh AI video ideas. Same account, same product, same publishing flow.
                  </p>

                  <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    {startTrialCta("btn-orbito-cta")}
                    <Link href="/labs" className="btn-clipforge">
                      Explore Generate
                    </Link>
                    <Link href="/pricing" className="btn-ghost">
                      View pricing
                    </Link>
                  </div>

                  <div className="mt-7 flex flex-wrap items-center gap-2">
                    <SocialBrandRow platforms={["youtube", "tiktok", "reels", "shorts"]} compact />
                  </div>

                  <div className="mt-6 grid gap-2 sm:grid-cols-2">
                    {proofPills.map((item) => (
                      <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/74">
                        {item}
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/64">
                    Long videos in. Short clips out. Or start from a prompt and build fresh short-form content inside the same system.
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="surface-soft overflow-hidden p-5">
                    <div className="flex items-center justify-between text-xs text-white/54">
                      <span>Short-form content studio</span>
                      <span className="rounded-full border border-emerald-300/22 bg-emerald-300/[0.10] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                        Active
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl border border-sky-300/18 bg-sky-300/[0.08] p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100/82">Clip Mode</div>
                        <div className="mt-2 text-lg font-semibold text-white/92">Upload once. Pick your clips.</div>
                        <div className="mt-2 text-sm text-white/66">For podcasts, YouTube videos, interviews, and long-form footage you already have.</div>
                      </div>
                      <div className="rounded-2xl border border-amber-300/18 bg-amber-300/[0.08] p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/82">Generate Mode</div>
                        <div className="mt-2 text-lg font-semibold text-white/92">Write one idea. Generate fast.</div>
                        <div className="mt-2 text-sm text-white/66">For new concepts, campaign content, AI visuals, and fresh short-form experiments.</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "Account", value: "One login" },
                      { label: "Connections", value: "Shared studio" },
                      { label: "Output", value: "Post everywhere" },
                    ].map((item) => (
                      <div key={item.label} className="surface-soft p-4">
                        <div className="text-xs uppercase tracking-[0.12em] text-white/50">{item.label}</div>
                        <div className="mt-2 text-base font-semibold text-white/90">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="pt-16">
          <div data-reveal className="reveal">
            <SectionKicker>Choose Your Starting Point</SectionKicker>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Start from footage or start from a prompt.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/68 sm:text-base">
              If you already recorded something, Orbito turns it into short clips. If you need something new, Generate creates it with
              AI. Both paths end in the same review and publishing workflow.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div data-reveal className="reveal">
              <ModeLane
                eyebrow="Orbito Clip"
                title="Turn long-form video into short clips."
                summary="Paste a YouTube link or upload a file. Orbito finds strong moments, keeps the flow simple, and gets your content ready for posting."
                bullets={["Paste a YouTube link or upload a file", "Approve the strongest moments", "Post now or schedule later"]}
                href="/how-it-works"
                cta="See clip workflow"
                accent="clip"
              />
            </div>
            <div data-reveal className="reveal">
              <ModeLane
                eyebrow="Orbito Generate"
                title="Create AI short-form video from one prompt."
                summary="Generate is the AI creation mode inside Orbito. Pick the style, shape the output, and create fresh videos when you do not have source footage."
                bullets={["Write one idea", "Pick style, voice, and format", "Generate, review, and publish"]}
                href="/labs"
                cta="See generate workflow"
                accent="generate"
              />
            </div>
          </div>
        </section>

        <section className="pt-16">
          <div data-reveal className="reveal surface-inset p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr]">
              <div>
                <SectionKicker>One Output Layer</SectionKicker>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  Less product switching. More posting.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-white/66 sm:text-base">
                  Create in the mode that fits the job, then move through one clear workflow for review, captions, and publishing
                  across TikTok, Reels, Shorts, and more.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <SocialBrandRow platforms={["tiktok", "reels", "instagram", "facebook"]} compact />
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {startTrialCta("btn-orbito-cta")}
                  <Link href="/pricing" className="btn-ghost">
                    Compare plans
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {workflow.map((item) => (
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
            <SectionKicker>Shared Studio</SectionKicker>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Everything stays connected.
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {sharedSystem.map((item) => (
              <div key={item.title} data-reveal className="reveal surface-soft p-5">
                <div className="text-lg font-semibold text-white/92">{item.title}</div>
                <div className="mt-3 text-sm leading-relaxed text-white/64">{item.text}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-16">
          <div data-reveal className="reveal surface relative overflow-hidden p-6 sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-75"
              style={{
                background:
                  "radial-gradient(760px 320px at 20% 20%, rgba(255,186,77,0.10), transparent 72%), radial-gradient(760px 320px at 80% 24%, rgba(82,152,255,0.10), transparent 74%)",
              }}
            />
            <div className="relative grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div>
                <SectionKicker>Optional Monetization</SectionKicker>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  Create first. Monetize second.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-white/66 sm:text-base">
                  Once you have content going out consistently, you can use Whop to join third-party campaigns and add an extra
                  earnings channel without changing your creation workflow.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1.05fr_0.95fr]">
                <div className="surface-soft p-5">
                  <div className="text-sm font-semibold text-white/90">Core Orbito promise</div>
                  <div className="mt-3 text-sm leading-relaxed text-white/64">
                    Clip from long-form video, generate fresh AI content, and publish with less editing and less friction.
                  </div>
                </div>
                <div className="surface-soft p-5">
                  <div className="text-sm font-semibold text-white/90">Optional monetization</div>
                  <div className="mt-3 text-sm leading-relaxed text-white/64">
                    Use <span className="whop-word">Whop</span> if you want an extra earnings channel. It is a third-party partner, not the core product.
                  </div>
                  <div className="mt-4">
                    <a href={ORBITO_WHOP_MARKETING_URL} target="_blank" rel="noreferrer" className="btn-ghost">
                      Learn about Whop
                    </a>
                  </div>
                </div>
              </div>
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
