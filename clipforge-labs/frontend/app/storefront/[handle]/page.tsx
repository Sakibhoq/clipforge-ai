// frontend/app/storefront/[handle]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Storefront = {
  handle: string;
  display_name?: string | null;
  bio?: string | null;
  hero?: string | null;
  pricing?: Record<string, any> | null;
  published: boolean;
};

export default function StorefrontPublicPage() {
  const params = useParams();
  const handle = String(params?.handle || "");
  const [data, setData] = useState<Storefront | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) return;
    apiFetch<Storefront>(`/storefront/${handle}`, { method: "GET" })
      .then((d) => setData(d))
      .catch(() => setError("Storefront not found."));
  }, [handle]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-6 pb-24 pt-12">
        {error && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
            {error}
          </div>
        )}

        {data && (
          <div className="surface relative overflow-hidden p-6 sm:p-8">
            <div className="text-xs text-white/55">• Creator storefront</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {data.display_name || data.handle}
            </h1>
            {data.hero && <p className="mt-2 text-sm text-white/60">{data.hero}</p>}
            {data.bio && <p className="mt-4 text-sm leading-relaxed text-white/70">{data.bio}</p>}

            <div className="mt-8 grid gap-3">
              {(data.pricing?.tiers || []).map((t: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-white/60">{t.desc}</div>
                  </div>
                  <div className="text-sm text-white/80">{t.price}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
