"use client";

import React from "react";
import Link from "next/link";

type NavItem = { href: string; label: string; emoji?: string };

const NAV: NavItem[] = [
  { href: "/features", label: "Features", emoji: "✨" },
  { href: "/how-it-works", label: "How it Works", emoji: "🧩" },
  { href: "/monetize", label: "Monetize", emoji: "💸" },
  { href: "/pricing", label: "Pricing", emoji: "🧾" },
  { href: "/contact", label: "Contact", emoji: "✉️" },
];

function MarkLogo() {
  return (
    <div className="relative grid h-9 w-9 place-items-center">
      <div className="absolute inset-0 rounded-xl bg-[rgba(124,92,255,0.22)] blur-[10px]" />
      <div className="absolute inset-0 rounded-xl border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)]" />
      <div className="relative h-4 w-4 rotate-45 rounded-[6px] bg-gradient-to-tr from-[rgba(124,92,255,0.95)] to-[rgba(0,200,255,0.95)]" />
    </div>
  );
}

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,12,18,0.55)] backdrop-blur-xl">
        <div className="cf-container">
          <div className="flex h-16 items-center justify-between">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-3">
              <MarkLogo />
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-tight text-white">
                  Clipforge
                </div>
                <div className="text-xs text-[rgba(170,180,205,0.95)]">
                  AI clipping + creator pipeline
                </div>
              </div>
            </Link>

            {/* Nav */}
            <nav className="flex items-center gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-[rgba(170,180,205,0.95)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
                >
                  <span className="mr-1 opacity-90">{item.emoji}</span>
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Link href="/login" className="cf-btn cf-btn-ghost">
                Log in
              </Link>
              <Link href="/upload" className="cf-btn cf-btn-primary">
                Start free →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
