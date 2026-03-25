// frontend/app/(marketing)/layout.tsx
import React from "react";
import Navbar from "@/components/Navbar";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="marketing-shell relative bg-transparent"
      style={{
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Global marketing background: calmer, sharper, and more product-like. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[-20] overflow-hidden">
        <div className="absolute inset-0 bg-[#06090f]" />
        <div className="absolute inset-0 bg-[radial-gradient(1120px_620px_at_12%_10%,rgba(82,152,255,0.18),transparent_68%),radial-gradient(1020px_560px_at_88%_12%,rgba(255,186,77,0.15),transparent_70%),radial-gradient(900px_500px_at_50%_78%,rgba(54,214,178,0.08),transparent_72%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_22%),linear-gradient(180deg,rgba(4,8,14,0.06),rgba(4,8,14,0.52))]" />
        <div
          className="absolute inset-0 opacity-[0.22]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px), linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)",
            backgroundSize: "96px 96px",
            maskImage: "linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.35))",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(720px_260px_at_50%_0%,rgba(255,255,255,0.08),transparent_72%)]" />
        <div className="absolute inset-0 opacity-[0.08]">
          <div className="aurora" />
        </div>
      </div>

      {/* Navbar must be in normal document flow for sticky to work */}
      <Navbar />

      {/* Clip x-overflow HERE (not on the parent that contains sticky) */}
      <main className="relative overflow-x-clip">{children}</main>
    </div>
  );
}
