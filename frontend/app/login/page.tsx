// frontend/app/login/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

/* =========================================================
   Clipforge — Login (Cookie Auth, Production)
   - Dev/Codespaces: cookie lives on backend origin, middleware can't see it
     -> We do a client-side /auth/me check to redirect if already authed.
   - POST /auth/login sets HttpOnly cf_token cookie (backend origin)
   - NO token storage in JS
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
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 animate-spin"
      fill="none"
      aria-hidden="true"
    >
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
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
    >
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
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M14 8.5V7.2c0-.7.5-1.2 1.2-1.2H17V3.5h-2c-2.2 0-3.5 1.4-3.5 3.6v1.4H9.5V11H11.5v9.5h2.8V11h2.3l.4-2.5H14Z"
        fill="rgba(255,255,255,0.86)"
      />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
    >
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
        "group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-[13px] font-semibold text-white/85 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
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
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-[12px] font-medium text-white/75" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-[14px] text-white/90 outline-none placeholder:text-white/35 transition focus:border-white/20 focus:bg-white/[0.06]"
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

  async function onSocial(provider: Provider) {
    setFormError(null);
    setSocialNoAccount(null);
    setSocialBusy(provider);
    try {
      await new Promise((r) => setTimeout(r, 420));
      setSocialNoAccount({
        provider,
        message: `No ${providerLabel(provider)} account found for Clipforge.`,
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
    if (password.length < 6)
      return setFormError("Password must be at least 6 characters.");

    setSubmitting(true);
    try {
      // apiFetch now handles JSON + credentials
      await apiFetch<LoginOk>("/auth/login", {
        method: "POST",
        body: { email: em, password },
      });

      // ✅ Fail fast if cookie wasn’t set / session isn’t valid yet
      await apiFetch<MeResponse>("/auth/me");

      router.push(nextPath);
      router.refresh();
    } catch (err: any) {
      // FastAPI often sends { detail: "..." } OR { detail: [{msg...}, ...] }
      const d = err?.detail;
      if (typeof d === "string") return setFormError(d);
      if (Array.isArray(d)) {
        const msgs = d.map((x: any) => x?.msg).filter(Boolean);
        return setFormError(
          msgs.length ? msgs.join(" • ") : "Unable to sign in."
        );
      }
      setFormError(err?.message || "Unable to sign in. Check email/password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-plain relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 opacity-[0.55]">
            <div className="aurora" />
          </div>
        </div>
        <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-16">
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
    <div className="min-h-screen bg-plain relative">
      {/* PAGE AURORA */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_10%,rgba(255,255,255,0.06),transparent_62%)]" />
        <div className="absolute inset-0 opacity-[0.55]">
          <div className="aurora" />
        </div>
        <div className="absolute -top-40 left-[-20%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.22),transparent_62%)] blur-3xl" />
        <div className="absolute top-24 right-[-18%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.18),transparent_64%)] blur-3xl" />
        <div className="absolute bottom-[-18%] left-[10%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.14),transparent_65%)] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-12">
        <section className="surface relative overflow-hidden p-8 md:p-12">
          <div className="absolute inset-0">
            <div className="aurora opacity-60" />
            <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
          </div>

          <div className="relative">
            {/* TOP ROW */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-white/55">• Sign in</div>
              <div className="flex items-center gap-3 text-[12px] text-white/60">
                <span className="hidden sm:inline">New here?</span>
                <Link
                  href="/register"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/85 transition hover:bg-white/8"
                >
                  Create account
                </Link>
              </div>
            </div>

            <div className="mt-6 grid gap-10 lg:grid-cols-12">
              {/* LEFT */}
              <div className="lg:col-span-5">
                <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                  Welcome back.
                </h1>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-white/65 md:text-[15px]">
                  Sign in to manage uploads, jobs, and clips.
                </p>
                <div className="mt-6 text-xs text-white/55">
                  Providers: <H>Google</H>, <H>Apple</H>, <H>Facebook</H>,{" "}
                  <H>TikTok</H>
                </div>
              </div>

              {/* RIGHT */}
              <div className="lg:col-span-7">
                <div className="surface-soft relative overflow-hidden p-6 md:p-7">
                  <HoverSheen />

                  <div className="relative">
                    <div className="text-sm font-semibold text-white/85">
                      Sign in
                    </div>
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
                        <span>
                          Continuing with {providerLabel(socialBusy)}…
                        </span>
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
                            className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/85 transition hover:bg-white/8"
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
                      />

                      <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <label
                            className="text-[12px] font-medium text-white/75"
                            htmlFor="password"
                          >
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
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-[14px] text-white/90 outline-none placeholder:text-white/35 transition focus:border-white/20 focus:bg-white/[0.06]"
                        />
                      </div>

                      <label className="flex items-center justify-between gap-3 pt-1 text-[12px] text-white/65">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={remember}
                            onChange={(e) => setRemember(e.target.checked)}
                            className="h-4 w-4 rounded border-white/20 bg-white/5"
                          />
                          Remember me
                        </span>
                        <span className="text-[11px] text-white/45">
                          Min 6 characters
                        </span>
                      </label>

                      {formError && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[12px] leading-5 text-white/70">
                          <div className="flex items-start justify-between gap-3">
                            <div>{formError}</div>
                            <button
                              type="button"
                              onClick={() =>
                                router.push("/register?from=login_email")
                              }
                              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 transition hover:bg-white/8"
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
                          "group relative h-11 w-full overflow-hidden rounded-2xl border text-[13px] font-semibold tracking-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
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
