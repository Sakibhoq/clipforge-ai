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
    "Add a video",
    "Or type an idea",
    "Pick the best part",
    "Check your clips",
    "Make new versions",
    "Post it",
    "Use Whop if you want",
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
          Live
        </span>
      </div>

      <div className="relative mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="grid gap-4">
          <div className="rounded-[24px] border border-sky-300/16 bg-[#0a1320] p-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/46">
              <span>Clip</span>
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
              <span>Ready to post</span>
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
            <span>Make with AI</span>
            <span className="inline-flex items-center gap-2 text-amber-100/82">
              <span className="live-dot" />
              Rendering
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[0.82fr_1.18fr]">
            <div className="rounded-[22px] border border-white/10 bg-black/28 p-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">Prompt</div>
              <div className="mt-2 text-sm leading-relaxed text-white/82">
                Make a short launch video with a strong hook, clean captions, and a dark look.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {["9:16", "Captions", "Fast hook"].map((item) => (
                  <div key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/74">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-h-[340px] items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-black/58">
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
        title: "One workflow from idea to post",
        text: "Clip existing videos or generate new ones, then review and publish from one account.",
      },
      {
        title: "Built for short-form channels",
        text: "Vertical framing, caption workflow, and social posting are designed for TikTok, Reels, and Shorts.",
      },
      {
        title: "Try first, upgrade when ready",
        text: "Free trial first. Pricing is clear before checkout and you can manage billing in-app.",
      },
    ],
    []
  );

  const trustSignals = useMemo(
    () => [
      {
        title: "Secure billing",
        text: "Subscriptions and payments are handled through Stripe checkout.",
      },
      {
        title: "Cancel anytime",
        text: "Change plan or cancel from Billing without opening a support ticket.",
      },
      {
        title: "Clear policies",
        text: "Privacy Policy and Terms are public and linked in the footer.",
      },
    ],
    []
  );

  const userFeedback = useMemo(
    () => [
      {
        quote: "This replaced my old clip workflow. I upload once, approve, then schedule.",
        label: "Creator workflow",
      },
      {
        quote: "The split is clear: Orbito for clipping, Labs for prompt-to-video. No confusion now.",
        label: "Team setup",
      },
      {
        quote: "The best part is speed. I can get from raw content to ready posts in one session.",
        label: "Daily publishing",
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
              <SectionKicker>Fast Creation, Real Distribution</SectionKicker>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white/96 sm:text-5xl md:text-6xl">
                Stop editing for hours.
                <br />
                Start posting every day.
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/68 sm:text-base">
                Orbito turns long-form content into clips. Orbito Labs turns prompts into new videos. One login, one workflow, and faster output for every channel.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {startTrialCta("btn-orbito-cta")}
                <Link href="/labs" className="btn-clipforge">
                  Try Generate
                </Link>
                <Link href="/pricing" className="btn-ghost">
                  See pricing
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <SocialBrandRow platforms={["youtube", "tiktok", "reels", "shorts"]} compact />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {["Secure checkout", "One account for Orbito + Labs", "Post-ready workflow"].map((item) => (
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

        <section className="pt-10">
          <div className="grid gap-4 lg:grid-cols-3">
            {trustSignals.map((item) => (
              <article
                key={item.title}
                data-reveal
                className="reveal rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,19,28,0.94),rgba(10,13,20,0.92))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/22 bg-emerald-300/[0.10] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-100">
                  <span className="live-dot" />
                  Trust
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-white/92">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/66">{item.text}</p>
              </article>
            ))}
          </div>

          <div data-reveal className="reveal mt-4 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,31,0.95),rgba(9,12,19,0.93))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/46">What Users Like Most</div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {userFeedback.map((item) => (
                <blockquote key={item.quote} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm leading-relaxed text-white/82">“{item.quote}”</p>
                  <footer className="mt-3 text-[11px] uppercase tracking-[0.14em] text-white/45">{item.label}</footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="pt-16">
          <div data-reveal className="reveal">
            <SectionKicker>How Orbito Works</SectionKicker>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Start with a video or start with an idea.
            </h2>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.02fr_0.98fr] xl:items-start">
            <article data-reveal className="reveal self-start rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="signal-chip border-sky-300/20 bg-sky-300/[0.10] text-sky-100">Clip</div>
                  <h3 className="mt-3 text-[30px] font-semibold tracking-tight text-white/94">Start with a long video.</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-white/66">
                    Upload it once. Orbito finds the best parts and turns them into short clips.
                  </p>
                </div>
                <Link href="/how-it-works" className="btn-orbito-cta">
                  See how it works
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
                  {["Add a link or upload", "Pick the clips you want", "Send them to post later"].map((item, index) => (
                    <div key={item} className="rounded-[22px] border border-white/10 bg-black/24 px-4 py-4">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">0{index + 1}</div>
                      <div className="mt-1.5 text-sm text-white/82">{item}</div>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <div className="grid gap-4 self-start">
              <article data-reveal className="reveal self-start rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="signal-chip border-amber-300/22 bg-amber-300/[0.10] text-amber-100">Generate</div>
                    <h3 className="mt-3 text-[30px] font-semibold tracking-tight text-white/94">Start with an idea.</h3>
                  </div>
                  <Link href="/labs" className="btn-clipforge">
                    Try Generate
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-[0.84fr_1.16fr]">
                  <div className="rounded-[22px] border border-white/10 bg-black/24 p-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">Prompt</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/82">
                      Make a short launch video with bold captions and a clean dark style.
                    </div>
                  </div>
                  <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-black/58">
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

              <article data-reveal className="reveal self-start rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,21,31,0.96),rgba(11,14,22,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
                <div className="signal-chip">Same next step</div>
                <h3 className="mt-3 text-[30px] font-semibold tracking-tight text-white/94">Both end in the same place.</h3>
                <div className="mt-4 grid gap-2">
                  {["Check it", "Add captions", "Post later"].map((item) => (
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
              <SectionKicker>Why This Is Easier</SectionKicker>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                One account. Less mess.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/66 sm:text-base">
                You do not need to jump between tools to get short videos done.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {startTrialCta("btn-orbito-cta")}
                <Link href="/pricing" className="btn-ghost">
                  See pricing
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
                <SectionKicker>Whop If You Want It</SectionKicker>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  Keep earning tools separate.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-white/66 sm:text-base">
                  Orbito is for making videos. Whop is there later if you want to try making money from them.
                </p>
                <div className="mt-5">
                  <Link href={ORBITO_WHOP_MARKETING_URL} className="btn-ghost">
                    See Whop
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { title: "Make", text: "Create clips or AI videos in Orbito." },
                  { title: "Post", text: "Get them ready for your channels." },
                  { title: "Earn", text: "Use Whop later if you want to try it." },
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

        <section className="pt-16">
          <div className="grid gap-4 xl:grid-cols-2">
            <article data-reveal className="reveal rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,19,28,0.96),rgba(10,13,19,0.93))] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.34)]">
              <SectionKicker>Pick Your Path</SectionKicker>
              <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white/94">Use Orbito if you already have videos.</h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/66 sm:text-base">
                Upload once, review the strongest moments, and schedule posts across your channels.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Source upload", "Clip approval", "Schedule + publish"].map((item) => (
                  <div key={item} className="signal-chip">
                    <span className="live-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/app" className="btn-orbito-cta">
                  Open Console
                </Link>
                <Link href="/how-it-works" className="btn-ghost">
                  View walkthrough
                </Link>
              </div>
            </article>

            <article data-reveal className="reveal rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,19,12,0.96),rgba(13,10,8,0.94))] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.34)]">
              <SectionKicker>Need New Videos?</SectionKicker>
              <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white/94">Use Labs if you want prompt-to-video generation.</h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/66 sm:text-base">
                Write the idea, generate variations, and push the finished videos into your posting workflow.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Prompt to video", "Style presets", "Export or publish"].map((item) => (
                  <div key={item} className="signal-chip border-amber-300/22 bg-amber-300/[0.10] text-amber-100">
                    <span className="live-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/labs" className="btn-clipforge">
                  Open Labs
                </Link>
                <Link href="/pricing" className="btn-ghost">
                  See plan options
                </Link>
              </div>
            </article>
          </div>
        </section>

        <section className="pt-16">
          <div data-reveal className="reveal rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,18,27,0.96),rgba(9,12,18,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
            <SectionKicker>Ready To Start</SectionKicker>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Built to earn trust before asking for the upgrade.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/66 sm:text-base">
              Start with the free trial, validate your workflow, then scale only when the output quality and posting speed make sense for you.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {startTrialCta("btn-orbito-cta")}
              <Link href="/pricing" className="btn-ghost">
                Compare plans
              </Link>
              <Link href="/contact" className="btn-ghost">
                Talk to support
              </Link>
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
