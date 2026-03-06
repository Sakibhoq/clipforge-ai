// clipforge-labs/frontend/components/DevNotice.tsx
"use client";

import React, { useEffect, useState } from "react";

// Bump version to re-show after deploy if someone dismissed the previous notice.
const STORAGE_KEY = "clipforge_dev_notice_dismissed_v2";

export default function DevNotice() {
  const [open, setOpen] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      dismissed = false;
    }

    if (dismissed) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
    const t = window.setTimeout(() => setInView(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  if (!open) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }

  return (
    <div className="relative z-40">
      <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6">
        <div
          className={[
            "transition-all duration-300",
            inView ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0",
          ].join(" ")}
          aria-live="polite"
        >
          <div className="overflow-hidden rounded-2xl border border-white/12 bg-[linear-gradient(120deg,rgba(255,183,3,0.18),rgba(251,86,7,0.10),rgba(58,134,255,0.14))] p-[1px] shadow-[0_18px_60px_rgba(0,0,0,0.48)]">
            <div className="flex flex-col gap-3 rounded-[15px] bg-black/75 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[rgba(255,183,3,0.95)] shadow-[0_0_0_3px_rgba(255,183,3,0.14)]" />
                <div className="text-sm text-white/80">
                  <span className="font-semibold text-white/92">Notice:</span>{" "}
                  <span>Orbito Labs is in development. Come back soon.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-full border border-white/14 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:border-white/20 hover:bg-white/[0.09]"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
