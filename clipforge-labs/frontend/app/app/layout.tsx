// frontend/app/app/layout.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { displayNameFromUser } from "@/lib/user";
import { emitMeSync, subscribeMeSync } from "@/lib/me-sync";
import { BRAND } from "@/lib/brand";
import { hasLabsFeatureAccess } from "@/lib/plans";

type MeResponse = {
  name?: string | null;
  email: string;
  plan: string;
  credits: number;
};

function normalizePath(p: string) {
  if (!p) return "/";
  if (p === "/") return "/";
  return p.replace(/\/+$/, "");
}

/**
 * /app tab resolver
 *  - /app            -> ""
 *  - /app/billing    -> "billing"
 *  - /app/clips/123  -> "clips"
 */
function getAppTabFromPath(pathname: string) {
  const p = normalizePath(pathname);

  if (p === "/app") return "";
  if (!p.startsWith("/app/")) return null;

  const rest = p.slice("/app/".length);
  return rest.split("/")[0] || "";
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function displayPlanLabel(rawPlan: string | null | undefined): string {
  const token = String(rawPlan || "free")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!token || token === "free" || token === "free_trial" || token === "trial" || token === "trialing") {
    return "free";
  }
  if (token === "labs_spark" || token === "labs_starter") return "labs starter";
  if (token === "labs_velocity" || token === "labs_creator") return "labs creator";
  if (token.startsWith("starter")) return "starter";
  if (token.startsWith("creator") || token.startsWith("pro")) return "creator";
  if (token.startsWith("studio")) return "studio";
  return token.replace(/_/g, " ");
}

const externalNavPillClass =
  "rounded-xl px-3 py-2 text-sm transition border outline-none border-transparent text-white/70 hover:text-white hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-0";

function withBasePath(path: string) {
  const raw = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
  if (!raw) return path.startsWith("/") ? path : `/${path}`;
  const base = `/${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}

function orbitoOrigin() {
  return (process.env.NEXT_PUBLIC_ORBITO_APP_ORIGIN || "https://app.orbito.cc").replace(/\/+$/, "");
}

function orbitoLoginUrl(nextPath: string) {
  const url = new URL("/login", orbitoOrigin());
  url.searchParams.set("next", withBasePath(nextPath || "/app"));
  url.searchParams.set("source", "orbito-labs");
  return url.toString();
}

function orbitoLandingUrl() {
  return BRAND.orbitoUrl;
}

function orbitoLabsBillingUrl() {
  const url = new URL("/app/billing", orbitoOrigin());
  url.searchParams.set("intent", "labs");
  url.searchParams.set("source", "labs-lock");
  return url.toString();
}

function LabsMark({ size = 34 }: { size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <span
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          width: size * 0.98,
          height: size * 0.48,
          border: "1.7px solid rgba(255, 183, 3, 0.78)",
          boxShadow: "0 0 14px rgba(251, 86, 7, 0.22)",
          transform: "rotate(-18deg) scaleX(1.18)",
        }}
      />
      <span
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          width: size * 0.58,
          height: size * 0.58,
          background: "linear-gradient(145deg, #ffd166 0%, #fb5607 52%, #3a86ff 100%)",
          boxShadow: "0 0 16px rgba(251, 86, 7, 0.24)",
        }}
      />
    </span>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathnameRaw = usePathname();
  const pathname = normalizePath(pathnameRaw || "/");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isEditorEmbed, setIsEditorEmbed] = useState(false);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Cookie-auth: load once on mount (do NOT re-run on every path change)
  useEffect(() => {
    let mounted = true;

    async function loadMe() {
      setLoading(true);
      try {
        const data = await apiFetch<MeResponse>("/auth/me", { method: "GET" });
        if (!mounted) return;
        setMe(data);
        emitMeSync(data);
      } catch (err: any) {
        if (!mounted) return;
        setMe(null);
        emitMeSync(null);
        if (err?.status === 401) {
          window.location.replace(orbitoLoginUrl(pathname || "/app"));
        }
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadMe();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return subscribeMeSync((payload) => {
      setMe(payload);
      setLoading(false);
    });
  }, []);

  // Mobile polish: only handle Esc close.
  // Avoid body/html scroll-lock tricks on mobile Safari/Chrome; they can freeze the page.
  useEffect(() => {
    if (!mobileOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setMobileOpen(false);
    setMe(null);
    emitMeSync(null);
    setLoading(false);
    window.location.assign(orbitoLoginUrl("/app"));
  }

  const activeTab = useMemo(() => getAppTabFromPath(pathname), [pathname]);

  function isActive(href: string) {
    const h = normalizePath(href);

    if (h === "/app") return activeTab === "";
    if (h.startsWith("/app/")) {
      const tab = h.slice("/app/".length).split("/")[0] || "";
      return activeTab === tab;
    }
    return false;
  }

  function navItem(href: string, label: string, mobile = false) {
    const active = isActive(href);

    return (
      <Link
        href={href}
        onClick={() => mobile && setMobileOpen(false)}
        className={cx(
          "rounded-xl px-3 py-2 text-sm font-medium transition border outline-none",
          active
            ? "bg-white/[0.10] text-white border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset]"
            : "border-transparent text-white/65 hover:text-white hover:bg-white/[0.05]",
          "focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-0",
          mobile && "w-full text-left"
        )}
      >
        {label}
      </Link>
    );
  }

  const planLabel = useMemo(() => displayPlanLabel(me?.plan), [me?.plan]);
  const displayName = useMemo(() => displayNameFromUser(me), [me]);
  const labsPlanAccess = useMemo(() => hasLabsFeatureAccess(me?.plan), [me?.plan]);

  useEffect(() => {
    if (!pathname.startsWith("/app/editor")) {
      setIsEditorEmbed(false);
      return;
    }
    try {
      const qp = new URLSearchParams(window.location.search);
      setIsEditorEmbed(qp.get("embed") === "1");
    } catch {
      setIsEditorEmbed(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (loading) return;
    if (!me) return;
    if (labsPlanAccess) return;
    window.location.replace(orbitoLabsBillingUrl());
  }, [labsPlanAccess, loading, me]);

  return (
    <div
      className={cx(
        // IMPORTANT: no 100vh/100svh/min-h here -> prevents creating a competing scroll container
        "relative bg-plain overflow-x-hidden",
        "[padding-left:env(safe-area-inset-left)] [padding-right:env(safe-area-inset-right)]"
      )}
    >
      {/* Background: fixed behind everything, never participates in height */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#03060f]" />
        <div
          className="absolute inset-[-14%] opacity-[0.95]"
          style={{
            background:
              "radial-gradient(1120px 760px at 10% 12%, rgba(255,183,3,0.20), transparent 66%), radial-gradient(980px 700px at 90% 12%, rgba(58,134,255,0.18), transparent 66%), radial-gradient(980px 720px at 16% 82%, rgba(251,86,7,0.17), transparent 67%), radial-gradient(900px 680px at 84% 82%, rgba(155,140,255,0.18), transparent 67%), radial-gradient(860px 620px at 52% 48%, rgba(70,215,255,0.12), transparent 70%)",
          }}
        />
        <div className="absolute inset-0 opacity-[0.24]">
          <div className="aurora" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.18),rgba(0,0,0,0.52))]" />
      </div>

      {/* Top bar */}
      {!isEditorEmbed ? (
      <div className="sticky top-0 z-50 border-b border-white/10 bg-black/65 backdrop-blur-xl">
        <div
          className={cx(
            "mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4",
            "[padding-top:calc(env(safe-area-inset-top)+0.75rem)] md:[padding-top:1rem]"
          )}
        >
          {/* Brand */}
          <div className="flex min-w-0 items-center gap-1.5">
            <a href={orbitoLandingUrl()} className="group inline-flex min-w-0 items-center gap-1.5">
              <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-5 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(62px 62px at 42% 45%, rgba(255,183,3,0.30), transparent 70%), radial-gradient(74px 74px at 70% 42%, rgba(251,86,7,0.24), transparent 72%), radial-gradient(78px 78px at 62% 76%, rgba(58,134,255,0.20), transparent 72%)",
                    filter: "blur(10px)",
                  }}
                />
                <LabsMark size={34} />
              </span>

              {/* Bigger wordmark */}
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="bg-[linear-gradient(90deg,#ffb703_0%,#fb5607_48%,#3a86ff_100%)] bg-clip-text text-[16px] font-semibold leading-none tracking-[-0.01em] text-transparent sm:text-[19px]">
                  {BRAND.name}
                </span>
                <span className="hidden shrink-0 rounded-full border border-[#fb56076e] bg-[linear-gradient(90deg,rgba(255,183,3,0.14),rgba(251,86,7,0.18),rgba(58,134,255,0.14))] px-2 py-0.5 text-[11px] font-semibold leading-none tracking-[0.08em] text-[#ffd9b5] sm:inline-flex">
                  LABS
                </span>
              </span>
            </a>

          </div>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-2">
            {navItem("/app/generate", "Generator")}
            {navItem("/app/clips", "Clips")}
            {navItem("/app/editor", "Editor")}
            <a href="/app/studio" className={externalNavPillClass}>
              Connections
            </a>
            {navItem("/app/settings", "Settings")}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden lg:block text-right">
              <div className="text-xs text-white/60">{loading ? "Loading…" : me ? displayName : "Signed out"}</div>
              <div className="text-[11px] text-white/40">{loading ? "—" : me ? `Plan: ${planLabel}` : "—"}</div>
            </div>

            {/* Slightly bigger credits pill */}
            <div className="rounded-xl border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white/85 sm:px-3.5 sm:py-2 sm:text-[13px]">
              <span className="text-white/60 sm:hidden">Cr</span>
              <span className="hidden text-white/60 sm:inline">Credits</span>{" "}
              <span className="font-semibold tabular-nums">
                {loading ? "—" : typeof me?.credits === "number" ? me.credits : "—"}
              </span>
            </div>

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden rounded-xl border border-white/15 bg-white/[0.06] p-2 text-white/80 hover:bg-white/[0.10] active:scale-[0.99]"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? "✕" : "☰"}
            </button>

            <a
              href={orbitoLandingUrl()}
              className="btn-orbito hidden lg:inline-flex text-[12px]"
              title={`Go to ${BRAND.orbitoName}`}
            >
              {BRAND.orbitoName}
            </a>

            <button
              onClick={logout}
              className="hidden lg:inline-flex rounded-xl border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] text-white/80 transition hover:bg-white/[0.10]"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-white/15 bg-[#01030aee] shadow-[0_20px_55px_rgba(0,0,0,0.75)] backdrop-blur-xl">
            <div
              className={cx(
                "mx-auto grid max-w-6xl gap-2 px-4 py-4",
                "[padding-bottom:calc(env(safe-area-inset-bottom)+1rem)]"
              )}
            >
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="text-xs text-white/60">{loading ? "Loading…" : me ? displayName : "Signed out"}</div>
                <div className="mt-1 text-[11px] text-white/40">{loading ? "—" : me ? `Plan: ${planLabel}` : "—"}</div>
              </div>

              {navItem("/app/generate", "Generator", true)}
              {navItem("/app/clips", "Clips", true)}
              {navItem("/app/editor", "Editor", true)}
              <a href="/app/studio" className={cx(externalNavPillClass, "w-full text-left")}>
                Connections
              </a>
              {navItem("/app/settings", "Settings", true)}

              <div className="mt-3 h-px bg-white/10" />

              <a
                href={orbitoLandingUrl()}
                className="btn-orbito w-full text-left text-sm"
                title={`Go to ${BRAND.orbitoName}`}
              >
                Go to {BRAND.orbitoName}
              </a>

              <button
                onClick={logout}
                className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-left text-sm text-white/80 hover:bg-white/[0.10]"
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </div>
      ) : null}

      {/* Page content (add safe-area bottom padding so body scroll feels right on iOS) */}
      <main
        className={cx(
          "relative",
          isEditorEmbed
            ? "mx-auto max-w-none px-0 py-0 pb-0"
            : "mx-auto max-w-6xl px-4 py-8 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6 sm:py-10"
        )}
      >
        {children}
      </main>
    </div>
  );
}
