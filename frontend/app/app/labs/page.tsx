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

type LabsLaunchResponse = {
  launch_url: string;
  mode: string;
  ttl_seconds: number;
  expires_at_utc: string;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function LabsPage() {
  const [status, setStatus] = useState<LabsStatusResponse | null>(null);
  const [launch, setLaunch] = useState<LabsLaunchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadStatus = async () => {
      try {
        const statusData = await apiFetch<LabsStatusResponse>("/labs/status", { method: "GET" });
        if (!mounted) return;
        setStatus(statusData);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.detail || "Could not load Orbito Labs status.");
      }
    };

    const loadLaunch = async () => {
      try {
        const launchData = await apiFetch<LabsLaunchResponse>("/labs/launch", { method: "GET" });
        if (!mounted) return;
        setLaunch(launchData);
        setLaunchError(null);
      } catch (err: any) {
        if (!mounted) return;
        if (err?.status === 404) {
          setLaunchError("Bridge launch endpoint is not available in this deployment.");
        } else {
          setLaunchError("Bridge launch URL is temporarily unavailable.");
        }
      }
    };

    Promise.all([loadStatus(), loadLaunch()]).finally(() => {
      if (!mounted) return;
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const providers = useMemo(() => status?.connected_providers || [], [status?.connected_providers]);
  const canLaunch = !!(launch?.launch_url || status?.labs_frontend_url);
  const launchHref = launch?.launch_url || status?.labs_frontend_url || "#";

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
                Labs is now an extra feature inside Orbito: one account, one publish stack, separate editors by source, and separate credits unless you move to full access.
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
                  Shared connections: <span className="text-white/85">{status.unified_connections ? "Enabled" : "Off"}</span>
                </div>
                <div>
                  Plan: <span className="text-white/85">{status.user_plan}</span> • Credits:{" "}
                  <span className="text-white/85 tabular-nums">{status.user_credits}</span>
                </div>
                <div>API URL: <span className="text-white/85">{status.labs_api_url}</span></div>
              </div>
            )}
          </div>

          <div className="surface-soft rounded-2xl p-5">
            <div className="text-xs text-white/50">Connected providers</div>
            <div className="mt-2 text-sm text-white/85">{loading ? "…" : `${status?.connected_accounts || 0} provider(s)`}</div>
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
            Open Labs for AI-generated clips. Use Orbito Publish for connections and scheduling across both products.
          </div>
          {launch?.mode ? <div className="mt-2 text-xs text-white/50">Bridge mode: {launch.mode}</div> : null}
          {launchError ? <div className="mt-2 text-xs text-rose-200/85">{launchError}</div> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={launchHref}
              target="_blank"
              rel="noreferrer"
              className={cx("btn-clipforge text-xs", !canLaunch && "pointer-events-none opacity-60")}
            >
              Open Orbito Labs
            </a>
            <Link href="/app/clips?source=orbito" className="btn-ghost text-xs">
              Open Orbito Clips
            </Link>
            <Link href="/app/clips?source=labs" className="btn-ghost text-xs">
              Open Labs Clips
            </Link>
            <Link href="/app/studio" className="btn-ghost text-xs">
              Open Publish Connections
            </Link>
            <Link href="/app" className="btn-ghost text-xs">
              Back to Overview
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
