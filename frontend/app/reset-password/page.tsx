// frontend/app/reset-password/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function isStrongPassword(pw: string) {
  const s = pw || "";
  const length = s.length >= 8;
  const upper = /[A-Z]/.test(s);
  const lower = /[a-z]/.test(s);
  const number = /[0-9]/.test(s);
  const special = /[^A-Za-z0-9]/.test(s); // special character
  return { length, upper, lower, number, special, ok: length && upper && lower && number && special };
}

function Icon({
  name,
  className = "",
}: {
  name: "lock" | "eye" | "eyeOff" | "check" | "x" | "arrow" | "key";
  className?: string;
}) {
  const common = `inline-block ${className}`;
  if (name === "lock") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M7.5 11V8.8A4.5 4.5 0 0 1 12 4.3a4.5 4.5 0 0 1 4.5 4.5V11"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6.8 11h10.4c.9 0 1.6.7 1.6 1.6v6.6c0 .9-.7 1.6-1.6 1.6H6.8c-.9 0-1.6-.7-1.6-1.6v-6.6c0-.9.7-1.6 1.6-1.6Z"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "key") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M14.5 9.5a4.5 4.5 0 1 0-1.3 3.2L16 15.5h2l.8.8V18h-1.7l-.6-.6-.7.7.7.7V20H14l-2.7-2.7"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "eye") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M2.2 12s3.6-7 9.8-7 9.8 7 9.8 7-3.6 7-9.8 7-9.8-7-9.8-7Z"
          stroke="rgba(255,255,255,0.70)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
          stroke="rgba(255,255,255,0.70)"
          strokeWidth="1.8"
        />
      </svg>
    );
  }
  if (name === "eyeOff") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M3 5l18 18"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M2.2 12s3.6-7 9.8-7c2 0 3.7.6 5.1 1.5M21.8 12s-3.6 7-9.8 7c-2.2 0-4.1-.7-5.7-1.8"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d="M10.2 10.2A3.2 3.2 0 0 0 12 15.2c.4 0 .8-.1 1.2-.2"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M20 7L10.2 16.8 4.8 11.4"
          stroke="rgba(255,255,255,0.82)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "x") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M7 7l10 10M17 7 7 17"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
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

function Rule({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span
        className={cx(
          "inline-flex h-5 w-5 items-center justify-center rounded-full border",
          ok ? "border-white/15 bg-white/[0.10]" : "border-white/10 bg-white/[0.03]"
        )}
      >
        {ok ? <Icon name="check" className="opacity-90" /> : <Icon name="x" className="opacity-75" />}
      </span>
      <span className={cx(ok ? "text-white/75" : "text-white/50")}>{label}</span>
    </div>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") || "";

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [show2, setShow2] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rules = useMemo(() => isStrongPassword(pw), [pw]);
  const match = useMemo(() => pw.length > 0 && pw2.length > 0 && pw === pw2, [pw, pw2]);

  const canSubmit = useMemo(() => {
    return !!token && rules.ok && match && !submitting;
  }, [token, rules.ok, match, submitting]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!token) return setErr("Missing reset token. Request a new reset link.");
    if (!rules.ok) return setErr("Password doesn’t meet the requirements.");
    if (!match) return setErr("Passwords do not match.");

    setSubmitting(true);
    try {
      // UI-only for now (backend later)
      await new Promise((r) => setTimeout(r, 420));
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-plain relative">
      {/* PAGE-LEVEL AURORA (matches forgot/login) */}
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
          {/* subtle aurora wash inside */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-10 opacity-35 blur-2xl"
            style={{
              background:
                "radial-gradient(180px 140px at 25% 30%, rgba(167,139,250,0.18), transparent 72%), radial-gradient(200px 160px at 80% 45%, rgba(125,211,252,0.16), transparent 72%), radial-gradient(200px 160px at 50% 88%, rgba(45,212,191,0.12), transparent 72%)",
            }}
          />

          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-white/70">
                <span className="pill-dot" style={{ width: 6, height: 6 }} />
                Reset password
              </div>

              <Link href="/login" className="text-[12px] text-white/55 transition hover:text-white/80">
                Back to login
              </Link>
            </div>

            <h1 className="mt-4 text-xl font-semibold text-white/90">Create a new password</h1>
            <p className="mt-1 text-sm leading-relaxed text-white/60">
              Choose a strong password to secure your account.
            </p>

            {!token ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
                    <Icon name="lock" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white/85">Reset link is invalid</div>
                    <div className="mt-1 text-sm leading-relaxed text-white/60">
                      This page needs a valid reset token. Request a new link from{" "}
                      <Link
                        href="/forgot-password"
                        className="text-white/75 underline decoration-white/15 underline-offset-4 hover:text-white/90"
                      >
                        Forgot password
                      </Link>
                      .
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-2">
                  <Link href="/forgot-password" className="btn-solid-dark w-full py-3 text-sm text-center">
                    Request new reset link
                    <span className="inline-flex align-middle ml-1">
                      <Icon name="arrow" />
                    </span>
                  </Link>
                  <Link href="/login" className="btn-ghost w-full py-3 text-sm text-center">
                    Back to login
                  </Link>
                </div>
              </div>
            ) : done ? (
              <>
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
                      <Icon name="check" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white/85">Password updated</div>
                      <div className="mt-1 text-sm leading-relaxed text-white/60">
                        You can now sign in with your new password.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="btn-solid-dark w-full py-3 text-sm"
                  >
                    Go to login
                    <span className="inline-flex align-middle ml-1">
                      <Icon name="arrow" />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDone(false);
                      setPw("");
                      setPw2("");
                      setErr(null);
                    }}
                    className="btn-ghost w-full py-3 text-sm"
                  >
                    Reset again
                  </button>
                </div>

                <div className="mt-4 text-[12px] text-white/45">
                  Backend reset tokens + email sending will be wired after auth is finalized.
                </div>
              </>
            ) : (
              <>
                {/* FORM */}
                <form onSubmit={onSubmit} className="mt-6 grid gap-4">
                  {/* NEW PASSWORD */}
                  <div>
                    <label className="block text-[12px] font-medium text-white/75">New password</label>
                    <div className="relative mt-2">
                      {/* left icon */}
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-95">
                        <Icon name="key" />
                      </span>

                      <input
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        type={show ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="field !pl-12 !pr-12"
                      />

                      {/* right eye */}
                      <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/70 hover:bg-white/[0.06]"
                        aria-label={show ? "Hide password" : "Show password"}
                      >
                        {show ? <Icon name="eyeOff" /> : <Icon name="eye" />}
                      </button>
                    </div>
                  </div>

                  {/* CONFIRM */}
                  <div>
                    <label className="block text-[12px] font-medium text-white/75">Confirm password</label>
                    <div className="relative mt-2">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-95">
                        <Icon name="lock" />
                      </span>

                      <input
                        value={pw2}
                        onChange={(e) => setPw2(e.target.value)}
                        type={show2 ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="field !pl-12 !pr-12"
                      />

                      <button
                        type="button"
                        onClick={() => setShow2((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/70 hover:bg-white/[0.06]"
                        aria-label={show2 ? "Hide password" : "Show password"}
                      >
                        {show2 ? <Icon name="eyeOff" /> : <Icon name="eye" />}
                      </button>
                    </div>

                    {pw2.length > 0 && !match ? (
                      <div className="mt-2 text-[12px] text-white/45">Passwords do not match.</div>
                    ) : null}
                  </div>

                  {/* RULES */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="text-[12px] font-semibold text-white/75">Password requirements</div>
                    <div className="mt-3 grid gap-2">
                      <Rule ok={rules.length} label="At least 8 characters" />
                      <Rule ok={rules.upper} label="1 uppercase letter" />
                      <Rule ok={rules.lower} label="1 lowercase letter" />
                      <Rule ok={rules.number} label="1 number" />
                      <Rule ok={rules.special} label="1 special character" />
                    </div>

                    <div className="mt-3 h-px w-full bg-white/10" />
                    <div className="mt-3 text-[12px] text-white/50">
                      We’ll wire validation + reset tokens on the backend next.
                    </div>
                  </div>

                  {err ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[12px] leading-5 text-white/70">
                      {err}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className={cx(
                      "btn-solid-dark w-full py-3 text-sm",
                      !canSubmit && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {submitting ? "Updating…" : "Update password"}
                  </button>

                  <div className="flex items-center justify-between text-[12px] text-white/50">
                    <span>Security-first: we don’t reveal account existence.</span>
                    <Link href="/contact" className="text-white/60 hover:text-white/80">
                      Need help?
                    </Link>
                  </div>
                </form>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
