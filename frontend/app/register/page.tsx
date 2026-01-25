// frontend/app/register/page.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

/* =========================================================
   Orbito — Register (Cookie Auth, Production)
   - POST /auth/register (creates user)
   - POST /auth/login (sets HttpOnly cf_token)
   - Redirects to /app after success
   - Social buttons remain UI-only (OAuth later) with no fake success
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
  onFocus?: (el: HTMLInputElement) => void;
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

type RegisterOk = { message: string };
type LoginOk = { ok: true };

function errToMessage(err: any) {
  const detail = err?.detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((x: any) => x?.msg).filter(Boolean);
    if (msgs.length) return msgs.join(" • ");
  }
  if (typeof detail === "string" && detail.trim()) return detail;
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return "Unable to create account. Try a different email.";
}

export default function RegisterPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"social" | "email">("social");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(true);

  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // mobile polish: keep focused input visible & avoid awkward jumps
  const lastFocusTsRef = useRef<number>(0);

  const canSubmitEmail = useMemo(() => {
    const n = name.trim();
    const e = email.trim();
    return n.length >= 2 && e.includes("@") && password.length >= 6 && agree && !submitting;
  }, [name, email, password, agree, submitting]);

  function onFieldFocus(target: HTMLInputElement) {
    lastFocusTsRef.current = Date.now();
    window.setTimeout(() => {
      if (Date.now() - lastFocusTsRef.current > 900) return;
      try {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {
        // ignore
      }
    }, 220);
  }

  function onSocial(provider: Provider) {
    // UI-only: no fake success.
    setFormError(`Continue with ${providerLabel(provider)} is being added.`);
  }

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const n = name.trim();
    const em = email.trim();

    if (n.length < 2) return setFormError("Enter your name.");
    if (!em || !em.includes("@")) return setFormError("Enter a valid email.");
    if (password.length < 6) return setFormError("Password must be at least 6 characters.");
    if (!agree) return setFormError("You must accept the Terms and Privacy Policy.");

    setSubmitting(true);
    try {
      // 1) Create user
      await apiFetch<RegisterOk>("/auth/register", {
        method: "POST",
        body: { email: em, password },
      });

      // 2) Immediately login to set HttpOnly cookie
      await apiFetch<LoginOk>("/auth/login", {
        method: "POST",
        body: { email: em, password },
      });

      router.push("/app");
      router.refresh();
    } catch (err: any) {
      setFormError(errToMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const rootStyle: React.CSSProperties = {
    minHeight: "100svh",
    paddingTop: "env(safe-area-inset-top)",
    paddingBottom: "env(safe-area-inset-bottom)",
  };

  return (
    <div className="relative overflow-x-hidden [max-width:100vw]" style={rootStyle}>
      {/* PAGE AURORA (mobile-safe) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_10%,rgba(255,255,255,0.06),transparent_62%)]" />
        <div className="absolute inset-0 opacity-[0.48] sm:opacity-[0.55]">
          <div className="aurora" />
        </div>

        {/* blobs: vmin positioning reduces iOS overflow edge cases */}
        <div className="absolute -top-[22vmin] left-[-18vmin] h-[54vmin] w-[54vmin] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.20),transparent_62%)] blur-3xl" />
        <div className="absolute top-[10vmin] right-[-18vmin] h-[58vmin] w-[58vmin] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.17),transparent_64%)] blur-3xl" />
        <div className="absolute bottom-[-24vmin] left-[6vmin] h-[64vmin] w-[64vmin] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.13),transparent_65%)] blur-3xl" />

        {/* grid: disable on small screens (can shimmer / seams on iOS) */}
        <div className="hidden sm:block absolute inset-0 opacity-[0.08] mix-blend-overlay [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-12">
        <section className="surface relative overflow-hidden p-6 sm:p-8 md:p-12">
          <div className="absolute inset-0">
            <div className="aurora opacity-60" />
            <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
          </div>

          <div className="relative">
            {/* TOP ROW */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-white/55">• Create account</div>
              <div className="flex items-center gap-3 text-[12px] text-white/60">
                <span className="hidden sm:inline">Already have an account?</span>
                <Link
                  href="/login"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/85 transition hover:bg-white/8 active:scale-[0.99]"
                >
                  Sign in
                </Link>
              </div>
            </div>

            <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-10">
              {/* LEFT */}
              <div className="lg:col-span-5">
                <h1 className="text-[34px] leading-[1.05] font-semibold tracking-tight sm:text-4xl md:text-5xl">
                  Join <span className="grad-text">Orbito</span>.
                </h1>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-white/65 md:text-[15px]">
                  Sign up with a provider or email. You’ll be ready to upload and start generating
                  clips.
                </p>

                <div className="mt-6 text-xs text-white/55">
                  Providers: <H>Google</H>, <H>Apple</H>, <H>Facebook</H>, <H>TikTok</H>
                </div>
              </div>

              {/* RIGHT */}
              <div className="lg:col-span-7">
                <div className="surface-soft relative overflow-hidden p-5 sm:p-6 md:p-7">
                  <HoverSheen />

                  <div className="relative">
                    <div className="text-sm font-semibold text-white/85">Sign up</div>
                    <div className="mt-1 text-xs text-white/55">Choose Social or Email.</div>

                    {/* MODE TOGGLE */}
                    <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setFormError(null);
                          setMode("social");
                        }}
                        className={[
                          "h-10 rounded-xl text-[12px] font-semibold transition",
                          mode === "social"
                            ? "bg-white/10 text-white/90"
                            : "text-white/60 hover:text-white/80",
                        ].join(" ")}
                      >
                        Social
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormError(null);
                          setMode("email");
                        }}
                        className={[
                          "h-10 rounded-xl text-[12px] font-semibold transition",
                          mode === "email"
                            ? "bg-white/10 text-white/90"
                            : "text-white/60 hover:text-white/80",
                        ].join(" ")}
                      >
                        Email
                      </button>
                    </div>

                    {mode === "social" ? (
                      <div className="mt-4 grid gap-2">
                        <ProviderButton
                          provider="google"
                          onClick={() => onSocial("google")}
                          disabled={submitting}
                        />
                        <ProviderButton
                          provider="apple"
                          onClick={() => onSocial("apple")}
                          disabled={submitting}
                        />
                        <ProviderButton
                          provider="facebook"
                          onClick={() => onSocial("facebook")}
                          disabled={submitting}
                        />
                        <ProviderButton
                          provider="tiktok"
                          onClick={() => onSocial("tiktok")}
                          disabled={submitting}
                        />

                        {formError && (
                          <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[12px] leading-5 text-white/70">
                            {formError}
                          </div>
                        )}
                      </div>
                    ) : (
                      <form onSubmit={onEmailSubmit} className="mt-4 grid gap-4">
                        <Field
                          id="name"
                          label="Name"
                          autoComplete="name"
                          placeholder="Your name"
                          value={name}
                          onChange={setName}
                          onFocus={onFieldFocus}
                        />
                        <Field
                          id="email"
                          label="Email"
                          autoComplete="email"
                          inputMode="email"
                          placeholder="you@domain.com"
                          value={email}
                          onChange={setEmail}
                          onFocus={onFieldFocus}
                        />

                        <div className="grid gap-2">
                          <label className="text-[12px] font-medium text-white/75" htmlFor="password">
                            Password
                          </label>

                          <div className="relative">
                            <input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              autoComplete="new-password"
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
                            >
                              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                          </div>
                        </div>

                        <label className="flex items-start gap-2 pt-1 text-[12px] text-white/65">
                          <input
                            type="checkbox"
                            checked={agree}
                            onChange={(e) => setAgree(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-white/80"
                          />
                          <span>
                            I agree to the{" "}
                            <Link
                              href="/terms"
                              className="text-white/75 underline decoration-white/15 underline-offset-4 hover:text-white/90"
                            >
                              Terms
                            </Link>{" "}
                            and{" "}
                            <Link
                              href="/privacy"
                              className="text-white/75 underline decoration-white/15 underline-offset-4 hover:text-white/90"
                            >
                              Privacy Policy
                            </Link>
                            .
                          </span>
                        </label>

                        {formError && (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[12px] leading-5 text-white/70">
                            {formError}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={!canSubmitEmail}
                          className={[
                            "group relative h-11 w-full overflow-hidden rounded-2xl border text-[13px] font-semibold tracking-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 active:scale-[0.99]",
                            canSubmitEmail
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
                                Creating account
                              </>
                            ) : (
                              "Create account"
                            )}
                          </span>
                        </button>
                      </form>
                    )}

                    <div className="mt-5 text-center text-[12px] text-white/55">
                      Already have an account?{" "}
                      <Link
                        href="/login"
                        className="text-white/80 underline decoration-white/20 underline-offset-4 transition hover:text-white"
                      >
                        Sign in
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
