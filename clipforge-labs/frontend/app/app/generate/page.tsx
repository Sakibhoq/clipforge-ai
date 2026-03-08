// frontend/app/app/generate/page.tsx
import React, { Suspense } from "react";
import type { Metadata } from "next";
import GenerateClient from "./GenerateClient";

export const dynamic = "force-dynamic";
const GENERATOR_ICON_V = "cflabs-gen-2";
const RAW_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || process.env.NEXT_BASE_PATH || "").trim();
const BASE_PATH = RAW_BASE_PATH ? `/${RAW_BASE_PATH.replace(/^\/+/, "").replace(/\/+$/, "")}` : "";
const GENERATOR_ICON_URL = `${BASE_PATH}/app/generate/icon?v=${GENERATOR_ICON_V}`;

export const metadata: Metadata = {
  icons: {
    icon: [{ url: GENERATOR_ICON_URL, type: "image/svg+xml" }],
    shortcut: [{ url: GENERATOR_ICON_URL, type: "image/svg+xml" }],
    apple: [{ url: GENERATOR_ICON_URL, type: "image/svg+xml" }],
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
