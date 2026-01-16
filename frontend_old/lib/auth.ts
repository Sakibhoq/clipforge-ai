const TOKEN_KEY = "token";

function isBrowser() {
  return typeof window !== "undefined";
}

export function login(token: string) {
  if (!isBrowser()) return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function logout() {
  if (!isBrowser()) return;
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = "/login";
}

export function getToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  if (!isBrowser()) return false;
  return !!getToken();
}
