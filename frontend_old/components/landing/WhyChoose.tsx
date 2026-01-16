"use client";

import React, { useMemo, useState } from "react";

type Row = {
  label: string;
  leftTitle: string;
  leftDesc: string;
  rightTitle: string;
  rightDesc: string;
};

const ROWS: Row[] = [
  {
    label: "Time Investment",
    leftTitle: "2 Minutes",
    leftDesc: "Just connect and forget",
    rightTitle: "2+ Hours",
    rightDesc: "Watching, editing, exporting",
  },
  {
    label: "Consistency",
    leftTitle: "100%",
    leftDesc: "Every upload gets processed",
    rightTitle: "Variable",
    rightDesc: "Depends on your schedule",
  },
  {
    label: "AI Analysis",
    leftTitle: "Included",
    leftDesc: "Hooks + pacing signals",
    rightTitle: "Manual",
    rightDesc: "Based on your judgment",
  },
  {
    label: "Multi-Platform",
    leftTitle: "Automatic",
    leftDesc: "Built to become your engine",
    rightTitle: "Manual",
    rightDesc: "Upload to each platform",
  },
];

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export default function WhyChoose() {
  const [mode, setMode] = useState<"clipforge" | "manual">("clipforge");

  const titleLeft = useMemo(
    () => (mode === "clipforge" ? "Clipforge" : "Easy Comparison"),
    [mode]
  );

  return (
    <section className="cf-section">
      <div className="cf-container cf-section-inner">
        <div className="cf-surface p-6 sm:p-10">
          <div className="text-center">
            <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Why Choose
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
              One clean comparison. The goal is “set it once” — not “edit forever.”
            </p>

            {/* toggle */}
            <div className="mx-auto mt-7 inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => setMode("clipforge")}
                className={cx(
                  "rounded-xl px-4 py-2 text-xs font-extrabold transition",
                  mode === "clipforge"
                    ? "bg-white text-black"
                    : "text-white/75 hover:text-white"
                )}
              >
                Clipforge
              </button>
              <button
                type="button"
                onClick={() => setMode("manual")}
                className={cx(
                  "rounded-xl px-4 py-2 text-xs font-extrabold transition",
                  mode === "manual"
                    ? "bg-white text-black"
                    : "text-white/75 hover:text-white"
                )}
              >
                Manual Editing
              </button>
            </div>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">

            {/* CATEGORY column */}
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="text-xs font-extrabold text-white/60">CATEGORY</div>

              {/* ✅ remove per-row borders, use subtle separators */}
              <div className="mt-4 overflow-hidden rounded-xl bg-white/[0.03]">
                {ROWS.map((r, idx) => (
                  <div
                    key={r.label}
                    className={cx(
                      "px-4 py-3 text-sm font-semibold text-white/80",
                      idx !== 0 && "border-t border-white/10"
                    )}
                  >
                    {r.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Clipforge column */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-20 opacity-50 blur-2xl"
                style={{
                  background:
                    "radial-gradient(circle at 30% 20%, rgba(124,58,237,0.20), transparent 60%), radial-gradient(circle at 70% 40%, rgba(6,182,212,0.16), transparent 55%)",
                }}
              />
              <div className="relative">
                <div className="text-xs font-extrabold text-white/60">
                  {titleLeft.toUpperCase()}
                </div>

                {/* ✅ remove per-row borders, use subtle separators */}
                <div className="mt-4 overflow-hidden rounded-xl bg-black/20">
                  {ROWS.map((r, idx) => (
                    <div
                      key={r.label}
                      className={cx("px-4 py-3", idx !== 0 && "border-t border-white/10")}
                    >
                      <div className="text-sm font-extrabold text-white">
                        ✅ {r.leftTitle}
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-white/65">
                        {r.leftDesc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Manual column */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-xs font-extrabold text-white/60">MANUAL EDITING</div>

              {/* ✅ remove per-row borders, use subtle separators */}
              <div className="mt-4 overflow-hidden rounded-xl bg-black/20">
                {ROWS.map((r, idx) => (
                  <div
                    key={r.label}
                    className={cx("px-4 py-3", idx !== 0 && "border-t border-white/10")}
                  >
                    <div className="text-sm font-extrabold text-white">
                      ⛔ {r.rightTitle}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-white/65">
                      {r.rightDesc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
