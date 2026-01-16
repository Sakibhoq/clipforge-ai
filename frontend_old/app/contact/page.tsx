"use client";

import MarketingShell from "../../components/MarketingShell";

export default function Page() {
  return (
    <MarketingShell active="contact">
      <section className="max-w-[900px] mx-auto py-24 px-6 text-center">
        <h1 className="text-4xl font-extrabold text-white mb-4">Contact</h1>
        <p className="text-white/70">
          Questions, feedback, or partnerships?
          <br />
          Email us at{" "}
          <span className="text-white font-semibold">support@clipforge.ai</span>
        </p>
      </section>
    </MarketingShell>
  );
}
