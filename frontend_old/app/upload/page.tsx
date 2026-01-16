"use client";

import React, { useMemo, useState } from "react";
import MarketingShell from "@/components/MarketingShell";

type LoginResponse = { access_token: string; token_type: string };
type UploadResponse = { path: string };

function StatusPill({ status }: { status: string }) {
  const isIdle = status === "idle";
  const isOk = status.toLowerCase().includes("success");
  const isFail =
    status.toLowerCase().includes("failed") || status.toLowerCase().includes("error");

  const tone = isFail
    ? "border-[rgba(255,80,110,0.25)] bg-[rgba(255,80,110,0.08)] text-[rgba(255,170,185,0.95)]"
    : isOk
    ? "border-[rgba(0,220,140,0.22)] bg-[rgba(0,220,140,0.08)] text-[rgba(170,255,220,0.95)]"
    : isIdle
    ? "border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] text-[rgba(170,180,205,0.95)]"
    : "border-[rgba(255,200,0,0.18)] bg-[rgba(255,200,0,0.08)] text-[rgba(255,235,170,0.95)]";

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${tone}`}>
      <b>Status:</b> <span className="opacity-90">{status}</span>
    </div>
  );
}

export default function UploadIndexPage() {
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("test1234");

  const [token, setToken] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [status, setStatus] = useState<string>("idle");
  const [uploadedPath, setUploadedPath] = useState<string>("");

  const canLogin = useMemo(
    () => email.length > 3 && password.length > 0,
    [email, password]
  );
  const canUpload = useMemo(() => !!token && !!file, [token, file]);

  async function login() {
    setStatus("Logging in…");
    setUploadedPath("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const text = await res.text();
        setStatus(`Login failed (${res.status}) ${text ? "— " + text : ""}`);
        return;
      }

      const data = (await res.json()) as LoginResponse;
      setToken(data.access_token);
      setStatus("Login success ✅ Token saved.");
    } catch (e: any) {
      setStatus(`Login error: ${e?.message || String(e)}`);
    }
  }

  async function upload() {
    if (!file) return;

    setStatus("Uploading…");
    setUploadedPath("");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        setStatus(`Upload failed (${res.status}) ${text ? "— " + text : ""}`);
        return;
      }

      const data = (await res.json()) as UploadResponse;
      setUploadedPath(data.path);
      setStatus("Upload success ✅");
    } catch (e: any) {
      setStatus(`Upload error: ${e?.message || String(e)}`);
    }
  }

  return (
    <MarketingShell>
      <section className="mt-16">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-4 py-1 text-xs font-semibold text-[rgba(170,180,205,0.95)]">
            ⚡ Live demo (dev)
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">
            Upload a video
          </h1>

          <p className="mt-1 text-sm text-[rgba(170,180,205,0.95)]">
            Login to get a token, then upload a video.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Login */}
          <div className="cf-panel p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white">🔑 Login</h3>
                <p className="mt-1 text-xs text-[rgba(170,180,205,0.95)]">
                  Generates a JWT token for API calls.
                </p>
              </div>

              <div className="rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs text-[rgba(170,180,205,0.95)]">
                <b>Plan:</b> free
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs text-[rgba(170,180,205,0.95)]">
                  Email
                </span>
                <input
                  className="w-full rounded-xl border border-[rgba(255,255,255,0.14)] bg-[rgba(7,10,18,0.35)] px-3 py-2 text-white"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-[rgba(170,180,205,0.95)]">
                  Password
                </span>
                <input
                  type="password"
                  className="w-full rounded-xl border border-[rgba(255,255,255,0.14)] bg-[rgba(7,10,18,0.35)] px-3 py-2 text-white"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              <button
                className={`cf-btn cf-btn-primary w-full ${
                  !canLogin ? "opacity-60 cursor-not-allowed" : ""
                }`}
                onClick={login}
                disabled={!canLogin}
              >
                Sign in
              </button>

              <div className="rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs text-[rgba(170,180,205,0.95)]">
                <b>Token:</b>{" "}
                <span className="break-all opacity-90">
                  {token ? `${token.slice(0, 42)}…` : "(none)"}
                </span>
              </div>
            </div>
          </div>

          {/* Upload */}
          <div className="cf-panel p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white">📤 Upload</h3>
                <p className="mt-1 text-xs text-[rgba(170,180,205,0.95)]">
                  Uploads a video and returns an internal storage path.
                </p>
              </div>

              <div className="rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs text-[rgba(170,180,205,0.95)]">
                <b>Auth:</b> required
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs text-[rgba(170,180,205,0.95)]">
                  Video file
                </span>
                <div className="rounded-xl border border-[rgba(255,255,255,0.14)] bg-[rgba(7,10,18,0.35)] px-3 py-2">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-[rgba(170,180,205,0.95)] file:mr-3 file:rounded-lg file:border-0 file:bg-[rgba(255,255,255,0.10)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-[rgba(255,255,255,0.14)]"
                  />
                </div>
              </label>

              <button
                className={`cf-btn cf-btn-ghost w-full ${
                  !canUpload ? "opacity-60 cursor-not-allowed" : ""
                }`}
                onClick={upload}
                disabled={!canUpload}
              >
                Upload video
              </button>

              <div className="rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs text-[rgba(170,180,205,0.95)] space-y-1">
                <div>
                  <b>Selected:</b> {file ? file.name : "(none)"}
                </div>
                <div>
                  <b>Uploaded path:</b> {uploadedPath || "(none)"}
                </div>
              </div>

              <div className="rounded-xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs text-[rgba(170,180,205,0.95)]">
                Tip: Upload a video with clear speech for best results.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <StatusPill status={status} />
        </div>
      </section>
    </MarketingShell>
  );
}
