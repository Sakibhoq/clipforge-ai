// frontend/proxy.ts
import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "cf_token";
const ONE_YEAR_SECONDS = 31536000;
const RAW_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || process.env.NEXT_BASE_PATH || "").trim();
const BASE_PATH = RAW_BASE_PATH
  ? `/${RAW_BASE_PATH.replace(/^\/+/, "").replace(/\/+$/, "")}`
  : "";

// Protect authenticated surface in production
const PROTECTED_PREFIXES = [
  "/app",
  "/dashboard",
  "/upload",
  "/clips",
  "/billing",
  "/settings",
];


function hostWithoutPort(host: string) {
  return host.split(":")[0]?.toLowerCase() || host.toLowerCase();
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function hasAuthCookie(req: NextRequest) {
  const v = req.cookies.get(AUTH_COOKIE)?.value;
  return typeof v === "string" && v.length > 0;
}

function stripBasePath(pathname: string): string {
  if (!BASE_PATH) return pathname;
  if (pathname === BASE_PATH) return "/";
  if (pathname.startsWith(`${BASE_PATH}/`)) {
    return pathname.slice(BASE_PATH.length) || "/";
  }
  return pathname;
}

function applySecurityHeaders(
  res: NextResponse,
  opts: { production: boolean; https: boolean },
) {
  const { production, https } = opts;
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  if (production && https) {
    res.headers.set(
      "Strict-Transport-Security",
      `max-age=${ONE_YEAR_SECONDS}; includeSubDomains; preload`,
    );
  }
  return res;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const routePath = stripBasePath(pathname);
  const hostHeader = req.headers.get("host") || req.nextUrl.host || "";
  const host = hostWithoutPort(hostHeader);
  const xfProto = (req.headers.get("x-forwarded-proto") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const canonicalHost = (process.env.CANONICAL_HOST || process.env.NEXT_PUBLIC_CANONICAL_HOST || "")
    .trim()
    .toLowerCase();
  const isHttps = req.nextUrl.protocol === "https:" || xfProto === "https";
  const isCodespaces =
    host.includes(".app.github.dev") || host.includes(".githubpreview.dev");
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const isProduction = process.env.NODE_ENV === "production";

  // Skip Next internals + static + well-known files
  if (
    routePath.startsWith("/_next") ||
    routePath.startsWith("/favicon") ||
    routePath.startsWith("/robots.txt") ||
    routePath.startsWith("/sitemap") ||
    routePath.startsWith("/api")
  ) {
    return applySecurityHeaders(NextResponse.next(), {
      production: isProduction,
      https: isHttps,
    });
  }

  // Production: enforce HTTPS on real domains.
  if (isProduction && !isCodespaces && !isLocal && !isHttps) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    return applySecurityHeaders(NextResponse.redirect(url), {
      production: isProduction,
      https: true,
    });
  }

  // Optional: force one canonical host in production (e.g. CANONICAL_HOST=clipforge.ai).
  // Keeps crawl/index signals on a single host and avoids duplicate-host indexing churn.
  if (isProduction && !isCodespaces && !isLocal && canonicalHost && host !== canonicalHost) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.host = canonicalHost;
    return applySecurityHeaders(NextResponse.redirect(url, 308), {
      production: isProduction,
      https: true,
    });
  }

  // ✅ DEV/CODESPACES/LOCAL: do NOT enforce auth in proxy
  // Cookie is set on backend origin (8000) and not readable on frontend origin (3000).
  // In dev, auth is enforced by /auth/me in the app layout.
  if (!isProduction || isCodespaces || isLocal) {
    return applySecurityHeaders(NextResponse.next(), {
      production: isProduction,
      https: isHttps,
    });
  }

  // Bridge fallback:
  // Older launch links may land on "/" with a bridge token.
  // Normalize to /login so bridge-login flow runs consistently.
  if (routePath === "/" && req.nextUrl.searchParams.has("bridge_token")) {
    const loginUrl = req.nextUrl.clone();
    // In Next middleware, pathname should be base-path agnostic.
    // Next will apply basePath automatically when sending the redirect.
    loginUrl.pathname = "/login";
    if (!loginUrl.searchParams.has("next")) {
      loginUrl.searchParams.set("next", "/app");
    }
    return applySecurityHeaders(NextResponse.redirect(loginUrl), {
      production: isProduction,
      https: isHttps,
    });
  }

  // ✅ PRODUCTION: enforce via cookie on shared domain (e.g. Domain=.clipforge.ai)
  const authed = hasAuthCookie(req);

  // IMPORTANT:
  // Do not auto-redirect /login or /register when a cookie is present.
  // A stale/foreign cf_token (for example, issued by Orbito backend but not
  // valid for Labs backend) must still be allowed to reach login, otherwise
  // users can get trapped in /app <-> /login redirect loops.

  // Protected paths require auth
  if (isProtectedPath(routePath) && !authed) {
    const loginUrl = req.nextUrl.clone();
    // Keep redirect targets base-path agnostic to avoid duplicate prefixes.
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", routePath);
    return applySecurityHeaders(NextResponse.redirect(loginUrl), {
      production: isProduction,
      https: isHttps,
    });
  }

  return applySecurityHeaders(NextResponse.next(), {
    production: isProduction,
    https: isHttps,
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
