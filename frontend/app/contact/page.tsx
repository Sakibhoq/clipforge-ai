// frontend/app/contact/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { apiFetch } from "@/lib/api";

type FormState = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function HoverSheen() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(120px 120px at 20% 25%, rgba(82,152,255,0.18), transparent 60%), radial-gradient(140px 140px at 80% 30%, rgba(255,186,77,0.16), transparent 62%), radial-gradient(140px 140px at 55% 85%, rgba(44,206,173,0.12), transparent 62%)",
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  error?: string | null;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs text-white/60">{label}</div>
        {error ? (
          <div className="text-[11px] text-rose-200/80">{error}</div>
        ) : null}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={[
          // iOS: avoid input zoom
          "h-11 w-full rounded-2xl border bg-white/[0.03] px-4 text-[16px] sm:text-sm text-white/85 outline-none transition",
          "placeholder:text-white/30",
          error
            ? "border-rose-200/25 focus:border-rose-200/40"
            : "border-white/10 focus:border-white/20",
        ].join(" ")}
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs text-white/60">{label}</div>
        {error ? (
          <div className="text-[11px] text-rose-200/80">{error}</div>
        ) : null}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={6}
        className={[
          // iOS: avoid zoom; keep comfy line-height
          "w-full resize-none rounded-2xl border bg-white/[0.03] px-4 py-3 text-[16px] sm:text-sm leading-relaxed text-white/85 outline-none transition",
          "placeholder:text-white/30",
          error
            ? "border-rose-200/25 focus:border-rose-200/40"
            : "border-white/10 focus:border-white/20",
        ].join(" ")}
      />
    </label>
  );
}

function SendMessageModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const [touched, setTouched] = useState<Record<keyof FormState, boolean>>({
    name: false,
    email: false,
    subject: false,
    message: false,
  });

  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // focus / keyboard polish
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const lastFocusTsRef = useRef<number>(0);

  function onFieldFocus(target: HTMLElement) {
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

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    const resetTimer = window.setTimeout(() => {
      setStatus({ kind: "idle" });
      setForm({ name: "", email: "", subject: "", message: "" });
      setTouched({ name: false, email: false, subject: false, message: false });
    }, 0);

    // focus first field
    const focusTimer = window.setTimeout(() => {
      try {
        firstFieldRef.current?.focus();
      } catch {
        // ignore
      }
    }, 60);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const errors = useMemo(() => {
    const e: Record<keyof FormState, string | null> = {
      name: null,
      email: null,
      subject: null,
      message: null,
    };

    if (!form.name.trim()) e.name = "Required";
    if (!form.email.trim()) e.email = "Required";
    else if (!isEmail(form.email)) e.email = "Invalid";
    if (!form.subject.trim()) e.subject = "Required";
    if (!form.message.trim()) e.message = "Required";
    else if (form.message.trim().length < 10) e.message = "Too short";

    return e;
  }, [form]);

  const canSend = useMemo(() => {
    return !errors.name && !errors.email && !errors.subject && !errors.message;
  }, [errors]);

  async function onSubmit() {
    setTouched({ name: true, email: true, subject: true, message: true });
    if (!canSend) return;

    setStatus({ kind: "sending" });
    try {
      await apiFetch("/contact/send", {
        method: "POST",
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          subject: form.subject.trim(),
          message: form.message.trim(),
        },
      });

      setStatus({ kind: "sent" });
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err: any) {
      const detail =
        typeof err?.detail === "string"
          ? err.detail
          : typeof err?.message === "string"
          ? err.message
          : "Failed to send message";
      setStatus({ kind: "error", message: detail });
    }
  }

  if (!open) return null;

  const fieldError = (k: keyof FormState) => (touched[k] ? errors[k] : null);

  return (
    <div className="fixed inset-0 z-[60]">
      {/* overlay */}
      <button
        aria-label="Close contact form overlay"
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* modal (mobile-safe): bottom sheet on small, centered on md+ */}
      <div
        className={cx(
          "relative mx-auto w-[min(720px,92vw)]",
          "mt-16 md:mt-24",
          "pb-[env(safe-area-inset-bottom)]"
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="group surface relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-6 md:p-7 shadow-[0_18px_70px_rgba(0,0,0,0.55)] backdrop-blur">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 opacity-[0.45]">
              <div className="aurora" />
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_10%,rgba(255,255,255,0.06),transparent_60%)]" />
          </div>

          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-white/55">• Contact</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  Send a <span className="grad-text">message</span>
                </h2>
                <p className="mt-2 text-sm text-white/60">
                  We read every message. Keep it short and clear - we will handle the rest.
                </p>
              </div>

              <button
                onClick={onClose}
                className="group relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80 transition hover:text-white active:scale-[0.98]"
                aria-label="Close"
                title="Close"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-2 opacity-0 blur-md transition-opacity duration-200 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(16px 16px at 50% 50%, rgba(167,139,250,0.26), transparent 70%), radial-gradient(18px 18px at 30% 60%, rgba(125,211,252,0.20), transparent 72%), radial-gradient(18px 18px at 70% 35%, rgba(45,212,191,0.16), transparent 70%)",
                  }}
                />
                <svg className="relative" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* status strip */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {status.kind === "sent" ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/75">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
                  Message sent. We’ll reply soon.
                </span>
              ) : status.kind === "error" ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/75">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-300/80" />
                  {status.message}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/60" />
                  Response target: within 24 hours
                </span>
              )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/60">Name</div>
                  {fieldError("name") ? (
                    <div className="text-[11px] text-rose-200/80">{fieldError("name")}</div>
                  ) : null}
                </div>
                <input
                  ref={(el) => {
                    firstFieldRef.current = el;
                  }}
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  onFocus={(e) => onFieldFocus(e.currentTarget)}
                  autoComplete="name"
                  placeholder="Your name"
                  className={cx(
                    "h-11 w-full rounded-2xl border bg-white/[0.03] px-4 text-[16px] sm:text-sm text-white/85 outline-none transition placeholder:text-white/30",
                    fieldError("name")
                      ? "border-rose-200/25 focus:border-rose-200/40"
                      : "border-white/10 focus:border-white/20"
                  )}
                />
              </label>

              <Field
                label="Your email"
                value={form.email}
                onChange={(v) => setForm((s) => ({ ...s, email: v }))}
                placeholder="you@company.com"
                autoComplete="email"
                inputMode="email"
                type="email"
                error={fieldError("email")}
              />

              <div className="md:col-span-2">
                <Field
                  label="Subject"
                  value={form.subject}
                  onChange={(v) => setForm((s) => ({ ...s, subject: v }))}
                  placeholder="What can we help with?"
                  autoComplete="off"
                  error={fieldError("subject")}
                />
              </div>

              <div className="md:col-span-2">
                <Textarea
                  label="Message"
                  value={form.message}
                  onChange={(v) => setForm((s) => ({ ...s, message: v }))}
                  placeholder="Tell us what you need. If it’s a bug, include what you expected vs what happened."
                  error={fieldError("message")}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-white/45">
                By sending, you agree to be contacted at the email you provided.
              </div>

              <div className="flex items-center gap-2">
                <button type="button" className="btn-ghost text-xs" onClick={onClose}>
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={status.kind === "sending"}
                  className={cx("btn-aurora text-xs", status.kind === "sending" && "opacity-80 cursor-not-allowed")}
                >
                  {status.kind === "sending" ? "Sending…" : status.kind === "sent" ? "Sent" : "Send message"}
                </button>
              </div>
            </div>

            {status.kind === "sent" ? (
              <div className="mt-3 text-xs text-emerald-200/85">
                Message sent successfully. We will reply soon.
              </div>
            ) : null}

            {status.kind === "error" ? (
              <div className="mt-3 text-xs text-rose-200/85">
                {status.message}
              </div>
            ) : null}

            <div className="mt-6 h-px w-full bg-white/10" />

            <div className="mt-4 text-xs text-white/45">
              Prefer email?{" "}
              <a className="text-white/70 hover:text-white" href="mailto:support@orbito.cc">
                support@orbito.cc
              </a>
              .
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContactPage() {
  const topics = ["Support", "Billing", "Partnerships", "Feedback"];
  const faqs = [
    {
      q: "How fast do you respond?",
      a: "Most messages get a reply within 24 hours. Complex billing or technical issues may take a bit longer.",
    },
    {
      q: "What should I include in a bug report?",
      a: "Share what you expected, what happened, and attach a screenshot or short screen recording if possible.",
    },
    {
      q: "Can I get help with billing and credits?",
      a: "Yes. Include the email on your account and we can review plan, credit, and charge details quickly.",
    },
  ];

  const footerLinks = useMemo(
    () => [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy-policy" },
      { label: "Terms", href: "/terms-of-service" },
    ],
    []
  );

  const [open, setOpen] = useState(false);

  const rootStyle: React.CSSProperties = {
    paddingTop: "env(safe-area-inset-top)",
    paddingBottom: "env(safe-area-inset-bottom)",
  };

  return (
    <div
      className="relative min-h-screen min-h-[100svh] min-h-[100dvh] overflow-x-hidden [max-width:100vw]"
      style={rootStyle}
    >
      <Navbar />

      {/* PAGE-LEVEL AURORA FIELD (mobile-safe) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[#06090f]" />
        <div className="absolute inset-0 bg-[radial-gradient(1080px_640px_at_16%_10%,rgba(82,152,255,0.20),transparent_68%),radial-gradient(980px_600px_at_84%_12%,rgba(255,186,77,0.18),transparent_70%),radial-gradient(880px_520px_at_50%_78%,rgba(44,206,173,0.08),transparent_72%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(1000px_620px_at_50%_10%,rgba(255,255,255,0.04),transparent_66%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(4,8,14,0.10),rgba(4,8,14,0.48))]" />
        <div className="absolute inset-0 opacity-[0.1]">
          <div className="aurora" />
        </div>
      </div>

      <main className="relative mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <section className="studio-frame p-5 sm:p-7 md:p-8">
          <div className="absolute inset-0">
            <div className="aurora opacity-55" />
            <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
          </div>

          <div className="relative">
            <div className="signal-chip">
              <span className="live-dot" />
              <span>Contact</span>
            </div>

            <div className="mt-4 grid gap-6 md:grid-cols-[0.96fr_1.04fr] md:items-start">
              <div>
                <h1 className="text-[34px] leading-[1.04] font-semibold tracking-tight sm:text-4xl md:text-6xl">
                  Need help? Send us a message.
                </h1>

                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65 md:text-[15px]">
                  Ask about setup, clips, Generate, billing, posting, or credits. Keep it simple. We will read it and help.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <span className="signal-chip">Reply in 24 hours</span>
                  <span className="signal-chip">Billing and setup help</span>
                  <span className="signal-chip">Screenshots help</span>
                </div>

                <div className="mt-7">
                  <div className="text-xs text-white/50">Common topics</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {topics.map((t) => (
                      <span key={t} className="signal-chip">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link href="/pricing" className="btn-ghost">
                    View pricing
                  </Link>
                  <Link href="/" className="btn-ghost">
                    Back to home
                  </Link>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="group studio-frame p-5 md:p-6">
                  <HoverSheen />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                        <div className="text-sm font-semibold">Talk to support</div>
                        <p className="mt-1.5 text-sm leading-relaxed text-white/60">
                          Send a message and our team will see it.
                        </p>
                      </div>

                      <span className="signal-chip">
                        <span className="live-dot" />
                        <span>Online</span>
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="metric-chip">
                        <div className="value">&lt; 24h</div>
                        <div className="label">Reply Target</div>
                      </div>
                      <div className="metric-chip">
                        <div className="value">support@orbito.cc</div>
                        <div className="label">Email</div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button type="button" className="btn-aurora" onClick={() => setOpen(true)}>
                        Write a message
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { title: "Setup", text: "Account, login, and connection questions." },
                    { title: "Billing", text: "Plans, credits, and charges." },
                    { title: "Product", text: "Bugs, video quality, and posting problems." },
                  ].map((item) => (
                    <div key={item.title} className="surface-soft motion-card p-4">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-white/42">{item.title}</div>
                      <div className="mt-2 text-lg font-semibold text-white/90">{item.title}</div>
                      <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pt-6">
          <div className="studio-frame p-4 md:p-5">
            <div className="text-xs text-white/50">Frequently asked questions</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {faqs.map((item) => (
                <details key={item.q} className="group/faq rounded-[24px] border border-white/10 bg-black/25 px-4 py-4">
                  <summary className="list-none cursor-pointer text-sm font-medium text-white/82 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <span>{item.q}</span>
                      <span className="text-xs text-white/45 transition group-open/faq:rotate-45">+</span>
                    </div>
                  </summary>
                  <div className="mt-2 text-sm leading-relaxed text-white/62">{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <footer className="pb-10 pt-12 text-xs text-white/45 sm:pt-16">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>© 2026 • Orbito by Sakib LLC. All rights reserved.</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {footerLinks.map((i) => (
                <a key={i.href} href={i.href} className="hover:text-white/70">
                  {i.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </main>

      <SendMessageModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
