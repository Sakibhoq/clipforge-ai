// frontend/app/login/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

/* =========================================================
   Orbito — Login (Cookie Auth, Production)
   - Dev/Codespaces: cookie lives on backend origin, middleware can't see it
     -> We do a client-side /auth/me check to redirect if already authed.
   - POST /auth/login sets HttpOnly cf_token cookie (backend origin)
   - NO token storage in JS

   DIAGNOSTICS (important):
   - If you get "Not authenticated" after successful /auth/login,
     it usually means one of:
       1) Frontend is calling a DIFFERENT backend origin between requests
          (cookie stored for origin A, /auth/me hits origin B).
       2) Browser blocked the Set-Cookie (CORS credentials / origin mismatch).
       3) Your api base points to an internal hostname like http://backend:8000
          (works in Docker network, NOT in the browser).
========================================================= */

function H({ children }: { children: React.ReactNode }) {
  return <span className="grad-text font-semibold">{children}</span>;
}

function HoverSheen() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(120px 120px at 20% 25%, rgba(167,139,250,0.20), transparent 60%), radial-gradient(140px 140px at 80% 30%, rgba(125,211,252,0.18), transparent 62%), radial-gradient(140px 140px at 55% 85%, rgba(45,212,191,0.14), transparent 62%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)",
        }}
      />
    </>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden="true">
      <path
        d="M12 3a9 9 0 1 0 9 9"
        stroke="rgba(255,255,255,0.78)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="rgba(255,255,255,0.92)"
        d="M21.35 11.1H12v2.98h5.35c-.23 1.25-.95 2.31-2.04 3.02v2.01h3.3c1.93-1.78 3.04-4.4 3.04-7.51 0-.68-.06-1.34-.2-1.99Z"
      />
      <path
        fill="rgba(255,255,255,0.70)"
        d="M12 22c2.76 0 5.08-.91 6.77-2.48l-3.3-2.01c-.91.62-2.08.99-3.47.99-2.66 0-4.92-1.79-5.72-4.19H2.9v2.08C4.58 19.86 8.03 22 12 22Z"
      />
      <path
        fill="rgba(255,255,255,0.70)"
        d="M6.28 14.31A6.8 6.8 0 0 1 6.02 12c0-.81.14-1.59.26-2.31V7.61H2.9A10 10 0 0 0 2 12c0 1.62.39 3.15.9 4.39l3.38-2.08Z"
      />
      <path
        fill="rgba(255,255,255,0.70)"
        d="M12 5.5c1.5 0 2.84.52 3.9 1.53l2.91-2.91C17.07 2.52 14.76 1.5 12 1.5 8.03 1.5 4.58 3.64 2.9 7.61l3.38 2.08C7.08 7.29 9.34 5.5 12 5.5Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
      <path
        d="M16.7 12.8c0-2 1.6-3 1.7-3.1-1-1.5-2.6-1.7-3.2-1.7-1.3-.1-2.5.8-3.1.8-.6 0-1.6-.8-2.7-.8-1.4 0-2.7.8-3.4 2-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.5 2.1 2.6 2 1 0 1.4-.6 2.7-.6 1.3 0 1.6.6 2.7.6 1.1 0 1.8-1 2.5-2Z"
        stroke="rgba(255,255,255,0.86)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M15 5.6c.6-.7 1-1.7.9-2.7-.9.1-2 .6-2.6 1.3-.6.7-1 1.7-.9 2.7.9.1 2-.6 2.6-1.3Z"
        stroke="rgba(255,255,255,0.86)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
      <path
        d="M14 8.5V7.2c0-.7.5-1.2 1.2-1.2H17V3.5h-2c-2.2 0-3.5 1.4-3.5 3.6v1.4H9.5V11H11.5v9.5h2.8V11h2.3l.4-2.5H14Z"
        fill="rgba(255,255,255,0.86)"
      />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
      <path
        d="M14.5 3c.5 3.1 2.7 5 5.5 5.2v2.7c-1.9 0-3.6-.6-5.1-1.7v6.3c0 3.1-2.5 5.6-5.6 5.6S3.7 18.6 3.7 15.5c0-3.1 2.5-5.6 5.6-5.6.3 0 .6 0 .9.1v2.9c-.3-.1-.6-.2-.9-.2-1.5 0-2.8 1.2-2.8 2.8s1.2 2.8 2.8 2.8 2.8-1.2 2.8-2.8V3h2.5Z"
        fill="rgba(255,255,255,0.86)"
      />
    </svg>
  );
}

type Provider = "google" | "apple" | "facebook" | "tiktok";

function providerLabel(p: Provider) {
  if (p === "google") return "Google";
  if (p === "apple") return "Apple";
  if (p === "facebook") return "Facebook";
  return "TikTok";
}

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === "google") return <GoogleIcon />;
  if (provider === "apple") return <AppleIcon />;
  if (provider === "facebook") return <FacebookIcon />;
  return <TikTokIcon />;
}

function ProviderButton({
  provider,
  onClick,
  disabled,
}: {
  provider: Provider;
  onClick: () => void;
  disabled?: boolean;
}) {
  const label = providerLabel(provider);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-[13px] font-semibold text-white/85 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 active:scale-[0.99]",
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-white/[0.07]",
      ].join(" ")}
      aria-label={`Continue with ${label}`}
    >
      <HoverSheen />
      <span className="relative inline-flex items-center gap-2">
        <ProviderIcon provider={provider} />
        Continue with {label}
      </span>
    </button>
  );
}

function Field({
  id,
  label,
  type = "text",
  autoComplete,
  inputMode,
  placeholder,
  value,
  onChange,
  inputRef,
  onFocus,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onFocus?: (el: HTMLInputElement) => void;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-[12px] font-medium text-white/75" htmlFor={id}>
        {label}
      </label>
      <input
        ref={(el) => {
          if (inputRef) inputRef.current = el;
        }}
        id={id}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => onFocus?.(e.currentTarget)}
        placeholder={placeholder}
        className={[
          // iOS: prevent input zoom by keeping >=16px on small screens
          "h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-[16px] sm:text-[14px]",
          "text-white/90 outline-none placeholder:text-white/35 transition focus:border-white/20 focus:bg-white/[0.06]",
        ].join(" ")}
      />
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3 text-[12px] text-white/40">
      <div className="h-px flex-1 bg-white/10" />
      {label}
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

type LoginOk = { ok: true };
type MeResponse = { email: string; plan: string; credits: number };

function errToHelpfulMessage(err: any) {
  const status = err?.status;
  const url = err?.url;
  const detail = err?.detail;

  if (status === 401 || detail === "Not authenticated") {
    return [
      "Not authenticated.",
      "",
      "This usually means the browser did NOT store/send the cf_token cookie.",
      "Check these in DevTools → Network:",
      `- POST /auth/login response has Set-Cookie (cf_token)`,
      `- Request URL for /auth/login and /auth/me are the SAME backend origin`,
      `- Response has Access-Control-Allow-Credentials: true`,
      `- Access-Control-Allow-Origin matches your frontend origin exactly`,
      url ? `\nDebug: ${status ?? "ERR"} from ${url}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (Array.isArray(detail)) {
    const msgs = detail.map((x: any) => x?.msg).filter(Boolean);
    if (msgs.length) return msgs.join(" • ");
  }

  if (typeof detail === "string" && detail.trim()) return detail;

  if (typeof err?.message === "string" && err.message.trim()) {
    return [
      err.message,
      url ? `\nDebug URL: ${url}` : "",
      "",
      "If the URL looks like http://backend:8000, that will NOT work in the browser.",
      "Use http://localhost:8000 (local) or the https://...-8000.app.github.dev origin (Codespaces).",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return "Unable to sign in. Check email/password.";
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const nextPath = sp.get("next") || "/app";

  const [checking, setChecking] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [socialBusy, setSocialBusy] = useState<Provider | null>(null);

  const [socialNoAccount, setSocialNoAccount] = useState<{
    provider: Provider;
    message: string;
  } | null>(null);

  const [formError, setFormError] = useState<string | null>(null);

  // mobile polish: keep focused input visible & avoid awkward jumps
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passRef = useRef<HTMLInputElement | null>(null);
  const lastFocusTsRef = useRef<number>(0);

  const canSubmit = useMemo(() => {
    const e = email.trim();
    return e.length > 3 && e.includes("@") && password.length >= 6 && !submitting;
  }, [email, password, submitting]);

  // ✅ If already authed (cookie exists on backend origin), redirect away from /login
  useEffect(() => {
    let mounted = true;

    async function checkMe() {
      try {
        await apiFetch<MeResponse>("/auth/me");
        if (!mounted) return;
        router.replace(nextPath);
        router.refresh();
      } catch {
        if (!mounted) return;
        setChecking(false);
      }
    }

    checkMe();
    return () => {
      mounted = false;
    };
  }, [router, nextPath]);

  // keyboard/focus polish: scroll focused input into view on mobile Safari
  function onFieldFocus(target: HTMLInputElement) {
    lastFocusTsRef.current = Date.now();

    // Let iOS open keyboard first, then gently center.
    // Also avoid fighting user scroll if focus changes quickly.
    window.setTimeout(() => {
      if (Date.now() - lastFocusTsRef.current > 900) return;
      try {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {
        // ignore
      }
    }, 220);
  }

  async function onSocial(provider: Provider) {
    setFormError(null);
    setSocialNoAccount(null);
    setSocialBusy(provider);
    try {
      await new Promise((r) => setTimeout(r, 420));
      setSocialNoAccount({
        provider,
        message: `No ${providerLabel(provider)} account found for Orbito.`,
      });
    } finally {
      setSocialBusy(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSocialNoAccount(null);

    const em = email.trim();
    if (!em || !em.includes("@")) return setFormError("Enter a valid email.");
    if (password.length < 6) return setFormError("Password must be at least 6 characters.");

    setSubmitting(true);
    try {
      await apiFetch<LoginOk>("/auth/login", {
        method: "POST",
        body: { email: em, password },
      });

      // tiny tick so cookie commit settles in some browsers
      await new Promise((r) => setTimeout(r, 60));
      await apiFetch<MeResponse>("/auth/me");

      router.push(nextPath);
      router.refresh();
    } catch (err: any) {
      setFormError(errToHelpfulMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // shared root styles: no horizontal overflow + safe-area padding.
  const rootStyle: React.CSSProperties = {
    minHeight: "100svh",
    paddingTop: "env(safe-area-inset-top)",
    paddingBottom: "env(safe-area-inset-bottom)",
  };

  if (checking) {
    return (
      <div className="relative overflow-x-hidden [max-width:100vw]" style={rootStyle}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 opacity-[0.55]">
            <div className="aurora" />
          </div>
        </div>

        <main className="relative mx-auto max-w-6xl px-6 pb-16 pt-12">
          <div className="surface mx-auto max-w-xl p-8 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-white/70">
              <Spinner />
              Checking session…
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]" style={rootStyle}>
      {/* PAGE AURORA (lighter on small screens to reduce paint cost) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_10%,rgba(255,255,255,0.06),transparent_62%)]" />
        <div className="absolute inset-0 opacity-[0.48] sm:opacity-[0.55]">
          <div className="aurora" />
        </div>

        {/* blobs: use vmin instead of negative % widths to reduce iOS overflow edge cases */}
        <div className="absolute -top-[22vmin] left-[-18vmin] h-[54vmin] w-[54vmin] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.20),transparent_62%)] blur-3xl" />
        <div className="absolute top-[10vmin] right-[-18vmin] h-[58vmin] w-[58vmin] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.17),transparent_64%)] blur-3xl" />
        <div className="absolute bottom-[-24vmin] left-[6vmin] h-[64vmin] w-[64vmin] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.13),transparent_65%)] blur-3xl" />

        {/* grid: disable on small screens (can shimmer / seams on iOS) */}
        <div className="hidden sm:block absolute inset-0 opacity-[0.08] mix-blend-overlay [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      {/* Layout: mobile-first scroll; desktop can look centered without forcing 100vh traps */}
      <main className="relative mx-auto max-w-6xl px-6 pb-16 pt-10 sm:pt-12">
        <section className="surface relative overflow-hidden p-6 sm:p-8 md:p-12">
          <div className="absolute inset-0">
            <div className="aurora opacity-60" />
            <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
          </div>

          <div className="relative">
            {/* TOP ROW */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-white/55">• Sign in</div>
              <div className="flex items-center gap-3 text-[12px] text-white/60">
                <span className="hidden sm:inline">New here?</span>
                <Link
                  href="/register"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/85 transition hover:bg-white/8 active:scale-[0.99]"
                >
                  Create account
                </Link>
              </div>
            </div>

            <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:gap-10">
              {/* LEFT */}
              <div className="lg:col-span-5">
                <h1 className="text-[34px] leading-[1.05] font-semibold tracking-tight sm:text-4xl md:text-5xl">
                  Welcome back.
                </h1>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-white/65 md:text-[15px]">
                  Sign in to manage uploads, jobs, and clips.
                </p>
                <div className="mt-5 text-xs text-white/55">
                  Providers: <H>Google</H>, <H>Apple</H>, <H>Facebook</H>, <H>TikTok</H>
                </div>
              </div>

              {/* RIGHT */}
              <div className="lg:col-span-7">
                <div className="surface-soft relative overflow-hidden p-5 sm:p-6 md:p-7">
                  <HoverSheen />

                  <div className="relative">
                    <div className="text-sm font-semibold text-white/85">Sign in</div>
                    <div className="mt-1 text-xs text-white/55">
                      Continue with a provider, or use email.
                    </div>

                    {/* SOCIAL */}
                    <div className="mt-5 grid gap-2">
                      <ProviderButton
                        provider="google"
                        onClick={() => onSocial("google")}
                        disabled={!!socialBusy || submitting}
                      />
                      <ProviderButton
                        provider="apple"
                        onClick={() => onSocial("apple")}
                        disabled={!!socialBusy || submitting}
                      />
                      <ProviderButton
                        provider="facebook"
                        onClick={() => onSocial("facebook")}
                        disabled={!!socialBusy || submitting}
                      />
                      <ProviderButton
                        provider="tiktok"
                        onClick={() => onSocial("tiktok")}
                        disabled={!!socialBusy || submitting}
                      />
                    </div>

                    {socialBusy && (
                      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[12px] text-white/70">
                        <Spinner />
                        <span>Continuing with {providerLabel(socialBusy)}…</span>
                      </div>
                    )}

                    {socialNoAccount && (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[12px] leading-5 text-white/70">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-white/80 font-semibold">
                              {socialNoAccount.message}
                            </div>
                            <div className="mt-1 text-white/60">
                              If you’re new, create an account to continue.
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/register?from=${encodeURIComponent(
                                  `login_${socialNoAccount.provider}`
                                )}`
                              )
                            }
                            className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/85 transition hover:bg-white/8 active:scale-[0.99]"
                          >
                            Create account
                          </button>
                        </div>
                      </div>
                    )}

                    <Divider label="OR" />

                    {/* EMAIL */}
                    <form onSubmit={onSubmit} className="grid gap-4">
                      <Field
                        id="email"
                        label="Email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="you@domain.com"
                        value={email}
                        onChange={setEmail}
                        inputRef={emailRef}
                        onFocus={onFieldFocus}
                      />

                      <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-[12px] font-medium text-white/75" htmlFor="password">
                            Password
                          </label>
                          <Link
                            href="/forgot-password"
                            className="text-[12px] text-white/55 transition hover:text-white/80"
                          >
                            Forgot?
                          </Link>
                        </div>

                        <input
                          ref={(el) => {
                            passRef.current = el;
                          }}
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onFocus={(e) => onFieldFocus(e.currentTarget)}
                          placeholder="••••••••"
                          className={[
                            "h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-[16px] sm:text-[14px]",
                            "text-white/90 outline-none placeholder:text-white/35 transition focus:border-white/20 focus:bg-white/[0.06]",
                          ].join(" ")}
                        />
                      </div>

                      <label className="flex items-center justify-between gap-3 pt-1 text-[12px] text-white/65">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={remember}
                            onChange={(e) => setRemember(e.target.checked)}
                            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-white/80"
                          />
                          Remember me
                        </span>
                        <span className="text-[11px] text-white/45">Min 6 characters</span>
                      </label>

                      {formError && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[12px] leading-5 text-white/70">
                          <div className="flex items-start justify-between gap-3">
                            <div className="whitespace-pre-wrap break-words">{formError}</div>
                            <button
                              type="button"
                              onClick={() => router.push("/register?from=login_email")}
                              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 transition hover:bg-white/8 active:scale-[0.99]"
                            >
                              Sign up
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={!canSubmit}
                        className={[
                          "group relative h-11 w-full overflow-hidden rounded-2xl border text-[13px] font-semibold tracking-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 active:scale-[0.99]",
                          canSubmit
                            ? "border-white/10 bg-white/10 text-white/90 hover:bg-white/12"
                            : "cursor-not-allowed border-white/10 bg-white/[0.06] text-white/45",
                        ].join(" ")}
                      >
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                          style={{
                            background:
                              "radial-gradient(140px 90px at 35% 45%, rgba(167,139,250,0.40), transparent 70%), radial-gradient(140px 90px at 70% 55%, rgba(94,234,212,0.24), transparent 72%)",
                          }}
                        />
                        <span className="relative inline-flex items-center justify-center gap-2">
                          {submitting ? (
                            <>
                              <Spinner />
                              Signing in
                            </>
                          ) : (
                            "Sign in"
                          )}
                        </span>
                      </button>
                    </form>

                    <div className="mt-5 text-center text-[12px] text-white/55">
                      Don’t have an account?{" "}
                      <Link
                        href="/register"
                        className="text-white/80 underline decoration-white/20 underline-offset-4 transition hover:text-white"
                      >
                        Create one
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-center text-[11px] text-white/45">
                  Need help?{" "}
                  <Link
                    href="/contact"
                    className="text-white/65 underline decoration-white/15 underline-offset-4 hover:text-white/80"
                  >
                    Contact support
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
