"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

type Card = {
  title: string;
  desc: string;
  bullets: string[];
  icon: React.ReactNode;
};

export default function Monetize() {
  const reduceMotion = useReducedMotion();

  const cards: Card[] = [
    {
      title: "Route attention into offers",
      desc: "Every clip is an asset. Clipforge helps you build repeatable output — and turn that output into revenue streams.",
      bullets: ["Pinned CTA links", "Series-based content", "Consistent cadence"],
      icon: <LinkIcon />,
    },
    {
      title: "Affiliate-ready overlays",
      desc: "Clean overlays and CTA placement so your clips do more than get views — they drive clicks.",
      bullets: ["UTM tracking plan", "Per-platform CTAs", "Brand-safe formatting"],
      icon: <TagIcon />,
    },
    {
      title: "Sponsor reporting",
      desc: "When sponsors ask for proof, you’ll have a clean story: series performance, clip wins, and exportable metrics.",
      bullets: ["Series metrics", "Exportable summaries", "Sponsor-ready views"],
      icon: <ChartIcon />,
    },
  ];

  return (
    <section id="monetize" className="cf-section">
      {/* Background accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 520px at 25% 15%, rgba(34,197,94,0.08), transparent 60%), radial-gradient(860px 520px at 75% 55%, rgba(124,58,237,0.07), transparent 62%)",
        }}
      />

      <div className="cf-container cf-section-inner">
        <div className="cf-surface p-6 sm:p-10">
          <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="text-[34px] font-extrabold tracking-tight text-white">
              Monetize the pipeline
            </h2>
            <p className="mt-2 max-w-[72ch] text-[15px] leading-relaxed text-white/70">
              Output creates attention. Attention creates options. Clipforge is
              built to help you ship consistent short-form — then route it into
              offers, sponsors, and affiliate revenue.
            </p>
          </motion.div>

          <div className="mt-6 grid grid-cols-12 gap-4">
            {/* Big left card */}
            <motion.div
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="col-span-12 lg:col-span-7 cf-monCol"
            >
              <BigCard />
            </motion.div>

            {/* Right stack */}
            <div className="col-span-12 lg:col-span-5 grid gap-4 cf-monCol">
              {cards.map((c, idx) => (
                <motion.div
                  key={c.title}
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{
                    duration: 0.55,
                    ease: [0.22, 1, 0.36, 1],
                    delay: reduceMotion ? 0 : idx * 0.05,
                  }}
                >
                  <SmallCard card={c} />
                </motion.div>
              ))}
            </div>
          </div>

          <style jsx>{`
            @media (max-width: 520px) {
              :global(.cf-monMiniGrid) {
                grid-template-columns: 1fr !important;
              }
            }
          `}</style>
        </div>

        <div className="mt-10 cf-divider" />
      </div>
    </section>
  );
}

/* ---------------- cards (unchanged logic) ---------------- */

function BigCard() {
  return (
    <div className="relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(34,197,94,0.14),transparent_58%),radial-gradient(circle_at_85%_28%,rgba(6,182,212,0.10),transparent_58%),radial-gradient(circle_at_60%_80%,rgba(124,58,237,0.10),transparent_62%)] mix-blend-screen" />
      <div className="relative p-4">
        <div className="text-sm font-extrabold text-white">
          Revenue engine: consistent series
        </div>
        <p className="mt-2 text-sm text-white/70">
          Build a system that produces repeatable wins — not one-off clips.
        </p>
      </div>
    </div>
  );
}

function SmallCard({ card }: { card: Card }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.14),transparent_58%),radial-gradient(circle_at_85%_28%,rgba(6,182,212,0.10),transparent_58%)] mix-blend-screen" />
      <div className="relative p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5">
            {card.icon}
          </div>
          <div className="font-extrabold text-white">{card.title}</div>
        </div>
        <p className="mt-2 text-sm text-white/70">{card.desc}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {card.bullets.map((b) => (
            <span
              key={b}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70"
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- icons (unchanged) ---------------- */

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M10 13a5 5 0 007.07 0l1.41-1.41a5 5 0 000-7.07 5 5 0 00-7.07 0L10.5 5"
        stroke="rgba(255,255,255,0.78)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 01-7.07 0L5.5 9.59a5 5 0 010-7.07 5 5 0 017.07 0L13.5 3"
        stroke="rgba(255,255,255,0.78)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 13l-7 7-11-11V2h7l11 11z"
        stroke="rgba(255,255,255,0.78)"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 7.5h.01"
        stroke="rgba(255,255,255,0.78)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 19V5" stroke="rgba(255,255,255,0.78)" strokeWidth="1.7" />
      <path d="M4 19h16" stroke="rgba(255,255,255,0.78)" strokeWidth="1.7" />
      <path d="M8 16v-5" stroke="rgba(255,255,255,0.78)" strokeWidth="1.7" />
      <path d="M12 16v-8" stroke="rgba(255,255,255,0.78)" strokeWidth="1.7" />
      <path d="M16 16v-3" stroke="rgba(255,255,255,0.78)" strokeWidth="1.7" />
    </svg>
  );
}
