"use client";

export type MeLike = {
  name?: string | null;
  email?: string | null;
};

function titleCase(input: string) {
  return input.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function displayNameFromUser(user: MeLike | null | undefined): string {
  const name = user?.name?.trim();
  if (name) return name;

  const email = user?.email?.trim();
  if (email && email.includes("@")) {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    if (local) return titleCase(local);
  }

  return "Creator";
}
