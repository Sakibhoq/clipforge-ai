"use client";

import React, { useEffect } from "react";

const TARGET = "https://app.orbito.cc/pricing";

export default function PricingRedirectPage() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      window.location.replace(TARGET);
    }, 120);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="surface-soft rounded-2xl p-6 text-sm text-white/75">
        <div className="text-xs text-white/55">Pricing moved</div>
        <div className="mt-2 text-base font-semibold text-white/90">
          Orbito + Orbito Labs now use one unified pricing page
        </div>
        <p className="mt-2 text-white/65">
          Redirecting you to the new pricing page.
        </p>
        <div className="mt-4">
          <a href={TARGET} className="btn-clipforge inline-flex px-4 py-2 text-xs">
            Open unified pricing
          </a>
        </div>
      </div>
    </main>
  );
}
