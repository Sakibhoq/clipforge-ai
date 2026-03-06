// frontend/app/app/upload/page.tsx
"use client";

import React from "react";
import Link from "next/link";

export default function UploadPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="surface relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-80">
          <div className="aurora" />
        </div>

        <div className="relative">
          <div className="text-xs text-white/55">• Uploads</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
            Orbito Labs is prompt-first.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
            Orbito Labs focuses on AI video generation. If you want to clip existing long videos into shorts, use our
            clipping app instead.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/app" className="btn-aurora">
              Go to Generator
            </Link>
            <Link href="/app/clips" className="btn-ghost">
              View My Clips
            </Link>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="text-sm font-semibold text-white/90">What you can do here</div>
            <div className="mt-2 grid gap-2 text-sm text-white/65 sm:grid-cols-2">
              <div>1. Generate short videos from a prompt</div>
              <div>2. Pick aspect ratio and duration</div>
              <div>3. Download MP4 outputs</div>
              <div>4. Publish to connected channels in Connections</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
