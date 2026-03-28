import path from "path";
import type { NextConfig } from "next";

const ignoreBuildErrors = process.env.NEXT_IGNORE_TYPECHECK === "1";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the monorepo root explicitly so Next does not guess across multiple lockfiles.
    root: path.resolve(__dirname, ".."),
  },
  async rewrites() {
    return [
      // Proxy browser calls like /api/auth/login, /api/auth/me, /api/clips, etc.
      // This runs inside the frontend container, so "backend:8000" is reachable.
      {
        source: "/api/:path*",
        destination: "http://backend:8000/:path*",
      },
      // Local-storage upload/download helpers returned by /storage/presign in dev.
      // Keep these same-origin so browser PUT/GET can work without CORS issues.
      {
        source: "/storage/:path*",
        destination: "http://backend:8000/storage/:path*",
      },
    ];
  },
  // Build reliability (Docker): allow opt-in skips to avoid CI crashes on type/lint
  typescript: {
    ignoreBuildErrors,
  },
};

export default nextConfig;
