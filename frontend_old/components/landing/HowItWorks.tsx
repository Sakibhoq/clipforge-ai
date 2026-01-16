"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Pack = "Shorts" | "Reels" | "TikTok";

type StudioState = {
  pack: Pack;
  aspect: "9:16" | "4:5" | "1:1";
  cut: string;
  captions: "Auto" | "Burn-in" | "Off";
  hookScore: number;
  bestMoment: string;
  nextAction: string;
  status: "ready" | "processing";
};

const PACKS: Pack[] = ["Shorts", "Reels", "TikTok"];

const PACK_META: Record<Pack, { label: string; accent: string; glow: string }> = {
  Shorts: {
    label: "YouTube Shorts",
    accent: "rgba(124,92,255,1)",
    glow: "rgba(124,92,255,0.38)",
  },
  Reels: {
    label: "Instagram Reels",
    accent: "rgba(255,120,88,1)",
    glow: "rgba(255,120,88,0.28)",
  },
  TikTok: {
    label: "TikTok",
    accent: "rgba(0,200,255,1)",
    glow: "rgba(0,200,255,0.28)",
  },
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(!!m.matches);
    onChange();
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function HowItWorks() {
  const reducedMotion = usePrefersReducedMotion();

  const [pack, setPack] = useState<Pack>("Shorts");
  const [phase, setPhase] = useState<"idle" | "switching">("idle");

  // Animate “live” values on pack changes (smooth + subtle)
  const target = useMemo<StudioState>(() => {
    if (pack === "Shorts") {
      return {
        pack,
        aspect: "9:16",
        cut: "23s",
        captions: "Auto",
        hookScore: 92,
        bestMoment: "0:42 → 1:05",
        nextAction: "Preview export →",
        status: "ready",
      };
    }
    if (pack === "Reels") {
      return {
        pack,
        aspect: "4:5",
        cut: "18s",
        captions: "Burn-in",
        hookScore: 88,
        bestMoment: "0:14 → 0:32",
        nextAction: "Queue batch →",
        status: "ready",
      };
    }
    return {
      pack,
      aspect: "9:16",
      cut: "29s",
      captions: "Auto",
      hookScore: 95,
      bestMoment: "1:12 → 1:41",
      nextAction: "Schedule post →",
      status: "ready",
    };
  }, [pack]);

  const [hookScore, setHookScore] = useState<number>(target.hookScore);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // smooth number tween
    if (reducedMotion) {
      setHookScore(target.hookScore);
      return;
    }
    const start = performance.now();
    const from = hookScore;
    const to = target.hookScore;
    const dur = 380;

    const tick = (t: number) => {
      const p = clamp((t - start) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setHookScore(Math.round(from + (to - from) * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.hookScore, reducedMotion]);

  const meta = PACK_META[pack];

  const onPick = (p: Pack) => {
    if (p === pack) return;
    setPhase("switching");
    // tiny transition window so content swaps feel deliberate
    window.setTimeout(() => {
      setPack(p);
      window.setTimeout(() => setPhase("idle"), 120);
    }, 120);
  };

  return (
    <section className="cf-section relative w-full overflow-hidden">
      {/* Ambient moving lights (unique signature – not EasySlice) */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* base vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_45%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.035),transparent_55%)]" />

        {/* drifting blobs */}
        <div
          className={[
            "absolute left-[-120px] top-[40px] h-[360px] w-[360px] rounded-full blur-3xl",
            reducedMotion ? "" : "animate-[cfFloat_9s_ease-in-out_infinite]",
          ].join(" ")}
          style={{ background: meta.glow }}
        />
        <div
          className={[
            "absolute right-[-140px] top-[220px] h-[420px] w-[420px] rounded-full blur-3xl",
            reducedMotion ? "" : "animate-[cfFloat2_11s_ease-in-out_infinite]",
          ].join(" ")}
          style={{ background: "rgba(255,255,255,0.06)" }}
        />
        <div
          className={[
            "absolute left-[18%] bottom-[-160px] h-[520px] w-[520px] rounded-full blur-3xl",
            reducedMotion ? "" : "animate-[cfFloat3_13s_ease-in-out_infinite]",
          ].join(" ")}
          style={{ background: "rgba(0,200,255,0.10)" }}
        />
      </div>

      <div className="cf-container cf-section-inner">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-3 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1 text-xs font-semibold text-white/70">
              🧠 Interactive studio preview
            </span>
          </div>

          <h2 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            A clean studio that feels{" "}
            <span className="cf-gradient-text">alive</span>
          </h2>

          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
            Not a checklist. A pipeline. Pick a destination pack and watch the “system”
            respond: format, captions, and a hook score you can trust at a glance.
          </p>

          {/* Tabs */}
          <div className="mt-6 flex justify-center">
            <div className="relative inline-flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
              {/* animated pill */}
              <div
                className={[
                  "absolute top-1 bottom-1 w-1/3 rounded-xl transition-all duration-300",
                  reducedMotion ? "" : "will-change-transform",
                ].join(" ")}
                style={{
                  left: pack === "Shorts" ? "0%" : pack === "Reels" ? "33.333%" : "66.666%",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              />

              {PACKS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPick(p)}
                  className="relative z-10 rounded-xl px-4 py-2 text-sm font-semibold text-white/70 transition hover:text-white"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Studio card (unique layout, no table borders) */}
        <div className="mx-auto mt-10 max-w-5xl">
          <div className="cf-surface relative overflow-hidden p-5 sm:p-7">
            {/* shimmer border */}
            <div
              className={[
                "pointer-events-none absolute inset-0 rounded-[28px] opacity-70",
                reducedMotion ? "" : "animate-[cfShimmer_7s_linear_infinite]",
              ].join(" ")}
              style={{
                background:
                  "conic-gradient(from 180deg at 50% 50%, rgba(255,255,255,0.0), rgba(255,255,255,0.08), rgba(255,255,255,0.0), rgba(255,255,255,0.0))",
                maskImage:
                  "radial-gradient(transparent 55%, black 62%), linear-gradient(black, black)",
                WebkitMaskImage:
                  "radial-gradient(transparent 55%, black 62%), linear-gradient(black, black)",
              }}
            />

            {/* Top row */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white/55">Clipforge Studio</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      color: "rgba(255,255,255,0.82)",
                    }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-xs text-white/55">
                    Upload once → system runs
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  <span
                    className={[
                      "h-2 w-2 rounded-full",
                      reducedMotion ? "" : "animate-pulse",
                    ].join(" ")}
                    style={{ background: meta.accent }}
                  />
                  Live preview
                </span>
              </div>
            </div>

            {/* Main grid */}
            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              {/* “Video” panel */}
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)]">
                {/* top bar */}
                <div className="flex items-center justify-between border-b border-white/10 bg-[rgba(0,0,0,0.25)] px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white/70">
                    <span className="inline-flex h-2 w-2 rounded-full bg-white/20" />
                    <span className="inline-flex h-2 w-2 rounded-full bg-white/20" />
                    <span className="inline-flex h-2 w-2 rounded-full bg-white/20" />
                    <span className="ml-2">Preview</span>
                  </div>
                  <div className="text-xs text-white/55">{target.bestMoment}</div>
                </div>

                {/* content */}
                <div className="relative p-5 sm:p-6">
                  {/* big glow */}
                  <div
                    className={[
                      "pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full blur-3xl",
                      reducedMotion ? "" : "animate-[cfGlowBreath_6.5s_ease-in-out_infinite]",
                    ].join(" ")}
                    style={{ background: meta.glow }}
                  />
                  <div
                    className={[
                      "pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full blur-3xl",
                      reducedMotion ? "" : "animate-[cfGlowBreath_8s_ease-in-out_infinite]",
                    ].join(" ")}
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  />

                  {/* fake player */}
                  <div className="relative mx-auto aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.07),transparent_50%),radial-gradient(circle_at_70%_60%,rgba(255,255,255,0.05),transparent_55%)]">
                    <div className="absolute inset-0 opacity-60" />
                    <div className="absolute left-5 top-5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/70">
                      {target.aspect} • {target.captions} captions
                    </div>

                    {/* play button */}
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="group relative grid h-16 w-16 place-items-center rounded-full border border-white/15 bg-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset] transition hover:bg-white/[0.08]">
                        <div
                          className={[
                            "absolute inset-0 rounded-full blur-xl opacity-70",
                            reducedMotion ? "" : "animate-[cfPulse_2.2s_ease-in-out_infinite]",
                          ].join(" ")}
                          style={{ background: meta.glow }}
                        />
                        <svg
                          viewBox="0 0 24 24"
                          className="relative h-6 w-6 translate-x-[1px] fill-white/80 transition group-hover:fill-white"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>

                    {/* bottom overlay */}
                    <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-[rgba(0,0,0,0.35)] px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-white/70">
                          Best moment detected • cut {target.cut}
                        </div>
                        <button
                          type="button"
                          className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/[0.08] hover:text-white"
                        >
                          {target.nextAction}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Metrics + pipeline */}
              <div className="flex flex-col gap-5">
                {/* metrics */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-xs font-semibold text-white/55">Signal summary</div>

                  <div
                    className={[
                      "mt-4 grid grid-cols-2 gap-3 transition-opacity duration-200",
                      phase === "switching" ? "opacity-55" : "opacity-100",
                    ].join(" ")}
                  >
                    <Metric label="Hook score" value={`${hookScore}`} highlight />
                    <Metric label="Format" value={target.aspect} />
                    <Metric label="Captions" value={target.captions} />
                    <Metric label="Cut length" value={target.cut} />
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white/70">Status</div>
                        <div className="mt-1 text-sm text-white/80">
                          {target.status === "ready" ? "Ready to export" : "Processing…"}
                        </div>
                      </div>
                      <span
                        className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
                        style={{
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.04)",
                          color: "rgba(255,255,255,0.78)",
                        }}
                      >
                        <span
                          className={[
                            "h-2 w-2 rounded-full",
                            reducedMotion ? "" : "animate-pulse",
                          ].join(" ")}
                          style={{ background: meta.accent }}
                        />
                        {target.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* pipeline */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white/55">Pipeline loop</div>
                      <div className="mt-1 text-sm font-semibold text-white/85">
                        Configure once. The system keeps running.
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <Step
                      n="01"
                      title="Connect sources"
                      desc="YouTube URL, upload, or folder watch (OAuth later)."
                      accent={meta.accent}
                      reducedMotion={reducedMotion}
                    />
                    <Step
                      n="02"
                      title="Detect moments"
                      desc="Signals find cut points people actually watch."
                      accent={meta.accent}
                      reducedMotion={reducedMotion}
                    />
                    <Step
                      n="03"
                      title="Forge + format"
                      desc="Framing, captions, titles — consistent presets."
                      accent={meta.accent}
                      reducedMotion={reducedMotion}
                    />
                    <Step
                      n="04"
                      title="Ship"
                      desc="Export now. Auto-post + scheduling next."
                      accent={meta.accent}
                      reducedMotion={reducedMotion}
                    />
                  </div>

                  <div className="mt-5 text-xs leading-relaxed text-white/60">
                    What makes this different: it’s a <span className="text-white/80 font-semibold">pipeline</span> —
                    not a checklist. You don’t “do steps”; you configure the system once.
                  </div>
                </div>
              </div>
            </div>

            {/* Footer hint */}
            <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-white/55 sm:flex-row">
              <div>
                Live-feel UI (not clutter) — interactive but simple.
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                Built for clarity • motion supports understanding
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* local keyframes (scoped) */}
      <style jsx global>{`
        @keyframes cfFloat {
          0%, 100% { transform: translate3d(0,0,0); }
          50% { transform: translate3d(18px, -14px, 0); }
        }
        @keyframes cfFloat2 {
          0%, 100% { transform: translate3d(0,0,0); }
          50% { transform: translate3d(-20px, 12px, 0); }
        }
        @keyframes cfFloat3 {
          0%, 100% { transform: translate3d(0,0,0); }
          50% { transform: translate3d(10px, -18px, 0); }
        }
        @keyframes cfShimmer {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes cfGlowBreath {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.05); }
        }
        @keyframes cfPulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.08); }
        }
      `}</style>
    </section>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="text-[11px] font-semibold text-white/55">{label}</div>
      <div
        className={[
          "mt-1 text-lg font-extrabold tracking-tight",
          highlight ? "text-white" : "text-white/90",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  desc,
  accent,
  reducedMotion,
}: {
  n: string;
  title: string;
  desc: string;
  accent: string;
  reducedMotion: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      {/* left accent */}
      <div
        className={[
          "pointer-events-none absolute left-0 top-0 h-full w-[2px] opacity-80",
          reducedMotion ? "" : "group-hover:opacity-100 transition-opacity",
        ].join(" ")}
        style={{ background: accent }}
      />
      {/* hover glow */}
      <div
        className={[
          "pointer-events-none absolute -left-16 -top-10 h-40 w-40 rounded-full blur-3xl opacity-0",
          reducedMotion ? "" : "group-hover:opacity-60 transition-opacity duration-300",
        ].join(" ")}
        style={{ background: `color-mix(in srgb, ${accent} 35%, transparent)` as any }}
      />
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-extrabold text-white/80">
          {n}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-white/90">{title}</div>
          <div className="mt-1 text-xs leading-relaxed text-white/60">{desc}</div>
        </div>
      </div>
    </div>
  );
}
