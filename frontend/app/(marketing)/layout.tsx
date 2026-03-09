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
      {/* Global marketing background (single blended layer, no left/right seam on small screens) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[-20] overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 bg-[radial-gradient(1150px_720px_at_10%_14%,rgba(155,140,255,0.28),transparent_68%),radial-gradient(1120px_700px_at_90%_14%,rgba(255,183,3,0.24),transparent_68%),radial-gradient(980px_620px_at_18%_78%,rgba(70,215,255,0.18),transparent_70%),radial-gradient(980px_620px_at_84%_78%,rgba(251,86,7,0.16),transparent_72%),radial-gradient(980px_620px_at_50%_46%,rgba(58,134,255,0.12),transparent_72%)]" />
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
