// frontend/components/Navbar.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { displayNameFromUser } from "@/lib/user";
import { BRAND } from "@/lib/brand";
import DevNotice from "@/components/DevNotice";

function Logo() {
  const pathname = usePathname();
  const inApp = pathname?.startsWith("/app");

  // bump this when you want to force-refresh the navbar mark (CDN/browser cache)
  const v = "cflabs-1";

  const markBoxClass = inApp ? "h-10 w-10 rounded-[18px]" : "h-9 w-9 rounded-2xl";
  const markImgSize = inApp ? 24 : 22;
  const wordmarkClass = inApp
    ? "text-[20px] sm:text-[21px] font-semibold tracking-[-0.012em] text-white/95"
    : "text-[18px] font-semibold tracking-[-0.01em] text-white/95";

  function onLogoClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // On landing, clicking logo should always bring user to top.
    if (inApp || pathname !== "/") return;
    e.preventDefault();
    if (window.location.hash) {
      window.history.replaceState(null, "", "/");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Link href={inApp ? "/app" : "/"} onClick={onLogoClick} className="group flex items-center gap-3 shrink-0">
      <span
        className={[
          "relative inline-flex items-center justify-center overflow-hidden border border-white/10 bg-white/5 backdrop-blur",
          markBoxClass,
        ].join(" ")}
      >
        {/* light-leak halo */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(62px 62px at 42% 45%, rgba(255,183,3,0.30), transparent 70%), radial-gradient(74px 74px at 70% 42%, rgba(251,86,7,0.24), transparent 72%), radial-gradient(78px 78px at 62% 76%, rgba(58,134,255,0.20), transparent 72%)",
            filter: "blur(10px)",
          }}
        />

        {/* Primary mark */}
        <img
          src={`/clipforge-labs-mark.svg?v=${v}`}
          alt={`${BRAND.name} logo`}
          width={markImgSize}
          height={markImgSize}
          style={{ display: "block" }}
        />
      </span>

      {/* Wordmark */}
      <span className="inline-flex items-center gap-2">
        <span className="relative">
          <span className={wordmarkClass}>{BRAND.name}</span>

          {/* soft sheen */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.55] blur-[10px] transition-opacity duration-300 group-hover:opacity-[0.85]"
            style={{
              background:
                "linear-gradient(90deg, rgba(255,183,3,0.55), rgba(251,86,7,0.46), rgba(58,134,255,0.40))",
            }}
          />
        </span>

        <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-white/70">
          LABS
        </span>
      </span>
    </Link>
  );
}

function NavLink({
  href,
  children,
  onNavigate,
  activeOverride,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate?: () => void;
  activeOverride?: boolean;
}) {
  const pathname = usePathname();
  const hrefPath = useMemo(() => {
    const [pathOnly] = href.split("#");
    return pathOnly && pathOnly.length > 0 ? pathOnly : "/";
  }, [href]);

  const active = useMemo(() => {
    if (!pathname) return false;
    if (hrefPath === "/") return pathname === "/";
    if (hrefPath === "/app") return pathname === "/app" || pathname.startsWith("/app/");
    return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
  }, [pathname, hrefPath]);
  const finalActive = activeOverride ?? active;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        "group relative -mx-1.5 inline-flex items-center rounded-full px-3 py-1.5 text-xs transition-colors",
        finalActive ? "text-white" : "text-white/70 hover:text-white",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-200",
          finalActive ? "opacity-100" : "group-hover:opacity-100",
        ].join(" ")}
        style={{
          background:
            "linear-gradient(90deg, rgba(255,183,3,0.10), rgba(251,86,7,0.09), rgba(58,134,255,0.09))",
          boxShadow: finalActive
            ? "0 0 0 1px rgba(255,255,255,0.10) inset"
            : "0 0 0 1px rgba(255,255,255,0.08) inset",
        }}
      />

      <span className="relative z-[1]">{children}</span>

      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute -bottom-1 left-2 right-2 h-px origin-left scale-x-0 transition-transform duration-300",
          finalActive ? "scale-x-100" : "group-hover:scale-x-100",
        ].join(" ")}
        style={{
          background:
            "linear-gradient(90deg, rgba(255,183,3,0.92), rgba(251,86,7,0.92), rgba(58,134,255,0.92))",
        }}
      />

      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-x-2 -bottom-3 h-3 opacity-0 blur-lg transition-opacity duration-300",
          finalActive ? "opacity-80" : "group-hover:opacity-75",
        ].join(" ")}
        style={{
          background:
            "linear-gradient(90deg, rgba(255,183,3,0.40), rgba(251,86,7,0.34), rgba(58,134,255,0.34))",
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
            "radial-gradient(16px 16px at 42% 45%, rgba(255,183,3,0.24), transparent 70%), radial-gradient(18px 18px at 70% 42%, rgba(251,86,7,0.20), transparent 72%), radial-gradient(18px 18px at 62% 76%, rgba(58,134,255,0.18), transparent 70%)",
        }}
      />
      <span className="relative">{children}</span>
    </Link>
  );
}

function CreditsPill({ credits, loading }: { credits: number | null; loading: boolean }) {
  const pathname = usePathname();
  const inApp = pathname?.startsWith("/app");

  const pillClass = inApp ? "px-3.5 py-2 text-[13px]" : "px-3 py-1.5 text-xs";
  const numClass = inApp
    ? "text-[13px] font-semibold text-white/90 tabular-nums"
    : "font-semibold text-white/85 tabular-nums";

  return (
    <div
      className={[
        "group relative hidden xl:inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] text-white/75",
        pillClass,
      ].join(" ")}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
      <span className="text-white/55">Credits</span>
      <span className={numClass}>{loading ? "…" : credits ?? "—"}</span>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-2 opacity-0 blur-md transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(18px 18px at 40% 55%, rgba(255,183,3,0.20), transparent 70%), radial-gradient(20px 20px at 62% 45%, rgba(251,86,7,0.16), transparent 72%), radial-gradient(22px 22px at 78% 55%, rgba(58,134,255,0.14), transparent 70%)",
        }}
      />
    </div>
  );
}

type MeResponse = { name?: string | null; email: string; plan: string; credits: number };

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [howInView, setHowInView] = useState(false);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);

  const inApp = pathname?.startsWith("/app");

  // ✅ Keep the scroll-safe approach:
  // - Marketing: FIXED + spacer (guarantees document scroll stays correct with your page backgrounds)
  // - App: STICKY
  const navModeClass = inApp ? "sticky" : "fixed";
  const navTopClass = inApp ? "top-0" : "top-4";
  const needsSpacer = !inApp;

  // close mobile menu on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Marketing nav: highlight "How it works" only when section is actually in view.
  useEffect(() => {
    if (inApp || pathname !== "/") {
      setHowInView(false);
      return;
    }

    let rafId = 0;
    const update = () => {
      const section = document.getElementById("how-it-works");
      if (!section) {
        setHowInView(false);
        return;
      }
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || 0;
      const active = rect.top <= vh * 0.46 && rect.bottom >= vh * 0.28;
      setHowInView(active);
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("hashchange", onScroll);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("hashchange", onScroll);
    };
  }, [inApp, pathname]);

  // esc to close
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
  const displayName = useMemo(() => displayNameFromUser(me), [me]);

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

  function goToAuthForTrial() {
    const next = pathname && pathname.length > 0 ? pathname : "/pricing";
    router.push(`/register?next=${encodeURIComponent(next)}&intent=free-trial`);
  }

  async function startFreeTrial() {
    if (startingTrial) return;

    // If not authed, ALWAYS go to register (your rule)
    if (!authed) {
      setOpen(false);
      goToAuthForTrial();
      return;
    }

    setStartingTrial(true);
    try {
      // Free trial checkout (card collection enforced in backend)
      const data = (await apiFetch("/billing/checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: "free", interval: "monthly", pack: 1 }),
      })) as any;

      const url = data?.url;
      if (!url) {
        console.error("trial_checkout_failed_no_url", { data });
        return;
      }

      setOpen(false);
      window.location.href = url;
    } catch (e) {
      console.error("trial_checkout_failed", e);
    } finally {
      setStartingTrial(false);
    }
  }

  const marketingLinks = useMemo(
    () => [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/contact", label: "Contact" },
    ],
    []
  );

  const appLinks = useMemo(
    () => [
      { href: "/app", label: "Generator" },
      { href: "/app/connections", label: "Connections" },
      { href: "/app/editor", label: "Editor" },
      { href: "/app/billing", label: "Billing" },
      { href: "/app/settings", label: "Settings" },
    ],
    []
  );

  const navLinks = inApp ? appLinks : marketingLinks;

  // Always card/glass
  const shellClass =
    "border border-white/10 bg-black/30 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)]";

  // ✅ Visual fix: marketing navbar should feel “in the header”, not floating down
  const shellMarginTop = inApp ? "mt-4" : "mt-0";

  return (
    <>
      {/* ✅ Spacer so FIXED marketing navbar never overlaps content */}
      {needsSpacer && <div aria-hidden="true" className="h-[112px]" />}
      {/* Drop-down notice should appear BELOW the fixed navbar (never behind it). */}
      {!inApp && <DevNotice />}

      <header
        className={`${navModeClass} ${navTopClass} z-50 w-full`}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div
            className={[
              `${shellMarginTop} flex items-center justify-between rounded-2xl px-6 py-3.5 transition-colors duration-200`,
              shellClass,
            ].join(" ")}
          >
            <div className="flex items-center gap-5 lg:gap-8 xl:gap-10 min-w-0">
              <Logo />

              <nav className="hidden lg:flex items-center gap-3 xl:gap-4">
                {navLinks.map((l) => (
                  <NavLink
                    key={l.href}
                    href={l.href}
                    activeOverride={
                      !inApp && l.href === "/#how-it-works" && pathname === "/" ? howInView : undefined
                    }
                  >
                    {l.label}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-2.5 xl:gap-3">
                <a
                  href={BRAND.orbitoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden xl:inline-flex btn-orbito text-xs"
                  title={`Go to ${BRAND.orbitoName}`}
                >
                  {BRAND.orbitoName} <span aria-hidden="true">↗</span>
                </a>

                {authed && (
                  <div className="hidden xl:inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-white/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
                    <span className="max-w-[140px] truncate">{displayName}</span>
                  </div>
                )}
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

                    <button
                      type="button"
                      onClick={startFreeTrial}
                      disabled={startingTrial}
                      className="group relative btn-aurora text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <span className="relative z-[1]">{startingTrial ? "Starting…" : "Start free trial"}</span>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -inset-2 opacity-0 blur-lg transition-opacity duration-200 group-hover:opacity-100"
                          style={{
                            background:
                              "radial-gradient(18px 18px at 40% 55%, rgba(255,183,3,0.26), transparent 70%), radial-gradient(20px 20px at 62% 45%, rgba(251,86,7,0.22), transparent 72%), radial-gradient(22px 22px at 78% 55%, rgba(58,134,255,0.20), transparent 70%)",
                          }}
                        />
                    </button>
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
                className="lg:hidden group relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/85 transition active:scale-[0.98]"
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-2 opacity-0 blur-md transition-opacity duration-200 group-hover:opacity-100"
                    style={{
                      background:
                        "radial-gradient(16px 16px at 42% 45%, rgba(255,183,3,0.22), transparent 70%), radial-gradient(18px 18px at 70% 42%, rgba(251,86,7,0.18), transparent 72%), radial-gradient(18px 18px at 62% 76%, rgba(58,134,255,0.16), transparent 70%)",
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
            <div
              className="lg:hidden mt-3 rounded-2xl border border-white/15 bg-[#04070fe8] p-2 shadow-[0_22px_60px_rgba(0,0,0,0.72)] backdrop-blur-xl"
              style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
              role="dialog"
              aria-label="Mobile navigation"
            >
                <div className="px-3 py-2 flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Navigate</div>

                  {authed && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
                      <span className="max-w-[120px] truncate text-white/80">{displayName}</span>
                      <span className="text-white/35">•</span>
                      <span className="text-white/50">Credits</span>
                      <span className="font-semibold text-white/85 tabular-nums">{meLoading ? "…" : credits ?? "—"}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1 p-1">
                  {navLinks.map((l) => (
                    <NavLink
                      key={l.href}
                      href={l.href}
                      onNavigate={() => setOpen(false)}
                      activeOverride={
                        !inApp && l.href === "/#how-it-works" && pathname === "/" ? howInView : undefined
                      }
                    >
                      {l.label}
                    </NavLink>
                  ))}
                </div>

                <div className="mt-2 p-2">
                  <a
                    href={BRAND.orbitoUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setOpen(false)}
                    className="btn-orbito w-full text-xs"
                    title={`Go to ${BRAND.orbitoName}`}
                  >
                    Go to {BRAND.orbitoName} <span aria-hidden="true">↗</span>
                  </a>
                </div>

                {!authed ? (
                  <div className="mt-2 p-2">
                    <div className="flex items-center justify-center gap-2">
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
                    </div>

                    <button
                      type="button"
                      onClick={startFreeTrial}
                      disabled={startingTrial}
                      className="group relative mt-2 w-full btn-aurora text-xs text-center disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <span className="relative z-[1]">{startingTrial ? "Starting…" : "Start free trial"}</span>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -inset-2 opacity-0 blur-lg transition-opacity duration-200 group-hover:opacity-100"
                          style={{
                            background:
                              "radial-gradient(18px 18px at 40% 55%, rgba(255,183,3,0.26), transparent 70%), radial-gradient(20px 20px at 62% 45%, rgba(251,86,7,0.22), transparent 72%), radial-gradient(22px 22px at 78% 55%, rgba(58,134,255,0.20), transparent 70%)",
                          }}
                        />
                    </button>
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
          )}
        </div>
      </header>
    </>
  );
}
