// frontend/components/Navbar.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { BRAND } from "@/lib/brand";

function Logo() {
  const pathname = usePathname();
  const inApp = pathname?.startsWith("/app");

  // bump this when you want to force-refresh the navbar mark (CDN/browser cache)
  const v = "orb-1";

  const markBoxClass = inApp ? "h-10 w-10 rounded-[18px]" : "h-9 w-9 rounded-2xl";
  const markImgSize = inApp ? 24 : 22;
  const wordmarkClass = inApp
    ? "text-[20px] sm:text-[21px] font-semibold tracking-[-0.012em] text-white/95"
    : "text-[18px] font-semibold tracking-[-0.01em] text-white/95";

  return (
    <Link href={inApp ? "/app" : "/"} className="group flex items-center gap-3 shrink-0">
      <span
        className={[
          "relative inline-flex items-center justify-center overflow-hidden border border-white/10 bg-white/5 backdrop-blur",
          markBoxClass,
        ].join(" ")}
      >
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

        {/* Primary mark */}
        <img
          src={`/orbito-mark.svg?v=${v}`}
          alt={`${BRAND.name} logo`}
          width={markImgSize}
          height={markImgSize}
          style={{ display: "block" }}
        />
      </span>

      {/* Wordmark */}
      <span className="relative">
        <span className={wordmarkClass}>{BRAND.name}</span>

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
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    if (href === "/app") return pathname === "/app" || pathname.startsWith("/app/");
    return pathname === href || pathname.startsWith(`${href}/`);
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

      <span className="relative z-[1]">{children}</span>

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

function CreditsPill({ credits, loading }: { credits: number | null; loading: boolean }) {
  const pathname = usePathname();
  const inApp = pathname?.startsWith("/app");

  const pillClass = inApp
    ? "px-3.5 py-2 text-[13px]"
    : "px-3 py-1.5 text-xs";

  const numClass = inApp ? "text-[13px] font-semibold text-white/90 tabular-nums" : "font-semibold text-white/85 tabular-nums";

  return (
    <div
      className={[
        "group relative hidden md:inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] text-white/75",
        pillClass,
      ].join(" ")}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
      <span className="text-white/55">Credits</span>
      <span className={numClass}>{loading ? "…" : credits ?? "—"}</span>

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

type MeResponse = { email: string; plan: string; credits: number };

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(false);

  const inApp = pathname?.startsWith("/app");
  const isLanding = pathname === "/";

  // Landing: use fixed (sticky can break if the landing has a different scroll/stack context)
  const navModeClass = !inApp && isLanding ? "fixed" : "sticky";

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

  // MOBILE POLISH: lock body scroll when menu is open
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;

    document.body.style.overflow = "hidden";

    const preventTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };
    window.addEventListener("touchmove", preventTouchMove, { passive: false });

    return () => {
      window.removeEventListener("touchmove", preventTouchMove);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  // cookie-auth: fetch /auth/me to determine authed + credits
  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      setMeLoading(true);
      try {
        const data = await apiFetch<MeResponse>("/auth/me", { method: "GET" });
        if (!cancelled) setMe(data);
      } catch {
        if (!cancelled) setMe(null);
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    loadMe();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const authed = !!me;
  const credits = me?.credits ?? null;

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setMe(null);
    setOpen(false);
    router.push("/login");
    router.refresh();
  }

  const marketingLinks = useMemo(
    () => [
      { href: "/how-it-works", label: "How it works" },
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/contact", label: "Contact" },
    ],
    []
  );

  const appLinks = useMemo(
    () => [
      { href: "/app", label: "Overview" },
      { href: "/app/upload", label: "Upload" },
      { href: "/app/clips", label: "Clips" },
      { href: "/app/billing", label: "Billing" },
      { href: "/app/settings", label: "Settings" },
    ],
    []
  );

  const navLinks = inApp ? appLinks : marketingLinks;

  // Always card/glass
  const shellClass =
    "border border-white/10 bg-black/30 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)]";

  return (
    <>
      {/* Landing-only spacer so fixed navbar doesn't overlap content */}
      {!inApp && isLanding && <div aria-hidden="true" className="h-[96px]" />}

      <header
        className={`${navModeClass} top-0 z-50 w-full`}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div
            className={[
              "mt-4 flex items-center justify-between rounded-2xl px-6 py-3.5 transition-colors duration-200",
              shellClass,
            ].join(" ")}
          >
            <div className="flex items-center gap-8 md:gap-10 min-w-0">
              <Logo />

              <nav className="hidden md:flex items-center gap-3">
                {navLinks.map((l) => (
                  <NavLink key={l.href} href={l.href}>
                    {l.label}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-3">
                {authed && <CreditsPill credits={credits} loading={meLoading} />}

                {!authed ? (
                  <>
                    <IconButton href="/login" label="Login" title="Login">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
                        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
                ) : (
                  <>
                    {!inApp && (
                      <Link href="/app" className="btn-ghost text-xs">
                        Dashboard
                      </Link>
                    )}

                    <button type="button" onClick={logout} className="btn-ghost text-xs">
                      Log out
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="md:hidden group relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/85 transition active:scale-[0.98]"
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
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
                  <svg className="relative" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg className="relative" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {open && (
            <div className="md:hidden relative">
              <button
                type="button"
                aria-label="Close menu overlay"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setOpen(false)}
              />

              <div
                className="absolute left-0 right-0 z-50 mt-3 rounded-2xl border border-white/10 bg-black/50 p-2 backdrop-blur"
                style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
                role="dialog"
                aria-label="Mobile navigation"
              >
                <div className="px-3 py-2 flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Navigate</div>

                  {authed && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                      <span className="text-white/50">Credits</span>
                      <span className="font-semibold text-white/85 tabular-nums">{meLoading ? "…" : credits ?? "—"}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1 p-1">
                  {navLinks.map((l) => (
                    <NavLink key={l.href} href={l.href} onNavigate={() => setOpen(false)}>
                      {l.label}
                    </NavLink>
                  ))}
                </div>

                {!authed ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 p-2">
                    <IconButton href="/login" label="Login" title="Login" onNavigate={() => setOpen(false)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <path
                          d="M12 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </IconButton>

                    <IconButton href="/register" label="Sign up" title="Sign up" onNavigate={() => setOpen(false)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
                ) : (
                  <div className="mt-2 grid gap-2 p-2">
                    {!inApp && (
                      <Link href="/app" onClick={() => setOpen(false)} className="btn-ghost text-xs text-center">
                        Dashboard
                      </Link>
                    )}

                    <button type="button" onClick={logout} className="btn-solid-dark text-xs">
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>
    </>
  );
}
