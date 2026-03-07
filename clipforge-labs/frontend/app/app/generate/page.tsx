// frontend/app/app/generate/page.tsx
import React, { Suspense } from "react";
import type { Metadata } from "next";
import GenerateClient from "./GenerateClient";

export const dynamic = "force-dynamic";
const GENERATOR_ICON_V = "cflabs-gen-1";

export const metadata: Metadata = {
  icons: {
    icon: [{ url: `/icon?v=${GENERATOR_ICON_V}`, type: "image/svg+xml" }],
    shortcut: [{ url: `/icon?v=${GENERATOR_ICON_V}`, type: "image/svg+xml" }],
  },
};

export default function GeneratePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-10 text-sm text-white/65">
          Loading generator…
        </div>
      }
    >
      <GenerateClient />
    </Suspense>
  );
}
