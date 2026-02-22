import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/app",
          "/dashboard",
          "/api",
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
