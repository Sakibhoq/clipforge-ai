// frontend/proxy.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveLabsFrontendEntry, resolveLabsFrontendPath } from "./lib/labs-launch";
import { labsLaunchPath, normalizeLabsTarget } from "./lib/labs-routes";

const AUTH_COOKIE = "cf_token";
const ONE_YEAR_SECONDS = 31536000;
const ORBITO_APP_ORIGIN = (
  process.env.NEXT_PUBLIC_ORBITO_APP_ORIGIN || "https://app.orbito.cc"
)
  .trim()
  .replace(/\/+$/, "");

function hostFromOrigin(origin: string) {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return "app.orbito.cc";
  }
}

// Protect authenticated surface in production
const PROTECTED_PREFIXES = [
  "/app",
  "/dashboard",
  "/upload",
  "/clips",
  "/billing",
  "/settings",
];

const APP_SURFACE_PREFIXES = [
  "/app",
  "/dashboard",
  "/upload",
  "/clips",
  "/billing",
  "/settings",
  "/studio",
  "/connections",
  "/automations",
  "/storefront",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/start-trial",
];

function hostWithoutPort(host: string) {
  return host.split(":")[0]?.toLowerCase() || host.toLowerCase();
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isAppSurface(pathname: string) {
  return APP_SURFACE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function hasAuthCookie(req: NextRequest) {
  const v = req.cookies.get(AUTH_COOKIE)?.value;
  return typeof v === "string" && v.length > 0;
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
  const hostHeader = req.headers.get("host") || req.nextUrl.host || "";
  const host = hostWithoutPort(hostHeader);
  const xfProto = (req.headers.get("x-forwarded-proto") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const canonicalApexHost = (
    process.env.CANONICAL_HOST ||
    process.env.NEXT_PUBLIC_CANONICAL_HOST ||
    "orbito.cc"
  )
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const canonicalWwwHost = `www.${canonicalApexHost}`;
  const isHttps = req.nextUrl.protocol === "https:" || xfProto === "https";
  const isCodespaces =
    host.includes(".app.github.dev") || host.includes(".githubpreview.dev");
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const isProduction = process.env.NODE_ENV === "production";

  // Skip Next internals + static + well-known files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap") ||
    pathname.startsWith("/api")
  ) {
    return applySecurityHeaders(NextResponse.next(), {
      production: isProduction,
      https: isHttps,
    });
  }

  const orbitoAppHost = hostFromOrigin(ORBITO_APP_ORIGIN);
  const labsTarget = normalizeLabsTarget(req.nextUrl.searchParams.get("target"));
  const redirectToLabsFrontendPath = (path: string, search = "") => {
    // Keep every entry point pointed at the configured Labs frontend instead of a hardcoded production URL.
    const target = new URL(resolveLabsFrontendPath(path));
    if (search) target.search = search;
    return applySecurityHeaders(NextResponse.redirect(target, 308), {
      production: isProduction,
      https: true,
    });
  };
  const redirectToLabsFrontendEntry = (target: "generate" | "clips") => {
    const resolved = new URL(resolveLabsFrontendEntry(target));
    return applySecurityHeaders(NextResponse.redirect(resolved, 308), {
      production: isProduction,
      https: true,
    });
  };

  // Normalize every Labs launch path through one entry route so local, staging, and production behave the same.
  if (pathname === "/labs") {
    const target = new URL(labsLaunchPath("generate"), req.nextUrl);
    target.hash = "";
    return applySecurityHeaders(NextResponse.redirect(target, 308), {
      production: isProduction,
      https: isHttps,
    });
  }
  if (pathname === "/app/labs") {
    return redirectToLabsFrontendEntry(labsTarget);
  }
  if (pathname === "/app/labs/contact") return redirectToLabsFrontendPath("/contact");
  if (pathname === "/app/labs/privacy-policy") return redirectToLabsFrontendPath("/privacy-policy");
  if (pathname === "/app/labs/terms-of-service") return redirectToLabsFrontendPath("/terms-of-service");
  if (pathname.startsWith("/app/labs/")) {
    const suffix = pathname.slice("/app/labs".length) || "/";
    return redirectToLabsFrontendPath(suffix, req.nextUrl.search);
  }

  // Keep nested Labs marketing paths normalized to canonical /labs.
  if (pathname.startsWith("/labs/")) {
    const target = req.nextUrl.clone();
    target.pathname = "/labs";
    target.search = "";
    target.hash = "";
    return applySecurityHeaders(NextResponse.redirect(target, 308), {
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

  // Keep crawl/index signals on the apex host.
  // This avoids duplicate host indexing between www and non-www.
  if (isProduction && !isCodespaces && !isLocal && host === canonicalWwwHost) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.host = canonicalApexHost;
    return applySecurityHeaders(NextResponse.redirect(url, 308), {
      production: isProduction,
      https: true,
    });
  }

  // Enforce trust: marketing on apex, product on app subdomain.
  if (
    isProduction &&
    !isCodespaces &&
    !isLocal &&
    orbitoAppHost &&
    canonicalApexHost &&
    orbitoAppHost !== canonicalApexHost
  ) {
    // Marketing content should stay on the apex host, even if a user lands on app.orbito.cc.
    if (host === orbitoAppHost && !isAppSurface(pathname)) {
      const url = req.nextUrl.clone();
      url.protocol = "https:";
      url.host = canonicalApexHost;
      return applySecurityHeaders(NextResponse.redirect(url, 308), {
        production: isProduction,
        https: true,
      });
    }
    // Product routes should stay on the app host so auth and app navigation stay consistent.
    if (host === canonicalApexHost && isAppSurface(pathname)) {
      const target = new URL(req.nextUrl.pathname + req.nextUrl.search, ORBITO_APP_ORIGIN);
      return applySecurityHeaders(NextResponse.redirect(target, 308), {
        production: isProduction,
        https: true,
      });
    }
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

  // ✅ PRODUCTION: enforce protected routes via cookie on shared domain.
  // Do NOT auto-redirect /login or /register based on cookie presence:
  // stale/invalid cookies can otherwise trap users outside login.
  const authed = hasAuthCookie(req);

  // Protected paths require auth
  if (isProtectedPath(pathname) && !authed) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
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
