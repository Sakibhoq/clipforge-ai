import type { MetadataRoute } from "next";

function siteOrigin() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.CANONICAL_URL ||
    "https://orbito.cc";
  const trimmed = String(raw || "").trim();
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://orbito.cc";
  }
}

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/app",
          "/dashboard",
          "/upload",
          "/clips",
          "/billing",
          "/settings",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/start-trial",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
