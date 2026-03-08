import type { NextConfig } from "next";

const ignoreBuildErrors = process.env.NEXT_IGNORE_TYPECHECK === "1";
const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || process.env.NEXT_BASE_PATH || "").trim();
const normalizedBasePath = rawBasePath
  ? `/${rawBasePath.replace(/^\/+/, "").replace(/\/+$/, "")}`
  : "";
const configuredInternalApiOrigin = (
  process.env.INTERNAL_API_ORIGIN ||
  process.env.LABS_INTERNAL_API_ORIGIN ||
  ""
).trim();

function resolveInternalApiOrigin(raw: string): string {
  const fallback = "http://labs-backend:8000";
  const value = (raw || "").trim().replace(/\/+$/, "");
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    const host = (parsed.hostname || "").toLowerCase();
    // In production Labs frontend should proxy only to Labs backend.
    // If misconfigured to "backend" (Orbito API) we force the Labs backend.
    if (host === "backend" || host === "0.0.0.0") return fallback;
    return value;
  } catch {
    if (value.includes("backend:8000")) return fallback;
    return value || fallback;
  }
}

const internalApiOrigin = resolveInternalApiOrigin(configuredInternalApiOrigin);

const nextConfig: NextConfig = {
  basePath: normalizedBasePath || undefined,
  async rewrites() {
    return [
      // Dedicated Labs proxy path to avoid collisions with global /api routing.
      {
        source: "/_api/:path*",
        destination: `${internalApiOrigin}/:path*`,
      },
      // Proxy browser calls like /api/auth/login, /api/auth/me, /api/clips, etc.
      // This runs inside the frontend container, so "backend:8000" is reachable.
      {
        source: "/api/:path*",
        destination: `${internalApiOrigin}/:path*`,
      },
      // Local-storage upload/download helpers returned by /storage/presign in dev.
      // Keep these same-origin so browser PUT/GET can work without CORS issues.
      {
        source: "/storage/:path*",
        destination: `${internalApiOrigin}/storage/:path*`,
      },
    ];
  },
  // Build reliability (Docker): allow opt-in skips to avoid CI crashes on type/lint
  typescript: {
    ignoreBuildErrors,
  },
};

export default nextConfig;
