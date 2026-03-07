// frontend/app/(marketing)/layout.tsx
import React from "react";
import Navbar from "@/components/Navbar";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative bg-transparent"
      style={{
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Global marketing background (same split Orbito/Labs glow as pricing page) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[-20] overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-y-0 left-0 w-1/2 bg-[radial-gradient(1000px_620px_at_20%_14%,rgba(155,140,255,0.30),transparent_66%),radial-gradient(920px_560px_at_34%_72%,rgba(70,215,255,0.20),transparent_70%),radial-gradient(760px_520px_at_42%_36%,rgba(53,242,166,0.14),transparent_72%)]" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(1000px_620px_at_80%_14%,rgba(255,183,3,0.30),transparent_66%),radial-gradient(920px_560px_at_66%_72%,rgba(251,86,7,0.20),transparent_70%),radial-gradient(760px_520px_at_58%_36%,rgba(58,134,255,0.16),transparent_72%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(1000px_620px_at_50%_10%,rgba(255,255,255,0.04),transparent_66%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.18),rgba(0,0,0,0.48))]" />
        <div className="absolute inset-0 opacity-[0.18]">
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
