// frontend/middleware.ts
import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "cf_token";

// Protect authenticated surface in production
const PROTECTED_PREFIXES = [
  "/app",
  "/dashboard",
  "/upload",
  "/clips",
  "/billing",
  "/settings",
];

const AUTH_PAGES = ["/login", "/register"];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isAuthPage(pathname: string) {
  return AUTH_PAGES.includes(pathname);
}

function hasAuthCookie(req: NextRequest) {
  const v = req.cookies.get(AUTH_COOKIE)?.value;
  return typeof v === "string" && v.length > 0;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip Next internals + static + well-known files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  // ✅ DEV/CODESPACES: do NOT enforce auth in middleware
  // Cookie is set on backend origin (8000) and not readable on frontend origin (3000).
  // In dev, auth is enforced by /auth/me in the app layout.
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  // ✅ PRODUCTION: enforce via cookie on shared domain (e.g. Domain=.clipforge.ai)
  const authed = hasAuthCookie(req);

  // If logged in, keep auth pages clean
  if (authed && isAuthPage(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Protected paths require auth
  if (isProtectedPath(pathname) && !authed) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
