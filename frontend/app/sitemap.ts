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

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const now = new Date();

  const pages: Array<{
    path: string;
    changeFrequency: "daily" | "weekly" | "monthly";
    priority: number;
  }> = [
    { path: "/", changeFrequency: "daily", priority: 1.0 },
    { path: "/pricing", changeFrequency: "weekly", priority: 0.8 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.7 },
    { path: "/privacy-policy", changeFrequency: "monthly", priority: 0.4 },
    { path: "/terms-of-service", changeFrequency: "monthly", priority: 0.4 },
  ];

  return pages.map((page) => ({
    url: `${origin}${page.path}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
