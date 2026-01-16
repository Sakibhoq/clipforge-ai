"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

/* =========================================================
   Clipforge — Features (Marketing)
   - Premium coverflow wheel (drag + wheel)
   - Magnetic center settling
   - One rail (single scrollbar) end-to-end (no gaps)
   - No infinite loop (prevents haywire)
   - Many feature cards (hooky, not wordy)
   - Footer matches landing (transparent)
========================================================= */

/* -----------------------------
   Tiny helpers
----------------------------- */

function H({ children }: { children: React.ReactNode }) {
  // highlight words (YouTube/TikTok/Instagram/Reels/Shorts)
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
  const railRef = useRef<HTMLDivElement | null>(null);
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

  const [progress, setProgress] = useState(0);

  /* -----------------------------
     Data — lots of cards (hooky)
     Keep each card short, punchy.
  ----------------------------- */
  const cards: FeatureCard[] = useMemo(
    () => [
      {
        id: "paste-youtube",
        kicker: "Source",
        title: (
          <>
            Paste a <H>YouTube</H> link
          </>
        ),
        desc: <>Drop a link. Clipforge ingests the full video and starts forging.</>,
        bullets: [
          <>
            Paste <H>YouTube</H> in seconds — no messy downloads.
          </>,
          <>Upload MP4 if you prefer.</>,
          <>Background processing so you can leave.</>,
        ],
        tagLeft: (
          <>
            <H>YouTube</H> → <H>Shorts</H>
          </>
        ),
        tagRight: <>Fast start</>,
      },
      {
        id: "detect-hooks",
        kicker: "AI",
        title: <>Find hooks people actually watch</>,
        desc: <>Hook-first selection that avoids filler and keeps attention tight.</>,
        bullets: [<>High-signal moments.</>, <>No dead air.</>, <>Clean endings.</>],
        tagLeft: <>Retention</>,
        tagRight: <>High signal</>,
      },
      {
        id: "short-form-native",
        kicker: "Platforms",
        title: (
          <>
            Built for <H>Shorts</H>, <H>Reels</H>, <H>TikTok</H>
          </>
        ),
        desc: <>Exports that look native on every platform — not “reposted long-form.”</>,
        bullets: [<>Vertical-first.</>, <>Safe crop margins.</>, <>Platform-ready layout.</>],
        tagLeft: (
          <>
            <H>Reels</H> / <H>TikTok</H>
          </>
        ),
        tagRight: <>Native</>,
      },
      {
        id: "captions-premium",
        kicker: "Captions",
        title: <>Premium captions that pop</>,
        desc: <>Clean captions with smart line breaks, timing, and emphasis.</>,
        bullets: [<>Readable at a glance.</>, <>Emphasis on key words.</>, <>Multiple styles.</>],
        tagLeft: <>Looks expensive</>,
        tagRight: <>Fast</>,
      },
      {
        id: "caption-emphasis",
        kicker: "Captions",
        title: <>Emphasis that feels intentional</>,
        desc: <>Highlight the right words so the viewer keeps reading.</>,
        bullets: [<>Punchy emphasis.</>, <>Better comprehension.</>, <>More watch time.</>],
        tagLeft: <>Clarity</>,
        tagRight: <>Hook</>,
      },
      {
        id: "hook-variants",
        kicker: "Speed",
        title: <>Generate multiple hook variants</>,
        desc: <>Different openings, same moment — pick the best performer fast.</>,
        bullets: [<>A/B-ready.</>, <>Fast iteration.</>, <>No re-editing from scratch.</>],
        tagLeft: <>Test quickly</>,
        tagRight: <>More winners</>,
      },
      {
        id: "batch-week",
        kicker: "Output",
        title: <>Turn one video into a week of posts</>,
        desc: <>Batch generation that keeps your cadence alive without burning hours.</>,
        bullets: [<>Produce in volume.</>, <>Stay consistent.</>, <>Always have a queue.</>],
        tagLeft: <>Cadence</>,
        tagRight: <>Volume</>,
      },
      {
        id: "quick-edits",
        kicker: "Control",
        title: <>Edit only what matters</>,
        desc: <>Quick trims, caption fixes, clean previews — no bloated editor UI.</>,
        bullets: [<>Tighten pacing.</>, <>Fix a word instantly.</>, <>Preview before export.</>],
        tagLeft: <>Fast edits</>,
        tagRight: <>Clean</>,
      },
      {
        id: "safe-margins",
        kicker: "Quality",
        title: <>Safe margins for UI overlays</>,
        desc: <>Keep captions and faces clear of platform UI and crops.</>,
        bullets: [<>No cut-off text.</>, <>Cleaner composition.</>, <>More professional.</>],
        tagLeft: <>Quality</>,
        tagRight: <>Polished</>,
      },
      {
        id: "export-crisp",
        kicker: "Export",
        title: <>Crisp exports, zero guessing</>,
        desc: <>Reliable encoding + clean audio so clips post smoothly every time.</>,
        bullets: [<>Sharp text.</>, <>Clean audio.</>, <>Fast downloads.</>],
        tagLeft: <>Post-ready</>,
        tagRight: <>Reliable</>,
      },
      {
        id: "auto-post",
        kicker: "Automation",
        title: (
          <>
            Auto-post to <H>Instagram</H>, <H>TikTok</H>, <H>YouTube</H>
          </>
        ),
        desc: <>Connect once, choose a cadence, and keep shipping — automatically.</>,
        bullets: [<>Schedule ahead.</>, <>Queue content.</>, <>Hands-off publishing.</>],
        tagLeft: <>Paste once</>,
        tagRight: <>Forget it</>,
      },
      {
        id: "content-queue",
        kicker: "Automation",
        title: <>Always-on content queue</>,
        desc: <>Your next posts stay lined up even when you’re busy.</>,
        bullets: [<>Consistent output.</>, <>Less stress.</>, <>No last-minute edits.</>],
        tagLeft: <>Always ready</>,
        tagRight: <>Calm</>,
      },
      {
        id: "dashboard",
        kicker: "Workspace",
        title: <>One dashboard for everything</>,
        desc: <>Uploads, jobs, clips, exports — in one calm workspace.</>,
        bullets: [<>Job status.</>, <>Clip library.</>, <>Download anytime.</>],
        tagLeft: <>Studio-ready</>,
        tagRight: <>Simple</>,
      },
      {
        id: "job-pipeline",
        kicker: "Reliability",
        title: <>A real processing pipeline</>,
        desc: <>Jobs, progress, retries, and clear status — built like production.</>,
        bullets: [<>Visible states.</>, <>Retries.</>, <>Error clarity.</>],
        tagLeft: <>Trust</>,
        tagRight: <>Stable</>,
      },
      {
        id: "credits",
        kicker: "Billing",
        title: <>Credit-based usage</>,
        desc: <>Simple pricing tied to output. Scale when the shorts are working.</>,
        bullets: [<>Start small.</>, <>Upgrade when it earns.</>, <>Clear tiers.</>],
        tagLeft: <>Aligned</>,
        tagRight: <>Fair</>,
      },
      {
        id: "re-run",
        kicker: "Output",
        title: <>Re-run the same video anytime</>,
        desc: <>New hooks, new clips, new angles — without re-uploading.</>,
        bullets: [<>Reuse long-form.</>, <>Fresh outputs.</>, <>Faster content cycles.</>],
        tagLeft: <>Repeatable</>,
        tagRight: <>Leverage</>,
      },
      {
        id: "clip-library",
        kicker: "Library",
        title: <>A clean clip library</>,
        desc: <>Every export organized so you can post fast.</>,
        bullets: [<>Searchable.</>, <>Reusable.</>, <>Always accessible.</>],
        tagLeft: <>Organized</>,
        tagRight: <>Fast</>,
      },
      {
        id: "team-ready",
        kicker: "Collab",
        title: <>Team-ready workflow</>,
        desc: <>Share outputs, keep standards, ship consistently.</>,
        bullets: [<>Clear handoffs.</>, <>Consistent style.</>, <>Faster approvals.</>],
        tagLeft: <>Team</>,
        tagRight: <>Smooth</>,
      },
      {
        id: "brand-presets",
        kicker: "Brand",
        title: <>Your style, saved once</>,
        desc: <>Keep your captions and look consistent across every clip.</>,
        bullets: [<>Brand consistency.</>, <>Less tweaking.</>, <>More trust.</>],
        tagLeft: <>Brand</>,
        tagRight: <>Consistent</>,
      },
      {
        id: "speed",
        kicker: "Speed",
        title: <>Faster from idea to post</>,
        desc: <>Stop spending hours per clip. Ship daily without burning out.</>,
        bullets: [<>Less editing.</>, <>More posting.</>, <>More compounding.</>],
        tagLeft: <>Ship daily</>,
        tagRight: <>No burnout</>,
      },
      {
        id: "studio-foundation",
        kicker: "Foundation",
        title: <>Built like a real product</>,
        desc: <>Not a toy tool. A system you can trust and scale.</>,
        bullets: [<>Reliable pipeline.</>, <>Clear controls.</>, <>AWS-ready foundation.</>],
        tagLeft: <>Production</>,
        tagRight: <>Ready</>,
      },
      // Add a few more so the wheel feels “deep”
      {
        id: "face-safe",
        kicker: "Quality",
        title: <>Keep faces centered</>,
        desc: <>Better framing means better watch time.</>,
        bullets: [<>Cleaner visuals.</>, <>Less awkward crops.</>, <>More professional.</>],
        tagLeft: <>Visuals</>,
        tagRight: <>Clean</>,
      },
      {
        id: "subtitles-style",
        kicker: "Captions",
        title: <>Styles that match your vibe</>,
        desc: <>Clean, premium typography — not loud, not cheap.</>,
        bullets: [<>Premium look.</>, <>Readable.</>, <>Consistent.</>],
        tagLeft: <>Premium</>,
        tagRight: <>Stylish</>,
      },
      {
        id: "export-standards",
        kicker: "Export",
        title: <>Export standards built-in</>,
        desc: <>The clip you download is the clip you can post immediately.</>,
        bullets: [<>No guessing.</>, <>No re-encode.</>, <>No quality loss.</>],
        tagLeft: <>Ready</>,
        tagRight: <>Instant</>,
      },
      {
        id: "workflow",
        kicker: "Workflow",
        title: <>A workflow that compounds</>,
        desc: <>The more you post, the easier it gets to keep posting.</>,
        bullets: [<>Repeatable loop.</>, <>More output.</>, <>More growth.</>],
        tagLeft: <>Compound</>,
        tagRight: <>Momentum</>,
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

    // smooth easing factor (trackpad-friendly)
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
     Coverflow transforms + progress (single scrollbar)
     IMPORTANT: progress must ignore the padding that centers cards.
  ========================================================= */

  useEffect(() => {
    const scroller = wheelRef.current;
    if (!scroller) return;

    const requestUpdate = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        const rect = scroller.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;

        // The wheel uses padding-left/right to center cards.
        // Ignore that padding when computing scrollbar progress so the rail is end-to-end.
        const PAD = scroller.clientWidth * 0.55;
        const usable = Math.max(1, scroller.scrollWidth - scroller.clientWidth - PAD * 2);
        const pos = scroller.scrollLeft - PAD;
        setProgress(Math.max(0, Math.min(1, pos / usable)));

        // Coverflow transforms on every card (center sharp, sides blur + tilt)
        for (let i = 0; i < cardRefs.current.length; i++) {
          const el = cardRefs.current[i];
          if (!el) continue;

          const r = el.getBoundingClientRect();
          const cardCx = r.left + r.width / 2;

          const d = (cardCx - cx) / rect.width;
          const clamped = Math.max(-1.35, Math.min(1.35, d));
          const a = Math.abs(clamped);

          const scale = 1 - Math.min(0.16, a * 0.12);
          const opacity = 1 - Math.min(0.58, a * 0.40);
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

      // Debounced snap after scroll ends
      if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = window.setTimeout(() => {
        if (!dragRef.current.dragging) snapToNearest();
      }, 140);
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", requestUpdate);

    // initial
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

      // only hijack when user is essentially vertical scrolling
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

    // cancel animated target while dragging
    animRef.current.active = false;

    // cancel pending snap
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

    // inertia
    const v = dragRef.current.vx;
    const inertia = -v * 520;
    setTarget(scroller.scrollLeft + inertia);

    // snap after inertia settles
    if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(() => snapToNearest(), 180);
  }

  /* =========================================================
     Rail (single scrollbar)
     - end-to-end
     - no gap (thumb never hangs outside)
  ========================================================= */

  const railThumbLeftPct = useMemo(() => {
    // must match CSS width
    const THUMB_PX = 72;

    // Use rail width if available; fallback to wheel width
    const railEl = railRef.current;
    const w = railEl?.clientWidth || wheelRef.current?.clientWidth || 1;

    const thumbPct = (THUMB_PX / w) * 100;
    const range = Math.max(0, 100 - thumbPct);

    // progress is already 0..1 across usable range
    return Math.max(0, Math.min(range, progress * range));
  }, [progress]);

  function railToPointer(e: React.PointerEvent<HTMLDivElement>) {
    const scroller = wheelRef.current;
    const railEl = railRef.current;
    if (!scroller || !railEl) return;

    const rect = railEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const p = rect.width > 0 ? x / rect.width : 0;

    // Map rail p to usable scroll (ignore center padding)
    const PAD = scroller.clientWidth * 0.55;
    const usable = Math.max(1, scroller.scrollWidth - scroller.clientWidth - PAD * 2);

    setTarget(PAD + usable * p);
  }

  /* -----------------------------
     Footer links (match landing)
  ----------------------------- */
  const footerLinks = useMemo(
    () => [
      { label: "Features", href: "/features" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
    ],
    []
  );

  /* =========================================================
     Render
  ========================================================= */

  return (
    <div className="min-h-screen bg-plain relative">
      <Navbar />

      {/* PAGE-LEVEL AURORA FIELD (match landing) */}
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

      <main className="relative mx-auto max-w-6xl px-6 pb-28 pt-12">
        {/* HERO */}
        <section className="surface relative overflow-hidden p-8 md:p-12">
          <div className="absolute inset-0">
            <div className="aurora opacity-60" />
            <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
          </div>

          <div className="relative">
            <div className="text-xs text-white/55">• Features</div>

            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">
              Everything you need to win on{" "}
              <span className="grad-text">short-form.</span>
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65 md:text-[15px]">
              Clipforge turns long-form into a clean, repeatable workflow: paste{" "}
              <H>YouTube</H>, generate <H>Shorts</H>, make quick edits, then post
              to <H>TikTok</H>, <H>Instagram</H> <H>Reels</H>, and{" "}
              <H>YouTube Shorts</H> — automatically.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-2 text-xs text-white/55">
              <Pill>
                paste <H>YouTube</H>
              </Pill>
              →
              <Pill>detect hooks</Pill>→
              <Pill>
                generate <H>Shorts</H>
              </Pill>
              →
              <Pill>edit / export</Pill>→
              <Pill>auto-post</Pill>
            </div>

            {/* WHEEL HEADER */}
            <div className="mt-12 flex items-center justify-between gap-4">
              <div className="text-xs text-white/45">
                Drag the cards or scroll — smooth wheel motion with magnetic center
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-white/45">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                premium settle
              </div>
            </div>

            {/* WHEEL */}
            <div className="mt-4">
              <div
                ref={wheelRef}
                className="cfWheel -mx-6 px-6 overflow-x-auto overscroll-x-contain"
                role="region"
                aria-label="Feature wheel"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{ cursor: dragRef.current.dragging ? "grabbing" : "grab" }}
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
                        {/* header */}
                        <div className="flex items-center justify-between text-xs text-white/55">
                          <div className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5">
                            {f.kicker}
                          </div>
                          <div className="text-white/40">{f.tagRight}</div>
                        </div>

                        {/* title */}
                        <div className="mt-3 text-base font-semibold text-white/90">
                          {f.title}
                        </div>

                        {/* desc */}
                        <div className="mt-2 text-sm leading-relaxed text-white/60">
                          {f.desc}
                        </div>

                        {/* bullets */}
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

                        {/* footer row */}
                        <div className="mt-5 flex items-center justify-between">
                          <Link href="/register" className="btn-ghost text-xs">
                            Try it now
                          </Link>
                          <div className="text-xs text-white/45">{f.tagLeft}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SINGLE RAIL (end-to-end, no gaps) */}
              <div
                ref={railRef}
                className="cfRail mt-4"
                role="slider"
                aria-label="Feature wheel scrollbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                tabIndex={0}
                onPointerDown={(e) => {
                  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                  railToPointer(e);
                }}
                onPointerMove={(e) => {
                  if ((e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) {
                    railToPointer(e);
                  }
                }}
                onPointerUp={(e) => {
                  try {
                    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
                  } catch {}
                }}
              >
                <div className="cfRail__track" />
                <div
                  className="cfRail__thumb"
                  style={{ left: `${railThumbLeftPct}%` }}
                />
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
              <Link href="/register" className="btn-ghost">
                Start free trial
              </Link>
            </div>

            {/* Secondary sections (real product feel) */}
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {[
                {
                  t: "Secure account + login",
                  d: "A clean, premium auth flow that feels trustworthy from the first click.",
                },
                {
                  t: "Uploads, jobs, clips — one dashboard",
                  d: "See what’s processing, what’s ready, and what’s scheduled in one place.",
                },
                {
                  t: "Built for serious output",
                  d: "A layout designed for creators who ship daily — fast, calm, and reliable.",
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
              <Link href="/register" className="btn-aurora">
                Start free trial
              </Link>
              <Link href="/contact" className="btn-ghost">
                Talk to us
              </Link>
            </div>

            {/* FOOTER (match landing: transparent) */}
            <footer className="pb-0 pt-20 text-xs text-white/45">
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
          </div>
        </section>
      </main>

      {/* =========================================================
          Styles (scoped)
          - Wheel overlap
          - Coverflow transforms
          - Single rail
      ========================================================= */}
      <style jsx>{`
        /* pills already use tailwind classes, but keep a hook for consistency */
        .pill :global(.grad-text) {
          display: inline-block;
        }

        /* Wheel container */
        .cfWheel {
          position: relative;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          user-select: none;
          touch-action: pan-y;
        }
        .cfWheel::-webkit-scrollbar {
          display: none;
        }

        /* Track: overlap for “hide behind” */
        .cfTrack {
          display: flex;
          align-items: stretch;

          /* Center scaffolding so first/last card can be centered */
          padding-left: 55vw;
          padding-right: 55vw;
        }

        .cfCard {
          scroll-snap-align: center;
          flex: 0 0 auto;

          width: min(560px, 86vw);
          margin-right: -180px;
          border-radius: 24px;

          transform: perspective(1000px) rotateY(var(--cf-ry, 0deg))
            scale(var(--cf-sc, 1));
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

        /* Rail */
        .cfRail {
          position: relative;
          height: 10px;
          border-radius: 999px;
          cursor: pointer;
          user-select: none;
          touch-action: none;
          overflow: hidden; /* ensures end-to-end visually */
        }

        .cfRail__track {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(10px);
        }

        .cfRail__thumb {
          position: absolute;
          top: 50%;
          width: 72px;
          height: 6px;

          /* IMPORTANT: no -50% X shift (prevents edge gaps) */
          transform: translateY(-50%);

          border-radius: 999px;
          background: linear-gradient(
            90deg,
            rgba(167, 139, 250, 0.75),
            rgba(125, 211, 252, 0.65),
            rgba(45, 212, 191, 0.55)
          );
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.14);
          transition: left 120ms ease;
        }

        /* Responsive tweaks */
        @media (max-width: 640px) {
          .cfCard {
            margin-right: -120px;
          }
          .cfRail__thumb {
            width: 56px;
          }
        }
      `}</style>
    </div>
  );
}
