// frontend/app/app/layout.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { displayNameFromUser } from "@/lib/user";
import { emitMeSync, subscribeMeSync } from "@/lib/me-sync";
import { labsLaunchPath } from "@/lib/labs-routes";
import { hasLabsFeatureAccess } from "@/lib/plans";
import { ThemeToggle } from "@/components/ThemeToggle";

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
  const tab = rest.split("/")[0] || "";
  if (tab === "studio") return "connections";
  return tab;
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

function marketingHomeUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.CANONICAL_URL ||
    "https://orbito.cc"
  ).trim();
}

type MarkProps = {
  size?: number;
  className?: string;
};

// Inline the real brand artwork here so the console navbar never depends on a flaky asset path.
function OrbitoMark({ size = 36, className }: MarkProps) {
  const id = React.useId().replace(/:/g, "");
  const ringId = `orbito-ring-${id}`;
  const planetId = `orbito-planet-${id}`;
  const clipTopId = `orbito-clip-top-${id}`;
  const clipBottomId = `orbito-clip-bottom-${id}`;
  const glowId = `orbito-glow-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="55%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id={planetId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4ef3e8" />
          <stop offset="50%" stopColor="#7b6cff" />
          <stop offset="100%" stopColor="#ff5fd2" />
        </linearGradient>
        <clipPath id={clipTopId} clipPathUnits="userSpaceOnUse">
          <rect x="0" y="0" width="512" height="256" />
        </clipPath>
        <clipPath id={clipBottomId} clipPathUnits="userSpaceOnUse">
          <rect x="0" y="256" width="512" height="256" />
        </clipPath>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform="rotate(-18 256 256)" clipPath={`url(#${clipTopId})`} opacity="0.55">
        <ellipse cx="256" cy="270" rx="210" ry="82" fill="none" stroke={`url(#${ringId})`} strokeWidth="40" strokeLinecap="round" />
      </g>

      <circle cx="256" cy="256" r="140" fill={`url(#${planetId})`} />

      <g transform="rotate(-18 256 256)" clipPath={`url(#${clipBottomId})`}>
        <ellipse
          cx="256"
          cy="270"
          rx="210"
          ry="82"
          fill="none"
          stroke={`url(#${ringId})`}
          strokeWidth="40"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
        />
      </g>
    </svg>
  );
}

function LabsProductMark({ size = 18, className }: MarkProps) {
  const id = React.useId().replace(/:/g, "");
  const ringId = `labs-ring-${id}`;
  const planetId = `labs-planet-${id}`;
  const clipTopId = `labs-clip-top-${id}`;
  const clipBottomId = `labs-clip-bottom-${id}`;
  const glowId = `labs-glow-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffb703" />
          <stop offset="52%" stopColor="#fb5607" />
          <stop offset="100%" stopColor="#3a86ff" />
        </linearGradient>
        <linearGradient id={planetId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd166" />
          <stop offset="48%" stopColor="#fb5607" />
          <stop offset="100%" stopColor="#3a86ff" />
        </linearGradient>
        <clipPath id={clipTopId} clipPathUnits="userSpaceOnUse">
          <rect x="0" y="0" width="512" height="256" />
        </clipPath>
        <clipPath id={clipBottomId} clipPathUnits="userSpaceOnUse">
          <rect x="0" y="256" width="512" height="256" />
        </clipPath>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform="rotate(-18 256 256)" clipPath={`url(#${clipTopId})`} opacity="0.55">
        <ellipse cx="256" cy="270" rx="210" ry="82" fill="none" stroke={`url(#${ringId})`} strokeWidth="40" strokeLinecap="round" />
      </g>

      <circle cx="256" cy="256" r="140" fill={`url(#${planetId})`} />

      <g transform="rotate(-18 256 256)" clipPath={`url(#${clipBottomId})`}>
        <ellipse
          cx="256"
          cy="270"
          rx="210"
          ry="82"
          fill="none"
          stroke={`url(#${ringId})`}
          strokeWidth="40"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
        />
      </g>
    </svg>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathnameRaw = usePathname();
  const pathname = normalizePath(pathnameRaw || "/");
  const [mobileOpen, setMobileOpen] = useState(false);

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
          router.replace("/login");
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
    router.push("/login");
    router.refresh();
  }

  const activeTab = useMemo(() => getAppTabFromPath(pathname), [pathname]);

  function isActive(href: string) {
    const h = normalizePath(String(href || "").split("?")[0] || "/");

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
          "rounded-full px-3 py-2 text-sm transition border outline-none",
          active
            ? "bg-white/[0.14] text-white border-white/25"
            : "border-transparent text-white/70 hover:text-white hover:bg-white/[0.06]",
          "focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-0",
          mobile && "w-full text-left"
        )}
      >
        {label}
      </Link>
    );
  }

  function aiLabButton(mobile = false) {
    const active = isActive("/app/labs");
    const labsHref = labsLaunchPath("generate");
    const locked = !!me && !hasLabsFeatureAccess(me.plan);
    const deniedTitle = "You don't have permission to open Orbito Generate. Upgrade to a Generate plan.";

    if (locked) {
      return (
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          title={deniedTitle}
          aria-label={deniedTitle}
          aria-disabled="true"
          className={cx(
            "btn-clipforge inline-flex items-center gap-2 whitespace-nowrap opacity-70 cursor-not-allowed",
            mobile ? "w-full justify-center px-3 py-2.5 text-sm" : "px-3 py-1.5 text-xs",
            active && "ring-1 ring-amber-300/45"
          )}
        >
          <LabsProductMark size={18} className="h-[18px] w-[18px] shrink-0" />
          <span>Generate 🔒</span>
        </button>
      );
    }

    return (
      <Link
        href={labsHref}
        onClick={() => mobile && setMobileOpen(false)}
        className={cx(
          "btn-clipforge inline-flex items-center gap-2 whitespace-nowrap",
          mobile ? "w-full justify-center px-3 py-2.5 text-sm" : "px-3 py-1.5 text-xs",
          active && "ring-1 ring-amber-300/45"
        )}
      >
        <LabsProductMark size={18} className="h-[18px] w-[18px] shrink-0" />
        <span>Generate</span>
      </Link>
    );
  }

  const planLabel = useMemo(() => displayPlanLabel(me?.plan), [me?.plan]);
  const displayName = useMemo(() => displayNameFromUser(me), [me]);

  return (
    <div
      className={cx(
        // IMPORTANT: no 100vh/100svh/min-h here -> prevents creating a competing scroll container
        "orbito-console relative bg-plain overflow-x-hidden",
        "[padding-left:env(safe-area-inset-left)] [padding-right:env(safe-area-inset-right)]"
      )}
    >
      {/* Background: fixed behind everything, never participates in height */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#02050d]" />
        <div
          className="absolute inset-[-16%]"
          style={{
            background:
              "radial-gradient(1260px 820px at 10% 12%, rgba(155,140,255,0.30), transparent 66%), radial-gradient(1120px 760px at 90% 12%, rgba(58,134,255,0.28), transparent 66%), radial-gradient(1080px 760px at 18% 84%, rgba(251,86,7,0.22), transparent 67%), radial-gradient(1040px 740px at 84% 82%, rgba(255,183,3,0.22), transparent 67%), radial-gradient(980px 680px at 52% 50%, rgba(70,215,255,0.18), transparent 70%)",
          }}
        />
        <div
          className="absolute inset-[-10%] opacity-[0.36] blur-3xl"
          style={{
            background:
              "radial-gradient(820px 380px at 50% 6%, rgba(255,255,255,0.10), transparent 66%), radial-gradient(920px 420px at 18% 44%, rgba(125,211,252,0.16), transparent 70%), radial-gradient(920px 420px at 82% 56%, rgba(167,139,250,0.14), transparent 70%)",
          }}
        />
        <div className="absolute inset-0 opacity-[0.34]">
          <div className="aurora" />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(1150px_700px_at_50%_8%,rgba(255,255,255,0.085),transparent_66%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.12),rgba(0,0,0,0.36))]" />
      </div>

      {/* Top bar */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur">
        <div
          className={cx(
            "mx-auto flex max-w-6xl items-center justify-between px-6 py-4",
            "[padding-top:calc(env(safe-area-inset-top)+1rem)] md:[padding-top:1rem]"
          )}
        >
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <a href={marketingHomeUrl()} className="group inline-flex items-center gap-3 min-w-0">
              <span className="relative inline-flex h-12 w-12 items-center justify-center">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(60px 60px at 50% 50%, rgba(167,139,250,0.35), transparent 70%), radial-gradient(70px 70px at 30% 60%, rgba(125,211,252,0.30), transparent 72%), radial-gradient(70px 70px at 70% 35%, rgba(45,212,191,0.22), transparent 70%)",
                    filter: "blur(10px)",
                  }}
                />
                <OrbitoMark size={36} className="h-9 w-9" />
              </span>

              {/* Bigger wordmark */}
              <span className="text-[18px] sm:text-[19px] font-semibold tracking-[-0.01em] text-white/95">
                Orbito
              </span>
            </a>

            <span className="text-xs text-white/40">/</span>
            <span className="text-xs text-white/60">App</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-2">
            {aiLabButton()}
            {navItem("/app", "Console")}
            {navItem("/app/clips", "Clips")}
            {navItem("/app/connections", "Connection")}
            {navItem("/app/billing", "Billing")}
            {navItem("/app/settings", "Settings")}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-3">
            <ThemeToggle compact className="hidden lg:inline-flex" />

            <div className="hidden lg:block text-right">
              <div className="text-xs text-white/60">{loading ? "Loading…" : me ? displayName : "Signed out"}</div>
              <div className="text-[11px] text-white/40">{loading ? "—" : me ? `Plan: ${planLabel}` : "—"}</div>
            </div>

            {/* Slightly bigger credits pill */}
            <div className="rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-2 text-[13px] text-white/85">
              <span className="text-white/60">Credits</span>{" "}
              <span className="font-semibold tabular-nums">
                {loading ? "—" : typeof me?.credits === "number" ? me.credits : "—"}
              </span>
            </div>

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden rounded-full border border-white/15 bg-white/[0.06] p-2 text-white/80 hover:bg-white/[0.10] active:scale-[0.99]"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? "✕" : "☰"}
            </button>

            <button
              onClick={logout}
              className="hidden lg:inline-flex rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] text-white/80 transition hover:bg-white/[0.10]"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-white/15 bg-[#04070fe8] shadow-[0_20px_55px_rgba(0,0,0,0.65)] backdrop-blur-xl">
            <div
              className={cx(
                "mx-auto max-w-6xl px-6 py-4 grid gap-2",
                "[padding-bottom:calc(env(safe-area-inset-bottom)+1rem)]"
              )}
            >
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Appearance</span>
                <ThemeToggle />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="text-xs text-white/60">{loading ? "Loading…" : me ? displayName : "Signed out"}</div>
                <div className="mt-1 text-[11px] text-white/40">{loading ? "—" : me ? `Plan: ${planLabel}` : "—"}</div>
              </div>

              {aiLabButton(true)}
              {navItem("/app", "Console", true)}
              {navItem("/app/clips", "Clips", true)}
              {navItem("/app/connections", "Connection", true)}
              {navItem("/app/billing", "Billing", true)}
              {navItem("/app/settings", "Settings", true)}

              <div className="mt-3 h-px bg-white/10" />

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

      {/* Page content (add safe-area bottom padding so body scroll feels right on iOS) */}
      <main className="relative mx-auto max-w-6xl px-6 py-8 sm:py-10 pb-[max(16px,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
