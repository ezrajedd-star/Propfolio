import { PLANS, PLAN_CONFIG, type PlanName } from "@/domain/plans/plans";

export type PlanRecommendation =
  | { kind: "plan"; plan: PlanName; reason: string }
  /** Beyond the largest plan: talk to us. */
  | { kind: "contact"; reason: string };

/**
 * The smallest plan that fits a portfolio, for the website's plan picker. Uses the same limits
 * the app enforces. Needing paid features (payments, reports, documents) is a separate choice the
 * picker shows as a tick box.
 */
export function recommendPlan(
  units: number,
  users: number,
  needs: { payments?: boolean; team?: boolean } = {},
): PlanRecommendation {
  const u = Math.max(1, Math.floor(units));
  const p = Math.max(1, Math.floor(users));
  const minimum: PlanName = needs.team ? "PREMIUM" : needs.payments ? "PRO" : "FREE";
  const start = PLANS.indexOf(minimum);
  for (const plan of PLANS.slice(start)) {
    const c = PLAN_CONFIG[plan];
    if (u <= c.units && p <= c.users) {
      return { kind: "plan", plan, reason: reasonFor(plan, u, p, minimum) };
    }
  }
  return {
    kind: "contact",
    reason: `More than ${PLAN_CONFIG.PREMIUM.units} units or ${PLAN_CONFIG.PREMIUM.users} users: talk to us about a larger plan.`,
  };
}

function reasonFor(plan: PlanName, units: number, users: number, minimum: PlanName): string {
  const c = PLAN_CONFIG[plan];
  if (plan === minimum && plan !== "FREE" && units <= PLAN_CONFIG.FREE.units && users === 1) {
    return plan === "PRO"
      ? "Payments, the overdue list and reports start on Pro."
      : "Teams, documents and the audit log come with Premium.";
  }
  if (users > 1) return `${users} people need Premium: up to ${c.users} users.`;
  return `${units} ${units === 1 ? "unit fits" : "units fit"} in ${c.label}: up to ${c.units} units.`;
}
