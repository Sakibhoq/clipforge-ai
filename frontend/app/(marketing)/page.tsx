"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { apiFetch } from "@/lib/api";
import { SocialBrandRow } from "@/components/SocialBrand";

const ORBITO_WHOP_MARKETING_URL = "/whop";

const GENERATE_PREVIEWS = [
  {
    title: "Real",
    text: "Clean and polished for product videos.",
    src: "https://app.orbito.cc/app/labs/previews/labs-preview-1.mp4",
    aspect: "9:16",
  },
  {
    title: "Cartoon",
    text: "Bright and fun for fast social posts.",
    src: "https://app.orbito.cc/app/labs/previews/labs-preview-2.mp4",
    aspect: "16:9",
  },
  {
    title: "Anime",
    text: "More energy for stronger hooks.",
    src: "https://app.orbito.cc/app/labs/previews/labs-preview-3.mp4",
    aspect: "9:16",
  },
  {
    title: "Comic",
    text: "Bold and clear for story or promo videos.",
    src: "https://app.orbito.cc/app/labs/previews/labs-preview-4.mp4",
    aspect: "9:16",
  },
] as const;

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
          50% { transform: translate3d(0, -14px, 0) scale(1.03); }
          100% { transform: translate3d(0, 0, 0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .orbito-studio-anim {
            animation: none !important;
          }
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(980px_580px_at_14%_8%,rgba(82,152,255,0.18),transparent_68%),radial-gradient(920px_560px_at_86%_10%,rgba(255,186,77,0.14),transparent_70%),radial-gradient(940px_540px_at_50%_88%,rgba(44,206,173,0.08),transparent_72%)]" />
        <div
          className="orbito-studio-anim absolute left-[-10%] top-[4%] h-[440px] w-[440px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(82,152,255,0.18) 0%, rgba(82,152,255,0.05) 38%, transparent 72%)",
            animation: "orbitoStudioFloat 16s ease-in-out infinite",
          }}
        />
        <div
          className="orbito-studio-anim absolute right-[-8%] top-[6%] h-[380px] w-[380px] rounded-full blur-3xl"
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
    <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-medium tracking-[0.04em] text-white/72">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
      <span>{children}</span>
    </div>
  );
}

function HeadingLine({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`heading-line mt-4 h-[3px] w-24 rounded-full bg-[linear-gradient(90deg,rgba(82,152,255,0.98),rgba(255,186,77,0.94),rgba(44,206,173,0.92))] shadow-[0_0_24px_rgba(82,152,255,0.24)] ${className}`}
    />
  );
}

function WorkflowTicker() {
  const items = [
    "Upload your video",
    "Or type your idea",
    "Find the best hook",
    "Make more versions",
    "Add captions",
    "Post it",
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

function PreviewWall({
  compact = false,
  title = "Preview wall",
}: {
  compact?: boolean;
  title?: string;
}) {
  return (
    <div className="relative rounded-[30px] border border-amber-300/18 bg-[linear-gradient(180deg,rgba(26,20,11,0.96),rgba(14,10,8,0.94))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.34)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(680px 240px at 10% 0%, rgba(255,186,77,0.10), transparent 62%), radial-gradient(520px 260px at 90% 12%, rgba(58,134,255,0.10), transparent 70%)",
        }}
      />

      <div className="relative flex items-center justify-between gap-3 text-sm text-white/56">
        <span>{title}</span>
        <span className="signal-chip border-amber-300/22 bg-amber-300/[0.10] text-amber-100">
          <span className="live-dot" />
          4 looks live
        </span>
      </div>

      <div className={`relative mt-4 grid gap-3 ${compact ? "sm:grid-cols-2" : "md:grid-cols-2"}`}>
        {GENERATE_PREVIEWS.map((preview, index) => (
          <article
            key={preview.title}
            className={`preview-card preview-card-${(index % 4) + 1} overflow-hidden rounded-[24px] border border-white/10 bg-black/34 p-3`}
          >
            <div className="flex items-center justify-between gap-3 text-[11px] tracking-[0.12em] text-white/50">
              <span>{preview.title}</span>
              <span>{preview.aspect}</span>
            </div>

            <div className={`mt-3 overflow-hidden rounded-[20px] border border-white/10 bg-black/60 ${compact ? "h-[180px]" : "h-[240px]"}`}>
              <video
                src={preview.src}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                className="h-full w-full"
                style={{ objectFit: "cover", objectPosition: "center center" }}
              />
            </div>

            <div className="mt-3">
              <div className="text-sm font-semibold text-white/90">{preview.title} style</div>
              <div className="mt-1 text-sm leading-relaxed text-white/62">{preview.text}</div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function HeroStudioVisual() {
  return (
    <div className="studio-frame p-5 sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(760px 260px at 12% 0%, rgba(255,255,255,0.08), transparent 62%), radial-gradient(660px 340px at 86% 16%, rgba(255,186,77,0.12), transparent 74%), radial-gradient(620px 340px at 12% 86%, rgba(82,152,255,0.14), transparent 74%)",
        }}
      />

      <div className="relative flex items-center justify-between gap-3 text-sm text-white/56">
        <span>Inside Orbito</span>
        <span className="signal-chip border-emerald-300/20 bg-emerald-300/[0.10] text-emerald-100">
          <span className="live-dot" />
          Live studio
        </span>
      </div>

      <div className="relative mt-5 grid gap-4 xl:grid-cols-[0.66fr_1.34fr]">
        <div className="rounded-[28px] border border-sky-300/16 bg-[#09111d] p-5">
          <div className="text-[11px] tracking-[0.12em] text-white/46">Clip flow</div>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white/92">Upload once. Cut faster.</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/64">
            Orbito finds the moments worth posting, then helps you clean them up and publish them.
          </p>

          <div className="mt-5 space-y-4">
            {[
              { label: "Best hook", width: "28%" },
              { label: "Story payoff", width: "58%" },
              { label: "Call to action", width: "76%" },
            ].map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 text-xs text-white/50">{item.label}</div>
                <div className="live-bar">
                  <span style={{ width: item.width }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-2">
            {["Paste a link", "Pick the best cuts", "Post now or later"].map((item) => (
              <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/74">
                <span>{item}</span>
                <span className="live-dot" />
              </div>
            ))}
          </div>
        </div>

        <PreviewWall compact title="Generate looks" />
      </div>
    </div>
  );
}

function HomeFact({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <article className="motion-card rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,19,28,0.94),rgba(10,13,20,0.92))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="text-lg font-semibold tracking-tight text-white/92">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/64">{text}</p>
      <HeadingLine className="mt-5 w-16" />
    </article>
  );
}

function PathCard({
  tone,
  title,
  text,
  bullets,
  href,
  cta,
  children,
}: {
  tone: "clip" | "generate";
  title: string;
  text: string;
  bullets: string[];
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "clip"
      ? "border-cyan-300/18 bg-[linear-gradient(180deg,rgba(13,21,34,0.96),rgba(9,13,20,0.94))]"
      : "border-amber-300/18 bg-[linear-gradient(180deg,rgba(27,20,11,0.96),rgba(14,10,8,0.94))]";

  return (
    <article className={`rounded-[32px] border p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] ${toneClass}`}>
      <div className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr] lg:items-center">
        <div>
          <SectionKicker>{tone === "clip" ? "Clip mode" : "Generate mode"}</SectionKicker>
          <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white/94">{title}</h3>
          <HeadingLine />
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/66 sm:text-base">{text}</p>

          <div className="mt-5 grid gap-2">
            {bullets.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/76">
                <span className="live-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <Link href={href} className={tone === "clip" ? "btn-orbito-cta" : "btn-clipforge"}>
              {cta}
            </Link>
          </div>
        </div>

        <div>{children}</div>
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

  const trustFacts = useMemo(
    () => [
      {
        title: "One login",
        text: "Clip and Generate live inside the same Orbito account.",
      },
      {
        title: "Post-ready",
        text: "Make the video, add captions, and get it ready for social.",
      },
      {
        title: "Clear pricing",
        text: "Start free. Upgrade only when you need more room.",
      },
    ],
    []
  );

  return (
    <div ref={revealRef} className="theme-merged relative overflow-x-hidden">
      <LandingBackdrop />

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+4.5rem)]">
        <section className="relative pt-2">
          <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
            <div data-reveal className="reveal">
              <SectionKicker>One studio for short videos</SectionKicker>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white/96 sm:text-5xl md:text-6xl">
                Clip what you filmed.
                <br />
                Make what you did not.
              </h1>
              <HeadingLine className="w-28" />
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/68 sm:text-base">
                Upload footage or type a prompt. Orbito helps you clip, generate, caption, and post from one clean flow.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {startTrialCta("btn-orbito-cta")}
                <Link href="/pricing" className="btn-ghost">
                  See pricing
                </Link>
                <Link href="/#generate" className="btn-clipforge">
                  See Generate
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <SocialBrandRow platforms={["youtube", "tiktok", "reels", "shorts"]} compact />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {["Clip + Generate", "Ready for social", "Stripe billing"].map((item) => (
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
            {trustFacts.map((item) => (
              <div key={item.title} data-reveal className="reveal">
                <HomeFact title={item.title} text={item.text} />
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="pt-16">
          <div data-reveal className="reveal">
            <SectionKicker>How it works</SectionKicker>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              One tool. Two fast ways in.
            </h2>
            <HeadingLine />
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/66 sm:text-base">
              Start with a long video if you already filmed something. Start with a prompt if you want AI to build the video for you.
            </p>
          </div>

          <div className="mt-6 grid gap-4">
            <div data-reveal className="reveal">
              <PathCard
                tone="clip"
                title="Have a long video?"
                text="Paste a link or upload a file. Orbito finds the parts people are most likely to watch."
                bullets={["Add a link or upload", "Pick the best cuts", "Caption and post from one place"]}
                href="/app"
                cta="Open Clip"
              >
                <div className="rounded-[28px] border border-sky-300/16 bg-[#09121f] p-5">
                  <div className="flex items-center justify-between text-[11px] tracking-[0.12em] text-white/46">
                    <span>Source video</span>
                    <span>12:47</span>
                  </div>
                  <div className="mt-5 space-y-4">
                    {[
                      { label: "Best hook", width: "24%" },
                      { label: "Strong middle", width: "57%" },
                      { label: "Strong finish", width: "74%" },
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
              </PathCard>
            </div>

            <div data-reveal className="reveal">
              <PathCard
                tone="generate"
                title="Only have an idea?"
                text="Write the idea once. Orbito Generate makes versions you can keep, change, and post."
                bullets={["Write the idea once", "Pick the look you want", "Keep the best version and post it"]}
                href="/#generate"
                cta="See Generate"
              >
                <PreviewWall compact title="Live preview wall" />
              </PathCard>
            </div>
          </div>
        </section>

        <section id="generate" className="pt-16">
          <div data-reveal className="reveal rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,21,31,0.96),rgba(10,13,19,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
            <div className="grid gap-8 xl:grid-cols-[0.78fr_1.22fr] xl:items-start">
              <div>
                <SectionKicker>Generate inside Orbito</SectionKicker>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  Type it. Pick a look. Keep the best take.
                </h2>
                <HeadingLine />
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/66 sm:text-base">
                  Generate is part of the same studio. You do not need a second product or a second workflow.
                </p>

                <div className="mt-5 grid gap-2">
                  {[
                    "Start with a simple prompt",
                    "Try different looks fast",
                    "Keep the version that feels right",
                    "Move it into the same post flow",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/76">
                      <span className="live-dot" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    { title: "Same account", text: "Clip and Generate stay together." },
                    { title: "Built for social", text: "Fast hooks, captions, and vertical output." },
                    { title: "Less tool switching", text: "One place to make and post." },
                    { title: "More creative range", text: "Real, cartoon, anime, and comic looks." },
                  ].map((item) => (
                    <div key={item.title} className="motion-card rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-lg font-semibold tracking-tight text-white/90">{item.title}</div>
                      <div className="mt-2 text-sm leading-relaxed text-white/62">{item.text}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="https://app.orbito.cc/app/labs/app/generate" className="btn-clipforge">
                    Open Generate
                  </Link>
                  <Link href="/pricing" className="btn-ghost">
                    See pricing
                  </Link>
                </div>
              </div>

              <div>
                <PreviewWall title="All preview looks" />
              </div>
            </div>
          </div>
        </section>

        <section className="pt-16">
          <div data-reveal className="reveal rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,31,0.96),rgba(10,13,20,0.94))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
            <div className="grid gap-4 md:grid-cols-[0.84fr_1.16fr] md:items-center">
              <div>
                <SectionKicker>Same finish</SectionKicker>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white/94 sm:text-3xl">
                  Both paths end in the same clean finish.
                </h3>
                <HeadingLine />
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/64 sm:text-base">
                  Check the video, add captions if you want them, and post when you are ready.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {["Check it", "Add captions", "Post now or later"].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/76">
                    <span>{item}</span>
                    <span className="live-dot" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pt-16">
          <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
            <div data-reveal className="reveal rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,19,28,0.96),rgba(10,13,20,0.93))] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.32)]">
              <SectionKicker>Simple pricing</SectionKicker>
              <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white/94">
                Start free. Move up when it feels worth it.
              </h3>
              <HeadingLine />
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/66 sm:text-base">
                Try both paths first. Then pick Clip if you work from footage, or Generate if you want AI to make the video.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/pricing" className="btn-orbito-cta">
                  View pricing
                </Link>
                {startTrialCta("btn-ghost")}
              </div>
            </div>

            <div data-reveal className="reveal grid gap-3 sm:grid-cols-3">
              {[
                { title: "Free trial", text: "Try Clip and Generate before you pay." },
                { title: "Clip starts at $15", text: "Best if you already have long videos." },
                { title: "Generate starts at $39", text: "Best if you want AI to make the video." },
              ].map((item) => (
                <div key={item.title} className="motion-card rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-lg font-semibold tracking-tight text-white/90">{item.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
                  <HeadingLine className="mt-5 w-16" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pt-16">
          <div data-reveal className="reveal rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,31,0.96),rgba(10,13,20,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
            <div className="grid gap-6 xl:grid-cols-[0.84fr_1.16fr] xl:items-center">
              <div>
                <SectionKicker>Whop is optional</SectionKicker>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
                  Make here first. Earn later if you want.
                </h2>
                <HeadingLine />
                <p className="mt-4 max-w-md text-sm leading-relaxed text-white/66 sm:text-base">
                  Orbito is for making videos. Whop is a different site you can try later if you want that part too.
                </p>
                <div className="mt-5">
                  <Link href={ORBITO_WHOP_MARKETING_URL} className="btn-ghost">
                    See Whop
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { title: "Make", text: "Clip long videos or make new ones with AI." },
                  { title: "Post", text: "Get them ready for your channels from one place." },
                  { title: "Earn", text: "Open Whop later if that part matters to you." },
                ].map((item) => (
                  <div key={item.title} className="motion-card rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-lg font-semibold tracking-tight text-white/90">{item.title}</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
                    <HeadingLine className="mt-5 w-16" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pt-16">
          <div data-reveal className="reveal rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,18,27,0.96),rgba(9,12,18,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
            <SectionKicker>Ready to start</SectionKicker>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
              Make your next short video today.
            </h2>
            <HeadingLine />
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/66 sm:text-base">
              Start with a long video or a simple prompt. Keep the version you like, then post it.
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
