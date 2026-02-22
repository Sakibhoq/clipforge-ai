const DEFAULT_SITE_URL = "https://orbito.cc";

function normalizeSiteUrl(raw?: string | null): string {
  const value = (raw || "").trim();
  if (!value) return DEFAULT_SITE_URL;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function getSiteUrl(): URL {
  const candidate = normalizeSiteUrl(
    process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.FRONTEND_BASE_URL,
  );

  try {
    return new URL(candidate);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

export function getSiteOrigin(): string {
  const url = getSiteUrl();
  return `${url.protocol}//${url.host}`;
}
