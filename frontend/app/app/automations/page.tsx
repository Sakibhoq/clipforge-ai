// frontend/app/app/automations/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Rule = {
  id: number;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
  config?: Record<string, any>;
};

const presets = [
  {
    key: "yt_autopost",
    name: "Auto-post to YouTube",
    trigger: "job.completed",
    action: "autopost.queue",
    config: {
      provider: "youtube",
      schedule_delay_minutes: 0,
      caption_template: "New Orbito clip",
    },
  },
  {
    key: "yt_scheduled",
    name: "Schedule YouTube (15 min delay)",
    trigger: "job.completed",
    action: "autopost.queue",
    config: {
      provider: "youtube",
      schedule_delay_minutes: 15,
      caption_template: "New Orbito clip",
    },
  },
];

export default function AutomationsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Rule[]>("/automations/rules", { method: "GET" })
      .then((d) => setRules(Array.isArray(d) ? d : []))
      .catch(() => setRules([]));
  }, []);

  async function dispatchPosts() {
    if (busy) return;
    setBusy("dispatch");
    try {
      await apiFetch("/social/posts/dispatch", { method: "POST" });
    } finally {
      setBusy(null);
    }
  }

  async function createPreset(preset: typeof presets[number]) {
    if (busy) return;
    setBusy(preset.key);
    try {
      const rule = (await apiFetch<Rule>("/automations/rules", {
        method: "POST",
        body: JSON.stringify({
          name: preset.name,
          trigger: preset.trigger,
          action: preset.action,
          enabled: true,
          config: preset.config,
        }),
      })) as Rule;
      setRules((prev) => [rule, ...prev]);
    } finally {
      setBusy(null);
    }
  }

  const summary = useMemo(() => {
    if (!rules.length) return "No automations yet.";
    const active = rules.filter((r) => r.enabled).length;
    return `${active} active rule${active === 1 ? "" : "s"}`;
  }, [rules]);

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-10 sm:pt-12">
      <div className="surface relative overflow-hidden p-6 sm:p-8">
        <div className="text-xs text-white/55">• Automations</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Automation rules
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/65">
          Set rules so uploads can move to posting automatically. Start with YouTube, then add more platforms.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2 text-[12px] text-white/55">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">{summary}</span>
          <Link href="/app/settings?tab=social" className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
            Connect socials
          </Link>
            <button
              type="button"
              onClick={dispatchPosts}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1"
              disabled={busy === "dispatch"}
            >
              {busy === "dispatch" ? "Sending..." : "Send posts"}
            </button>
          </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => createPreset(p)}
              className="group surface-soft text-left relative overflow-hidden p-5 transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.04]"
            >
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="mt-1 text-sm text-white/60">
                Trigger: {p.trigger} · Action: {p.action}
              </div>
              <div className="mt-3 text-[12px] text-white/55">
                {busy === p.key ? "Creating..." : "Add rule"}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-10">
          <div className="text-sm font-semibold text-white/85">Your rules</div>
          <div className="mt-3 grid gap-2">
            {rules.length ? (
              rules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
                >
                  <div>
                    <div className="text-white/85 font-semibold">{r.name}</div>
                    <div className="text-white/55 text-[12px]">
                      {r.trigger} → {r.action}
                    </div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] text-white/70">
                    {r.enabled ? "Active" : "Paused"}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
                No rules yet. Add a preset to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
