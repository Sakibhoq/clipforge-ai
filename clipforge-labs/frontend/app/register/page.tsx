"use client";

import React, { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

function appBasePath() {
  const raw = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
  if (!raw) return "";
  return `/${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function withBasePath(pathname: string) {
  const base = appBasePath();
  if (!base) return pathname;
  if (pathname === "/") return base;
  if (pathname.startsWith(base)) return pathname;
  return `${base}${pathname}`;
}

function sanitizeNextPath(nextRaw: string | null) {
  const fallback = "/app";
  const raw = (nextRaw || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;

  let nextPath = raw;
  const base = appBasePath();
  if (base) {
    while (nextPath === base || nextPath.startsWith(`${base}/`)) {
      nextPath = nextPath.slice(base.length) || "/";
    }
  }

  if (nextPath === "/") return fallback;
  if (nextPath.startsWith("/login") || nextPath.startsWith("/register")) return fallback;
  return nextPath;
}

function orbitoOrigin() {
  return (process.env.NEXT_PUBLIC_ORBITO_APP_ORIGIN || "https://app.orbito.cc").replace(/\/+$/, "");
}

function orbitoRegisterUrl(nextPath: string) {
  const url = new URL("/register", orbitoOrigin());
  url.searchParams.set("next", withBasePath(nextPath));
  url.searchParams.set("source", "orbito-labs");
  return url.toString();
}

function RegisterRedirectInner() {
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams?.get("next")),
    [searchParams]
  );

  useEffect(() => {
    window.location.replace(orbitoRegisterUrl(nextPath));
  }, [nextPath]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-plain">
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
        <div className="surface w-full max-w-xl p-8 text-center">
          <div className="text-sm text-white/75">Redirecting to Orbito sign up...</div>
        </div>
      </main>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-white/60">Loading…</div>}>
      <RegisterRedirectInner />
    </Suspense>
  );
}
