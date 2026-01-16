"use client";

/**
 * Cookie-based auth (production):
 * - Backend sets/clears HttpOnly cookie `cf_token` on the API domain.
 * - Frontend cannot read it (HttpOnly) and should not try.
 * - Frontend only needs a "session hint" to avoid UI jitter (optional).
 *
 * We keep a small non-sensitive client hint cookie on the FRONTEND domain:
 *   cf_logged_in=1
 * This is NOT security — only UX.
 */

const LOGGED_IN_HINT = "cf_logged_in";

export function setAuthTokenHint() {
  // 7 days (match backend TTL)
  const maxAge = 60 * 60 * 24 * 7;
  document.cookie = `${LOGGED_IN_HINT}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function clearAuthTokenHint() {
  document.cookie = `${LOGGED_IN_HINT}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function isProbablyLoggedIn(): boolean {
  if (typeof document === "undefined") return false;
  const cookies = document.cookie.split(";").map((c) => c.trim());
  return cookies.some((c) => c === `${LOGGED_IN_HINT}=1` || c.startsWith(`${LOGGED_IN_HINT}=`));
}

/**
 * Back-compat (old Bearer flow). Must stay but returns null so we never send Authorization.
 */
export function getAuthToken(): string | null {
  return null;
}

/**
 * Back-compat. No-op now.
 */
export function setAuthToken(_: string) {
  setAuthTokenHint();
}

/**
 * Back-compat.
 */
export function clearAuthToken() {
  clearAuthTokenHint();
}

/**
 * Not used in cookie auth. Keep to avoid import crashes.
 */
export function decodeJwt(_: string): any | null {
  return null;
}
export function getEmailFromToken(): string | null {
  return null;
}
