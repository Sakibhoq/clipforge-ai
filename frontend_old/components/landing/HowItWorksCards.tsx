"use client";

import React from "react";

type Step = {
  title: string;
  desc: string;
  meta: string;
  icon: React.ReactNode;
  accent: "violet" | "cyan" | "pink" | "amber" | "emerald";
};

const STEPS: Step[] = [
  {
    title: "Connect sources",
    desc: "Drop a YouTube URL, upload a file, or plug in a folder. (OAuth later.)",
    meta: "Input",
    icon: <LinkIcon />,
    accent: "violet",
  },
  {
    title: "Auto-detect uploads",
    desc: "We watch for new content and queue it instantly — no refresh, no manual steps.",
    meta: "Trigger",
    icon: <RadarIcon />,
    accent: "cyan",
  },
  {
    title: "Find moments",
    desc: "Hook + pacing signals identify cut points that keep retention high.",
    meta: "Analyze",
    icon: <WaveIcon />,
    accent: "pink",
  },
  {
    title: "Cut & format",
    desc: "Auto-crop, captions, titles, and platform presets for Shorts/Reels/TikTok.",
    meta: "Create",
    icon: <ScissorsIcon />,
    accent: "amber",
  },
  {
    title: "Publish & track",
    desc: "Auto-post (later) + performance tracking. Built for monetization workflows.",
    meta: "Distribute",
    icon: <RocketIcon />,
    accent: "emerald",
  },
];

function accentStyles(accent: Step["accent"]) {
  // Using inline gradients makes this feel less like EasySlice and more “Clipforge”.
  switch (accent) {
    case "violet":
      return {
        glow:
          "radial-gradient(circle at 30% 20%, rgba(124,58,237,0.22), transparent 62%)",
        chip:
          "linear-gradient(135deg, rgba(124,58,237,0.95), rgba(236,72,153,0.75))",
        line: "linear-gradient(90deg, rgba(124,58,237,0.0), rgba(124,58,237,0.85), rgba(236,72,153,0.55), rgba(124,58,237,0.0))",
      };
    case "cyan":
      return {
        glow:
          "radial-gradient(circle at 30% 20%, rgba(6,182,212,0.18), transparent 62%)",
        chip:
          "linear-gradient(135deg, rgba(6,182,212,0.95), rgba(124,58,237,0.65))",
        line: "linear-gradient(90deg, rgba(6,182,212,0.0), rgba(6,182,212,0.85), rgba(124,58,237,0.45), rgba(6,182,212,0.0))",
      };
    case "pink":
      return {
        glow:
          "radial-gradient(circle at 30% 20%, rgba(236,72,153,0.18), transparent 62%)",
        chip:
          "linear-gradient(135deg, rgba(236,72,153,0.95), rgba(245,158,11,0.55))",
        line: "linear-gradient(90deg, rgba(236,72,153,0.0), rgba(236,72,153,0.85), rgba(245,158,11,0.35), rgba(236,72,153,0.0))",
      };
    case "amber":
      return {
        glow:
          "radial-gradient(circle at 30% 20%, rgba(245,158,11,0.16), transparent 62%)",
        chip:
          "linear-gradient(135deg, rgba(245,158,11,0.95), rgba(236,72,153,0.55))",
        line: "linear-gradient(90deg, rgba(245,158,11,0.0), rgba(245,158,11,0.85), rgba(236,72,153,0.35), rgba(245,158,11,0.0))",
      };
    case "emerald":
    default:
      return {
        glow:
          "radial-gradient(circle at 30% 20%, rgba(16,185,129,0.16), transparent 62%)",
        chip:
          "linear-gradient(135deg, rgba(16,185,129,0.95), rgba(6,182,212,0.65))",
        line: "linear-gradient(90deg, rgba(16,185,129,0.0), rgba(16,185,129,0.85), rgba(6,182,212,0.45), rgba(16,185,129,0.0))",
      };
  }
}

export default function HowItWorksCards() {
  return (
    <section className="cf-section">
      <div className="cf-container cf-section-inner">
        <div className="cf-surface p-6 sm:p-10">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/70">
              <span>⚙️ Creator pipeline</span>
              <span className="text-white/30">•</span>
              <span>📦 Upload once</span>
              <span className="text-white/30">•</span>
              <span>🧠 System runs</span>
            </div>

            <h2 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              How it works
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
              A creator pipeline — not a checklist. You upload once, and Clipforge runs the
              system end-to-end.
            </p>
          </div>

          {/* Unique “Pipeline Track” (NOT EasySlice line) */}
          <div className="mt-10">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20">
              {/* top track */}
              <div className="relative px-6 pt-6">
                <div className="flex items-center justify-between text-xs font-semibold text-white/50">
                  <span>INPUT</span>
                  <span>TRIGGER</span>
                  <span>ANALYZE</span>
                  <span>CREATE</span>
                  <span>DISTRIBUTE</span>
                </div>

                <div className="relative mt-4 h-[10px] overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                  <div
                    className="absolute inset-0 opacity-90"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(124,58,237,0.0), rgba(124,58,237,0.9), rgba(6,182,212,0.65), rgba(236,72,153,0.65), rgba(245,158,11,0.6), rgba(16,185,129,0.75), rgba(16,185,129,0.0))",
                    }}
                  />
                  <div
                    className="absolute inset-0 opacity-35"
                    style={{
                      background:
                        "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.35), transparent 35%)",
                    }}
                  />
                </div>

                {/* nodes */}
                <div className="mt-5 grid grid-cols-5 gap-3 pb-6">
                  {STEPS.map((s, idx) => {
                    const a = accentStyles(s.accent);
                    return (
                      <div
                        key={s.title}
                        className="relative"
                        aria-label={`Step ${idx + 1}: ${s.title}`}
                      >
                        <div
                          className="mx-auto h-9 w-9 rounded-full border border-white/10 bg-white/[0.05] shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                          style={{ position: "relative" }}
                        >
                          <div
                            aria-hidden="true"
                            className="absolute -inset-6 opacity-60 blur-xl"
                            style={{ background: a.glow }}
                          />
                          <div
                            aria-hidden="true"
                            className="absolute inset-[3px] rounded-full"
                            style={{ background: a.chip }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Steps grid */}
              <div className="border-t border-white/10">
                <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
                  {STEPS.map((s, idx) => {
                    const a = accentStyles(s.accent);
                    return (
                      <div
                        key={s.title}
                        className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
                      >
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-24 opacity-60 blur-2xl"
                          style={{ background: a.glow }}
                        />
                        <div className="relative">
                          <div className="flex items-start justify-between gap-3">
                            <div className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-black/20">
                              {s.icon}
                            </div>

                            <div className="text-right">
                              <div className="text-[10px] font-extrabold tracking-wider text-white/55">
                                STEP {idx + 1}
                              </div>
                              <div className="mt-1 inline-flex items-center rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                                {s.meta}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 text-sm font-extrabold text-white">
                            {s.title}
                          </div>
                          <div className="mt-2 text-xs leading-relaxed text-white/65">
                            {s.desc}
                          </div>

                          <div
                            className="mt-5 h-[1px] w-full opacity-80"
                            style={{ background: a.line }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom callout */}
                <div className="px-6 pb-6">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-sm text-white/70">
                    <span className="font-semibold text-white/85">Clipforge = pipeline.</span>{" "}
                    The goal is consistent output — your system keeps posting while you keep creating.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 cf-divider" />
        </div>
      </div>
    </section>
  );
}

/* Icons */
function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M10 13a5 5 0 007.07 0l1.41-1.41a5 5 0 000-7.07 5 5 0 00-7.07 0L10.5 5"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 01-7.07 0L5.5 9.59a5 5 0 010-7.07 5 5 0 017.07 0L13.5 3"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RadarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 21a9 9 0 109-9"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 12l7-7"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 12a3 3 0 103 3"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12c2.2 0 2.2-6 4.4-6S9.6 18 11.8 18 14 6 16.2 6 18.4 12 20.6 12 22.8 9 21 9"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScissorsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 4l8 8"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M4 20l8-8"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M14 14l6 6"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M14 10l6-6"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle
        cx="6"
        cy="6"
        r="2"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
      />
      <circle
        cx="6"
        cy="18"
        r="2"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M14 4c4 1 6 5 6 8-3 0-7 2-8 6-3 0-7-2-8-6 1-3 3-7 10-8z"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 15l-2 2"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M15 9l2-2"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle
        cx="14"
        cy="10"
        r="1.8"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.7"
      />
    </svg>
  );
}
