// frontend/app/(marketing)/layout.tsx
import React from "react";
import Navbar from "@/components/Navbar";
import DevNotice from "@/components/DevNotice";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative bg-transparent"
      style={{
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Navbar must be in normal document flow for sticky to work */}
      <DevNotice />
      <Navbar />

      {/* Clip x-overflow HERE (not on the parent that contains sticky) */}
      <main className="relative overflow-x-clip">{children}</main>
    </div>
  );
}
