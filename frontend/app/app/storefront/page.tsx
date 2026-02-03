// frontend/app/app/storefront/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Storefront = {
  handle: string;
  display_name?: string | null;
  bio?: string | null;
  hero?: string | null;
  pricing?: Record<string, any> | null;
  published: boolean;
};

export default function StorefrontPage() {
  const [data, setData] = useState<Storefront | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Storefront>("/storefront/me", { method: "GET" })
      .then((d) => setData(d))
      .catch(() => setError("Unable to load storefront."));
  }, []);

  async function onSave() {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<Storefront>("/storefront/me", {
        method: "POST",
        body: data,
      });
      setData(res);
    } catch (e: any) {
      setError(e?.detail || "Failed to save storefront.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-10 sm:pt-12">
      <div className="surface relative overflow-hidden p-6 sm:p-8">
        <div className="text-xs text-white/55">• Storefront</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Creator storefront
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/65">
          This is your public page for clients and followers. Publish when you’re ready.
        </p>

        {error && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
            {error}
          </div>
        )}

        {data ? (
          <div className="mt-6 grid gap-4">
            <div className="grid gap-2">
              <label className="text-[12px] text-white/60">Handle</label>
              <input
                className="h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white/90"
                value={data.handle}
                onChange={(e) => setData({ ...data, handle: e.target.value })}
              />
              <div className="text-[12px] text-white/45">
                Public URL:{" "}
                <Link href={`/storefront/${data.handle}`} className="underline">
                  /storefront/{data.handle}
                </Link>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-[12px] text-white/60">Display name</label>
              <input
                className="h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white/90"
                value={data.display_name || ""}
                onChange={(e) => setData({ ...data, display_name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-[12px] text-white/60">Hero</label>
              <input
                className="h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white/90"
                value={data.hero || ""}
                onChange={(e) => setData({ ...data, hero: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-[12px] text-white/60">Bio</label>
              <textarea
                className="min-h-[90px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90"
                value={data.bio || ""}
                onChange={(e) => setData({ ...data, bio: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-[12px] text-white/60">Pricing JSON</label>
              <textarea
                className="min-h-[140px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/80 font-mono"
                value={JSON.stringify(data.pricing || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value || "{}");
                    setData({ ...data, pricing: parsed });
                  } catch {
                    // ignore parse errors until valid JSON
                  }
                }}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={!!data.published}
                onChange={(e) => setData({ ...data, published: e.target.checked })}
              />
              Published
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onSave}
                className="btn-aurora text-sm"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save storefront"}
              </button>
              <Link href={`/storefront/${data.handle}`} className="btn-ghost text-sm">
                Preview
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 text-sm text-white/60">Loading storefront…</div>
        )}
      </div>
    </div>
  );
}
