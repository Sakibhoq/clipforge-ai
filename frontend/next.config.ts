import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy browser calls like /api/auth/login, /api/auth/me, /api/clips, etc.
      // This runs inside the frontend container, so "backend:8000" is reachable.
      {
        source: "/api/:path*",
        destination: "http://backend:8000/:path*",
      },
    ];
  },
};

export default nextConfig;
