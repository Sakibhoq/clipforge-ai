"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type LabsLaunchResponse = {
  launch_url?: string;
};

type LabsLaunchTarget = "app" | "generate" | "clips";

const TARGET_META: Record<LabsLaunchTarget, { title: string; fallbackHref: string }> = {
  app: { title: "Orbito Labs", fallbackHref: "/app/labs/app" },
  generate: { title: "Labs Generator", fallbackHref: "/app/labs/app/generate" },
  clips: { title: "Labs Clips", fallbackHref: "/app/labs/app/clips" },
};

export default function LabsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-6 py-16">
          <div className="surface-soft rounded-2xl p-6 text-sm text-white/75">Opening Orbito Labs…</div>
        </main>
      }
    >
      <LabsPageInner />
    </Suspense>
  );
}

function LabsPageInner() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const target = useMemo<LabsLaunchTarget>(() => {
    const raw = String(searchParams?.get("target") || "app").trim().toLowerCase();
    if (raw === "generate") return "generate";
    if (raw === "clips") return "clips";
    return "app";
  }, [searchParams]);

  const targetMeta = TARGET_META[target];

  useEffect(() => {
    let mounted = true;

    async function launchLabs() {
      try {
        const data = await apiFetch<LabsLaunchResponse>(`/labs/launch?target=${encodeURIComponent(target)}`, {
          method: "GET",
        });
        const url = String(data?.launch_url || "").trim();
        if (!url) throw new Error("Labs launch URL unavailable.");
        window.location.replace(url);
      } catch (err: any) {
        if (!mounted) return;
        const detail = String(err?.detail || err?.message || "Could not open Orbito Labs right now.");
        setError(detail);
        setLocked(detail.toLowerCase().includes("labs plan required"));
      }
    }

    launchLabs();
    return () => {
      mounted = false;
    };
  }, [target]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="surface-soft rounded-2xl p-6 text-sm text-white/75">
        <div className="text-xs text-white/55">Opening Orbito Labs…</div>
        <div className="mt-2 text-base font-semibold text-white/90">Redirecting to {targetMeta.title}</div>
        {error ? <div className="mt-3 text-xs text-rose-200/90">{error}</div> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={targetMeta.fallbackHref} className="btn-clipforge inline-flex px-4 py-2 text-xs">
            Open {targetMeta.title}
          </a>
          {locked ? (
            <Link href="/app/billing" className="btn-ghost inline-flex px-4 py-2 text-xs">
              Unlock with Labs plan
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
