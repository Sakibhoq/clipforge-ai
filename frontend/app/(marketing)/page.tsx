"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { apiFetch } from "@/lib/api";
import { SocialBrandRow } from "@/components/SocialBrand";

const ORBITO_WHOP_MARKETING_URL = "/whop";
const HOME_GENERATE_PREVIEW = "https://app.orbito.cc/app/labs/previews/labs-preview-1.mp4";

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
          50% { transform: translate3d(0, -12px, 0) scale(1.03); }
          100% { transform: translate3d(0, 0, 0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .orbito-studio-anim {
            animation: none !important;
          }
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(940px_560px_at_12%_10%,rgba(82,152,255,0.16),transparent_68%),radial-gradient(860px_540px_at_88%_12%,rgba(255,186,77,0.13),transparent_70%),radial-gradient(920px_520px_at_52%_88%,rgba(44,206,173,0.07),transparent_72%)]" />
        <div
          className="orbito-studio-anim absolute left-[-12%] top-[5%] h-[420px] w-[420px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(82,152,255,0.16) 0%, rgba(82,152,255,0.05) 38%, transparent 72%)",
            animation: "orbitoStudioFloat 16s ease-in-out infinite",
          }}
        />
        <div
          className="orbito-studio-anim absolute right-[-8%] top-[8%] h-[360px] w-[360px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(255,186,77,0.14) 0%, rgba(255,186,77,0.05) 40%, transparent 72%)",
            animation: "orbitoStudioFloat 18s ease-in-out infinite reverse",
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

function WorkflowTicker() {
  const items = [
    "Upload footage",
    "Or start from a prompt",
    "Find the hook",
    "Review clips",
    "Generate versions",
    "Queue to publish",
    "Whop optional",
  ];

  return (
    <div className="marquee-shell rounded-full border border-white/10 bg-black/20 p-2">
      <div className="marquee-track gap-2">
        {[...items, ...items].map((item, index) => (
          <div key={`${item}-${index}`} className="marquee-pill">
            <span className="live-dot" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroStudioVisual() {
  return (
    <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,31,0.96),rgba(9,12,19,0.94))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(740px 220px at 14% 0%, rgba(255,255,255,0.07), transparent 60%), radial-gradient(620px 340px at 84% 14%, rgba(255,186,77,0.10), transparent 74%), radial-gradient(620px 340px at 12% 86%, rgba(82,152,255,0.12), transparent 72%)",
        }}
      />

      <div className="relative flex items-center justify-between text-xs text-white/54">
        <span>Inside Orbito</span>
        <span className="signal-chip border-emerald-300/20 bg-emerald-300/[0.10] text-emerald-100">
          <span className="live-dot" />
          Live workflow
        </span>
      </div>

      <div className="relative mt-4 grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
        <div className="grid gap-4">
          <div className="rounded-[24px] border border-sky-300/16 bg-[#0a1320] p-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/46">
              <span>Clip mode</span>
              <span>12:47 source</span>
            </div>
            <div className="mt-4 space-y-4">
              {[
                { label: "Hook", width: "24%" },
                { label: "Story payoff", width: "54%" },
                { label: "CTA", width: "78%" },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 text-xs text-white/50">{item.label}</div>
                  <div className="live-bar">
                    <span style={{ width: item.width }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/46">
              <span>Queue</span>
              <span>4 ready</span>
            </div>
            <div className="mt-3 space-y-2">
              {["TikTok ready", "Reels ready", "Shorts synced"].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/74">
                  <span>{item}</span>
                  <span className="live-dot" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-amber-300/18 bg-[#140f0b] p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/46">
            <span>Generate mode</span>
            <span className="inline-flex items-center gap-2 text-amber-100/82">
              <span className="live-dot" />
              Rendering
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[0.82fr_1.18fr]">
            <div className="rounded-[22px] border border-white/10 bg-black/28 p-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">Prompt</div>
              <div className="mt-2 text-sm leading-relaxed text-white/82">
                Create a sharp launch teaser with a clean hook, premium captions, and dark editorial framing.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {["9:16", "Captions", "Fast hook"].map((item) => (
                  <div key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/74">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-black/58">
              <video
                src={HOME_GENERATE_PREVIEW}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                className="h-full w-full"
                style={{ objectFit: "cover", objectPosition: "center center" }}
              />
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
          <button type="button" disabled className={`${className} disabled:cursor-not-allowed disabled:opacity-70`}>
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

  const operatingPoints = useMemo(
    () => [
      {
        title: "One studio after creation",
        text: "Clip mode and Generate mode both move into the same review and publish flow.",
      },
      {
        title: "Built for short-form speed",
        text: "Hooks, captions, vertical formats, and queueing stay close to the output.",
      },
      {
        title: "Try it before you commit",
        text: "Start free, see how it fits, then move into the plan that matches your volume.",
      },
    ],
    []
  );

  return (
    <div ref={revealRef} className="theme-merged relative overflow-x-hidden">
      <LandingBackdrop />

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+4.5rem)]">
        <section className="relative pt-2">
          <div className="grid gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
            <div data-reveal className="reveal">
              <SectionKicker>One Platform, Two Creation Modes</SectionKicker>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white/96 sm:text-5xl md:text-6xl">
                Make short-form from footage or prompts.
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/68 sm:text-base">
                Clip long videos, generate new ones with AI, and publish both from one workflow.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {startTrialCta("btn-orbito-cta")}
                <Link href="/labs" className="btn-clipforge">
                  Explore Generate
                </Link>
                <Link href="/pricing" className="btn-ghost">
                  View pricing
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <SocialBrandRow platforms={["youtube", "tiktok", "reels", "shorts"]} compact />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {["One account", "Clip or generate", "Publish-ready formats"].map((item) => (
                  <div key={item} className="signal-chip">
                    <span className="live-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div data-reveal className="reveal">
              <HeroStudioVisual />
            </div>
          </div>

          <div data-reveal className="reveal mt-8">
            <WorkflowTicker />
          </div>
        </section>

        <section id="how-it-works" className="pt-16">
          <div data-reveal className="reveal">
            <SectionKicker>How Orbito Works</SectionKicker>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Two ways in. One clean system out.
            </h2>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
            <article data-reveal className="reveal rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="signal-chip border-sky-300/20 bg-sky-300/[0.10] text-sky-100">Clip mode</div>
                  <h3 className="mt-3 text-[30px] font-semibold tracking-tight text-white/94">Start with a long video.</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-white/66">
                    Upload once, find the strongest moments, and turn them into clips built for social.
                  </p>
                </div>
                <Link href="/how-it-works" className="btn-orbito-cta">
                  See clip flow
                </Link>
              </div>

              <div className="mt-6 grid gap-3 lg:grid-cols-[1.14fr_0.86fr]">
                <div className="rounded-[24px] border border-sky-300/14 bg-[#09121f] p-4">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/46">
                    <span>Source timeline</span>
                    <span>12:47</span>
                  </div>
                  <div className="mt-4 space-y-4">
                    {[
                      { label: "Best hook", width: "26%" },
                      { label: "Story payoff", width: "54%" },
                      { label: "CTA cut", width: "76%" },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="mb-1.5 text-xs text-white/50">{item.label}</div>
                        <div className="live-bar">
                          <span style={{ width: item.width }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3">
                  {["Paste a link or upload", "Approve the best clips", "Push to your publish queue"].map((item, index) => (
                    <div key={item} className="rounded-[22px] border border-white/10 bg-black/24 px-4 py-4">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">0{index + 1}</div>
                      <div className="mt-1.5 text-sm text-white/82">{item}</div>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <div className="grid gap-4">
              <article data-reveal className="reveal rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="signal-chip border-amber-300/22 bg-amber-300/[0.10] text-amber-100">Generate mode</div>
                    <h3 className="mt-3 text-[30px] font-semibold tracking-tight text-white/94">Start with an idea.</h3>
                  </div>
                  <Link href="/labs" className="btn-clipforge">
                    Open Generate
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-[0.84fr_1.16fr]">
                  <div className="rounded-[22px] border border-white/10 bg-black/24 p-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">Prompt</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/82">
                      Create a sharp launch teaser with bold captions and a premium dark style.
                    </div>
                  </div>
                  <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-black/58">
                    <video
                      src={HOME_GENERATE_PREVIEW}
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full"
                      style={{ objectFit: "cover", objectPosition: "center center" }}
                    />
                  </div>
                </div>
              </article>

              <article data-reveal className="reveal rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
                <div className="signal-chip">Shared finish line</div>
                <h3 className="mt-3 text-[30px] font-semibold tracking-tight text-white/94">Both modes end in publish.</h3>
                <div className="mt-4 grid gap-2">
                  {["Review", "Caption", "Queue"].map((item) => (
                    <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/74">
                      <span>{item}</span>
                      <span className="live-dot" />
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="pt-16">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div data-reveal className="reveal">
              <SectionKicker>Why It Feels Simpler</SectionKicker>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                One account. Less switching.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/66 sm:text-base">
                The experience should feel like one product because the workflow is one product.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {startTrialCta("btn-orbito-cta")}
                <Link href="/pricing" className="btn-ghost">
                  Compare plans
                </Link>
              </div>
            </div>

            <div data-reveal className="reveal space-y-6">
              {operatingPoints.map((item, index) => (
                <div key={item.title} className="border-b border-white/10 pb-6 last:border-b-0 last:pb-0">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-xs font-semibold text-white/72">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-2xl font-semibold tracking-tight text-white/92">{item.title}</div>
                      <div className="mt-2 max-w-2xl text-sm leading-relaxed text-white/64">{item.text}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pt-16">
          <div data-reveal className="reveal rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
            <div className="grid gap-6 xl:grid-cols-[0.84fr_1.16fr]">
              <div>
                <SectionKicker>Optional Monetization</SectionKicker>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  Keep monetization in its place.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-white/66 sm:text-base">
                  Orbito is the creation engine. Whop is only there if you want an extra earnings channel later.
                </p>
                <div className="mt-5">
                  <Link href={ORBITO_WHOP_MARKETING_URL} className="btn-ghost">
                    See how Whop fits
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { title: "Create", text: "Make clips or AI videos inside Orbito." },
                  { title: "Publish", text: "Send finished content into the same channel queue." },
                  { title: "Monetize", text: "Use Whop only if and when that part matters." },
                ].map((item) => (
                  <div key={item.title} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">{item.title}</div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-white/90">{item.title}</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
                  </div>
                ))}
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
