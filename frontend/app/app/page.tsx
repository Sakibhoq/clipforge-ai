"use client";

import React, { Suspense } from "react";
import { UploadWorkspace } from "@/app/app/upload/page";
import { ClipsWorkspace } from "@/app/app/clips/page";

export default function OverviewPage() {
  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-12">
        {/* Welcome */}
        <section className="surface relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-45 blur-3xl"
            style={{
              background:
                "radial-gradient(260px 180px at 18% 28%, rgba(167,139,250,0.22), transparent 70%), radial-gradient(260px 180px at 78% 35%, rgba(125,211,252,0.18), transparent 72%), radial-gradient(260px 180px at 55% 92%, rgba(45,212,191,0.14), transparent 72%)",
            }}
          />
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Overview</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/90">
                Welcome to <span className="grad-text">Orbito</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                Upload once. Orbito finds the best moments, reframes for shorts, and delivers clips
                that look like a pro editor cut them.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
              Launch status: <span className="text-white/85">In progress</span>
            </div>
          </div>
        </section>

        {/* Clipforge Labs highlight */}
        <section className="mt-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(120deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-[1px]">
            <div
              aria-hidden="true"
              className="absolute -inset-8 opacity-70 blur-2xl"
              style={{
                background:
                  "conic-gradient(from 140deg, rgba(45,212,191,0.24), rgba(125,211,252,0.24), rgba(167,139,250,0.22), rgba(45,212,191,0.24))",
              }}
            />
            <div className="relative rounded-[22px] bg-black/70 p-6 md:p-7">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs text-white/55">• Clipforge Labs</div>
                  <div className="mt-2 text-xl font-semibold text-white/90">
                    AI video + AI music generation is coming soon.
                  </div>
                  <div className="mt-2 text-sm text-white/65">
                    We’re launching it at clipforge.us. Orbito stays focused on premium clipping while
                    Labs builds the next frontier.
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/75">
                  Preview card added
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Upload + Clips merged */}
        <section className="mt-8">
          <div className="mb-4 text-xs text-white/55">• Upload + Clips</div>
          <div className="grid gap-8">
            <UploadWorkspace />
            <Suspense fallback={<div className="text-sm text-white/60">Loading clips…</div>}>
              <ClipsWorkspace />
            </Suspense>
          </div>
        </section>
      </main>
    </div>
  );
}
