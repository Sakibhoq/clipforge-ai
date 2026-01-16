"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function LogoMark({
  size = 28,
  speed = "nav",
}: {
  size?: number;
  speed?: "nav" | "hero";
}) {
  const root = speed === "hero" ? "cfm-hero" : "cfm-nav";

  return (
    <span
      className={root}
      aria-hidden="true"
      style={{ width: size, height: size, display: "inline-flex" }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <defs>
          <linearGradient
            id={`${root}-grad`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="50%" stopColor="#7DD3FC" />
            <stop offset="100%" stopColor="#2DD4BF" />
          </linearGradient>
        </defs>

        {/* Spine */}
        <g className={`${root}__spine`}>
          <rect
            x="18"
            y="10"
            width="10"
            height="44"
            rx="5"
            fill={`url(#${root}-grad)`}
          />
        </g>

        {/* Top arm */}
        <g className={`${root}__top`}>
          <rect
            x="26"
            y="10"
            width="30"
            height="10"
            rx="5"
            fill={`url(#${root}-grad)`}
          />
        </g>

        {/* Mid arm */}
        <g className={`${root}__mid`}>
          <rect
            x="26"
            y="28"
            width="22"
            height="10"
            rx="5"
            fill={`url(#${root}-grad)`}
          />
        </g>
      </svg>
    </span>
  );
}

function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-3">
      <span className="relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        {/* aurora halo */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(60px 60px at 50% 50%, rgba(167,139,250,0.35), transparent 70%), radial-gradient(70px 70px at 30% 60%, rgba(125,211,252,0.30), transparent 72%), radial-gradient(70px 70px at 70% 35%, rgba(45,212,191,0.22), transparent 70%)",
            filter: "blur(10px)",
          }}
        />

        <LogoMark size={28} speed="nav" />
      </span>

      {/* Wordmark */}
      <span className="relative">
        <span className="text-sm font-semibold tracking-tight text-white/90">
          Clipforge
        </span>

        {/* soft aurora sheen */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.55] blur-[10px] transition-opacity duration-300 group-hover:opacity-[0.85]"
          style={{
            background:
              "linear-gradient(90deg, rgba(167,139,250,0.65), rgba(125,211,252,0.55), rgba(45,212,191,0.45))",
          }}
        />
      </span>

      {/* animation styles (reliable, outside SVG) */}
      <style jsx>{`
        .cfm-nav__spine,
        .cfm-nav__top,
        .cfm-nav__mid {
          transform-box: fill-box;
          opacity: 0;
        }

        .cfm-nav__spine {
          transform-origin: center;
          transform: scaleY(0.2);
          animation: cfmNavSpine 700ms cubic-bezier(0.22, 1, 0.36, 1)
            forwards;
        }
        .cfm-nav__top,
        .cfm-nav__mid {
          transform-origin: left center;
          transform: scaleX(0.2);
          animation: cfmNavArm 650ms cubic-bezier(0.22, 1, 0.36, 1)
            forwards;
        }

        .cfm-nav__top {
          animation-delay: 160ms;
        }
        .cfm-nav__mid {
          animation-delay: 320ms;
        }

        @keyframes cfmNavSpine {
          to {
            opacity: 1;
            transform: scaleY(1);
          }
        }
        @keyframes cfmNavArm {
          to {
            opacity: 1;
            transform: scaleX(1);
          }
        }
      `}</style>
    </Link>
  );
}

function NavLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const active = useMemo(() => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname?.startsWith(`${href}/`);
  }, [pathname, href]);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        "group relative -mx-1.5 inline-flex items-center rounded-full px-3 py-1.5 text-xs transition-colors",
        active ? "text-white" : "text-white/70 hover:text-white",
      ].join(" ")}
    >
      {/* pill hover/active surface */}
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-200",
          active ? "opacity-100" : "group-hover:opacity-100",
        ].join(" ")}
        style={{
          background:
            "linear-gradient(90deg, rgba(167,139,250,0.10), rgba(125,211,252,0.09), rgba(45,212,191,0.08))",
          boxShadow: active
            ? "0 0 0 1px rgba(255,255,255,0.10) inset"
            : "0 0 0 1px rgba(255,255,255,0.08) inset",
        }}
      />

      {/* label */}
      <span className="relative z-[1]">{children}</span>

      {/* underline */}
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute -bottom-1 left-2 right-2 h-px origin-left scale-x-0 transition-transform duration-300",
          active ? "scale-x-100" : "group-hover:scale-x-100",
        ].join(" ")}
        style={{
          background:
            "linear-gradient(90deg, rgba(167,139,250,0.9), rgba(125,211,252,0.9), rgba(45,212,191,0.9))",
        }}
      />

      {/* glow */}
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-x-2 -bottom-3 h-3 opacity-0 blur-lg transition-opacity duration-300",
          active ? "opacity-80" : "group-hover:opacity-75",
        ].join(" ")}
        style={{
          background:
            "linear-gradient(90deg, rgba(167,139,250,0.45), rgba(125,211,252,0.45), rgba(45,212,191,0.45))",
        }}
      />
    </Link>
  );
}

function IconButton({
  href,
  label,
  title,
  children,
  onNavigate,
}: {
  href: string;
  label: string;
  title: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:text-white active:scale-[0.98]"
      aria-label={label}
      title={title}
    >
      {/* hover glow */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-2 opacity-0 blur-md transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(16px 16px at 50% 50%, rgba(167,139,250,0.28), transparent 70%), radial-gradient(18px 18px at 30% 60%, rgba(125,211,252,0.22), transparent 72%), radial-gradient(18px 18px at 70% 35%, rgba(45,212,191,0.18), transparent 70%)",
        }}
      />
      <span className="relative">{children}</span>
    </Link>
  );
}

function CreditsPill({
  credits,
  loading,
}: {
  credits: number | null;
  loading: boolean;
}) {
  return (
    <div className="group relative hidden md:inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/75">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-emerald-300/70"
      />
      <span className="text-white/55">Credits</span>
      <span className="font-semibold text-white/85 tabular-nums">
        {loading ? "…" : credits ?? "—"}
      </span>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-2 opacity-0 blur-md transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(18px 18px at 35% 55%, rgba(167,139,250,0.22), transparent 70%), radial-gradient(20px 20px at 60% 45%, rgba(125,211,252,0.18), transparent 72%), radial-gradient(22px 22px at 75% 55%, rgba(45,212,191,0.14), transparent 70%)",
        }}
      />
    </div>
  );
}

function getStoredToken() {
  if (typeof window === "undefined") return null;
  // supports multiple keys so you don’t get stuck if your login page stores a different name
  const keys = ["access_token", "token", "cf_token", "clipforge_token"];
  for (const k of keys) {
    const v = window.localStorage.getItem(k);
    if (v && v.trim()) return v.trim();
  }
  return null;
}

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  // close mobile menu on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // esc to close
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // hydrate auth token (client)
  useEffect(() => {
    const t = getStoredToken();
    setToken(t);
  }, []);

  // fetch credits when logged in
  useEffect(() => {
    if (!token) {
      setCredits(null);
      setCreditsLoading(false);
      return;
    }

    const API =
      process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
      "http://127.0.0.1:8000";

    const ac = new AbortController();
    setCreditsLoading(true);

    fetch(`${API}/me`, {
      method: "GET",
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`me:${r.status}`);
        return r.json();
      })
      .then((data) => {
        // ✅ CHANGE THIS LINE if your backend uses a different field name:
        const v =
          data?.credits_remaining ??
          data?.credits ??
          data?.remaining_credits ??
          null;

        setCredits(typeof v === "number" ? v : null);
      })
      .catch(() => {
        // silent fail: navbar should never crash
        setCredits(null);
      })
      .finally(() => setCreditsLoading(false));

    return () => ac.abort();
  }, [token]);

  const authed = !!token;

  return (
    <header className="sticky top-0 z-50">
      {/* spacing: px-6 for premium breathing room */}
      <div className="mx-auto max-w-6xl px-6">
        {/* spacing: mt-4 + px-6 py-3.5 */}
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-6 py-3.5 backdrop-blur">
          {/* left cluster: looser */}
          <div className="flex items-center gap-8 md:gap-10">
            <Logo />

            {/* nav: more room between pills */}
            <nav className="hidden md:flex items-center gap-3">
              <NavLink href="/features">Features</NavLink>
              <NavLink href="/how-it-works">How it works</NavLink>
              <NavLink href="/pricing">Pricing</NavLink>
              <NavLink href="/contact">Contact</NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Desktop actions */}
            <div className="hidden md:flex items-center gap-3">
              {authed && (
                <CreditsPill credits={credits} loading={creditsLoading} />
              )}

              {!authed && (
                <>
                  <IconButton href="/login" label="Login" title="Login">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M20 21a8 8 0 0 0-16 0"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M12 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </IconButton>

                  <IconButton href="/register" label="Sign up" title="Sign up">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </IconButton>

                  <Link href="/register" className="group relative btn-aurora text-xs">
                    <span className="relative z-[1]">Start free trial</span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-2 opacity-0 blur-lg transition-opacity duration-200 group-hover:opacity-100"
                      style={{
                        background:
                          "radial-gradient(18px 18px at 35% 55%, rgba(167,139,250,0.30), transparent 70%), radial-gradient(20px 20px at 60% 45%, rgba(125,211,252,0.26), transparent 72%), radial-gradient(22px 22px at 75% 55%, rgba(45,212,191,0.20), transparent 70%)",
                      }}
                    />
                  </Link>
                </>
              )}

              {authed && (
                <Link href="/dashboard" className="btn-ghost text-xs">
                  Dashboard
                </Link>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="md:hidden group relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/85 transition active:scale-[0.98]"
              aria-label={open ? "Close menu" : "Open menu"}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-2 opacity-0 blur-md transition-opacity duration-200 group-hover:opacity-100"
                style={{
                  background:
                    "radial-gradient(16px 16px at 50% 50%, rgba(167,139,250,0.26), transparent 70%), radial-gradient(18px 18px at 30% 60%, rgba(125,211,252,0.20), transparent 72%), radial-gradient(18px 18px at 70% 35%, rgba(45,212,191,0.16), transparent 70%)",
                }}
              />
              {open ? (
                <svg
                  className="relative"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  className="relative"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile panel */}
        {open && (
          <div className="md:hidden relative">
            {/* overlay click-catcher */}
            <button
              aria-label="Close menu overlay"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />

            <div className="absolute left-0 right-0 z-50 mt-3 rounded-2xl border border-white/10 bg-black/50 p-2 backdrop-blur">
              <div className="px-3 py-2 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                  Navigate
                </div>

                {authed && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                    <span className="text-white/50">Credits</span>
                    <span className="font-semibold text-white/85 tabular-nums">
                      {creditsLoading ? "…" : credits ?? "—"}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 p-1">
                <NavLink href="/features" onNavigate={() => setOpen(false)}>
                  Features
                </NavLink>
                <NavLink href="/how-it-works" onNavigate={() => setOpen(false)}>
                  How it works
                </NavLink>
                <NavLink href="/pricing" onNavigate={() => setOpen(false)}>
                  Pricing
                </NavLink>
                <NavLink href="/contact" onNavigate={() => setOpen(false)}>
                  Contact
                </NavLink>
                {authed && (
                  <NavLink href="/dashboard" onNavigate={() => setOpen(false)}>
                    Dashboard
                  </NavLink>
                )}
              </div>

              {!authed && (
                <div className="mt-2 grid grid-cols-2 gap-2 p-2">
                  <IconButton
                    href="/login"
                    label="Login"
                    title="Login"
                    onNavigate={() => setOpen(false)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M20 21a8 8 0 0 0-16 0"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M12 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </IconButton>

                  <IconButton
                    href="/register"
                    label="Sign up"
                    title="Sign up"
                    onNavigate={() => setOpen(false)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </IconButton>

                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="group relative col-span-2 btn-aurora text-xs text-center"
                  >
                    <span className="relative z-[1]">Start free trial</span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-2 opacity-0 blur-lg transition-opacity duration-200 group-hover:opacity-100"
                      style={{
                        background:
                          "radial-gradient(18px 18px at 35% 55%, rgba(167,139,250,0.30), transparent 70%), radial-gradient(20px 20px at 60% 45%, rgba(125,211,252,0.26), transparent 72%), radial-gradient(22px 22px at 75% 55%, rgba(45,212,191,0.20), transparent 70%)",
                      }}
                    />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
