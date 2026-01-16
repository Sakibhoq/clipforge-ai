// frontend/app/app/layout.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type MeResponse = {
  email: string;
  plan: string;
  credits: number;
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Cookie-auth: always try to load /auth/me (server decides if logged in)
  useEffect(() => {
    let mounted = true;

    async function loadMe() {
      setLoading(true);
      try {
        const data = await apiFetch<MeResponse>("/auth/me", { credentials: "include" });
        if (!mounted) return;
        setMe(data);
      } catch (e: any) {
        if (!mounted) return;
        setMe(null);

        // If not authenticated, bounce to login (but avoid loops if already there)
        if (!pathname.startsWith("/login")) {
          router.push("/login");
        }
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadMe();
    return () => {
      mounted = false;
    };
  }, [pathname, router]);

  async function logout() {
    try {
      await apiFetch<{ ok: true }>("/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    } finally {
      setMobileOpen(false);
      setMe(null);
      router.push("/login");
      router.refresh();
    }
  }

  function navItem(href: string, label: string, mobile = false) {
    const active = pathname === href || pathname.startsWith(href + "/");

    return (
      <Link
        href={href}
        onClick={() => mobile && setMobileOpen(false)}
        className={[
          "rounded-full px-3 py-2 text-sm transition border",
          active
            ? "bg-white/[0.14] text-white border-white/25"
            : "border-transparent text-white/70 hover:text-white hover:bg-white/[0.06]",
          mobile && "w-full text-left",
        ].join(" ")}
      >
        {label}
      </Link>
    );
  }

  const planLabel = useMemo(() => me?.plan ?? "free", [me]);
  const emailLabel = useMemo(() => me?.email ?? "Account", [me]);

  return (
    <div className="min-h-screen bg-plain relative">
      {/* Background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-[0.55]">
          <div className="aurora" />
        </div>
        <div className="absolute -top-40 left-[-20%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.18),transparent_62%)] blur-3xl" />
        <div className="absolute top-24 right-[-18%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.14),transparent_64%)] blur-3xl" />
        <div className="absolute bottom-[-18%] left-[10%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.12),transparent_65%)] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.06] mix-blend-overlay [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      {/* Top bar */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold tracking-tight text-white">
              Clipforge
            </Link>
            <span className="text-xs text-white/40">/</span>
            <span className="text-xs text-white/60">App</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-2">
            {navItem("/app", "Overview")}
            {navItem("/app/upload", "Upload")}
            {navItem("/app/clips", "Clips")}
            {navItem("/app/billing", "Billing")}
            {navItem("/app/settings", "Settings")}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-3">
            <div className="hidden md:block text-right">
              <div className="text-xs text-white/60">
                {loading ? "Loading…" : me ? emailLabel : "Signed out"}
              </div>
              <div className="text-[11px] text-white/40">
                {loading ? "—" : me ? `Plan: ${planLabel}` : "—"}
              </div>
            </div>

            <div className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] text-white/80">
              <span className="text-white/60">Credits</span>{" "}
              <span className="font-semibold">
                {loading ? "—" : typeof me?.credits === "number" ? me.credits : "—"}
              </span>
            </div>

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden rounded-full border border-white/15 bg-white/[0.06] p-2 text-white/80 hover:bg-white/[0.10]"
              aria-label="Open menu"
            >
              ☰
            </button>

            <button
              onClick={logout}
              className="hidden md:inline-flex rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] text-white/80 transition hover:bg-white/[0.10]"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-black/60 backdrop-blur">
            <div className="mx-auto max-w-6xl px-6 py-4 grid gap-2">
              {navItem("/app", "Overview", true)}
              {navItem("/app/upload", "Upload", true)}
              {navItem("/app/clips", "Clips", true)}
              {navItem("/app/billing", "Billing", true)}
              {navItem("/app/settings", "Settings", true)}

              <div className="mt-3 h-px bg-white/10" />

              <button
                onClick={logout}
                className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-left text-sm text-white/80 hover:bg-white/[0.10]"
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Page content */}
      <main className="relative mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
