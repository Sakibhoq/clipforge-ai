"use client";

export type MeLike = {
  name?: string | null;
  email?: string | null;
};

function titleCase(input: string) {
  return input.replace(/\b\w/g, (c) => c.toUpperCase());
}

function friendlyName(input: string): string {
  const cleaned = String(input || "").trim().replace(/[._-]+/g, " ");
  if (!cleaned) return "";

  const firstToken = cleaned.split(/\s+/).find(Boolean) || cleaned;
  const raw = firstToken.replace(/[^a-z0-9]/gi, "");
  if (!raw) return "";

  let token = raw.replace(/\d+$/g, "");
  for (const suffix of ["llc", "inc", "corp", "company", "co", "studio", "labs", "media", "team", "app", "hq"]) {
    if (token.length > suffix.length + 1 && token.toLowerCase().endsWith(suffix)) {
      token = token.slice(0, -suffix.length);
      break;
    }
  }

  return titleCase(token || raw);
}

export function displayNameFromUser(user: MeLike | null | undefined): string {
  const name = user?.name?.trim();
  if (name) return friendlyName(name);

  const email = user?.email?.trim();
  if (email && email.includes("@")) {
    const local = email.split("@")[0].trim();
    if (local) return friendlyName(local);
  }

  return "Creator";
}
