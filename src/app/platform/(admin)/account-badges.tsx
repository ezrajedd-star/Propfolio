import type { AccountStatus, Plan } from "@prisma/client";

import { StatusBadge } from "@/components/app/status-badge";

export const PLAN_LABELS: Record<Plan, string> = { FREE: "Free", PRO: "Pro", PREMIUM: "Premium" };

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return status === "ACTIVE" ? (
    <StatusBadge tone="success" label="Active" />
  ) : (
    <StatusBadge tone="danger" label="Suspended" />
  );
}

/** "Premium trial, 12 days left", "Trial ended", or the plan. */
export function planLabel(a: { plan: Plan; trialDaysLeft: number | null }): string {
  if (a.trialDaysLeft === null) return PLAN_LABELS[a.plan];
  if (a.trialDaysLeft === 0) return `${PLAN_LABELS[a.plan]} (trial ended)`;
  return `${PLAN_LABELS[a.plan]} trial, ${a.trialDaysLeft} day${a.trialDaysLeft === 1 ? "" : "s"} left`;
}
