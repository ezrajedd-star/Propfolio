import type { PlanAccess } from "@/domain/plans/plans";
import { manilaToday } from "@/domain/time/manila";
import { assertCan, type Actor } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { countActiveMembers } from "./access";

export interface PlanSummary extends PlanAccess {
  usersUsed: number;
  /** The last day of the trial (Manila date), while it runs. */
  trialLastDay: string | null;
  /** Only the Owner controls the subscription. */
  canChangePlan: boolean;
  supportEmail: string | null;
}

/** The "Plan" page: everyone in the account may see which plan it is on and what it includes. */
export async function getPlanSummary(actor: Actor): Promise<PlanSummary> {
  assertCan(actor, "occupancy.view");
  const access = actor.access;
  return {
    ...access,
    usersUsed: await countActiveMembers(db, actor.accountId),
    trialLastDay: access.trial ? manilaToday(new Date(access.trial.endsAt.getTime() - 1)) : null,
    canChangePlan: actor.role === "OWNER",
    supportEmail: env().SUPPORT_EMAIL ?? null,
  };
}
