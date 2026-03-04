// frontend/middleware.ts
import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "cf_token";
const ONE_YEAR_SECONDS = 31536000;

// Protect authenticated surface in production
const PROTECTED_PREFIXES = [
  "/app",
  "/dashboard",
  "/upload",
  "/clips",
  "/billing",
  "/settings",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get("host") || req.nextUrl.host || "").toLowerCase();
  const xfProto = (req.headers.get("x-forwarded-proto") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
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

  // Production: enforce HTTPS on real domains.
  if (isProduction && !isCodespaces && !isLocal && !isHttps) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    return applySecurityHeaders(NextResponse.redirect(url), {
      production: isProduction,
      https: true,
    });
  }

  // ✅ DEV/CODESPACES/LOCAL: do NOT enforce auth in middleware
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
