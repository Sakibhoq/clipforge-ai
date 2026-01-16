import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nav = [
    { href: "/dashboard", label: "Overview", emoji: "📊" },
    { href: "/jobs", label: "Jobs", emoji: "🧱" },
    { href: "/upload", label: "Upload", emoji: "📤" },
    { href: "/dashboard/clips", label: "Clips", emoji: "🎬" },
    { href: "/pricing", label: "Upgrade", emoji: "⚡" },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <div className="cf-container">
        <div className="grid gap-6 py-8 md:grid-cols-[260px_1fr]">
          {/* Sidebar */}
          <aside className="cf-panel p-4 md:sticky md:top-[88px] md:h-[calc(100vh-120px)]">
            <div className="mb-4">
              <div className="text-xs font-semibold text-[rgba(170,180,205,0.95)]">
                Workspace
              </div>
              <div className="mt-1 text-sm font-bold text-white">
                Clipforge Studio
              </div>
              <div className="mt-2 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs text-[rgba(170,180,205,0.95)]">
                Plan: <b className="text-white">free</b> · Creator pipeline
              </div>
            </div>

            <nav className="space-y-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[rgba(170,180,205,0.95)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
                >
                  <span className="opacity-90">{item.emoji}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            <div className="mt-5 rounded-2xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] p-3">
              <div className="text-xs font-semibold text-white">💸 Monetize later</div>
              <div className="mt-1 text-xs text-[rgba(170,180,205,0.95)] leading-relaxed">
                This area will evolve into a Whop-style creator hub:
                earnings, campaigns, affiliates, payouts.
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="space-y-5">
            {/* Top bar */}
            <div className="cf-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Dashboard</div>
                  <div className="text-xs text-[rgba(170,180,205,0.95)]">
                    Jobs, clips, and creator output — in one place.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link href="/upload" className="cf-btn cf-btn-primary">
                    New upload →
                  </Link>
                </div>
              </div>
            </div>

            {/* Page content */}
            <div>{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
