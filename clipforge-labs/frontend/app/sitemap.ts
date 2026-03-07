import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/seo";

const PUBLIC_ROUTES = [
  "/",
  "/pricing",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  const now = new Date();

  return PUBLIC_ROUTES.map((route) => ({
    url: `${origin}${route}`,
    lastModified: now,
    changeFrequency: route === "/" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
