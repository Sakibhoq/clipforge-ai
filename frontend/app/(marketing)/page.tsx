"use client";

import React, { useEffect, useMemo, useRef } from "react";

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

function HoverSheen() {
  return (
    <>
      {/* hover aurora sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(120px 120px at 20% 25%, rgba(167,139,250,0.20), transparent 60%), radial-gradient(140px 140px at 80% 30%, rgba(125,211,252,0.18), transparent 62%), radial-gradient(140px 140px at 55% 85%, rgba(45,212,191,0.14), transparent 62%)",
        }}
      />
      {/* subtle top highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)",
        }}
      />
    </>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <span className="grad-text font-semibold tracking-tight">{children}</span>
  );
}

export default function Page() {
  const revealRef = useReveal();

  const footerLinks = useMemo(
    () => [
      { label: "Features", href: "/features" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
    ],
    []
  );

  const heroSteps = useMemo(
    () => [
      {
        id: "paste",
        t: (
          <>
            Paste <H>YouTube</H> (or upload)
          </>
        ),
        d: <>One link in — your clip machine starts.</>,
      },
      {
        id: "generate",
        t: (
          <>
            Generate <H>Shorts</H> automatically
          </>
        ),
        d: <>Clipforge finds the moments, hooks them, and formats them.</>,
      },
      {
        id: "edit",
        t: <>Edit or download in seconds</>,
        d: (
          <>
            Quick trims, captions, and layout tweaks — without a bloated editor.
          </>
        ),
      },
      {
        id: "autopost",
        t: (
          <>
            Auto-post to <H>TikTok</H> / <H>Reels</H> / <H>Shorts</H>
          </>
        ),
        d: <>Schedule once. Stay consistent while you sleep.</>,
      },
    ],
    []
  );

  const featureCards = useMemo(
    () => [
      {
        id: "moments",
        title: (
          <>
            AI finds your best moments from <H>YouTube</H>
          </>
        ),
        desc: (
          <>
            Pull highlights, hooks, and clean segments from long-form —
            automatically.
          </>
        ),
      },
      {
        id: "formats",
        title: (
          <>
            Built for <H>Reels</H>, <H>TikTok</H>, and <H>Shorts</H>
          </>
        ),
        desc: (
          <>
            Captions, pacing, and formatting that looks native on every platform.
          </>
        ),
      },
      {
        id: "autopublish",
        title: (
          <>
            Auto-post to <H>Instagram</H>, <H>TikTok</H> & <H>YouTube</H>
          </>
        ),
        desc: (
          <>
            Set a cadence once. Clipforge keeps your accounts active every week.
          </>
        ),
      },
    ],
    []
  );

  const howItWorks = useMemo(
    () => [
      {
        id: "hiw-1",
        n: "1",
        title: "Start your free trial",
        desc: "Create an account and get credits to process your first videos.",
      },
      {
        id: "hiw-2",
        n: "2",
        title: (
          <>
            Paste <H>YouTube</H> or upload
          </>
        ),
        desc: (
          <>
            Drop a <H>YouTube</H> link or upload long-form once.
          </>
        ),
      },
      {
        id: "hiw-3",
        n: "3",
        title: "Review & edit (optional)",
        desc: "Approve clips, tweak captions, export — or keep it fully hands-off.",
      },
      {
        id: "hiw-4",
        n: "4",
        title: (
          <>
            Auto-post to <H>TikTok</H>, <H>Reels</H> & <H>Shorts</H>
          </>
        ),
        desc: (
          <>
            Schedule <H>TikTok</H>, <H>Instagram</H> <H>Reels</H>, and{" "}
            <H>YouTube Shorts</H> — consistently.
          </>
        ),
      },
    ],
    []
  );

  return (
    <div ref={revealRef as any} className="min-h-screen bg-plain relative">
      {/* PAGE-LEVEL AURORA FIELD */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_10%,rgba(255,255,255,0.06),transparent_62%)]" />
        <div className="absolute inset-0 opacity-[0.55]">
          <div className="aurora" />
        </div>
        <div className="absolute -top-40 left-[-20%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.22),transparent_62%)] blur-3xl" />
        <div className="absolute top-24 right-[-18%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.18),transparent_64%)] blur-3xl" />
        <div className="absolute bottom-[-18%] left-[10%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.14),transparent_65%)] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      <main className="relative mx-auto max-w-6xl px-6 pb-24 pt-10">
        {/* HERO */}
        <section className="relative">
          <div
            data-reveal
            className="reveal surface relative overflow-hidden p-8 md:p-10"
          >
            <div className="absolute inset-0">
              <div className="aurora opacity-80" />
              <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_35%_25%,rgba(255,255,255,0.06),transparent_60%)]" />
            </div>

            <div className="relative grid gap-8 md:grid-cols-[1.15fr_0.85fr]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-white/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                  Turn <H>YouTube</H> into <H>Shorts</H>, <H>Reels</H> &{" "}
                  <H>TikToks</H> — on autopilot
                </div>

                <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
                  Paste a <H>YouTube</H> link.
                  <br />
                  Get <H>Shorts</H> ready to post.
                </h1>

                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65 md:text-[15px]">
                  Clipforge finds your best moments, turns them into
                  ready-to-publish <H>Shorts</H>, and lets you edit, download, or
                  auto-post to <H>TikTok</H>, <H>Instagram</H> <H>Reels</H>, and{" "}
                  <H>YouTube Shorts</H>. One upload — weeks of content.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a href="/register" className="btn-aurora">
                    Start free trial
                  </a>
                  <a href="/how-it-works" className="btn-ghost">
                    See how it works
                  </a>
                  <div className="text-xs text-white/45">
                    Credits only when you generate clips.
                  </div>
                </div>

                <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/55">
                  <span className="text-white/70">
                    Paste <H>YouTube</H> / upload
                  </span>{" "}
                  → AI clips → quick edits → schedule <H>TikTok</H> /{" "}
                  <H>Reels</H> / <H>Shorts</H> → repeat
                </div>
              </div>

              {/* RIGHT PANEL */}
              <div className="group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]">
                <HoverSheen />

                <div className="relative">
                  <div className="flex items-center justify-between text-xs text-white/55">
                    <div>Your posting loop</div>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                      always running
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {heroSteps.map((x) => (
                      <div
                        key={x.id}
                        className="group/card relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20"
                      >
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover/card:opacity-100"
                          style={{
                            background:
                              "radial-gradient(120px 120px at 25% 25%, rgba(167,139,250,0.18), transparent 60%), radial-gradient(140px 140px at 80% 30%, rgba(125,211,252,0.15), transparent 62%), radial-gradient(140px 140px at 55% 85%, rgba(45,212,191,0.12), transparent 62%)",
                          }}
                        />
                        <div className="relative">
                          <div className="text-sm font-semibold">{x.t}</div>
                          <div className="mt-1 text-xs text-white/55">{x.d}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] text-white/60">
                    {[
                      { k: "Speed", v: "Shorts in minutes" },
                      { k: "Reach", v: "Every platform" },
                      { k: "Consistency", v: "Schedule & forget" },
                    ].map((x) => (
                      <div
                        key={x.k}
                        className="group/mini relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20"
                      >
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover/mini:opacity-100"
                          style={{
                            background:
                              "radial-gradient(120px 120px at 20% 30%, rgba(167,139,250,0.16), transparent 60%), radial-gradient(140px 140px at 85% 25%, rgba(125,211,252,0.14), transparent 62%), radial-gradient(140px 140px at 55% 90%, rgba(45,212,191,0.10), transparent 62%)",
                          }}
                        />
                        <div className="relative">
                          <div className="text-white/45">{x.k}</div>
                          <div className="mt-1 text-white/75">{x.v}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* /RIGHT PANEL */}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="pt-16">
          <div data-reveal className="reveal">
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Make <H>Shorts</H> that win attention —<br className="hidden md:block" />
              and post them everywhere.
            </h2>
            <p className="mt-3 max-w-2xl text-white/65">
              Clipforge is built for creators who want the output of a team —
              without spending hours editing.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {featureCards.map((c) => (
              <div
                key={c.id}
                data-reveal
                className="reveal group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]"
              >
                <HoverSheen />
                <div className="relative">
                  <div className="text-sm font-semibold">{c.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/60">
                    {c.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/features" className="btn-ghost">
              Explore all features
            </a>
            <a href="/pricing" className="btn-aurora">
              View pricing
            </a>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="pt-16">
          <div data-reveal className="reveal">
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Set it up once. <span className="grad-text">Then ship daily.</span>
            </h2>
            <p className="mt-3 max-w-2xl text-white/65">
              One link becomes a steady stream of <H>Shorts</H> — with control
              when you want it.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {howItWorks.map((s) => (
              <div
                key={s.id}
                data-reveal
                className="reveal group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]"
              >
                <HoverSheen />
                <div className="relative">
                  <div className="flex items-center justify-between text-xs text-white/55">
                    <div className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5">
                      {s.n}
                    </div>
                    <div>step</div>
                  </div>
                  <div className="mt-3 text-sm font-semibold">{s.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/60">
                    {s.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/how-it-works" className="btn-ghost">
              See full workflow
            </a>
            <a href="/register" className="btn-aurora">
              Start free trial
            </a>
            <a href="/contact" className="btn-ghost">
              Contact
            </a>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="pb-10 pt-20 text-xs text-white/45">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-0">
            <div>© 2026 • Clipforge.ai by Sakib LLC</div>
            <div className="flex gap-5">
              {footerLinks.map((i) => (
                <a key={i.href} href={i.href} className="hover:text-white/70">
                  {i.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
