"use client";

import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs tracking-wide text-white/70">
      <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
      {children}
    </div>
  );
}

function GlowDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "absolute h-2 w-2 rounded-full bg-white/70 shadow-[0_0_20px_rgba(255,255,255,0.35)]",
        className
      )}
    />
  );
}

function Nav() {
  return (
    <div className="sticky top-0 z-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/70 to-transparent backdrop-blur-[2px]" />
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="relative h-9 w-9">
            <div className="absolute inset-0 rounded-xl bg-white/10" />
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 via-white/5 to-transparent" />
            <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/20 bg-white/5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Clipforge</div>
            <div className="text-[11px] text-white/55">Creator System</div>
          </div>
        </div>

        <div className="hidden items-center gap-7 text-sm text-white/70 md:flex">
          <a className="hover:text-white transition" href="#system">
            System
          </a>
          <a className="hover:text-white transition" href="#capabilities">
            Capabilities
          </a>
          <a className="hover:text-white transition" href="#principles">
            Principles
          </a>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="#get-started"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition"
          >
            Request access
          </a>
          <a
            href="#get-started"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 transition"
          >
            Start pipeline
          </a>
        </div>
      </div>
    </div>
  );
}

function BackgroundOrchestrator() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Soft aurora gradients */}
      <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(120,120,255,0.18),transparent_55%)] blur-2xl" />
      <div className="absolute -bottom-56 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_60%)] blur-3xl" />

      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.22] bg-grid" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.85)_78%)]" />
    </div>
  );
}

function SystemLoop() {
  const items = [
    {
      title: "Upload once",
      desc: "Bring your long-form. The system ingests it once—cleanly—then keeps working.",
      tag: "Input",
    },
    {
      title: "Forge clips",
      desc: "High-retention shorts generated with structure: pacing, hooks, and continuity.",
      tag: "Intelligence",
    },
    {
      title: "Distribute consistently",
      desc: "A running schedule, not a one-off export. Your presence stays active.",
      tag: "Continuity",
    },
    {
      title: "Monetize over time",
      desc: "Campaign-ready outputs, performance signals, and creator economics—built in.",
      tag: "Scale",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((it, idx) => (
        <motion.div
          key={it.title}
          variants={fadeUp}
          transition={{ duration: 0.55, delay: idx * 0.06 }}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6"
        >
          <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="absolute -top-24 right-0 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(120,120,255,0.16),transparent_60%)] blur-2xl" />
          </div>

          <div className="relative flex items-start justify-between gap-6">
            <div>
              <div className="mb-2 text-xs text-white/60">{it.tag}</div>
              <div className="text-lg font-semibold text-white">{it.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                {it.desc}
              </p>
            </div>

            <div className="relative mt-1 h-10 w-10 shrink-0 rounded-xl border border-white/10 bg-white/5">
              <GlowDot className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="relative mt-6 h-px w-full bg-gradient-to-r from-transparent via-white/12 to-transparent" />
          <div className="relative mt-4 text-xs text-white/55">
            Designed as a running system—keeps momentum without manual resets.
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function Capabilities() {
  const caps = [
    {
      title: "Pipeline-first UI",
      desc: "Every screen is oriented around “what runs next,” not “what button to click.”",
    },
    {
      title: "Automation with control",
      desc: "Defaults that work immediately, with levers that appear only when needed.",
    },
    {
      title: "Continuity engine",
      desc: "Your content becomes a stream. Clips connect, formats repeat, cadence persists.",
    },
    {
      title: "Monetization-ready outputs",
      desc: "Assets and insights prepared for sponsors, campaigns, and creator offers.",
    },
    {
      title: "Scalable foundations",
      desc: "Built to evolve into a creator OS and Whop-style monetization hub later.",
    },
    {
      title: "Premium by restraint",
      desc: "Fewer sections, stronger hierarchy, subtle glow, minimal borders, clean type.",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {caps.map((c, i) => (
        <motion.div
          key={c.title}
          variants={fadeUp}
          transition={{ duration: 0.55, delay: i * 0.04 }}
          className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6"
        >
          <div className="text-base font-semibold text-white">{c.title}</div>
          <p className="mt-2 text-sm leading-relaxed text-white/70">{c.desc}</p>

          <div className="mt-5 flex items-center gap-2 text-xs text-white/55">
            <span className="h-1 w-1 rounded-full bg-white/50" />
            <span>System behavior, not one-off features.</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function Principles() {
  const principles = [
    {
      k: "Set once",
      v: "Defaults carry you forward. No constant re-configuring.",
    },
    {
      k: "Keeps running",
      v: "The system continues while you create—cadence and output persist.",
    },
    {
      k: "Surfaces leverage",
      v: "Controls appear when they matter. The UI stays calm and decisive.",
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:p-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(120,120,255,0.14),transparent_62%)] blur-2xl" />
        <div className="absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.10),transparent_60%)] blur-3xl" />
      </div>

      <div className="relative">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <SectionLabel>Design principles</SectionLabel>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white md:text-3xl">
              A calm UI that signals power underneath.
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
              Clipforge is built to feel like infrastructure. It shouldn’t scream.
              It should quietly prove it runs.
            </p>
          </div>

          <div className="flex gap-3">
            <a
              href="#get-started"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition"
            >
              See it in action
            </a>
            <a
              href="#get-started"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 transition"
            >
              Start pipeline
            </a>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {principles.map((p, idx) => (
            <motion.div
              key={p.k}
              variants={fadeUp}
              transition={{ duration: 0.55, delay: idx * 0.06 }}
              className="rounded-2xl border border-white/10 bg-black/20 p-6"
            >
              <div className="text-sm font-semibold text-white">{p.k}</div>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{p.v}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-white/70">
            <span className="font-semibold text-white">Clipforge</span>{" "}
            <span className="text-white/50">—</span> Set it once. The system keeps running.
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
            <a className="hover:text-white transition" href="#system">
              System
            </a>
            <a className="hover:text-white transition" href="#capabilities">
              Capabilities
            </a>
            <a className="hover:text-white transition" href="#principles">
              Principles
            </a>
            <span className="text-white/35">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function Page() {
  const reduceMotion = useReducedMotion();

  const heroWords = useMemo(
    () => ["Upload once.", "Forge clips.", "Stay consistent.", "Monetize over time."],
    []
  );

  return (
    <div className="bg-noise relative min-h-screen bg-black text-white">
      <BackgroundOrchestrator />
      <Nav />

      <main className="relative">
        {/* HERO */}
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pb-24 md:pt-16">
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeIn}
            transition={{ duration: reduceMotion ? 0 : 0.8 }}
            className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-8 md:p-12"
          >
            {/* subtle internal glow */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-28 left-1/2 h-72 w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(120,120,255,0.18),transparent_60%)] blur-3xl" />
              <div className="absolute -bottom-40 right-0 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.10),transparent_62%)] blur-3xl" />
            </div>

            <div className="relative">
              <SectionLabel>Creator pipeline infrastructure</SectionLabel>

              <motion.h1
                variants={fadeUp}
                transition={{ duration: reduceMotion ? 0 : 0.6, delay: 0.05 }}
                className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl"
              >
                A system creators rely on.
              </motion.h1>

              <motion.p
                variants={fadeUp}
                transition={{ duration: reduceMotion ? 0 : 0.6, delay: 0.12 }}
                className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70 md:text-base"
              >
                Clipforge is built for continuity: upload long-form once, then your short-form
                pipeline keeps running—clips, cadence, and monetization-ready outputs—without
                constant manual resets.
              </motion.p>

              {/* “alive” line — animated but restrained */}
              <motion.div
                variants={fadeUp}
                transition={{ duration: reduceMotion ? 0 : 0.6, delay: 0.18 }}
                className="mt-7 flex flex-col gap-3 md:flex-row md:items-center md:gap-4"
              >
                <a
                  id="get-started"
                  href="#system"
                  className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 transition"
                >
                  Start with the system
                </a>
                <a
                  href="#capabilities"
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/80 hover:bg-white/10 hover:text-white transition"
                >
                  Explore capabilities
                </a>

                <div className="md:ml-auto">
                  <div className="text-xs text-white/55">Operating loop</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {heroWords.map((w, i) => (
                      <motion.span
                        key={w}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: reduceMotion ? 0 : 0.5,
                          delay: 0.22 + i * 0.08,
                        }}
                        className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/75"
                      >
                        {w}
                      </motion.span>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* “signal not noise” metrics */}
              <motion.div
                variants={fadeUp}
                transition={{ duration: reduceMotion ? 0 : 0.6, delay: 0.28 }}
                className="mt-10 grid gap-3 md:grid-cols-3"
              >
                {[
                  { k: "Continuity", v: "Cadence that stays alive" },
                  { k: "Automation", v: "Defaults that run" },
                  { k: "Scale", v: "From clips → platform" },
                ].map((m) => (
                  <div
                    key={m.k}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
                  >
                    <div className="text-xs text-white/55">{m.k}</div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {m.v}
                    </div>
                    <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-white/12 to-transparent" />
                    <div className="mt-3 text-xs text-white/55">
                      Built to feel like infrastructure—not a checklist.
                    </div>
                  </div>
                ))}
              </motion.div>

              {/* animated “runline” */}
              <motion.div
                aria-hidden
                className="relative mt-10 overflow-hidden rounded-2xl border border-white/10 bg-black/30"
              >
                <div className="px-5 py-4 text-xs text-white/60">
                  Pipeline signal:{" "}
                  <span className="text-white/80">ingest → structure → publish → learn → repeat</span>
                </div>
                <motion.div
                  className="absolute inset-y-0 left-0 w-48 bg-[linear-gradient(to_right,transparent,rgba(120,120,255,0.18),transparent)]"
                  animate={reduceMotion ? {} : { x: ["-20%", "520%"] }}
                  transition={{
                    duration: 3.6,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              </motion.div>
            </div>
          </motion.div>
        </section>

        {/* SYSTEM */}
        <section id="system" className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            className="flex flex-col gap-4"
          >
            <motion.div variants={fadeUp} transition={{ duration: 0.55 }}>
              <SectionLabel>The operating loop</SectionLabel>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white md:text-4xl">
                Set it once. The system keeps running.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 md:text-base">
                Clipforge is designed as a pipeline, not a project. You don’t “finish a session”—
                you establish a loop, then the loop keeps producing.
              </p>
            </motion.div>

            <div className="mt-6">
              <SystemLoop />
            </div>
          </motion.div>
        </section>

        {/* CAPABILITIES */}
        <section id="capabilities" className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
          >
            <motion.div variants={fadeUp} transition={{ duration: 0.55 }}>
              <SectionLabel>What it becomes</SectionLabel>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white md:text-4xl">
                Built for creators who want leverage, not extra work.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 md:text-base">
                The UI is intentionally calm. Underneath, it’s structured to evolve into a creator
                OS: campaigns, sponsor workflows, analytics, and a Whop-style monetization hub.
              </p>
            </motion.div>

            <div className="mt-8">
              <Capabilities />
            </div>
          </motion.div>
        </section>

        {/* PRINCIPLES / CTA */}
        <section id="principles" className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
          >
            <motion.div variants={fadeUp} transition={{ duration: 0.55 }}>
              <Principles />
            </motion.div>

            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.55, delay: 0.06 }}
              className="mt-10 grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:grid-cols-12 md:p-10"
            >
              <div className="md:col-span-8">
                <div className="text-xs text-white/60">Next steps (after landing)</div>
                <div className="mt-3 text-xl font-semibold text-white md:text-2xl">
                  Upload flow, dashboard, auth, and monetization UI—built on this foundation.
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
                  We’ll implement your real product screens with the same principle: simple at a glance,
                  powerful underneath. No UI kits, no messy CSS, no patchwork.
                </p>
              </div>

              <div className="flex flex-col justify-center gap-3 md:col-span-4 md:items-end">
                <a
                  href="#get-started"
                  className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 transition md:w-auto"
                >
                  Continue to Upload UI
                </a>
                <a
                  href="#system"
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/80 hover:bg-white/10 hover:text-white transition md:w-auto"
                >
                  Review the loop
                </a>
              </div>
            </motion.div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
