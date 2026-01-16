"use client";

import MarketingShell from "../../components/MarketingShell";
import Features from "../../components/landing/Features";

export default function Page() {
  return (
    <MarketingShell active="features">
      <Features />
    </MarketingShell>
  );
}
