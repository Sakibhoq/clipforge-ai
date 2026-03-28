import { type LabsLaunchTarget } from "./labs-routes";

const DEFAULT_ORBITO_APP_ORIGIN = "https://app.orbito.cc";
const DEFAULT_LABS_FRONTEND_URL = `${DEFAULT_ORBITO_APP_ORIGIN}/app/labs`;

function cleanUrl(raw: string | undefined, fallback: string): string {
  const value = String(raw || "").trim();
  if (!value) return fallback;
  if (!value.includes("://") && value.includes(".")) {
    return `https://${value}`;
  }
  return value;
}

export function resolveLabsFrontendBaseUrl(): string {
  return cleanUrl(
    process.env.LABS_FRONTEND_URL ||
      process.env.NEXT_PUBLIC_LABS_FRONTEND_URL ||
      process.env.NEXT_PUBLIC_LABS_MARKETING_URL ||
      "",
    DEFAULT_LABS_FRONTEND_URL,
  ).replace(/\/+$/, "");
}

export function resolveLabsFrontendPath(pathSuffix = ""): string {
  const url = new URL(resolveLabsFrontendBaseUrl());
  const basePath = url.pathname.replace(/\/+$/, "");
  const suffix = pathSuffix ? `/${pathSuffix.replace(/^\/+/, "")}` : "";
  url.pathname = `${basePath}${suffix}`.replace(/\/{2,}/g, "/");
  return url.toString();
}

export function resolveLabsFrontendEntry(target: LabsLaunchTarget): string {
  return resolveLabsFrontendPath(target === "clips" ? "/app/clips" : "/app/generate");
}
