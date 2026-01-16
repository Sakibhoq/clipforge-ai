"use client";

import React, { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

type Feature = {
  emoji: string;
  title: string;
  description: string;
  bullets: string[];
  tag?: string;
};

type MiniStep = {
  emoji: string;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    emoji: "🔗",
    title: "Connect once",
    description:
      "Bring your long-form content in from YouTube or upload directly. Clipforge handles the pipeline end-to-end.",
    bullets: [
      "Paste a channel link (later: OAuth)",
      "Direct uploads supported",
      "Private by default — you control what gets processed",
    ],
    tag: "Setup",
  },
  {
    emoji: "🧠",
    title: "AI finds the best moments",
    description:
      "We detect hooks, high-signal segments, and clip-worthy beats — automatically — without you scrubbing timelines.",
    bullets: [
      "Hook detection + pacing signals",
      "Speech-first segmentation (best results with clear audio)",
      "Multi-clip output per video",
    ],
    tag: "AI",
  },
  {
    emoji: "✂️",
    title: "Auto-clip + captions",
    description:
      "Clips are generated, cut, and captioned in a short-form friendly format so you can post fast (or automate posting).",
    bullets: [
      "9:16 vertical-ready formatting",
      "Auto captions (pipeline-ready)",
      "Export-ready clips delivered back to storage",
    ],
    tag: "Output",
  },
  {
    emoji: "📤",
    title: "Auto-post everywhere",
    description:
      "Keep a consistent schedule across platforms. Clipforge is built to become your posting engine, not just a clipper.",
    bullets: [
      "TikTok / Reels / Shorts targets",
      "Scheduled posting (later phase)",
      "Series templates + reusable formats",
    ],
    tag: "Growth",
  },
  {
    emoji: "💸",
    title: "Monetize the pipeline",
    description:
      "Turn consistency into revenue. Clipforge is designed to plug into affiliate links, sponsors, and future creator programs.",
    bullets: [
      "CTA overlays + pinned links (later)",
      "UTM tracking per series (later)",
      "Sponsor-ready exports + metrics (later)",
    ],
    tag: "Money",
  },
];

const MINI_STEPS: MiniStep[] = [
  { emoji: "📺", title: "New video posted", description: "You upload or publish long-form content." },
  { emoji: "⚡", title: "Clipforge detects it", description: "We pick it up automatically and queue processing." },
  { emoji: "🎯", title: "Best moments clipped", description: "AI finds hook segments and generates short clips." },
  { emoji: "🚀", title: "Clips shipped", description: "Export or auto-post to your platforms." },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Features() {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(1); // default highlight = AI
  const activeFeature = useMemo(() => FEATURES[active], [active]);

  return (
    <section id="features" className="cf-section">
      {/* subtle section glow behind the surface */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-240px] h-[620px] w-[980px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.10),transparent_62%)] blur-3xl" />
      </div>

      <div className="cf-container cf-section-inner">
        {/* ONE premium surface (like your good screenshot) */}
        <div className="cf-surface p-6 sm:p-10">
          {/* Header */}
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-white/80"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(34,197,94,0.55)]" />
              <span>✨ Features built for creators</span>
              <span className="text-white/40">•</span>
              <span className="text-white/70">simple, fast, automated</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, ease: "easeOut", delay: 0.02 }}
              className="mt-4 text-[34px] font-extrabold tracking-tight text-white sm:text-[42px]"
            >
              Everything you need to go from{" "}
              <span
                className="bg-gradient-to-r from-violet-400 via-cyan-300 to-emerald-300 bg-clip-text text-transparent"
                style={{ WebkitTextFillColor: "transparent" }}
              >
                upload → viral-ready clips
              </span>{" "}
              automatically.
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, ease: "easeOut", delay: 0.06 }}
              className="mt-3 text-[15px] leading-7 text-white/70"
            >
              Clipforge is a production SaaS pipeline: ingestion, job queue, worker processing,
              transcription, segmentation, clipping, and delivery. We’re polishing the UX so it
              feels premium, fast, and launch-ready.
            </motion.p>
          </div>

          {/* Spacer */}
          <div className="mt-8 h-px w-full bg-white/10" />

          {/* Flow strip (kept clean, not boxy) */}
          <div className="mt-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm font-semibold text-white/85">🌊 Set once. Let the content flow.</div>
              <div className="text-sm text-white/60">Clipforge handles everything after upload.</div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
              <FlowLine reduceMotion={!!reduceMotion} />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {MINI_STEPS.map((s, idx) => (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.45, ease: "easeOut", delay: 0.05 + idx * 0.05 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <div className="text-[22px]">{s.emoji}</div>
                  <div className="mt-2 text-[14px] font-extrabold text-white">{s.title}</div>
                  <div className="mt-1 text-[13px] leading-6 text-white/65">{s.description}</div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Spacer */}
          <div className="mt-8 h-px w-full bg-white/10" />

          {/* Main area: left list + right preview (less box borders, more “surface inside surface”) */}
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.95fr]">
            {/* Left: interactive list */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-extrabold text-white/85">⚙️ Pipeline modules</div>
                <div className="text-xs font-semibold text-white/55">Click a card to preview</div>
              </div>

              <div className="grid gap-3">
                {FEATURES.map((f, idx) => {
                  const selected = idx === active;
                  return (
                    <motion.button
                      key={f.title}
                      type="button"
                      onClick={() => setActive(idx)}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.99 }}
                      className={cx(
                        "group w-full text-left rounded-2xl border px-4 py-4 transition",
                        selected
                          ? "border-white/18 bg-white/10"
                          : "border-white/10 bg-white/[0.045] hover:bg-white/[0.06]"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-[22px]">{f.emoji}</div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-[14px] font-extrabold text-white">{f.title}</div>
                            {f.tag ? (
                              <span
                                className={cx(
                                  "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold",
                                  selected
                                    ? "border-white/16 bg-white/10 text-white/75"
                                    : "border-white/10 bg-white/5 text-white/60"
                                )}
                              >
                                {f.tag}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-1 text-[13px] leading-6 text-white/65">{f.description}</div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {f.bullets.slice(0, 2).map((b) => (
                              <span
                                key={b}
                                className={cx(
                                  "rounded-full border px-2.5 py-1 text-[12px] font-semibold",
                                  selected
                                    ? "border-white/14 bg-black/20 text-white/75"
                                    : "border-white/10 bg-black/15 text-white/60"
                                )}
                              >
                                ✅ {b}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div
                          className={cx(
                            "mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl border transition",
                            selected
                              ? "border-white/14 bg-white/10 text-white/85"
                              : "border-white/10 bg-white/5 text-white/60 group-hover:text-white/80"
                          )}
                          aria-hidden="true"
                        >
                          →
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Right: highlight preview panel */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
            >
              {/* glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 -top-24 h-[380px] w-[380px] rounded-full blur-[80px] opacity-40"
                style={{
                  background:
                    "radial-gradient(circle at 30% 30%, rgba(124,58,237,0.9), transparent 60%), radial-gradient(circle at 70% 40%, rgba(6,182,212,0.85), transparent 55%), radial-gradient(circle at 50% 70%, rgba(34,197,94,0.55), transparent 60%)",
                }}
              />

              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[28px]">{activeFeature.emoji}</div>
                    <div className="mt-2 text-[18px] font-extrabold text-white">{activeFeature.title}</div>
                    <div className="mt-2 text-[13px] leading-6 text-white/70">{activeFeature.description}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-[12px] font-bold text-white/70">
                    🔥 Clipforge Advantage
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  {activeFeature.bullets.map((b, i) => (
                    <motion.div
                      key={b}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, ease: "easeOut", delay: 0.04 + i * 0.05 }}
                      className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
                    >
                      <div className="text-[13px] font-semibold text-white/80">✅ {b}</div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <a
                    href="/upload"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/10 px-4 py-3 text-[13px] font-extrabold text-white shadow-[0_14px_45px_rgba(0,0,0,0.35)] hover:bg-white/[0.12] transition"
                  >
                    🚀 Start clipping <span className="text-white/70">→</span>
                  </a>
                  <a
                    href="/pricing"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[13px] font-bold text-white/75 hover:bg-black/25 hover:text-white transition"
                  >
                    🧾 See pricing
                  </a>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-[12px] leading-6 text-white/65">
                  <span className="font-bold text-white/80">🧪 Note:</span> We’ll add{" "}
                  <span className="font-semibold text-white/80">AI video generation</span> later.
                  This UI is built so we can drop that in as a new module without redesigning the
                  marketing site.
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* clean divider between sections */}
        <div className="mt-10 cf-divider" />
      </div>
    </section>
  );
}

function FlowLine({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="relative h-[86px] w-full">
      {/* base */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="cfFlowGrad" x1="0" x2="1200" y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="rgba(124,58,237,0.0)" />
            <stop offset="0.20" stopColor="rgba(124,58,237,0.85)" />
            <stop offset="0.50" stopColor="rgba(6,182,212,0.85)" />
            <stop offset="0.78" stopColor="rgba(34,197,94,0.75)" />
            <stop offset="1" stopColor="rgba(34,197,94,0.0)" />
          </linearGradient>

          <filter id="cfGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* faint track */}
        <path
          d="M0,70 C160,20 320,110 480,64 C640,18 760,105 920,70 C1040,44 1120,54 1200,60"
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="3"
        />

        {/* glow line */}
        <path
          d="M0,70 C160,20 320,110 480,64 C640,18 760,105 920,70 C1040,44 1120,54 1200,60"
          fill="none"
          stroke="url(#cfFlowGrad)"
          strokeWidth="4"
          filter="url(#cfGlow)"
          opacity="0.9"
        />
      </svg>

      {/* moving highlight */}
      <motion.div
        className="absolute inset-0"
        initial={{ x: "-35%" }}
        animate={reduceMotion ? { x: "0%" } : { x: "35%" }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 2.6, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }
        }
        aria-hidden="true"
      >
        <div
          className="absolute inset-y-0 left-0 w-[38%] opacity-70"
          style={{
            background:
              "linear-gradient(90deg, rgba(124,58,237,0.0), rgba(124,58,237,0.28), rgba(6,182,212,0.24), rgba(34,197,94,0.18), rgba(34,197,94,0.0))",
            filter: "blur(10px)",
          }}
        />
      </motion.div>
    </div>
  );
}
