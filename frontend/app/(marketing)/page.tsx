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
        <div className="absolute inset-0 bg-[radial-gradient(960px_560px_at_14%_8%,rgba(82,152,255,0.17),transparent_68%),radial-gradient(900px_560px_at_86%_10%,rgba(255,186,77,0.13),transparent_70%),radial-gradient(920px_540px_at_52%_88%,rgba(44,206,173,0.08),transparent_72%)]" />
        <div
          className="orbito-studio-anim absolute left-[-12%] top-[5%] h-[420px] w-[420px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(82,152,255,0.17) 0%, rgba(82,152,255,0.05) 38%, transparent 72%)",
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
    <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-medium tracking-[0.04em] text-white/72">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
      <span>{children}</span>
    </div>
  );
}

function WorkflowTicker() {
  const items = [
    "Add your video",
    "Or type an idea",
    "Pick the best cut",
    "Make new versions",
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

function HeroStudioVisual() {
  return (
    <div className="studio-frame p-5 sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(760px 260px at 12% 0%, rgba(255,255,255,0.07), transparent 62%), radial-gradient(660px 340px at 86% 16%, rgba(255,186,77,0.12), transparent 74%), radial-gradient(620px 340px at 12% 86%, rgba(82,152,255,0.13), transparent 74%)",
        }}
      />

      <div className="relative flex items-center justify-between gap-3 text-sm text-white/56">
        <span>Inside Orbito</span>
        <span className="signal-chip border-emerald-300/20 bg-emerald-300/[0.10] text-emerald-100">
          <span className="live-dot" />
          Live studio
        </span>
      </div>

      <div className="relative mt-5 grid gap-4 xl:grid-cols-[0.84fr_1.16fr]">
        <div className="grid gap-4">
          <div className="rounded-[28px] border border-sky-300/16 bg-[#09111d] p-5">
            <div className="text-[11px] tracking-[0.12em] text-white/46">Clip</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white/92">Upload once. Pick the best parts.</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/64">
              Orbito looks through your long video and helps you keep the parts worth posting.
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
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              "1. Add a link",
              "2. Pick your cuts",
              "3. Post later",
            ].map((item) => (
              <div key={item} className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/76">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-amber-300/18 bg-[#130e0a] p-4">
          <div className="flex items-center justify-between gap-3 text-[11px] tracking-[0.12em] text-white/46">
            <span>Generate</span>
            <span className="inline-flex items-center gap-2 text-amber-100/84">
              <span className="live-dot" />
              Rendering
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[0.82fr_1.18fr]">
            <div className="rounded-[24px] border border-white/10 bg-black/28 p-4">
              <div className="text-[11px] tracking-[0.12em] text-white/42">Prompt</div>
              <div className="mt-2 text-sm leading-relaxed text-white/82">
                Make a short launch video with a fast hook, clean captions, and a strong close.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {["9:16", "Captions", "Fast edit"].map((item) => (
                  <div key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/74">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-h-[360px] items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-black/60">
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

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {["Check it", "Add captions", "Post to channels"].map((item) => (
              <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/74">
                <span>{item}</span>
                <span className="live-dot" />
              </div>
            ))}
          </div>
        </div>
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
    <article className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,19,28,0.94),rgba(10,13,20,0.92))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="text-lg font-semibold tracking-tight text-white/92">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/64">{text}</p>
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
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/66 sm:text-base">{text}</p>

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
        text: "Clip and Generate work inside the same Orbito account.",
      },
      {
        title: "Use your own channels",
        text: "Make the video, then send it to TikTok, Reels, Shorts, and more.",
      },
      {
        title: "Clear pricing",
        text: "Start free, see the plans, and upgrade only when you need more.",
      },
      {
        title: "Real support",
        text: "Billing, setup, and product help are easy to reach from the contact page.",
      },
    ],
    []
  );

  return (
    <div ref={revealRef} className="theme-merged relative overflow-x-hidden">
      <LandingBackdrop />

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+4.5rem)]">
        <section className="relative pt-2">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div data-reveal className="reveal">
              <SectionKicker>One place for short videos</SectionKicker>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white/96 sm:text-5xl md:text-6xl">
                Make short videos from long videos or simple prompts.
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/68 sm:text-base">
                Use Clip when you already have footage. Use Generate when you want AI to make the video. Both end in the same post flow.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {startTrialCta("btn-orbito-cta")}
                <Link href="/pricing" className="btn-ghost">
                  See pricing
                </Link>
                <Link href="/labs" className="btn-clipforge">
                  Try Generate
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <SocialBrandRow platforms={["youtube", "tiktok", "reels", "shorts"]} compact />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {["Clip + Generate", "Ready for social", "Billing by Stripe"].map((item) => (
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
          <div className="grid gap-4 lg:grid-cols-4">
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
              Pick the fast path that fits your day.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/66 sm:text-base">
              Start with a long video if you already filmed something. Start with a prompt if you want AI to make the video for you.
            </p>
          </div>

          <div className="mt-6 grid gap-4">
            <div data-reveal className="reveal">
              <PathCard
                tone="clip"
                title="Have a long video?"
                text="Paste a link or upload a file. Orbito finds the parts people are most likely to watch."
                bullets={["Add a link or upload", "Pick the clips you want", "Caption and post from one place"]}
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
                text="Type what you want. Generate makes short videos you can keep, change, and post."
                bullets={["Write the idea once", "Make different versions fast", "Keep the best one and post it"]}
                href="/labs"
                cta="Open Generate"
              >
                <div className="rounded-[28px] border border-amber-300/16 bg-[#140f0b] p-4">
                  <div className="mb-3 flex items-center justify-between text-[11px] tracking-[0.12em] text-white/46">
                    <span>Prompt preview</span>
                    <span>9:16</span>
                  </div>
                  <div className="flex h-[340px] items-center justify-center overflow-hidden rounded-[22px] border border-white/10 bg-black/60">
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
              </PathCard>
            </div>
          </div>

          <div data-reveal className="reveal mt-4 rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,31,0.96),rgba(10,13,20,0.94))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
            <div className="grid gap-4 md:grid-cols-[0.84fr_1.16fr] md:items-center">
              <div>
                <SectionKicker>Same next step</SectionKicker>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white/94 sm:text-3xl">
                  Both paths end in the same clean finish.
                </h3>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/64 sm:text-base">
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
                Start free. Move up only when you need more.
              </h3>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/66 sm:text-base">
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
                <div key={item.title} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-lg font-semibold tracking-tight text-white/90">{item.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
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
                  Make the video here. Use Whop later if you want.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-white/66 sm:text-base">
                  Orbito is for making videos. Whop is a different site you can try later if you want a money path too.
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
                  <div key={item.title} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-lg font-semibold tracking-tight text-white/90">{item.title}</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
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
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/66 sm:text-base">
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
