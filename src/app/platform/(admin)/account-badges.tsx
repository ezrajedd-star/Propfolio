import type { AccountStatus, Plan } from "@prisma/client";

import { StatusBadge } from "@/components/app/status-badge";

export const PLAN_LABELS: Record<Plan, string> = { FREE: "Free", PRO: "Pro", PREMIUM: "Premium" };

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  if (status === "ACTIVE") return <StatusBadge tone="success" label="Active" />;
  if (status === "CLOSED") return <StatusBadge tone="neutral" label="Closed by Owner" />;
  return <StatusBadge tone="danger" label="Suspended" />;
}

/** The plan in force now: "Premium trial, 12 days left", "Free (trial or payment ended)", "Pro". */
export function planLabel(a: {
  effectivePlan: Plan;
  onTrial: boolean;
  lapsed: boolean;
  readOnly: boolean;
  trialDaysLeft: number | null;
}): string {
  let label = PLAN_LABELS[a.effectivePlan];
  if (a.onTrial && a.trialDaysLeft !== null) {
    label = `Premium trial, ${a.trialDaysLeft} day${a.trialDaysLeft === 1 ? "" : "s"} left`;
  } else if (a.lapsed) {
    label = "Free (trial or payment ended)";
  }
  return a.readOnly ? `${label}, read-only (over unit limit)` : label;
}
