export type LabsLaunchTarget = "generate" | "clips";

export function normalizeLabsTarget(raw: string | string[] | null | undefined): LabsLaunchTarget {
  const value = Array.isArray(raw) ? String(raw[0] || "") : String(raw || "");
  return value.trim().toLowerCase() === "clips" ? "clips" : "generate";
}

export function labsLaunchPath(target: LabsLaunchTarget = "generate"): string {
  return target === "clips" ? "/app/labs?target=clips" : "/app/labs?target=generate";
}

export function labsMarketingPath(): string {
  return "/labs";
}
