import type { Plan } from "@prisma/client";

import { PLANS, type PlanName } from "@/domain/plans/plans";
import { moneyString } from "@/domain/money/money";
import { manilaPeriods, monthlyRecurringRevenue } from "@/domain/platform/today";
import { toDbDate } from "@/domain/time/calendar-date";
import { asSystem, db } from "@/server/db";
import type { PlatformActor } from "./auth";
import { getSignUpFunnel, type FunnelCounts } from "./accounts";
import { countOpenIncidents } from "@/server/monitoring/incidents";
import { openTicketCounts } from "@/server/tickets/service";
import { assertPlatformCan } from "./staff-log";

/**
 * The console's Today page: counts only, never names, emails or tenant records. Later phases
 * add tickets, incidents and approvals through `extraTodayCounts`.
 */
export interface TodayMetrics {
  signUps: { today: number; thisWeek: number; lastWeek: number };
  trialsEndingIn7Days: number;
  payingByPlan: Record<PlanName, number>;
  payingTotal: number;
  /** Pesos per month as a decimal string. */
  mrr: string;
  cancellationsThisMonth: number;
  funnel: FunnelCounts;
  /** Filled in once tickets exist (phase 4). */
  tickets?: { open: number; under1d: number; oneTo3d: number; over3d: number };
  /** Filled in once the approval inbox exists (phase 5). */
  approvalsWaiting?: number;
  /** Filled in once monitoring exists (phase 1b). */
  openIncidents?: number;
}

/** Account ids paying now: an active (or in-grace) subscription, or a manual payment that covers today. */
export async function payingAccounts(now: Date): Promise<Map<string, Plan>> {
  const { today } = manilaPeriods(now);
  const [subs, manual] = await Promise.all([
    db.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE"] }, account: { status: "ACTIVE" } },
      select: { accountId: true, plan: true },
    }),
    db.account.findMany({
      where: { status: "ACTIVE", paidUntil: { gte: toDbDate(today) } },
      select: { id: true, plan: true },
    }),
  ]);
  const paying = new Map<string, Plan>();
  for (const m of manual) if (m.plan !== "FREE") paying.set(m.id, m.plan);
  for (const s of subs) if (s.plan !== "FREE") paying.set(s.accountId, s.plan);
  return paying;
}

export async function getTodayMetrics(
  admin: PlatformActor,
  now = new Date(),
): Promise<TodayMetrics> {
  assertPlatformCan(admin, "console.view");
  const p = manilaPeriods(now);
  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  const [counts, funnel, openIncidents, tickets] = await Promise.all([
    asSystem(async () => {
      const [today, thisWeek, lastWeek, trials, paying, cancels] = await Promise.all([
        db.account.count({ where: { createdAt: { gte: p.todayStart } } }),
        db.account.count({ where: { createdAt: { gte: p.weekStart } } }),
        db.account.count({ where: { createdAt: { gte: p.lastWeekStart, lt: p.weekStart } } }),
        db.account.count({
          where: { status: "ACTIVE", trialEndsAt: { gt: now, lte: in7 } },
        }),
        payingAccounts(now),
        db.auditLog.findMany({
          where: {
            action: { in: ["subscription.cancel_scheduled", "account.closed"] },
            at: { gte: p.monthStart },
            accountId: { not: null },
          },
          distinct: ["accountId"],
          select: { accountId: true },
        }),
      ]);
      return { today, thisWeek, lastWeek, trials, paying, cancels: cancels.length };
    }),
    getSignUpFunnel(admin, Math.max(1, Number(p.today.slice(8, 10))), now),
    countOpenIncidents(),
    openTicketCounts(now),
  ]);
  const plans = [...counts.paying.values()] as PlanName[];
  const payingByPlan = Object.fromEntries(PLANS.map((pl) => [pl, 0])) as Record<PlanName, number>;
  for (const pl of plans) payingByPlan[pl] += 1;
  return {
    signUps: { today: counts.today, thisWeek: counts.thisWeek, lastWeek: counts.lastWeek },
    trialsEndingIn7Days: counts.trials,
    payingByPlan,
    payingTotal: plans.length,
    mrr: moneyString(monthlyRecurringRevenue(plans)),
    cancellationsThisMonth: counts.cancels,
    funnel,
    openIncidents,
    tickets,
  };
}
