"use client";

/* =========================================================
   Orbito — API helper (cookie auth, Codespaces-safe)

   - Backend auth uses HttpOnly cookie: cf_token
   - Therefore ALL requests must include:
       credentials: "include"

   Codespaces:
     frontend: https://<name>-3000.app.github.dev
     backend:  https://<name>-8000.app.github.dev

   Production (EC2):
     NEXT_PUBLIC_API_BASE=https://api.orbito.cc
========================================================= */

type ApiErrorShape =
  | { detail?: any; message?: any; error?: any; status?: number; url?: string }
  | string
  | any;

function isBrowser() {
  return typeof window !== "undefined";
}

function guessCodespacesBackendOrigin(): string | null {
  if (!isBrowser()) return null;

  const host = window.location.host; // e.g. organic-funicular-xxx-3000.app.github.dev
  const proto = window.location.protocol; // "https:"

  if (!host.includes(".app.github.dev")) return null;

  const backendHost = host.replace(/-3000(\.app\.github\.dev)$/, "-8000$1");
  if (backendHost === host) return null;

  return `${proto}//${backendHost}`;
}

function guessLocalBackendOrigin(): string | null {
  if (!isBrowser()) return null;

  const hostname = window.location.hostname; // "localhost" OR "127.0.0.1"
  const proto = window.location.protocol; // usually "http:"

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${proto}//${hostname}:8000`;
  }
  return null;
}

function getApiBase(): string {
  // Prefer explicit env override (works for EC2 + local + Codespaces)
  const envBase =
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_URL ||
    "";

  if (envBase) return envBase.replace(/\/+$/, "");

  // Codespaces fallback (direct to -8000)
  const cs = guessCodespacesBackendOrigin();
  if (cs) return cs;

  // Local fallback (match host)
  const local = guessLocalBackendOrigin();
  if (local) return local;

  // Last resort: same-origin proxy (only if you actually implemented it)
  return "/api";
}

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildErrorPayload(res: Response, url: string, body: any): Record<string, any> {
  const payload: Record<string, any> = { status: res.status, url };

  if (body && typeof body === "object") {
    if ("detail" in body) payload.detail = (body as any).detail;
    if ("message" in body) payload.message = (body as any).message;
    if ("error" in body) payload.error = (body as any).error;

    if (!payload.detail && !payload.message && !payload.error) {
      payload.body = body;
    }
  } else if (typeof body === "string") {
    payload.message = body;
  }

  return payload;
}

function isPlainObject(v: any): v is Record<string, any> {
  if (!v || typeof v !== "object") return false;
  if (v instanceof FormData) return false;
  if (v instanceof Blob) return false;
  if (v instanceof ArrayBuffer) return false;
  if (v instanceof URLSearchParams) return false;
  if (typeof ReadableStream !== "undefined" && v instanceof ReadableStream) return false;
  return Object.prototype.toString.call(v) === "[object Object]";
}

/**
 * apiFetch<T>(path, init)
 * - Cookie-auth by default
 * - Throws a structured object on non-2xx
 */
export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const base = getApiBase();

  // If base is "/api", keep relative routing.
  // Otherwise, call backend origin directly.
  const url =
    path.startsWith("http")
      ? path
      : base === "/api"
        ? `${base}${path.startsWith("/") ? "" : "/"}${path}`
        : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = new Headers(init.headers || {});
  let body: RequestInit["body"] = init.body;

  if (isPlainObject(body)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  } else if (typeof body === "string") {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      body,
      credentials: "include",
      cache: "no-store",
    });
  } catch (e: any) {
    throw { message: e?.message || "Failed to fetch", url } satisfies ApiErrorShape;
  }

  const parsed = await readJsonSafe(res);

  if (!res.ok) {
    throw buildErrorPayload(res, url, parsed);
  }

  return parsed as T;
}
