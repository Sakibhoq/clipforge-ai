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
        <div className="absolute inset-0 bg-[radial-gradient(980px_560px_at_14%_10%,rgba(82,152,255,0.18),transparent_68%),radial-gradient(880px_520px_at_86%_12%,rgba(255,186,77,0.14),transparent_70%),radial-gradient(920px_520px_at_52%_88%,rgba(44,206,173,0.08),transparent_72%)]" />
        <div
          className="orbito-studio-anim absolute left-[-12%] top-[5%] h-[420px] w-[420px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(82,152,255,0.18) 0%, rgba(82,152,255,0.05) 38%, transparent 72%)",
            animation: "orbitoStudioFloat 16s ease-in-out infinite",
          }}
        />
        <div
          className="orbito-studio-anim absolute right-[-8%] top-[8%] h-[360px] w-[360px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(255,186,77,0.16) 0%, rgba(255,186,77,0.05) 40%, transparent 72%)",
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
    "Footage in",
    "Prompt in",
    "Find the hook",
    "Review cuts",
    "Generate versions",
    "Queue to publish",
    "Whop optional",
  ];

  return (
    <div className="marquee-shell rounded-2xl border border-white/10 bg-black/20 p-2">
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

function HeroStudioBoard() {
  return (
    <div className="studio-frame p-4 sm:p-5">
      <div className="flex items-center justify-between text-xs text-white/54">
        <span>Live studio preview</span>
        <span className="signal-chip border-emerald-300/22 bg-emerald-300/[0.10] text-emerald-100">
          <span className="live-dot" />
          Active
        </span>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[26px] border border-sky-300/16 bg-[#08111b] p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/46">
            <span>Clip mode</span>
            <span>12:47 source</span>
          </div>

          <div className="studio-grid mt-3 rounded-[22px] border border-white/10 bg-black/28 p-4">
            <div className="flex items-center justify-between text-xs text-white/62">
              <span>Podcast episode.mp4</span>
              <span>3 strong moments</span>
            </div>

            <div className="mt-4 space-y-3">
              {[
                { label: "Hook found", width: "24%" },
                { label: "Story cut", width: "52%" },
                { label: "CTA ready", width: "76%" },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/48">
                    <span>{item.label}</span>
                    <span>{item.width}</span>
                  </div>
                  <div className="live-bar">
                    <span style={{ width: item.width }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {["Captions on", "9:16", "Hook first"].map((item) => (
                <div key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/74">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              { value: "03", label: "Clips ready" },
              { value: "Auto", label: "Captions" },
              { value: "Queue", label: "Export" },
            ].map((item) => (
              <div key={item.label} className="metric-chip">
                <div className="value">{item.value}</div>
                <div className="label">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-[26px] border border-amber-300/18 bg-[#130d0a] p-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/46">
              <span>Generate mode</span>
              <span className="inline-flex items-center gap-2 text-amber-100/82">
                <span className="live-dot" />
                Rendering
              </span>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-white/10 bg-black/28 p-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">Prompt</div>
                <div className="mt-2 text-sm leading-relaxed text-white/84">
                  Launch the product with a fast hook, clean captions, and a premium dark visual style.
                </div>
              </div>

              <div className="flex h-[208px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/55">
                <video
                  src={HOME_GENERATE_PREVIEW}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full"
                  style={{ objectFit: "contain", objectPosition: "center center" }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/46">
              <span>Publish queue</span>
              <span>4 queued</span>
            </div>
            <div className="mt-3 space-y-2">
              {["TikTok scheduled", "Reels ready", "Shorts synced"].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/74">
                  <span>{item}</span>
                  <span className="live-dot" />
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/62">
              Both creation modes land in the same review and publish flow.
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

  const heroFacts = useMemo(
    () => ["One account", "Clip or generate", "Publish-ready formats"],
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
        text: "Hooks, captions, vertical formats, and queueing stay close to the output instead of buried in tools.",
      },
      {
        title: "Try the workflow first",
        text: "Start free, see how it fits, then move into the plan that matches your volume.",
      },
    ],
    []
  );

  return (
    <div ref={revealRef} className="theme-merged relative overflow-x-hidden">
      <LandingBackdrop />

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+4.5rem)]">
        <section className="relative">
          <div data-reveal className="reveal">
            <div className="studio-frame px-5 py-6 sm:px-7 sm:py-7 md:px-8 md:py-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(920px 420px at 18% 14%, rgba(82,152,255,0.14), transparent 70%), radial-gradient(860px 420px at 88% 16%, rgba(255,186,77,0.12), transparent 72%), radial-gradient(720px 360px at 50% 100%, rgba(44,206,173,0.08), transparent 74%)",
                }}
              />

              <div className="grid gap-6 lg:grid-cols-[1fr_1.04fr] lg:items-start">
                <div>
                  <SectionKicker>One Platform, Two Creation Modes</SectionKicker>
                  <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white/96 sm:text-5xl md:text-6xl">
                    Make short-form from footage or prompts.
                  </h1>
                  <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/68 sm:text-base">
                    Clip long videos, generate new ones with AI, and move both into one publish workflow.
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
                    {heroFacts.map((item) => (
                      <div key={item} className="signal-chip">
                        <span className="live-dot" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <WorkflowTicker />
                  </div>
                </div>

                <HeroStudioBoard />
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="pt-12">
          <div data-reveal className="reveal">
            <SectionKicker>How Orbito Works</SectionKicker>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Two ways in. One clean system out.
            </h2>
          </div>

          <div data-reveal className="reveal mt-6">
            <div className="studio-frame p-4 sm:p-6">
              <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
                <article className="surface-soft motion-card border border-sky-300/20 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="signal-chip border-sky-300/20 bg-sky-300/[0.10] text-sky-100">Clip Mode</div>
                      <h3 className="mt-3 text-[28px] font-semibold tracking-tight text-white/94">
                        Start with a long video.
                      </h3>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-white/66">
                        Upload once, find the strongest moments, and turn them into clips built for social.
                      </p>
                    </div>
                    <Link href="/how-it-works" className="btn-orbito-cta">
                      See clip flow
                    </Link>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-[1.18fr_0.82fr]">
                    <div className="studio-grid rounded-[24px] border border-white/10 bg-[#08111b] p-4">
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/48">
                        <span>Source timeline</span>
                        <span>12:47</span>
                      </div>
                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="mb-2 text-xs text-white/50">Best hook</div>
                          <div className="live-bar">
                            <span style={{ width: "26%" }} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-2 text-xs text-white/50">Story payoff</div>
                          <div className="live-bar">
                            <span style={{ width: "54%" }} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-2 text-xs text-white/50">CTA cut</div>
                          <div className="live-bar">
                            <span style={{ width: "76%" }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {[
                        "Paste a link or upload",
                        "Approve the best clips",
                        "Push to your publish queue",
                      ].map((item, index) => (
                        <div key={item} className="rounded-2xl border border-white/10 bg-black/22 px-4 py-3">
                          <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">0{index + 1}</div>
                          <div className="mt-1.5 text-sm text-white/82">{item}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>

                <div className="grid gap-4">
                  <article className="surface-soft motion-card border border-amber-300/22 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="signal-chip border-amber-300/22 bg-amber-300/[0.10] text-amber-100">Generate Mode</div>
                        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white/94">
                          Start with an idea.
                        </h3>
                      </div>
                      <Link href="/labs" className="btn-clipforge">
                        Open Generate
                      </Link>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">Prompt</div>
                        <div className="mt-2 text-sm leading-relaxed text-white/80">
                          Create a sharp launch teaser with bold captions and a premium dark style.
                        </div>
                      </div>
                      <div className="flex h-[176px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/55">
                        <video
                          src={HOME_GENERATE_PREVIEW}
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full"
                          style={{ objectFit: "contain", objectPosition: "center center" }}
                        />
                      </div>
                    </div>
                  </article>

                  <article className="surface-soft motion-card p-5">
                    <div className="signal-chip">Shared finish line</div>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white/94">
                      Both modes end in publish.
                    </h3>
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
            </div>
          </div>
        </section>

        <section className="pt-12">
          <div className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
            <div data-reveal className="reveal">
              <div className="studio-frame h-full p-5 sm:p-6">
                <SectionKicker>Why It Feels Simpler</SectionKicker>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  One account. Less tool-switching.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-white/66 sm:text-base">
                  The site should feel like one product because the workflow is one product.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  {startTrialCta("btn-orbito-cta")}
                  <Link href="/pricing" className="btn-ghost">
                    Compare plans
                  </Link>
                </div>
              </div>
            </div>

            <div data-reveal className="reveal">
              <div className="studio-frame section-rail h-full p-5 sm:p-6">
                <div className="space-y-5">
                  {operatingPoints.map((item, index) => (
                    <div key={item.title} className="relative pl-8">
                      <div className="absolute left-0 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-white/14 bg-white/[0.05] text-[10px] font-semibold text-white/70">
                        {index + 1}
                      </div>
                      <div className="text-lg font-semibold tracking-tight text-white/90">{item.title}</div>
                      <div className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/64">{item.text}</div>
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
              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <SectionKicker>Optional Monetization</SectionKicker>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                    Keep monetization in its place.
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-white/66 sm:text-base">
                    Orbito is the creation engine. Whop is only there if you want an extra earnings channel later.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href={ORBITO_WHOP_MARKETING_URL} className="btn-ghost">
                      See how Whop fits
                    </Link>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { title: "Create", text: "Make clips or AI videos inside Orbito." },
                    { title: "Publish", text: "Get your content into the same channel queue." },
                    { title: "Monetize", text: "Use Whop only if and when that part matters." },
                  ].map((item) => (
                    <div key={item.title} className="surface-soft motion-card p-4">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">{item.title}</div>
                      <div className="mt-2 text-lg font-semibold text-white/90">{item.title}</div>
                      <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
                    </div>
                  ))}
                </div>
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
