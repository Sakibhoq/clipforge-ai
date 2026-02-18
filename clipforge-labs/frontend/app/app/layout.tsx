// frontend/app/app/layout.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { displayNameFromUser } from "@/lib/user";
import { emitMeSync, subscribeMeSync } from "@/lib/me-sync";
import { BRAND } from "@/lib/brand";

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

  const planLabel = useMemo(() => me?.plan ?? "free", [me]);
  const displayName = useMemo(() => displayNameFromUser(me), [me]);

  // bump this when you want to force-refresh the mark (CDN/browser cache)
  const logoV = "cflabs-1";

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
        <div className="absolute inset-0 opacity-[0.55]">
          <div className="aurora" />
        </div>
        <div className="absolute -top-40 left-[-20%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,183,3,0.16),transparent_62%)] blur-3xl" />
        <div className="absolute top-24 right-[-18%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,rgba(58,134,255,0.14),transparent_64%)] blur-3xl" />
        <div className="absolute bottom-[-18%] left-[10%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(251,86,7,0.12),transparent_65%)] blur-3xl" />
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
            <Link href="/" className="group inline-flex items-center gap-3 min-w-0">
              <span className="relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(62px 62px at 42% 45%, rgba(255,183,3,0.30), transparent 70%), radial-gradient(74px 74px at 70% 42%, rgba(251,86,7,0.24), transparent 72%), radial-gradient(78px 78px at 62% 76%, rgba(58,134,255,0.20), transparent 72%)",
                    filter: "blur(10px)",
                  }}
                />
                <img
                  src={`/clipforge-labs-mark.svg?v=${logoV}`}
                  alt={`${BRAND.product} logo`}
                  width={22}
                  height={22}
                  style={{ display: "block" }}
                />
              </span>

              {/* Bigger wordmark */}
              <span className="inline-flex items-center gap-2 min-w-0">
                <span className="text-[18px] sm:text-[19px] font-semibold tracking-[-0.01em] text-white/95">
                  {BRAND.name}
                </span>
                <span className="shrink-0 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-white/70">
                  LABS
                </span>
              </span>
            </Link>

            <span className="text-xs text-white/40">/</span>
            <span className="text-xs text-white/60">Lab</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-2">
            {navItem("/app", "Console")}
            {navItem("/app/generate", "Generate")}
            {navItem("/app/clips", "Clips")}
            {navItem("/app/studio", "Studio")}
            {navItem("/app/settings", "Settings")}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-3">
            <div className="hidden md:block text-right">
              <div className="text-xs text-white/60">{loading ? "Loading…" : me ? displayName : "Signed out"}</div>
              <div className="text-[11px] text-white/40">{loading ? "—" : me ? `Plan: ${planLabel}` : "—"}</div>
            </div>

            {/* Slightly bigger credits pill */}
            <div className="rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-[13px] text-white/85">
              <span className="text-white/60">Credits</span>{" "}
              <span className="font-semibold tabular-nums">
                {loading ? "—" : typeof me?.credits === "number" ? me.credits : "—"}
              </span>
            </div>

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden rounded-xl border border-white/15 bg-white/[0.06] p-2 text-white/80 hover:bg-white/[0.10] active:scale-[0.99]"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? "✕" : "☰"}
            </button>

            <a
              href={BRAND.orbitoUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-orbito hidden md:inline-flex text-[12px]"
              title={`Go to ${BRAND.orbitoName}`}
            >
              {BRAND.orbitoName} <span aria-hidden="true">↗</span>
            </a>

            <button
              onClick={logout}
              className="hidden md:inline-flex rounded-xl border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] text-white/80 transition hover:bg-white/[0.10]"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-black/70 backdrop-blur">
            <div
              className={cx(
                "mx-auto max-w-6xl px-6 py-4 grid gap-2",
                "[padding-bottom:calc(env(safe-area-inset-bottom)+1rem)]"
              )}
            >
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="text-xs text-white/60">{loading ? "Loading…" : me ? displayName : "Signed out"}</div>
                <div className="mt-1 text-[11px] text-white/40">{loading ? "—" : me ? `Plan: ${planLabel}` : "—"}</div>
              </div>

              {navItem("/app", "Console", true)}
              {navItem("/app/generate", "Generate", true)}
              {navItem("/app/clips", "Clips", true)}
              {navItem("/app/studio", "Studio", true)}
              {navItem("/app/settings", "Settings", true)}

              <div className="mt-3 h-px bg-white/10" />

              <a
                href={BRAND.orbitoUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-orbito w-full text-left text-sm"
                title={`Go to ${BRAND.orbitoName}`}
              >
                Go to {BRAND.orbitoName} <span aria-hidden="true">↗</span>
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

      {/* Page content (add safe-area bottom padding so body scroll feels right on iOS) */}
      <main className="relative mx-auto max-w-6xl px-6 py-8 sm:py-10 pb-[max(16px,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
