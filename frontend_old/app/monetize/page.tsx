"use client";

import MarketingShell from "../../components/MarketingShell";
import Monetize from "../../components/landing/Monetize";

export default function Page() {
  return (
    <MarketingShell active="monetize">
      <Monetize />
    </MarketingShell>
  );
}
