"use client";

import React, { useMemo } from "react";
import Link from "next/link";

function Icon({
  name,
  className = "",
}: {
  name:
    | "spark"
    | "upload"
    | "link"
    | "clips"
    | "billing"
    | "shield"
    | "bolt"
    | "clock"
    | "check"
    | "arrow";
  className?: string;
}) {
  const common = `inline-block ${className}`;
  switch (name) {
    case "spark":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2l1.2 5.2L18 9l-4.8 1.8L12 16l-1.2-5.2L6 9l4.8-1.8L12 2z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M19.5 13.5l.7 3 2.3.9-2.3.9-.7 3-.7-3-2.3-.9 2.3-.9.7-3z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "upload":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M8 7l4-4 4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 14v4a3 3 0 003 3h8a3 3 0 003-3v-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "link":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M10 13a5 5 0 010-7l.7-.7a5 5 0 017.1 7.1l-.7.7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M14 11a5 5 0 010 7l-.7.7a5 5 0 01-7.1-7.1l.7-.7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "clips":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 7a3 3 0 013-3h6a3 3 0 013 3v10a3 3 0 01-3 3H9a3 3 0 01-3-3V7z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M10 9l6 3-6 3V9z" fill="currentColor" opacity="0.9" />
        </svg>
      );
    case "billing":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 8h12M6 12h12M6 16h8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M5 6a3 3 0 013-3h8a3 3 0 013 3v12a3 3 0 01-3 3H8a3 3 0 01-3-3V6z"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      );
    case "shield":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3l8 4v6c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V7l8-4z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 12l1.8 1.8L15.8 9.3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "bolt":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
      );
    case "clock":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 22a10 10 0 110-20 10 10 0 010 20z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M12 6v6l4 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "check":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "arrow":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M13 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-400/15 bg-emerald-400/10 text-emerald-200"
      : tone === "warn"
      ? "border-amber-400/15 bg-amber-400/10 text-amber-200"
      : "border-white/10 bg-white/5 text-white/70";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

function SoftCard({
  children,
  className = "",
  glow = true,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div className={`surface-soft relative overflow-hidden ${className}`}>
      {glow ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-10 opacity-25 blur-2xl"
          style={{
            background:
              "radial-gradient(220px 150px at 22% 28%, rgba(167,139,250,0.14), transparent 72%), radial-gradient(240px 170px at 78% 42%, rgba(125,211,252,0.12), transparent 72%), radial-gradient(240px 170px at 50% 88%, rgba(45,212,191,0.10), transparent 72%)",
          }}
        />
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  icon,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80">
              {icon}
            </div>
          ) : null}
          <div>
            <div className="text-sm font-semibold tracking-tight text-white/90">{title}</div>
            {subtitle ? <div className="mt-1 text-sm leading-relaxed text-white/60">{subtitle}</div> : null}
          </div>
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>

      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

function ActionButton({
  href,
  title,
  desc,
  icon,
  variant = "ghost",
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  const base =
    "group relative overflow-hidden rounded-2xl border px-5 py-4 transition-all duration-300";
  const styles =
    variant === "primary"
      ? "border-white/15 bg-white text-black hover:bg-white/90"
      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/16";
  const titleCls = variant === "primary" ? "text-black" : "text-white/90";
  const descCls = variant === "primary" ? "text-black/70" : "text-white/60";

  return (
    <Link href={href} className={`${base} ${styles}`}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-35"
        style={{
          background:
            "radial-gradient(220px 150px at 22% 28%, rgba(167,139,250,0.16), transparent 72%), radial-gradient(240px 170px at 78% 42%, rgba(125,211,252,0.14), transparent 72%), radial-gradient(240px 170px at 50% 88%, rgba(45,212,191,0.11), transparent 72%)",
        }}
      />
      <div className="relative flex items-start gap-3">
        <div
          className={`mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${
            variant === "primary" ? "border-black/10 bg-black/5" : "border-white/10 bg-white/5"
          }`}
        >
          <div className={`${variant === "primary" ? "text-black/80" : "text-white/80"}`}>{icon}</div>
        </div>
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${titleCls}`}>{title}</div>
          <div className={`mt-1 text-sm leading-snug ${descCls}`}>{desc}</div>
        </div>
        <div
          className={`ml-auto mt-1 inline-flex items-center gap-2 text-xs ${
            variant === "primary" ? "text-black/70" : "text-white/55"
          }`}
        >
          Open <Icon name="arrow" className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

export default function AppHome() {
  const ui = useMemo(() => {
    return {
      planLabel: "Free",
      creditsLabel: "—",
      lastUpload: "No uploads yet",
      pipeline: [
        { label: "Upload", state: "ready" as const },
        { label: "Process", state: "idle" as const },
        { label: "Clips", state: "idle" as const },
      ],
      hints: [
        {
          title: "Trial credits",
          desc: "Get your first outputs fast. Credits will sync once billing is wired.",
          icon: "bolt" as const,
        },
        {
          title: "Cost clarity",
          desc: "You’ll see what a run costs before processing starts.",
          icon: "shield" as const,
        },
        {
          title: "Quality first",
          desc: "Smart framing + clean captions by default.",
          icon: "spark" as const,
        },
      ],
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Compact status strip (kept, cleaner) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge label={`Plan: ${ui.planLabel}`} tone="neutral" />
          <Badge label={`Credits: ${ui.creditsLabel}`} tone="neutral" />
          <Badge label={`Last upload: ${ui.lastUpload}`} tone="neutral" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/upload" className="btn-aurora text-[12px] px-4 py-2">
            Upload
          </Link>
          <Link href="/app/billing" className="btn-ghost text-[12px] px-4 py-2">
            Billing
          </Link>
        </div>
      </div>

      {/* Hero — polished to match Clips/Billing style */}
      <SoftCard className="p-6 md:p-7" glow>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-white/55">
              <span className="inline-flex items-center gap-2">
                <Icon name="spark" className="h-4 w-4 text-white/70" />
                Overview
              </span>
              <span className="text-white/30">•</span>
              <span className="text-white/55">Orbito App</span>
            </div>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-violet-300 via-sky-300 to-teal-300 bg-clip-text text-transparent">
                Start your first run
              </span>
              <span className="text-white/90"> — we’ll handle the pipeline.</span>
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
              Upload a long-form video once. Orbito generates short clips you can review and export.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <ActionButton
                href="/app/upload"
                title="Start upload"
                desc="Drop a file and kick off processing."
                icon={<Icon name="upload" className="h-5 w-5" />}
                variant="primary"
              />
              <ActionButton
                href="/app/upload"
                title="Import link"
                desc="Paste a YouTube / podcast URL."
                icon={<Icon name="link" className="h-5 w-5" />}
                variant="ghost"
              />
              <ActionButton
                href="/app/clips"
                title="View clips"
                desc="Your library fills in after the first run."
                icon={<Icon name="clips" className="h-5 w-5" />}
                variant="ghost"
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="text-xs text-white/50">Pipeline:</span>
              {ui.pipeline.map((step) => {
                const tone = step.state === "ready" ? "good" : step.state === "running" ? "warn" : "neutral";
                return <Badge key={step.label} label={step.label} tone={tone} />;
              })}
            </div>
          </div>

          {/* Right-side “next step” module (kept, simplified) */}
          <div className="w-full max-w-sm">
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center gap-2 text-xs text-white/55">
                <Icon name="shield" className="h-4 w-4 text-white/70" />
                Next step
              </div>
              <div className="mt-2 text-sm font-semibold text-white/85">Upload a video</div>
              <div className="mt-1 text-sm text-white/55">
                You’ll see processing status and generated clips immediately after.
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href="/app/upload" className="btn-solid-dark text-[12px] px-4 py-2">
                  Upload now
                </Link>
                <Link href="/app/clips" className="btn-ghost text-[12px] px-4 py-2">
                  Open clips
                </Link>
              </div>
            </div>
          </div>
        </div>
      </SoftCard>

      {/* Lower content — reduced duplication, still “full” */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 grid gap-4 md:grid-cols-3">
          {ui.hints.map((x) => (
            <div key={x.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80">
                  {x.icon === "bolt" ? <Icon name="bolt" className="h-5 w-5" /> : null}
                  {x.icon === "shield" ? <Icon name="shield" className="h-5 w-5" /> : null}
                  {x.icon === "spark" ? <Icon name="spark" className="h-5 w-5" /> : null}
                </div>
                <div className="text-sm font-semibold text-white/90">{x.title}</div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/65">{x.desc}</p>
            </div>
          ))}
        </div>

        <Card
          title="Recent activity"
          subtitle="Runs and exports will show here."
          icon={<Icon name="clock" className="h-5 w-5 text-white/80" />}
          right={
            <Link href="/app/clips" className="btn-ghost text-[12px] px-3 py-1.5">
              Open clips
            </Link>
          }
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70">
                <Icon name="check" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white/85">Nothing yet — start your first upload.</div>
                <div className="mt-1 text-sm leading-relaxed text-white/60">
                  Upload a long-form video and Orbito will generate short clips for review.
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/app/upload" className="btn-aurora text-[12px] px-4 py-2">
                    Upload now
                  </Link>
                  <Link href="/app/billing" className="btn-ghost text-[12px] px-4 py-2">
                    Plans
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
      {/* Keep these two cards, remove the extra “what happens next” wall-of-text */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="How the flow works"
          subtitle="Upload → process → review → export."
          icon={<Icon name="spark" className="h-5 w-5 text-white/80" />}
        >
          <div className="grid gap-3">
            {[
              { t: "Upload long-form", d: "Drag & drop a file or import a link.", to: "/app/upload" },
              { t: "Run processing", d: "Transcribe, detect highlights, generate clips.", to: "/app/upload" },
              { t: "Review & export", d: "Pick the best clips and export.", to: "/app/clips" },
            ].map((s, idx) => (
              <Link
                key={s.t}
                href={s.to}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] hover:border-white/16 transition"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-white/70">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white/90">{s.t}</div>
                    <div className="mt-1 text-sm text-white/60">{s.d}</div>
                  </div>
                  <div className="ml-auto mt-1 text-white/35 group-hover:text-white/60 transition">
                    <Icon name="arrow" className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card
          title="Quick links"
          subtitle="Jump to the key surfaces."
          icon={<Icon name="arrow" className="h-5 w-5 text-white/80" />}
        >
          <div className="grid gap-2">
            {[
              { t: "Upload", to: "/app/upload" },
              { t: "Clips", to: "/app/clips" },
              { t: "Billing", to: "/app/billing" },
              { t: "Settings", to: "/app/settings" },
            ].map((x) => (
              <Link
                key={x.t}
                href={x.to}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80 hover:bg-white/[0.06] hover:text-white transition"
              >
                <span className="font-semibold">{x.t}</span>
                <Icon name="arrow" className="h-4 w-4 text-white/50" />
              </Link>
            ))}
          </div>
        </Card>

        <Card
          title="Billing & credits"
          subtitle="UI-only for now; wiring comes after launch hardening."
          icon={<Icon name="billing" className="h-5 w-5 text-white/80" />}
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="text-sm font-semibold text-white/85">Coming soon</div>
            <ul className="mt-3 space-y-2 text-sm text-white/65">
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/40" />
                Stripe checkout + webhook credit updates
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/40" />
                Credits shown in navbar (from /auth/me)
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/40" />
                Packs + subscriptions with real receipts/invoices
              </li>
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link href="/app/billing" className="btn-solid-dark text-[12px] px-4 py-2">
                Open billing
              </Link>
              <Link href="/app/upload" className="btn-ghost text-[12px] px-4 py-2">
                New upload
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
