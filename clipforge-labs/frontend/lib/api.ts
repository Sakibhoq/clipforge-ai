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
  return basePath ? `${basePath}/lapi` : "/lapi";
}

function labsLegacyProxyApiBase(): string {
  const envBasePath = normalizeBasePath(
    process.env.NEXT_PUBLIC_BASE_PATH || process.env.NEXT_BASE_PATH || "",
  );
  const basePath = envBasePath || inferLabsBasePathFromLocation();
  return basePath ? `${basePath}/api` : "/api";
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

function isAuthMePath(path: string): boolean {
  const p = String(path || "").trim().toLowerCase();
  return p === "/auth/me" || p.endsWith("/auth/me");
}

function isValidAuthMePayload(body: any): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (typeof (body as any).email !== "string") return false;
  if (!("plan" in (body as any))) return false;
  if (!("credits" in (body as any))) return false;
  return true;
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

function getCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  const match = document.cookie
    .split(";")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(prefix));
  if (!match) return "";
  return decodeURIComponent(match.slice(prefix.length));
}

function isMutatingMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function addCsrfHeader(headers: Headers, method: string) {
  if (!isMutatingMethod(method)) return;
  const token = getCookie("cf_csrf");
  if (!token) return;
  headers.set("x-csrf-token", token);
}

function isCsrfValidationError(status: number, parsed: any): boolean {
  if (status !== 403) return false;
  const detail = String(parsed?.detail || parsed?.message || parsed?.error || "").toLowerCase();
  return detail.includes("csrf");
}

async function refreshCsrfCookie(base: string): Promise<void> {
  const authMeUrl = `${base}${base.endsWith("/") ? "" : "/"}auth/me`;
  try {
    await fetch(authMeUrl, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    // Best effort only: caller will continue with normal error handling.
  }
}

/**
 * apiFetch<T>(path, init)
 * - Cookie-auth by default
 * - Throws a structured object on non-2xx
 */
type ApiFetchInit = Omit<RequestInit, "body"> & { body?: any };

export async function apiFetch<T = any>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const base = getApiBase();
  const method = (init.method || "GET").toUpperCase();

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
  addCsrfHeader(headers, method);

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

  let parsed = await readJsonSafe(res);

  // If user has a valid auth cookie but missing/stale CSRF token, self-heal once.
  if (isMutatingMethod(method) && isCsrfValidationError(res.status, parsed)) {
    await refreshCsrfCookie(base);
    const retryHeaders = new Headers(headers);
    addCsrfHeader(retryHeaders, method);
    if (retryHeaders.get("x-csrf-token")) {
      try {
        const retryRes = await fetch(url, {
          ...init,
          headers: retryHeaders,
          body,
          credentials: "include",
          cache: "no-store",
        });
        const retryParsed = await readJsonSafe(retryRes);
        if (retryRes.ok) return retryParsed as T;
        res = retryRes;
        parsed = retryParsed;
      } catch {
        // Keep original CSRF error path if retry transport fails.
      }
    }
  }
  const authMe = isAuthMePath(path);
  const invalidAuthMePayload = authMe && !isValidAuthMePayload(parsed);

  // Resilience fallback:
  // If Labs/auth routes return proxy/edge mismatch responses, retry against
  // alternate API bases.
  // This protects prompt/generation flows when proxy/basePath routing is stale.
  if (
    (res.status === 404 || res.status === 502 || res.status === 503 || res.status === 504 || invalidAuthMePayload) &&
    typeof path === "string" &&
    (path.startsWith("/labs/") || path.startsWith("/jobs/") || path === "/jobs" || authMe)
  ) {
    const candidateBases = [
      labsProxyApiBase(),
      "/app/labs/lapi",
      "/lapi",
      labsLegacyProxyApiBase(),
      "/app/labs/api",
      "/api",
      guessPublicApiOriginFromPage() || "https://api.orbito.cc",
    ];
    let lastErr: any = null;
    const seen = new Set<string>();

    for (const candidateBase of candidateBases) {
      if (!candidateBase || seen.has(candidateBase)) continue;
      seen.add(candidateBase);
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
        const retryInvalidAuthMePayload = authMe && !isValidAuthMePayload(retryParsed);
        if (retryRes.ok && !retryInvalidAuthMePayload) {
          return retryParsed as T;
        }
        if (retryInvalidAuthMePayload) {
          lastErr = {
            status: 502,
            url: candidateUrl,
            detail: "Invalid auth payload from upstream",
          };
        } else {
          lastErr = buildErrorPayload(retryRes, candidateUrl, retryParsed);
        }
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

  if (invalidAuthMePayload) {
    throw {
      status: 502,
      url,
      detail: "Invalid auth payload from upstream",
    } satisfies ApiErrorShape;
  }

  if (!res.ok) {
    throw buildErrorPayload(res, url, parsed);
  }

  return parsed as T;
}
