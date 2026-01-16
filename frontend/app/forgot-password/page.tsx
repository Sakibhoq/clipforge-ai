"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function Icon({
  name,
  className = "",
}: {
  name: "mail" | "check" | "arrow";
  className?: string;
}) {
  const common = `inline-block ${className}`;
  if (name === "mail") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M4.5 7.5h15v9h-15v-9Z"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M5.5 8.5 12 13l6.5-4.5"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M20 7L10.2 16.8 4.8 11.4"
          stroke="rgba(255,255,255,0.80)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path
        d="M10 7l5 5-5 5"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const okEmail = useMemo(() => isValidEmail(email), [email]);

  function submit() {
    // UI-only for now (backend + email later)
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-plain relative">
      {/* PAGE-LEVEL AURORA */}
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

      <main className="relative mx-auto flex min-h-screen max-w-lg items-center px-6 py-14">
        <section className="surface-soft relative w-full overflow-hidden p-6 md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-10 opacity-35 blur-2xl"
            style={{
              background:
                "radial-gradient(180px 140px at 25% 30%, rgba(167,139,250,0.18), transparent 72%), radial-gradient(200px 160px at 80% 45%, rgba(125,211,252,0.16), transparent 72%), radial-gradient(200px 160px at 50% 88%, rgba(45,212,191,0.12), transparent 72%)",
            }}
          />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-white/70">
              <span className="pill-dot" style={{ width: 6, height: 6 }} />
              Password reset
            </div>

            <h1 className="mt-4 text-xl font-semibold text-white/90">Forgot your password?</h1>
            <p className="mt-1 text-sm leading-relaxed text-white/60">
              Enter your account email. If it exists, we’ll send a reset link.
            </p>

            {!submitted ? (
              <>
                <div className="mt-6">
                  <label className="block text-[12px] font-medium text-white/75">
                    Email
                  </label>
                  <div className="relative mt-2">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-90">
                      <Icon name="mail" />
                    </span>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="field !pl-12"
                      inputMode="email"
                      autoComplete="email"
                    />
                  </div>

                  {!okEmail && email.length > 0 ? (
                    <div className="mt-2 text-[12px] text-white/45">Enter a valid email.</div>
                  ) : null}
                </div>

                <div className="mt-6 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!okEmail}
                    className={cx(
                      "btn-solid-dark w-full py-3 text-sm",
                      !okEmail && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    Send reset link
                  </button>

                  <Link href="/login" className="btn-ghost w-full py-3 text-sm text-center">
                    Back to login
                  </Link>
                </div>

                <div className="mt-4 text-[12px] text-white/45">
                  Email sending + reset tokens will be wired when backend auth is finished.
                </div>
              </>
            ) : (
              <>
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
                      <Icon name="check" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white/85">Check your email</div>
                      <div className="mt-1 text-sm leading-relaxed text-white/60">
                        If an account exists for <span className="text-white/80">{email}</span>, we sent a reset link.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2">
                  <Link href="/login" className="btn-solid-dark w-full py-3 text-sm text-center">
                    Back to login{" "}
                    <span className="inline-flex align-middle ml-1">
                      <Icon name="arrow" />
                    </span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="btn-ghost w-full py-3 text-sm"
                  >
                    Try a different email
                  </button>
                </div>

                <div className="mt-4 text-[12px] text-white/45">
                  For security, we never reveal whether an email exists.
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
