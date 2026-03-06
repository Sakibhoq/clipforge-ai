"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type LabsLaunchResponse = {
  launch_url?: string;
};

export default function LabsPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function launchLabs() {
      try {
        const data = await apiFetch<LabsLaunchResponse>("/labs/launch", { method: "GET" });
        const url = String(data?.launch_url || "").trim();
        if (!url) throw new Error("Labs launch URL unavailable.");
        window.location.replace(url);
      } catch (err: any) {
        if (!mounted) return;
        setError(String(err?.detail || err?.message || "Could not open Orbito Labs right now."));
      }
    }

    launchLabs();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="surface-soft rounded-2xl p-6 text-sm text-white/75">
        <div className="text-xs text-white/55">Opening Orbito Labs…</div>
        <div className="mt-2 text-base font-semibold text-white/90">Redirecting to your Labs workspace</div>
        {error ? <div className="mt-3 text-xs text-rose-200/90">{error}</div> : null}
        <div className="mt-4">
          <a href="/app/labs/app" className="btn-clipforge inline-flex px-4 py-2 text-xs">
            Open Labs now
          </a>
        </div>
      </div>
    </main>
  );
}
