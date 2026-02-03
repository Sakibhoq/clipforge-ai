"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type MeResponse = { email: string; plan: string; credits: number };

export default function StartTrialPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // 1) If not logged in -> send to register (with return)
      try {
        await apiFetch<MeResponse>("/auth/me", { method: "GET" });
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
          body: JSON.stringify({ plan: "free", interval: "monthly", pack: 1 }),
        })) as any;

        const url = data?.url;
        if (!url) throw new Error("checkout_failed_no_url");

        window.location.href = url;
      } catch {
        if (!cancelled) router.replace("/pricing?trial=error");
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
