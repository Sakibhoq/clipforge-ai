"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

/* =========================================================
   Orbito — Change Password (Wired, Launch-Ready)
   - Calls POST /auth/password (cookie auth)
   - Real-time password rules:
     ✅ >= 8 chars
     ✅ 1 uppercase
     ✅ 1 lowercase
     ✅ 1 number
     ✅ 1 symbol
   - Mobile polish: 100svh, safe-area padding, full-width actions on small screens
   - Removes dev-only query params
========================================================= */

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function Icon({
  name,
  className = "",
}: {
  name: "lock" | "eye" | "eyeOff" | "chevLeft" | "info" | "check" | "x";
  className?: string;
}) {
  const common = `inline-block ${className}`;

  if (name === "lock") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M7.5 11V8.6a4.5 4.5 0 0 1 9 0V11"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M7 11h10a2 2 0 0 1 2 2v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6a2 2 0 0 1 2-2Z"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12 15.2v2.6"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "eye") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (name === "eyeOff") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M4 5l16 16"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M10.2 10.6A3.2 3.2 0 0 0 12 15.2c1.77 0 3.2-1.43 3.2-3.2 0-.53-.13-1.03-.36-1.47"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6.2 7.6C4 9.4 2.5 12 2.5 12s3.5 7 9.5 7c2.06 0 3.87-.5 5.36-1.26"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9.1 5.6A10.2 10.2 0 0 1 12 5c6 0 9.5 7 9.5 7s-1.1 2.2-3.4 4.2"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "chevLeft") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M15 6l-6 6 6 6"
          stroke="rgba(255,255,255,0.70)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M20 7L10.2 16.8 4.8 11.4"
          stroke="rgba(167,255,220,0.9)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "info") {
    return (
      <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.6"
        />
        <path
          d="M12 10.5v6"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12 7.5h.01"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // x
  return (
    <svg className={common} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="rgba(255,255,255,0.62)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RuleRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={cx("flex items-center gap-2 text-[12px]", ok ? "text-emerald-300/80" : "text-white/45")}>
      <span className={cx("inline-flex h-4 w-4 items-center justify-center", ok ? "" : "opacity-70")}>
        {ok ? <Icon name="check" className="h-4 w-4" /> : <span className="h-1.5 w-1.5 rounded-full bg-white/30" />}
      </span>
      <span>{label}</span>
    </div>
  );
}

function humanizeApiError(e: any): string {
  const detail = e?.detail;
  if (typeof detail === "string") return detail;

  const msg = e?.message;
  if (typeof msg === "string" && msg.trim()) return msg;

  if (e?.status === 401) return "Not authenticated or current password is incorrect.";
  if (e?.status === 400) return "Please check your input and try again.";
  return "Something went wrong. Please try again.";
}

export default function PasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [saved, setSaved] = useState<null | "ok">(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = useMemo(() => {
    return {
      length: (s: string) => s.length >= 8,
      upper: (s: string) => /[A-Z]/.test(s),
      lower: (s: string) => /[a-z]/.test(s),
      number: (s: string) => /[0-9]/.test(s),
      symbol: (s: string) => /[^A-Za-z0-9]/.test(s),
    };
  }, []);

  const rLength = rules.length(newPassword);
  const rUpper = rules.upper(newPassword);
  const rLower = rules.lower(newPassword);
  const rNumber = rules.number(newPassword);
  const rSymbol = rules.symbol(newPassword);

  const passwordOk = rLength && rUpper && rLower && rNumber && rSymbol;
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  const canSubmit = currentPassword.length > 0 && passwordOk && matches && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);

    try {
      await apiFetch<{ ok: boolean }>("/auth/password", {
        method: "POST",
        body: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });

      setSaved("ok");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);

      router.refresh();
      setTimeout(() => setSaved(null), 2000);
    } catch (e: any) {
      setError(humanizeApiError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100svh] pb-[max(16px,env(safe-area-inset-bottom))] grid gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm text-white/55">
            <Link href="/app/settings" className="inline-flex items-center gap-2 hover:text-white/75 transition">
              <Icon name="chevLeft" className="opacity-80" />
              Settings
            </Link>
            <span className="text-white/35">/</span>
            <span className="text-white/70">Password</span>
          </div>

          <div className="mt-3 text-lg font-semibold text-white/90">Change password</div>
          <div className="mt-1 text-sm text-white/60">Update your password for this account.</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/settings" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto">
            Back
          </Link>
        </div>
      </div>

      {/* Form card */}
      <div className="surface-soft relative overflow-hidden p-6">
        {/* subtle aurora wash */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-10 opacity-30 blur-2xl"
          style={{
            background:
              "radial-gradient(220px 150px at 22% 28%, rgba(167,139,250,0.16), transparent 72%), radial-gradient(240px 170px at 78% 42%, rgba(125,211,252,0.14), transparent 72%), radial-gradient(240px 170px at 50% 88%, rgba(45,212,191,0.11), transparent 72%)",
          }}
        />

        <div className="relative">
          <form onSubmit={onSubmit} className="grid gap-5">
            {/* Current */}
            <div>
              <div className="text-sm font-semibold text-white/85">Current password</div>
              <div className="mt-2 relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45">
                  <Icon name="lock" className="h-4 w-4" />
                </span>

                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  className="field !pl-14 pr-12"
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white/85 transition"
                  aria-label={showCurrent ? "Hide password" : "Show password"}
                >
                  <Icon name={showCurrent ? "eyeOff" : "eye"} />
                </button>
              </div>
            </div>

            {/* New */}
            <div>
              <div className="text-sm font-semibold text-white/85">New password</div>
              <div className="mt-2 relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45">
                  <Icon name="lock" className="h-4 w-4" />
                </span>

                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="field !pl-14 pr-12"
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white/85 transition"
                  aria-label={showNew ? "Hide password" : "Show password"}
                >
                  <Icon name={showNew ? "eyeOff" : "eye"} />
                </button>
              </div>

              <div className="mt-3 grid gap-1">
                <RuleRow ok={rLength} label="At least 8 characters" />
                <RuleRow ok={rUpper} label="1 uppercase letter" />
                <RuleRow ok={rLower} label="1 lowercase letter" />
                <RuleRow ok={rNumber} label="1 number" />
                <RuleRow ok={rSymbol} label="1 special character" />
              </div>
            </div>

            {/* Confirm */}
            <div>
              <div className="text-sm font-semibold text-white/85">Confirm new password</div>
              <div className="mt-2 relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45">
                  <Icon name="lock" className="h-4 w-4" />
                </span>

                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="field !pl-14 pr-12"
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white/85 transition"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  <Icon name={showConfirm ? "eyeOff" : "eye"} />
                </button>
              </div>

              {confirmPassword.length > 0 ? (
                <div className={cx("mt-2 text-[12px]", matches ? "text-emerald-300/80" : "text-amber-200/70")}>
                  {matches ? "✓ Passwords match" : "• Passwords do not match"}
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100/90">
                {error}
              </div>
            ) : null}

            <div className="h-px w-full bg-white/10" />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-[12px] text-white/50">
                <Icon name="info" className="opacity-80" />
                Password updates require you to be signed in.
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                <Link href="/app/settings" className="btn-ghost text-[12px] px-4 py-2 w-full sm:w-auto">
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="btn-solid-dark text-[12px] px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                  {loading ? "Updating..." : "Update password"}
                </button>
              </div>
            </div>

            {saved === "ok" ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100/90">
                Password updated.
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
