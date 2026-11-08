/**
 * Subscriptions to Propfolio (Pro and Premium, monthly). Not to be confused with `billing`, which
 * is the lessor's rent billing to their tenants.
 *
 * A payment sets the account's plan and its "paid until" day, and the plan rules
 * (src/domain/plans/plans.ts) do the rest: that is how access, limits and read-only work.
 */
import { money, moneyString, roundMoney } from "@/domain/money/money";
import { PLAN_CONFIG, type PlanName } from "@/domain/plans/plans";
import { addDays, addMonths, daysBetween, type IsoDate } from "@/domain/time/calendar-date";

/** Days of access after a renewal fails, with reminders, before the account moves to Free. */
export const GRACE_DAYS = 7;

export type PaidPlan = Exclude<PlanName, "FREE">;
export type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELED";

export interface SubscriptionFacts {
  plan: PaidPlan;
  status: SubscriptionStatus;
  /** Manila dates, inclusive. */
  currentPeriodStart: IsoDate;
  currentPeriodEnd: IsoDate;
  cancelAtPeriodEnd: boolean;
  /** A downgrade waiting for the end of the period. */
  pendingPlan: PaidPlan | null;
}

/** One month, ending the day before the same date next month (1 Mar → 31 Mar; 31 Jan → 27 Feb). */
export function periodEndFor(start: IsoDate): IsoDate {
  return addDays(addMonths(start, 1), -1);
}

export function monthlyPrice(plan: PaidPlan): string {
  return PLAN_CONFIG[plan].pricePerMonth;
}

/**
 * Upgrading in the middle of a period: pay the difference for the days left (today included),
 * and the new plan applies straight away. The period's end doesn't move.
 */
export function upgradeCharge(
  from: PaidPlan,
  to: PaidPlan,
  today: IsoDate,
  period: { start: IsoDate; end: IsoDate },
): string {
  const total = daysBetween(period.start, period.end) + 1;
  const left = Math.max(0, Math.min(total, daysBetween(today, period.end) + 1));
  const diff = money(monthlyPrice(to)).minus(monthlyPrice(from));
  if (diff.lte(0) || left === 0) return "0.00";
  return moneyString(roundMoney(diff.times(left).dividedBy(total)));
}

export type ChangeKind = "upgrade" | "downgrade" | "same";

export function changeKind(from: PaidPlan, to: PaidPlan): ChangeKind {
  if (from === to) return "same";
  return from === "PRO" && to === "PREMIUM" ? "upgrade" : "downgrade";
}

/** What people see: trialing, active, past due, canceled (still paid up), or free. */
export type DisplayState = "trialing" | "active" | "past_due" | "canceled" | "free";

export function displayState(o: {
  trialRunning: boolean;
  subscription: Pick<SubscriptionFacts, "status" | "cancelAtPeriodEnd"> | null;
  effectivePlan: PlanName;
}): DisplayState {
  const s = o.subscription;
  if (s?.status === "PAST_DUE") return "past_due";
  if (s && s.status === "ACTIVE") return s.cancelAtPeriodEnd ? "canceled" : "active";
  if (o.trialRunning) return "trialing";
  return o.effectivePlan === "FREE" ? "free" : "active";
}

/** The next automatic charge, or null when the subscription ends with this period. */
export function nextCharge(
  s: SubscriptionFacts,
): { date: IsoDate; amount: string; plan: PaidPlan } | null {
  if (s.status !== "ACTIVE" || s.cancelAtPeriodEnd) return null;
  const plan = s.pendingPlan ?? s.plan;
  return { date: addDays(s.currentPeriodEnd, 1), amount: monthlyPrice(plan), plan };
}

/** Is a renewal due? (The day after the period's last day, or later.) */
export function renewalDue(s: SubscriptionFacts, today: IsoDate): boolean {
  return s.status === "ACTIVE" && today > s.currentPeriodEnd;
}

/** The account keeps its plan this long after a failed renewal. */
export function graceEnd(periodEnd: IsoDate): IsoDate {
  return addDays(periodEnd, GRACE_DAYS);
}

/** "PF-2026-000042": the payment record's number (not a BIR official invoice number). */
export function invoiceNumber(year: number, seq: number): string {
  return `PF-${year}-${String(seq).padStart(6, "0")}`;
}
