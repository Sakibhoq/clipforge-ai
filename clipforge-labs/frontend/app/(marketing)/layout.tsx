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
      {/* Navbar must be in normal document flow for sticky to work */}
      <Navbar />

      {/* Clip x-overflow HERE (not on the parent that contains sticky) */}
      <main className="relative overflow-x-clip">{children}</main>
    </div>
  );
}
