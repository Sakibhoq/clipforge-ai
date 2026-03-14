"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type MeResponse = { name?: string | null; email: string; plan: string; credits: number; trial_used: boolean };

function isTrialLockedError(error: any): boolean {
  if (!error) return false;
  const status = Number((error as any).status || 0);
  if (status === 400) return true;
  const detail = String((error as any).detail || (error as any).message || (error as any).error || "").toLowerCase();
  return detail.includes("free trial already used") || detail.includes("already used");
}

function StartTrialPageInner() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // 1) If not logged in -> send to register (with return)
      try {
        const me = await apiFetch<MeResponse>("/auth/me", { method: "GET" });
        if (me.trial_used) {
          if (!cancelled) router.replace("/pricing?trial=locked");
          return;
        }
      } catch {
        if (!cancelled) {
          router.replace(`/register?next=${encodeURIComponent("/start-trial")}`);
        }
        return;
      }

      // 2) Logged in -> create Stripe Checkout session for free trial
      try {
        const data = (await apiFetch("/billing/checkout-session", {
          method: "POST",
          body: { plan: "free", interval: "monthly", pack: 1 },
        })) as any;

        const url = data?.url;
        if (!url) throw new Error("checkout_failed_no_url");

        window.location.href = url;
      } catch (error) {
        if (!cancelled) {
          if (isTrialLockedError(error)) {
            router.replace("/pricing?trial=locked");
          } else {
            router.replace("/pricing?trial=error");
          }
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-[100svh] flex items-center justify-center px-6">
      <div className="text-center">
        <div className="text-sm text-white/70">Starting your free trial…</div>
      </div>
    </div>
  );
}

export default function StartTrialPage() {
  return (
    <Suspense fallback={<div className="text-sm text-white/60">Loading…</div>}>
      <StartTrialPageInner />
    </Suspense>
  );
}
