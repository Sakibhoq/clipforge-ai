// frontend/app/features/page.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

/* =========================================================
   Orbito — Features (Marketing)
   - Premium coverflow wheel (drag + wheel)
   - Magnetic center settling
   - Mobile friendly: safe-area + touch tuning
   - No infinite loop (stable)
   - Footer matches landing (transparent)
   - FIX: removed Dial/Scrub UI entirely

   IMPORTANT FIXES:
   - Remove page-level scroll containers (prevents 2 scrollbars)
   - Use FIXED background layers (never affect layout height)
   - Keep Navbar visible (this route not under (marketing) layout currently)
========================================================= */

/* -----------------------------
   Tiny helpers
----------------------------- */

function H({ children }: { children: React.ReactNode }) {
  return <span className="grad-text font-semibold tracking-tight">{children}</span>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="pill inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/70">
      {children}
    </span>
  );
}

function Dot() {
  return <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-emerald-300/70" />;
}

function HoverSheen() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(120px 120px at 20% 25%, rgba(167,139,250,0.20), transparent 60%), radial-gradient(140px 140px at 80% 30%, rgba(125,211,252,0.18), transparent 62%), radial-gradient(140px 140px at 55% 85%, rgba(45,212,191,0.14), transparent 62%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)",
        }}
      />
    </>
  );
}

/* -----------------------------
   Types
----------------------------- */

type FeatureCard = {
  id: string;
  kicker: string;
  title: React.ReactNode;
  desc: React.ReactNode;
  bullets?: React.ReactNode[];
  tagLeft?: React.ReactNode;
  tagRight?: React.ReactNode;
};

/* =========================================================
   Page
========================================================= */

export default function FeaturesPage() {
  /* -----------------------------
     Refs + State (wheel system)
  ----------------------------- */
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);

  const animRef = useRef<{ active: boolean; target: number; lastT: number }>({
    active: false,
    target: 0,
    lastT: 0,
  });

  const dragRef = useRef<{
    dragging: boolean;
    pointerId: number | null;
    startX: number;
    startLeft: number;
    lastX: number;
    lastT: number;
    vx: number; // px/ms
  }>({
    dragging: false,
    pointerId: null,
    startX: 0,
    startLeft: 0,
    lastX: 0,
    lastT: 0,
    vx: 0,
  });

  const snapTimerRef = useRef<number | null>(null);

  /* -----------------------------
     Data — fewer, stronger cards
  ----------------------------- */
  const cards: FeatureCard[] = useMemo(
    () => [
      {
        id: "source",
        kicker: "Source",
        title: (
          <>
            Add a <H>YouTube</H> link or file
          </>
        ),
        desc: <>Upload once. Orbito starts building clips in the background.</>,
        bullets: [<>MP4 or YouTube.</>, <>No setup.</>, <>Fast start.</>],
        tagLeft: <>Simple</>,
        tagRight: <>Quick</>,
      },
      {
        id: "hooks",
        kicker: "AI",
        title: (
          <>
            Clips made for <H>TikTok</H> and <H>Reels</H>
          </>
        ),
        desc: <>We pick strong moments so your clips get to the point quickly.</>,
        bullets: [<>No long pauses.</>, <>Clear cuts.</>, <>Clean endings.</>],
        tagLeft: <>Better watch time</>,
        tagRight: <>Focused</>,
      },
      {
        id: "reframe",
        kicker: "Quality",
        title: (
          <>
            Captions and framing that are easy to read
          </>
        ),
        desc: <>Get speaker-first framing and clean captions for vertical video.</>,
        bullets: [<>Stable framing.</>, <>Clear captions.</>, <>Ready to post.</>],
        tagLeft: <>Looks clean</>,
        tagRight: <>Readable</>,
      },
    ],
    []
  );

  /* =========================================================
     Smooth scroll engine (premium)
  ========================================================= */

  function tickSmooth() {
    const scroller = wheelRef.current;
    if (!scroller) {
      animRef.current.active = false;
      return;
    }

    const now = performance.now();
    const dt = Math.min(32, now - animRef.current.lastT);
    animRef.current.lastT = now;

    const cur = scroller.scrollLeft;
    const target = animRef.current.target;

    const k = 1 - Math.pow(0.001, dt / 340);
    const next = cur + (target - cur) * k;

    scroller.scrollLeft = next;

    if (Math.abs(target - next) < 0.5) {
      scroller.scrollLeft = target;
      animRef.current.active = false;
      return;
    }

    requestAnimationFrame(tickSmooth);
  }

  function setTarget(left: number) {
    const scroller = wheelRef.current;
    if (!scroller) return;

    const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    animRef.current.target = Math.max(0, Math.min(max, left));

    if (!animRef.current.active) {
      animRef.current.active = true;
      animRef.current.lastT = performance.now();
      tickSmooth();
    }
  }

  /* =========================================================
     Magnetic center snapping
  ========================================================= */

  function snapToNearest() {
    const scroller = wheelRef.current;
    if (!scroller) return;

    const rect = scroller.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;

    let bestEl: HTMLDivElement | null = null;
    let bestDist = Infinity;

    for (const el of cardRefs.current) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const d = Math.abs(cx - centerX);
      if (d < bestDist) {
        bestDist = d;
        bestEl = el as HTMLDivElement;
      }
    }

    if (!bestEl) return;

    const br = bestEl.getBoundingClientRect();
    const bestCenter = br.left + br.width / 2;
    const deltaPx = bestCenter - centerX;

    setTarget(scroller.scrollLeft + deltaPx);
  }

  /* =========================================================
     Coverflow transforms
  ========================================================= */

  useEffect(() => {
    const scroller = wheelRef.current;
    if (!scroller) return;

    const requestUpdate = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        const rect = scroller.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;

        for (let i = 0; i < cardRefs.current.length; i++) {
          const el = cardRefs.current[i];
          if (!el) continue;

          const r = el.getBoundingClientRect();
          const cardCx = r.left + r.width / 2;

          const d = (cardCx - cx) / rect.width;
          const clamped = Math.max(-1.35, Math.min(1.35, d));
          const a = Math.abs(clamped);

          const scale = 1 - Math.min(0.16, a * 0.12);
          const opacity = 1 - Math.min(0.58, a * 0.4);
          const blur = Math.min(10, a * 5.2);
          const rotateY = clamped * -14;
          const z = Math.round((1.45 - Math.min(1.45, a)) * 100);

          el.style.setProperty("--cf-sc", `${scale}`);
          el.style.setProperty("--cf-op", `${opacity}`);
          el.style.setProperty("--cf-bl", `${blur}px`);
          el.style.setProperty("--cf-ry", `${rotateY}deg`);
          el.style.setProperty("--cf-z", `${z}`);
        }

        rafRef.current = null;
      });
    };

    const onScroll = () => {
      requestUpdate();

      if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = window.setTimeout(() => {
        if (!dragRef.current.dragging) snapToNearest();
      }, 140);
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", requestUpdate);

    const t = window.requestAnimationFrame(requestUpdate);

    return () => {
      window.cancelAnimationFrame(t);
      scroller.removeEventListener("scroll", onScroll as any);
      window.removeEventListener("resize", requestUpdate as any);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    };
  }, [cards.length]);

  /* =========================================================
     Wheel (vertical wheel => horizontal scroll), smooth target
  ========================================================= */

  useEffect(() => {
    const scroller = wheelRef.current;
    if (!scroller) return;

    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) return;

      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);

      if (absY > absX) {
        e.preventDefault();
        setTarget(scroller.scrollLeft + e.deltaY * 1.05);
      }
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel as any);
  }, []);

  /* =========================================================
     Drag (pointer) + inertia + snap
  ========================================================= */

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const scroller = wheelRef.current;
    if (!scroller) return;

    dragRef.current.dragging = true;
    dragRef.current.pointerId = e.pointerId;
    dragRef.current.startX = e.clientX;
    dragRef.current.startLeft = scroller.scrollLeft;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastT = performance.now();
    dragRef.current.vx = 0;

    animRef.current.active = false;

    if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    scroller.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const scroller = wheelRef.current;
    if (!scroller) return;
    if (!dragRef.current.dragging) return;
    if (dragRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - dragRef.current.startX;
    scroller.scrollLeft = dragRef.current.startLeft - dx;

    const now = performance.now();
    const dt = Math.max(8, now - dragRef.current.lastT);
    dragRef.current.vx = (e.clientX - dragRef.current.lastX) / dt;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastT = now;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const scroller = wheelRef.current;
    if (!scroller) return;
    if (!dragRef.current.dragging) return;
    if (dragRef.current.pointerId !== e.pointerId) return;

    dragRef.current.dragging = false;
    dragRef.current.pointerId = null;

    const v = dragRef.current.vx;
    const inertia = -v * 520;
    setTarget(scroller.scrollLeft + inertia);

    if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(() => snapToNearest(), 180);
  }

  const footerLinks = useMemo(
    () => [
      { label: "Features", href: "/features" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy-policy" },
      { label: "Terms", href: "/terms-of-service" },
    ],
    []
  );

  /* =========================================================
     Render
  ========================================================= */
  return (
    <div className="relative overflow-x-hidden bg-transparent">
      {/* FIXED PAGE BACKGROUND (never affects layout height / never creates scroll containers) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_10%,rgba(255,255,255,0.06),transparent_62%)]" />
        <div className="absolute inset-0 opacity-[0.55]">
          <div className="aurora" />
        </div>

        <div className="absolute -top-40 left-[-20%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.22),transparent_62%)] blur-3xl" />
        <div className="absolute top-24 right-[-18%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.18),transparent_64%)] blur-3xl" />
        <div className="absolute bottom-[-18%] left-[10%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.14),transparent_65%)] blur-3xl" />

        <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      {/* Navbar (needed here because this route isn't under (marketing)/layout.tsx) */}
      <Navbar />

      <main className="relative mx-auto max-w-6xl px-6 pt-12 pb-28 [padding-bottom:calc(7rem+env(safe-area-inset-bottom))]">
        {/* HERO */}
        <section className="surface relative overflow-hidden p-8 md:p-12">
          <div className="absolute inset-0">
            <div className="aurora opacity-60" />
            <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
          </div>

          <div className="relative">
            <div className="text-xs text-white/55">• Features</div>

            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">
              Turn long videos into short clips.
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65 md:text-[15px]">
              Start with one <H>YouTube</H> link or file. Orbito helps you find good moments and post faster on{" "}
              <H>TikTok</H>, <H>Reels</H>, and <H>YouTube Shorts</H>.
            </p>

            <div className="mt-6 relative overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(120deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-[1px]">
              <div
                aria-hidden="true"
                className="absolute -inset-8 opacity-70 blur-2xl"
                style={{
                  background:
                    "conic-gradient(from 120deg, rgba(45,212,191,0.22), rgba(125,211,252,0.22), rgba(167,139,250,0.2), rgba(45,212,191,0.22))",
                }}
              />
              <div className="relative rounded-[14px] bg-black/70 px-5 py-4 text-sm text-white/75">
                <span className="font-semibold text-white/90">Clipforge Labs</span> is coming soon at clipforge.us
                with AI video and AI song generation.
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-2 text-xs text-white/55">
              <Pill>
                upload video
              </Pill>
              <span className="text-white/35">→</span>
              <Pill>pick clips</Pill>
              <span className="text-white/35">→</span>
              <Pill>
                add captions
              </Pill>
              <span className="text-white/35">→</span>
              <Pill>post</Pill>
            </div>

            {/* WHEEL HEADER */}
            <div className="mt-12 flex items-center justify-between gap-4">
              <div className="text-xs text-white/45">Swipe to see what Orbito does</div>
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-white/45">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                smooth scrolling
              </div>
            </div>

            {/* WHEEL */}
            <div className="mt-4">
              <div
                ref={wheelRef}
                className="cfWheel -mx-6 px-6"
                role="region"
                aria-label="Feature wheel"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  cursor: dragRef.current.dragging ? "grabbing" : "grab",
                }}
              >
                <div className="cfTrack py-6">
                  {cards.map((f, idx) => (
                    <div
                      key={f.id}
                      ref={(el) => {
                        cardRefs.current[idx] = el;
                      }}
                      className="cfCard group surface-soft relative overflow-hidden p-6 select-none"
                    >
                      <HoverSheen />
                      <div className="relative">
                        <div className="flex items-center justify-between text-xs text-white/55">
                          <div className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5">
                            {f.kicker}
                          </div>
                          <div className="text-white/40">{f.tagRight}</div>
                        </div>

                        <div className="mt-3 text-base font-semibold text-white/90">{f.title}</div>

                        <div className="mt-2 text-sm leading-relaxed text-white/60">{f.desc}</div>

                        {f.bullets?.length ? (
                          <ul className="mt-4 space-y-2 text-sm text-white/60">
                            {f.bullets.map((b, i) => (
                              <li key={`${f.id}-b-${i}`} className="flex gap-2">
                                <Dot />
                                <span className="leading-relaxed">{b}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        <div className="mt-5 flex items-center justify-between">
                          <Link href="/start-trial" className="btn-ghost text-xs">
                            Try it now
                          </Link>
                          <div className="text-xs text-white/45">{f.tagLeft}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CTA ROW */}
            <div className="mt-12 flex flex-wrap items-center gap-3">
              <Link href="/pricing" className="btn-aurora">
                View pricing
              </Link>
              <Link href="/how-it-works" className="btn-ghost">
                How it works
              </Link>
              <Link href="/start-trial" className="btn-ghost">
                Start free
              </Link>
            </div>

            {/* SECONDARY SECTIONS */}
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {[
                {
                  t: "Simple pricing",
                  d: "Pay for what you need. Upgrade when you are ready.",
                },
                {
                  t: "One dashboard",
                  d: "Upload, review, edit, and export in one place.",
                },
                {
                  t: "Clipforge Labs (coming soon)",
                  d: "clipforge.us will launch AI video and AI song generation.",
                },
              ].map((x) => (
                <div
                  key={x.t}
                  className="group surface-soft relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.03]"
                >
                  <HoverSheen />
                  <div className="relative">
                    <div className="text-sm font-semibold">{x.t}</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/60">{x.d}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link href="/start-trial" className="btn-aurora">
                Start free
              </Link>
              <Link href="/contact" className="btn-ghost">
                Contact
              </Link>
            </div>

            {/* FOOTER */}
            <footer className="pb-0 pt-20 text-xs text-white/45">
              <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>© 2026 • Orbito by Sakib LLC</div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {footerLinks.map((i) => (
                    <a key={i.href} href={i.href} className="hover:text-white/70">
                      {i.label}
                    </a>
                  ))}
                </div>
              </div>
            </footer>
          </div>
        </section>
      </main>

      {/* ================= STYLES ================= */}
      <style jsx>{`
        .pill :global(.grad-text) {
          display: inline-block;
        }

        .cfWheel {
          position: relative;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          user-select: none;

          /* wheel container should only scroll horizontally */
          overflow-x: auto;
          overflow-y: hidden;

          /* MOBILE: allow horizontal gestures */
          touch-action: pan-x;

          /* keep momentum, prevent "rubber band" scroll chaining */
          overscroll-behavior-x: contain;
        }
        .cfWheel::-webkit-scrollbar {
          display: none;
        }

        .cfTrack {
          display: flex;
          align-items: stretch;
          padding-left: clamp(42vw, 55vw, 55vw);
          padding-right: clamp(42vw, 55vw, 55vw);
        }

        .cfCard {
          scroll-snap-align: center;
          flex: 0 0 auto;
          width: min(560px, 86vw);
          margin-right: -180px;

          border-radius: 24px;
          transform: perspective(1000px) rotateY(var(--cf-ry, 0deg)) scale(var(--cf-sc, 1));
          opacity: var(--cf-op, 1);
          filter: blur(var(--cf-bl, 0px));
          z-index: var(--cf-z, 1);

          transform-style: preserve-3d;
          will-change: transform, opacity, filter;

          transition: filter 220ms ease, opacity 220ms ease;
        }

        .cfCard:hover {
          filter: blur(0px);
          opacity: 1;
        }

        .cfCard::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 24px;
          pointer-events: none;
          opacity: 0.75;
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.55);
        }

        @media (max-width: 640px) {
          .cfCard {
            margin-right: -120px;
          }
        }
      `}</style>
    </div>
  );
}
