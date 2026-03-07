export type AppPlan = "free" | "starter" | "creator" | "studio";

function canonicalizePlan(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const PLAN_ALIASES: Record<string, AppPlan> = {
  free: "free",
  free_trial: "free",
  trial: "free",
  trialing: "free",
  starter: "starter",
  starter_monthly: "starter",
  starter_yearly: "starter",
  labs_starter: "starter",
  labs_spark: "starter",
  creator: "creator",
  creator_plus: "creator",
  creator_monthly: "creator",
  creator_yearly: "creator",
  labs_creator: "creator",
  labs_velocity: "creator",
  pro: "creator",
  pro_plus: "creator",
  studio: "studio",
  studio_monthly: "studio",
  studio_yearly: "studio",
};

export function normalizeAppPlan(raw: string | null | undefined): AppPlan {
  const plan = canonicalizePlan(raw);
  if (!plan) return "free";

  const alias = PLAN_ALIASES[plan];
  if (alias) return alias;

  if (plan.startsWith("starter")) return "starter";
  if (plan.startsWith("creator") || plan.startsWith("pro")) return "creator";
  if (plan.startsWith("studio")) return "studio";

  if (plan.includes("starter")) return "starter";
  if (plan.includes("creator")) return "creator";
  if (plan.includes("studio")) return "studio";

  return "free";
}

export function hasLabsPlanAccess(raw: string | null | undefined): boolean {
  const plan = canonicalizePlan(raw);
  if (!plan) return false;

  const explicitLabsPlans = new Set([
    "labs_starter",
    "labs_spark",
    "labs_creator",
    "labs_velocity",
  ]);
  if (explicitLabsPlans.has(plan)) return true;

  return plan.includes("labs") || plan.includes("spark") || plan.includes("velocity");
}
