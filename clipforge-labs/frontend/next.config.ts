import type { NextConfig } from "next";

const ignoreBuildErrors = process.env.NEXT_IGNORE_TYPECHECK === "1";
const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || process.env.NEXT_BASE_PATH || "").trim();
const normalizedBasePath = rawBasePath
  ? `/${rawBasePath.replace(/^\/+/, "").replace(/\/+$/, "")}`
  : "";
const internalApiOrigin = (
  process.env.INTERNAL_API_ORIGIN ||
  process.env.LABS_INTERNAL_API_ORIGIN ||
  "http://labs-backend:8000"
)
  .trim()
  .replace(/\/+$/, "");

const nextConfig: NextConfig = {
  basePath: normalizedBasePath || undefined,
  async rewrites() {
    return [
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
