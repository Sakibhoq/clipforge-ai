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

function WorkflowTicker() {
  const items = [
    "Upload",
    "Find moments",
    "Generate ideas",
    "Review",
    "Schedule",
    "Publish",
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

function HeroActivityBoard() {
  const rows = [
    { label: "Upload synced", value: "00:28", width: "76%" },
    { label: "Clip review", value: "3 ready", width: "62%" },
    { label: "Publish queue", value: "4 channels", width: "84%" },
  ];

  return (
    <div className="surface-soft motion-card overflow-hidden p-5">
      <div className="flex items-center justify-between text-xs text-white/54">
        <span>Live studio</span>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/22 bg-emerald-300/[0.10] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
          <span className="live-dot" />
          Active
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-sm text-white/82">
              <span>{row.label}</span>
              <span className="text-xs text-white/56">{row.value}</span>
            </div>
            <div className="mt-3 live-bar">
              <span style={{ width: row.width }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-sky-300/18 bg-sky-300/[0.08] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100/82">Clip Mode</div>
          <div className="mt-2 text-lg font-semibold text-white/92">Source video in.</div>
          <div className="mt-2 text-sm text-white/66">Strong moments out.</div>
        </div>
        <div className="rounded-2xl border border-amber-300/18 bg-amber-300/[0.08] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/82">Generate Mode</div>
          <div className="mt-2 text-lg font-semibold text-white/92">Prompt in.</div>
          <div className="mt-2 text-sm text-white/66">Fresh output fast.</div>
        </div>
      </div>
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
    <article className={`surface motion-card relative overflow-hidden border ${accentClasses.ring} p-5 sm:p-6`}>
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
        <h3 className="mt-3 text-[22px] font-semibold tracking-tight text-white/94 sm:text-2xl">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/68">{summary}</p>
        <div className="mt-4 grid gap-2">
          {bullets.map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white/76">
              {item}
            </div>
          ))}
        </div>
        <div className="mt-5">
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
      "Clip",
      "Generate",
      "Publish",
    ],
    []
  );

  const workflow = useMemo(
    () => [
      {
        title: "Clip mode",
        text: "Upload once, pick the best moments, and move fast.",
      },
      {
        title: "Generate mode",
        text: "Write one idea and turn it into a short video.",
      },
      {
        title: "Publish",
        text: "Send finished clips to your connected channels.",
      },
    ],
    []
  );

  return (
    <div ref={revealRef} className="relative overflow-x-hidden">
      <LandingBackdrop />

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+4.5rem)]">
        <section className="relative">
          <div data-reveal className="reveal">
            <div className="surface relative overflow-hidden p-5 sm:p-7 md:p-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(920px 420px at 18% 14%, rgba(82,152,255,0.14), transparent 70%), radial-gradient(860px 420px at 88% 16%, rgba(255,186,77,0.12), transparent 72%), radial-gradient(720px 360px at 50% 100%, rgba(44,206,173,0.08), transparent 74%)",
                }}
              />

              <div className="relative grid gap-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
                <div>
                  <SectionKicker>One Platform, Two Creation Modes</SectionKicker>
                  <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white/96 sm:text-5xl md:text-6xl">
                    Clip long videos. Generate new ones with AI. <span className="grad-text">Publish from one workflow.</span>
                  </h1>
                  <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/68 sm:text-base">
                    Use Clip when you have footage. Use Generate when you need something new. Same account. Same workflow.
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

                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    {proofPills.map((item) => (
                      <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm text-white/74">
                        {item}
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <WorkflowTicker />
                  </div>
                </div>

                <div className="grid gap-3">
                  <HeroActivityBoard />

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "Account", value: "One login" },
                      { label: "Connections", value: "Shared studio" },
                      { label: "Output", value: "Post everywhere" },
                    ].map((item) => (
                      <div key={item.label} className="surface-soft motion-card p-4">
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

        <section id="how-it-works" className="pt-12">
          <div data-reveal className="reveal">
            <SectionKicker>Choose Your Starting Point</SectionKicker>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Start from footage or start from a prompt.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/68 sm:text-base">
              Both paths land in the same review and publishing flow.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div data-reveal className="reveal">
              <ModeLane
                eyebrow="Orbito Clip"
                title="Turn long-form video into short clips."
                summary="Upload once. Pick the best moments. Post faster."
                bullets={["Paste a link or upload a file", "Approve top clips", "Post or schedule"]}
                href="/how-it-works"
                cta="See clip workflow"
                accent="clip"
              />
            </div>
            <div data-reveal className="reveal">
              <ModeLane
                eyebrow="Orbito Generate"
                title="Create AI short-form video from one prompt."
                summary="Write one idea. Pick a style. Publish faster."
                bullets={["Write the idea", "Choose style and format", "Generate and publish"]}
                href="/labs"
                cta="See generate workflow"
                accent="generate"
              />
            </div>
          </div>
        </section>

        <section className="pt-12">
          <div data-reveal className="reveal surface-inset motion-card p-5 sm:p-7">
            <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
              <div>
                <SectionKicker>One Workflow After Creation</SectionKicker>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  Less switching. More posting.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/66 sm:text-base">
                  Review, caption, and publish from one clear flow.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {startTrialCta("btn-orbito-cta")}
                  <Link href="/pricing" className="btn-ghost">
                    Compare plans
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {workflow.map((item) => (
                  <div key={item.title} className="surface-soft motion-card p-4">
                    <div className="text-sm font-semibold text-white/90">{item.title}</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pt-12">
          <div data-reveal className="reveal surface motion-card relative overflow-hidden p-5 sm:p-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-75"
              style={{
                background:
                  "radial-gradient(760px 320px at 20% 20%, rgba(255,186,77,0.10), transparent 72%), radial-gradient(760px 320px at 80% 24%, rgba(82,152,255,0.10), transparent 74%)",
              }}
            />
            <div className="relative grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
              <div>
                <SectionKicker>Optional Monetization</SectionKicker>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  Create first. Monetize second.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/66 sm:text-base">
                  Use Whop later if you want an extra earnings channel.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1.05fr_0.95fr]">
                <div className="surface-soft motion-card p-4">
                  <div className="text-sm font-semibold text-white/90">Core Orbito promise</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/64">
                    Clip, generate, and publish from one product.
                  </div>
                </div>
                <div className="surface-soft motion-card p-4">
                  <div className="text-sm font-semibold text-white/90">Optional monetization</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/64">
                    <span className="whop-word">Whop</span> is a third-party partner, not the core product.
                  </div>
                  <div className="mt-3">
                    <a href={ORBITO_WHOP_MARKETING_URL} className="btn-ghost">
                      Learn about Whop
                    </a>
                  </div>
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
