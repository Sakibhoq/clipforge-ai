"use client";

/* =========================================================
   Orbito Labs — API helper (cookie auth, Codespaces-safe)

   - Backend auth uses HttpOnly cookie: cf_token
   - Therefore ALL requests must include:
       credentials: "include"

   Codespaces:
     frontend: https://<name>-3000.app.github.dev
     backend:  https://<name>-8000.app.github.dev

   Production:
     NEXT_PUBLIC_API_BASE=https://api.clipforge.us
========================================================= */

type ApiErrorShape =
  | { detail?: any; message?: any; error?: any; status?: number; url?: string }
  | string
  | any;

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeBasePath(rawBase: string): string {
  const trimmed = (rawBase || "").trim();
  if (!trimmed) return "";
  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function inferLabsBasePathFromLocation(): string {
  if (!isBrowser()) return "";
  const pathname = String(window.location.pathname || "/");
  const marker = "/app/labs";
  const idx = pathname.toLowerCase().indexOf(marker);
  if (idx < 0) return "";
  return pathname.slice(idx, idx + marker.length) || marker;
}

function labsProxyApiBase(): string {
  const envBasePath = normalizeBasePath(
    process.env.NEXT_PUBLIC_BASE_PATH || process.env.NEXT_BASE_PATH || "",
  );
  const basePath = envBasePath || inferLabsBasePathFromLocation();
  // Use a dedicated labs proxy prefix so reverse-proxy /api rules for Orbito
  // cannot accidentally intercept Labs API traffic.
  return basePath ? `${basePath}/_api` : "/_api";
}

function shouldForceLabsProxyApi(): boolean {
  const raw = (process.env.NEXT_PUBLIC_LABS_FORCE_PROXY_API || "1").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  if (!isBrowser()) return true;
  const envBasePath = normalizeBasePath(
    process.env.NEXT_PUBLIC_BASE_PATH || process.env.NEXT_BASE_PATH || "",
  );
  const basePath = envBasePath || inferLabsBasePathFromLocation();
  if (!basePath) return true;
  const pathname = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
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

function isLocalPageHost(): boolean {
  if (!isBrowser()) return false;
  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function isInternalBackendUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "backend";
  } catch {
    return false;
  }
}

function guessPublicApiOriginFromPage(): string | null {
  if (!isBrowser()) return null;

  const host = window.location.hostname.toLowerCase();
  const proto = window.location.protocol;

  // Skip local/codespaces hosts.
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".app.github.dev") ||
    host.endsWith(".githubpreview.dev")
  ) {
    return null;
  }

  // If already on api host, use it.
  if (host.startsWith("api.")) return `${proto}//${host}`;

  // app.<domain> / www.<domain> -> api.<domain>
  if (host.startsWith("app.")) return `${proto}//api.${host.slice(4)}`;
  if (host.startsWith("www.")) return `${proto}//api.${host.slice(4)}`;

  // <domain> -> api.<domain>
  return `${proto}//api.${host}`;
}

function normalizeEnvBase(envBase: string): string {
  const trimmed = envBase.replace(/\/+$/, "");

  if (!isBrowser()) return trimmed;
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const pageHost = window.location.hostname.toLowerCase();
    const pageHostFull = window.location.host.toLowerCase();
    const pageIsCodespaces =
      pageHostFull.includes(".app.github.dev") || pageHostFull.includes(".githubpreview.dev");
    const pageIsLocal = pageHost === "localhost" || pageHost === "127.0.0.1";

    // NOTE: Do NOT force /api for production api subdomains.
    // app.<domain> should talk directly to api.<domain>.

    const isInternalHost =
      host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "backend";
    const isCodespacesHost =
      host.endsWith(".app.github.dev") || host.endsWith(".githubpreview.dev");

    // Codespaces should never call production APIs directly.
    // Use same-origin /api proxy to keep cookies on the preview domain.
    if (pageIsCodespaces && !isCodespacesHost && !isInternalHost) {
      return "/api";
    }

    // If build-time base is internal but page is public, prefer inferred public api host.
    if ((isInternalHost || isCodespacesHost) && !pageIsLocal && !pageIsCodespaces) {
      const guessed = guessPublicApiOriginFromPage();
      if (guessed) return guessed;
      return "/api";
    }

    // If site is https but env base is http, upgrade to https.
    if (window.location.protocol === "https:" && parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

export function getApiBase(): string {
  if (shouldForceLabsProxyApi()) {
    return labsProxyApiBase();
  }

  // Prefer explicit env override (works for EC2 + local + Codespaces)
  const envBase =
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_URL ||
    "";

  if (envBase) {
    const normalized = normalizeEnvBase(envBase);
    // Ignore internal build-time bases when page is not actually local.
    if (!(isInternalBackendUrl(normalized) && !isLocalPageHost())) {
      return normalized;
    }
  }

  // Codespaces fallback (direct to -8000)
  const cs = guessCodespacesBackendOrigin();
  if (cs) return cs;

  // Local fallback (match host)
  const local = guessLocalBackendOrigin();
  if (local) return local;

  // Public host fallback (app.<domain> -> api.<domain>)
  const inferred = guessPublicApiOriginFromPage();
  if (inferred) return inferred;

  // Last resort: same-origin proxy
  return "/api";
}

/**
 * Direct backend origin for large/binary upload paths.
 * Avoids same-origin frontend proxy limits (often causes HTTP 413).
 */
export function getDirectApiBase(): string {
  if (shouldForceLabsProxyApi()) {
    return labsProxyApiBase();
  }

  const envBase =
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_URL ||
    "";
  if (envBase) {
    const normalized = normalizeEnvBase(envBase);
    // For direct uploads, never keep an internal localhost/backend base on non-local pages.
    if (
      normalized !== "/api" &&
      !(isInternalBackendUrl(normalized) && !isLocalPageHost())
    ) {
      return normalized;
    }
  }

  const cs = guessCodespacesBackendOrigin();
  if (cs) return cs;

  const local = guessLocalBackendOrigin();
  if (local) return local;

  const inferred = guessPublicApiOriginFromPage();
  if (inferred) return inferred;

  // Final fallback (may still be proxied/same-origin).
  return getApiBase();
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
type ApiFetchInit = Omit<RequestInit, "body"> & { body?: any };

export async function apiFetch<T = any>(path: string, init: ApiFetchInit = {}): Promise<T> {
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

  // Resilience fallback:
  // If Labs generation routes return 404, retry against alternate API bases.
  // This protects prompt/generation flows when proxy/basePath routing is stale.
  if (
    res.status === 404 &&
    typeof path === "string" &&
    (path.startsWith("/labs/") || path.startsWith("/jobs/") || path === "/jobs")
  ) {
    const candidateBases = [
      labsProxyApiBase(),
      "/_api",
      "/api",
      guessPublicApiOriginFromPage() || "https://api.orbito.cc",
    ];
    let lastErr: any = null;

    for (const candidateBase of candidateBases) {
      const candidateUrl =
        path.startsWith("http")
          ? path
          : `${candidateBase}${path.startsWith("/") ? "" : "/"}${path}`;
      if (candidateUrl === url) continue;

      try {
        const retryRes = await fetch(candidateUrl, {
          ...init,
          headers,
          body,
          credentials: "include",
          cache: "no-store",
        });
        const retryParsed = await readJsonSafe(retryRes);
        if (retryRes.ok) {
          return retryParsed as T;
        }
        lastErr = buildErrorPayload(retryRes, candidateUrl, retryParsed);
      } catch (retryErr: any) {
        lastErr = retryErr;
      }
    }

    if (lastErr && typeof lastErr === "object") {
      if ("status" in lastErr || "detail" in lastErr || "message" in lastErr) {
        throw lastErr;
      }
    }
  }

  if (!res.ok) {
    throw buildErrorPayload(res, url, parsed);
  }

  return parsed as T;
}
