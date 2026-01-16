import Link from "next/link";

type Step = {
  title: string;
  desc: string;
  href: string;
  cta: string;
  emoji: string;
};

const steps: Step[] = [
  {
    title: "Upload a video",
    desc: "Send a file to the pipeline (S3/local).",
    href: "/upload",
    cta: "Go to upload →",
    emoji: "📤",
  },
  {
    title: "Processing jobs",
    desc: "Worker claims jobs and runs Whisper + ffmpeg.",
    href: "/jobs",
    cta: "View jobs →",
    emoji: "🧠",
  },
  {
    title: "Review clips",
    desc: "Open /upload/[id] to see generated outputs.",
    href: "/upload/1",
    cta: "Open example →",
    emoji: "🎬",
  },
  {
    title: "Whop direction",
    desc: "This will evolve into stats, earnings, campaigns, affiliates, and payouts.",
    href: "/monetize",
    cta: "Explore →",
    emoji: "💸",
  },
];

function StatCard({
  label,
  value,
  meta,
  icon,
}: {
  label: string;
  value: string;
  meta: string;
  icon: string;
}) {
  return (
    <div className="cf-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-[rgba(170,180,205,0.95)]">
            {label}
          </div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight text-white">
            {value}
          </div>
          <div className="mt-1 text-xs text-[rgba(170,180,205,0.75)]">{meta}</div>
        </div>

        <div className="grid h-10 w-10 place-items-center rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] text-lg">
          {icon}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ step }: { step: Step }) {
  return (
    <Link
      href={step.href}
      className="group block rounded-2xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.035)] p-4 transition hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(255,255,255,0.045)]"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[rgba(255,255,255,0.05)] text-lg">
          {step.emoji}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold tracking-tight text-white">
            {step.title}
          </div>
          <div className="mt-1 text-sm text-[rgba(170,180,205,0.85)]">
            {step.desc}
          </div>

          <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm font-bold text-white transition group-hover:bg-[rgba(255,255,255,0.07)]">
            {step.cta}
            <span className="opacity-60">↗</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-xs font-bold text-[rgba(170,180,205,0.95)]">
            <span className="opacity-90">🧪</span>
            Workspace · Clipforge Studio
          </div>

          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white">
            Dashboard
          </h1>
          <p className="mt-2 text-[rgba(170,180,205,0.95)]">
            Jobs, clips, and creator output — in one place.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/upload" className="cf-btn cf-btn-primary">
            New upload →
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Uploads" value="—" meta="This week" icon="📤" />
        <StatCard label="Jobs" value="—" meta="Queued / running" icon="🧠" />
        <StatCard label="Clips" value="—" meta="Generated" icon="🎬" />
        <StatCard label="Plan" value="Free" meta="Upgrade anytime" icon="⚡" />
      </div>

      {/* Grid */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        {/* Recent activity */}
        <section className="cf-panel p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-white">
                Recent activity
              </h2>
              <p className="mt-1 text-sm text-[rgba(170,180,205,0.85)]">
                Uploads and clip runs will appear here.
              </p>
            </div>

            <Link href="/upload" className="cf-btn cf-btn-ghost">
              New upload →
            </Link>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="text-sm font-extrabold text-white">No uploads yet</div>
            <div className="mt-1 text-sm text-[rgba(170,180,205,0.85)]">
              Upload a video to generate clips.
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-xs font-bold text-[rgba(170,180,205,0.95)]">
                🧪 Dev mode
              </span>
              <span className="rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-xs font-bold text-[rgba(170,180,205,0.95)]">
                🔐 Auth next
              </span>
              <span className="rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-xs font-bold text-[rgba(170,180,205,0.95)]">
                ☁️ AWS-ready
              </span>
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <section className="cf-panel p-5">
          <h2 className="text-lg font-extrabold tracking-tight text-white">
            Quick actions
          </h2>
          <p className="mt-1 text-sm text-[rgba(170,180,205,0.85)]">
            The core pipeline, end-to-end.
          </p>

          <div className="mt-4 space-y-3">
            {steps.map((s) => (
              <ActionCard key={s.title} step={s} />
            ))}
          </div>
        </section>
      </div>

      {/* Footer note */}
      <div className="cf-panel p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-[rgba(170,180,205,0.95)]">
            <span className="font-bold text-white">Whop direction:</span>{" "}
            We’ll evolve this into creator stats, earnings, campaigns, affiliates,
            and payouts.
          </div>
          <Link href="/monetize" className="cf-btn cf-btn-ghost">
            Explore →
          </Link>
        </div>
      </div>
    </main>
  );
}
