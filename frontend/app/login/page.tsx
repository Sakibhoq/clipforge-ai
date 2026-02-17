// frontend/app/login/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getApiBase } from "@/lib/api";

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

function EyeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12s-4 7.5-10.5 7.5S1.5 12 1.5 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M2 12s3.5-6.5 10-6.5c2.1 0 3.9.6 5.4 1.4M22 12s-3.5 6.5-10 6.5c-2.1 0-3.9-.6-5.4-1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10.2 10.2A3 3 0 0 0 12 15a3 3 0 0 0 1.8-.6"
        stroke="currentColor"
        strokeWidth="1.5"
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

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
      <path
        d="M7.5 7.5c2.7-1.1 6.3-1.1 9 0 1.7 2 2.7 4.3 2.9 6.9-2.1 1.6-4.2 2.2-6.4 2.4l-.8-1.2c.7-.1 1.4-.3 2.1-.6-2.4 1.1-4.9 1.1-7.3 0 .7.3 1.4.5 2.1.6l-.8 1.2c-2.2-.2-4.3-.8-6.4-2.4.2-2.6 1.2-4.9 2.9-6.9Z"
        fill="rgba(255,255,255,0.86)"
      />
      <circle cx="9.3" cy="12" r="1.2" fill="rgba(0,0,0,0.7)" />
      <circle cx="14.7" cy="12" r="1.2" fill="rgba(0,0,0,0.7)" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
      <path
        d="M22 7.5s-.2-1.6-.8-2.3c-.7-.9-1.5-.9-1.9-1-2.7-.2-6.8-.2-6.8-.2h-.1s-4.1 0-6.8.2c-.4 0-1.2.1-1.9 1C3 6 2.8 7.5 2.8 7.5S2.6 9.3 2.6 11v1.6c0 1.7.2 3.5.2 3.5s.2 1.6.8 2.3c.7.9 1.7.9 2.1 1 1.5.1 6.3.2 6.3.2s4.1 0 6.8-.2c.4 0 1.2-.1 1.9-1 .6-.7.8-2.3.8-2.3s.2-1.8.2-3.5V11c0-1.7-.2-3.5-.2-3.5Z"
        fill="rgba(255,255,255,0.86)"
      />
      <path d="M10 9.2 15.4 12 10 14.8V9.2Z" fill="rgba(0,0,0,0.75)" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        rx="4"
        stroke="rgba(255,255,255,0.86)"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3.4" stroke="rgba(255,255,255,0.86)" strokeWidth="1.6" />
      <circle cx="16.6" cy="7.6" r="1" fill="rgba(255,255,255,0.86)" />
    </svg>
  );
}

type Provider = "google" | "facebook" | "instagram" | "tiktok";
type OAuthProvidersResponse = {
  providers?: Array<{ provider?: string; configured?: boolean }>;
};

const AUTH_PROVIDER_ORDER: Provider[] = ["google", "facebook", "instagram", "tiktok"];

function providerLabel(provider: Provider) {
  if (provider === "google") return "Google";
  if (provider === "facebook") return "Facebook";
  if (provider === "instagram") return "Instagram";
  return "TikTok";
}

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === "google") return <GoogleIcon />;
  if (provider === "facebook") return <FacebookIcon />;
  if (provider === "instagram") return <InstagramIcon />;
  if (provider === "tiktok") return <TikTokIcon />;
  return null;
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
type MeResponse = { name?: string | null; email: string; plan: string; credits: number };

function errToHelpfulMessage(err: any) {
  const status = err?.status;
  const url = err?.url;
  const detail = err?.detail;

  const detailStr = typeof detail === "string" ? detail.trim() : "";
  const detailLower = detailStr.toLowerCase();
  const urlStr = typeof url === "string" ? url : "";
  const isProd = process.env.NODE_ENV === "production";

  // Auth errors should be user-friendly (no DevTools/CORS/cookie debugging).
  if (status === 401) {
    if (detailLower.includes("account disabled")) {
      return "This account is disabled. Contact support if you think this is a mistake.";
    }

    if (detailLower.includes("not authenticated")) {
      // If login succeeded but /auth/me failed (cookie blocked), keep this simple for users.
      if (isProd) return "Sign-in didn’t complete. Please try again.";

      // Dev-only: keep some useful debugging hints.
      return [
        "Not authenticated.",
        "",
        "Dev hint: browser did not store/send the cf_token cookie.",
        "Check these in DevTools → Network:",
        `- POST /auth/login response has Set-Cookie (cf_token)`,
        `- Request URL for /auth/login and /auth/me are the SAME backend origin`,
        `- Response has Access-Control-Allow-Credentials: true`,
        `- Access-Control-Allow-Origin matches your frontend origin exactly`,
        urlStr ? `\nDebug: ${status ?? "ERR"} from ${urlStr}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    // Default 401 (e.g. invalid credentials)
    return "Incorrect email or password.";
  }

  if (Array.isArray(detail)) {
    const msgs = detail.map((x: any) => x?.msg).filter(Boolean);
    if (msgs.length) return msgs.join(" • ");
  }

  if (detailStr) {
    if (detailLower.includes("real email") || detailLower.includes("deliverable email")) {
      return "Please use a real email address.";
    }
    return detailStr;
  }

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

function LoginPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const nextRaw = sp.get("next") || "/app";
  const nextPath = useMemo(() => {
    if (!nextRaw.startsWith("/")) return "/app";
    if (nextRaw.startsWith("//")) return "/app";
    if (nextRaw.startsWith("/login") || nextRaw.startsWith("/register")) return "/app";
    return nextRaw;
  }, [nextRaw]);

  const [checking, setChecking] = useState(true);
  const [checkSlow, setCheckSlow] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [socialBusy, setSocialBusy] = useState<Provider | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<Provider[]>(["google"]);

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
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3500);
    const softTimeout = window.setTimeout(() => {
      if (!mounted) return;
      setCheckSlow(true);
      setChecking(false);
    }, 2200);
    const hardTimeout = window.setTimeout(() => {
      if (!mounted) return;
      setChecking(false);
    }, 4800);

    async function checkMe() {
      try {
        await apiFetch<MeResponse>("/auth/me", { signal: controller.signal });
        if (!mounted) return;
        window.location.replace(nextPath);
      } catch {
        if (!mounted) return;
        setChecking(false);
      } finally {
        window.clearTimeout(timeout);
        window.clearTimeout(softTimeout);
        window.clearTimeout(hardTimeout);
      }
    }

    checkMe();
    return () => {
      mounted = false;
      controller.abort();
      window.clearTimeout(timeout);
      window.clearTimeout(softTimeout);
      window.clearTimeout(hardTimeout);
    };
  }, [router, nextPath]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await apiFetch<OAuthProvidersResponse>("/auth/oauth/providers");
        const configured = (data?.providers || [])
          .filter((p) => p?.configured)
          .map((p) => p?.provider)
          .filter((p): p is Provider =>
            AUTH_PROVIDER_ORDER.includes(p as Provider)
          );
        if (mounted && configured.length) {
          const ordered = AUTH_PROVIDER_ORDER.filter((p) => configured.includes(p));
          setOauthProviders(ordered);
        }
      } catch {
        // Keep fallback provider list.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);


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

  function socialErrorMessage(e: any): string {
    if (!e) return "Social login failed. Please try again.";
    const detail = e?.detail || e?.message || e?.error;
    if (typeof detail === "string") return detail;
    try {
      return JSON.stringify(detail);
    } catch {
      return "Social login failed. Please try again.";
    }
  }

  async function onSocial(provider: Provider) {
    setFormError(null);
    setSocialError(null);
    setSocialBusy(provider);
    try {
      const base = getApiBase();
      const next = encodeURIComponent(nextPath || "/app");
      const startPath = `/auth/oauth/${provider}/start?next=${next}`;
      const url = base === "/api" ? startPath : `${base}${startPath}`;
      window.location.href = url;
    } catch (e) {
      setSocialError(socialErrorMessage(e));
    } finally {
      setSocialBusy(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSocialError(null);

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

      window.location.replace(nextPath);
    } catch (err: any) {
      setFormError(errToHelpfulMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // shared root styles: no horizontal overflow + safe-area padding.
  const rootStyle: React.CSSProperties = {
    minHeight: "100dvh",
    paddingTop: "env(safe-area-inset-top)",
    paddingBottom: "env(safe-area-inset-bottom)",
  };

  if (checking) {
    return (
      <div className="relative min-h-screen overflow-x-hidden [max-width:100vw]" style={rootStyle}>
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
    <div className="relative min-h-screen overflow-x-hidden [max-width:100vw]" style={rootStyle}>
      {/* Layout: mobile-first scroll; desktop can look centered without forcing 100vh traps */}
      <main className="relative mx-auto max-w-6xl px-6 pb-16 pt-10 sm:pt-12 overflow-visible">
        <section className="surface relative overflow-visible p-6 sm:p-8 md:p-12">
          <div className="absolute inset-0">
            <div className="aurora opacity-60" />
            <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
          </div>

          <div className="relative">
            {/* TOP ROW */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs text-white/55">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-white/80 transition hover:bg-white/10"
                >
                  <span aria-hidden="true">←</span> Back
                </Link>
                <span>• Sign in</span>
              </div>
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
                {checkSlow && (
                  <div className="mt-3 text-xs text-white/50">
                    Session check is taking longer than usual — you can continue below.
                  </div>
                )}
                <div className="mt-5 text-xs text-white/55">
                  Providers: <H>{oauthProviders.map(providerLabel).join(", ")}</H>
                </div>
              </div>

              {/* RIGHT */}
              <div className="lg:col-span-7">
                <div className="surface-soft relative overflow-visible p-5 sm:p-6 md:p-7">
                  <HoverSheen />

                  <div className="relative">
                    <div className="text-sm font-semibold text-white/85">Sign in</div>
                    <div className="mt-1 text-xs text-white/55">
                      Continue with a provider, or use email.
                    </div>

                    {/* SOCIAL */}
                    <div className="mt-5 grid gap-2">
                      {oauthProviders.map((p) => (
                        <ProviderButton
                          key={p}
                          provider={p}
                          onClick={() => onSocial(p)}
                          disabled={!!socialBusy || submitting}
                        />
                      ))}
                    </div>

                    {socialBusy && (
                      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[12px] text-white/70">
                        <Spinner />
                        <span>Continuing with {providerLabel(socialBusy)}…</span>
                      </div>
                    )}

                    {socialError && (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[12px] leading-5 text-white/70">
                        {socialError}
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

                        <div className="relative">
                          <input
                            ref={(el) => {
                              passRef.current = el;
                            }}
                            id="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onFocus={(e) => onFieldFocus(e.currentTarget)}
                            placeholder="••••••••"
                            className={[
                              "h-11 w-full rounded-2xl border border-white/10 bg-white/5 pl-4 pr-11 text-[16px] sm:text-[14px]",
                              "text-white/90 outline-none placeholder:text-white/35 transition focus:border-white/20 focus:bg-white/[0.06]",
                            ].join(" ")}
                          />

                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            className={[
                              "absolute right-2 top-1/2 -translate-y-1/2",
                              "inline-flex h-9 w-9 items-center justify-center rounded-xl",
                              "text-white/45 transition hover:text-white/80 hover:bg-white/[0.06]",
                              "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                              "active:scale-[0.98]",
                            ].join(" ")}
                            tabIndex={0}
                          >
                            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                          </button>
                        </div>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-white/60">Loading…</div>}>
      <LoginPageInner />
    </Suspense>
  );
}
