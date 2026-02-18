// frontend/app/app/generate/page.tsx
import React, { Suspense } from "react";
import GenerateClient from "./GenerateClient";

export const dynamic = "force-dynamic";

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

