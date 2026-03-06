"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type LabsStatusResponse = {
  phase: string;
  mode: string;
  labs_frontend_url: string;
  labs_api_url: string;
  unified_auth: boolean;
  unified_connections: boolean;
  connected_providers: string[];
  connected_accounts: number;
  user_plan: string;
  user_credits: number;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function LabsPage() {
  const [status, setStatus] = useState<LabsStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiFetch<LabsStatusResponse>("/labs/status", { method: "GET" })
      .then((data) => {
        if (!mounted) return;
        setStatus(data);
        setError(null);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setError(e?.detail || "Could not load Orbito Labs status.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const providers = useMemo(() => status?.connected_providers || [], [status?.connected_providers]);
  const canLaunch = !!status?.labs_frontend_url;
  const launchHref = status?.labs_frontend_url || "#";

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]">
      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-12">
        <section className="surface relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-12 opacity-40 blur-3xl"
            style={{
              background:
                "radial-gradient(280px 180px at 16% 28%, rgba(255,178,90,0.24), transparent 70%), radial-gradient(260px 180px at 78% 35%, rgba(255,102,36,0.20), transparent 72%), radial-gradient(260px 180px at 55% 92%, rgba(58,134,255,0.14), transparent 72%)",
            }}
          />

          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs text-white/55">• Orbito Labs migration</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white/90">
                Orbito <span className="grad-text">Labs</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                Phase 1 is live: unified account + shared social connections. Labs is now accessible from inside your
                Orbito app while we complete native in-app migration.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
              Mode: <span className="text-white/85">{loading ? "…" : status?.mode || "unknown"}</span>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="surface-soft rounded-2xl p-5">
            <div className="text-xs text-white/50">Status</div>
            <div className="mt-2 text-sm text-white/80">
              {loading ? "Loading…" : error ? <span className="text-rose-300/85">{error}</span> : "Connected"}
            </div>
            {!loading && !error && status && (
              <div className="mt-3 space-y-2 text-xs text-white/65">
                <div>
                  Phase: <span className="text-white/85">{status.phase}</span>
                </div>
                <div>
                  Unified auth: <span className="text-white/85">{status.unified_auth ? "Enabled" : "Off"}</span>
                </div>
                <div>
                  Shared connections:{" "}
                  <span className="text-white/85">{status.unified_connections ? "Enabled" : "Off"}</span>
                </div>
                <div>
                  Plan: <span className="text-white/85">{status.user_plan}</span> • Credits:{" "}
                  <span className="text-white/85 tabular-nums">{status.user_credits}</span>
                </div>
              </div>
            )}
          </div>

          <div className="surface-soft rounded-2xl p-5">
            <div className="text-xs text-white/50">Connected providers</div>
            <div className="mt-2 text-sm text-white/85">
              {loading ? "…" : `${status?.connected_accounts || 0} provider(s)`}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {providers.length > 0 ? (
                providers.map((p) => (
                  <span
                    key={p}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-wide text-white/70"
                  >
                    {p}
                  </span>
                ))
              ) : (
                <span className="text-xs text-white/55">No connected channels yet.</span>
              )}
            </div>
            <div className="mt-4">
              <Link href="/app/studio" className="btn-ghost text-xs">
                Manage connections
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 surface-soft rounded-2xl p-5">
          <div className="text-xs text-white/50">Workspace</div>
          <div className="mt-2 text-sm text-white/70">
            Launch the existing Labs workspace while native `/app/labs` tools are being merged into Orbito.
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={launchHref}
              target="_blank"
              rel="noreferrer"
              className={cx("btn-whop text-xs", !canLaunch && "pointer-events-none opacity-60")}
            >
              Open Orbito Labs
            </a>
            <Link href="/app" className="btn-ghost text-xs">
              Back to Overview
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
