"use client";

import React from "react";
import Link from "next/link";
import UploadsPage from "@/app/app/upload/page";
import ClipsPage from "@/app/app/clips/page";
import { BRAND } from "@/lib/brand";

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
                Upload one video. Orbito finds strong moments and gives you clips ready to post.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
              Status: <span className="text-white/85">Live</span>
            </div>
          </div>
        </section>

        <section className="mt-6 surface-soft relative overflow-hidden rounded-3xl p-5 md:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-45 blur-3xl"
            style={{
              background:
                "radial-gradient(260px 180px at 18% 28%, rgba(255,177,115,0.28), transparent 70%), radial-gradient(260px 180px at 78% 35%, rgba(255,102,36,0.24), transparent 72%), radial-gradient(260px 180px at 55% 92%, rgba(255,141,66,0.18), transparent 72%)",
            }}
          />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Monetize your output</div>
              <div className="mt-1 text-sm font-semibold text-white/90">Create clips in Orbito, then get paid with Whop</div>
              <div className="mt-1 text-sm text-white/65">
                Use your best-performing clips to join campaigns and open new revenue.
              </div>
            </div>
            <a
              href={BRAND.whopUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-whop text-[12px] px-4 py-2 w-full md:w-auto text-center"
            >
              Open <span className="whop-word">Whop</span> monetization
            </a>
          </div>
        </section>

        <section className="mt-6 surface-soft relative overflow-hidden rounded-3xl p-5 md:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-40 blur-3xl"
            style={{
              background:
                "radial-gradient(260px 180px at 20% 30%, rgba(255,178,90,0.24), transparent 70%), radial-gradient(240px 170px at 78% 38%, rgba(255,102,36,0.20), transparent 72%), radial-gradient(240px 170px at 54% 90%, rgba(58,134,255,0.14), transparent 72%)",
            }}
          />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Orbito Labs</div>
              <div className="mt-1 text-sm font-semibold text-white/90">AI generation workspace now linked to your Orbito account</div>
              <div className="mt-1 text-sm text-white/65">
                Use one login and shared connections while Labs tools migrate directly into Orbito.
              </div>
            </div>
            <Link href="/app/labs" className="btn-ghost text-[12px] px-4 py-2 w-full md:w-auto text-center">
              Open Orbito Labs
            </Link>
          </div>
        </section>

        {/* Upload + Clips merged */}
        <section className="mt-8">
          <div className="mb-4 text-xs text-white/55">• Upload + Clips</div>
          <div className="grid gap-8">
            <UploadsPage />
            <ClipsPage />
          </div>
        </section>

        <footer className="mt-10 border-t border-white/10 pt-6 text-xs text-white/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Orbito by Sakib LLC • Simple short-form clipping. All rights reserved.</span>
            <span className="text-white/40">Need help? support@orbito.cc</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
