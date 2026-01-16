"use client";

import Navbar from "./Navbar";

export default function MarketingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-black text-white">
      {/* Global background glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60%_40%_at_50%_-10%,rgba(120,80,255,0.25),transparent_70%)]" />

      {/* Navbar */}
      <Navbar />

      {/* Full-width content (sections control their own max-width/padding) */}
      <main className="w-full">{children}</main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-10 text-sm text-white/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span>© {new Date().getFullYear()} Clipforge</span>
          <span>Built for creators who want output.</span>
        </div>
      </footer>
    </div>
  );
}
