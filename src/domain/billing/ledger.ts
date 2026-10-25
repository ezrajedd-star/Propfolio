import type { Money } from "../money/money";
import { money, roundMoney } from "../money/money";
import { daysBetween, type IsoDate } from "../time/calendar-date";

export interface OpenCharge {
  id: string;
  dueDate: IsoDate;
  /** One-off charges (deposit, advance) are settled before rent due the same day. */
  type: "RENT" | "DEPOSIT" | "ADVANCE" | "OTHER";
  amount: Money;
  /** Already paid by other (posted) payments. */
  paid: Money;
  createdAt?: string;
}

export const outstanding = (c: Pick<OpenCharge, "amount" | "paid">): Money =>
  roundMoney(c.amount.minus(c.paid));

const TYPE_ORDER = { DEPOSIT: 0, ADVANCE: 1, RENT: 2, OTHER: 3 } as const;

/** Oldest unpaid charges first; same day: deposit, advance, rent, other. */
export function sortForAllocation<T extends OpenCharge>(charges: T[]): T[] {
  return [...charges].sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
}

export interface Allocation {
  chargeId: string;
  amount: Money;
}

/** Suggested allocation: fill the oldest unpaid charges first. Any remainder is unapplied credit. */
export function allocateOldestFirst(
  charges: OpenCharge[],
  amount: Money,
): { allocations: Allocation[]; unapplied: Money } {
  let left = roundMoney(amount);
  const allocations: Allocation[] = [];
  for (const c of sortForAllocation(charges)) {
    if (left.lessThanOrEqualTo(0)) break;
    const open = outstanding(c);
    if (open.lessThanOrEqualTo(0)) continue;
    const take = open.lessThan(left) ? open : left;
    allocations.push({ chargeId: c.id, amount: take });
    left = roundMoney(left.minus(take));
  }
  return { allocations, unapplied: left };
}

export type AllocationProblem =
  | { kind: "unknown_charge"; chargeId: string }
  | { kind: "not_positive"; chargeId: string }
  | { kind: "too_many_decimals"; chargeId: string }
  | { kind: "over_charge"; chargeId: string; outstanding: Money }
  | { kind: "over_payment"; total: Money };

/** Check a (possibly hand-adjusted) allocation against the open charges and the payment amount. */
export function validateAllocation(
  charges: OpenCharge[],
  payment: Money,
  allocations: Allocation[],
): AllocationProblem | null {
  const byId = new Map(charges.map((c) => [c.id, c]));
  let total = money(0);
  for (const a of allocations) {
    const c = byId.get(a.chargeId);
    if (!c) return { kind: "unknown_charge", chargeId: a.chargeId };
    if (a.amount.lessThanOrEqualTo(0)) return { kind: "not_positive", chargeId: a.chargeId };
    if (a.amount.decimalPlaces() > 2) return { kind: "too_many_decimals", chargeId: a.chargeId };
    if (a.amount.greaterThan(outstanding(c)))
      return { kind: "over_charge", chargeId: a.chargeId, outstanding: outstanding(c) };
    total = total.plus(a.amount);
  }
  if (total.greaterThan(payment)) return { kind: "over_payment", total };
  return null;
}

// ─── Overdue and aging ──────────────────────────────────────────────────────────

export const AGING_BUCKETS = ["1–30", "31–60", "61–90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function agingBucket(dueDate: IsoDate, today: IsoDate): AgingBucket | null {
  const late = daysBetween(dueDate, today);
  if (late <= 0) return null;
  if (late <= 30) return "1–30";
  if (late <= 60) return "31–60";
  if (late <= 90) return "61–90";
  return "90+";
}

/** A charge is overdue once its due date has passed and it isn't fully paid. */
export function isOverdue(
  c: Pick<OpenCharge, "dueDate" | "amount" | "paid">,
  today: IsoDate,
): boolean {
  return c.dueDate < today && outstanding(c).greaterThan(0);
}

export interface OverdueSummary {
  total: Money;
  count: number;
  oldestDueDate: IsoDate | null;
  buckets: Record<AgingBucket, Money>;
}

export function summariseOverdue(
  charges: Pick<OpenCharge, "dueDate" | "amount" | "paid">[],
  today: IsoDate,
): OverdueSummary {
  const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b, money(0)])) as Record<
    AgingBucket,
    Money
  >;
  let total = money(0);
  let count = 0;
  let oldest: IsoDate | null = null;
  for (const c of charges) {
    if (!isOverdue(c, today)) continue;
    const open = outstanding(c);
    total = total.plus(open);
    count++;
    const b = agingBucket(c.dueDate, today)!;
    buckets[b] = buckets[b].plus(open);
    if (!oldest || c.dueDate < oldest) oldest = c.dueDate;
  }
  return { total: roundMoney(total), count, oldestDueDate: oldest, buckets };
}

/** Amount due now: outstanding on charges due today or earlier. */
export function balanceDue(
  charges: Pick<OpenCharge, "dueDate" | "amount" | "paid">[],
  today: IsoDate,
): Money {
  return roundMoney(
    charges
      .filter((c) => c.dueDate <= today)
      .reduce((sum, c) => sum.plus(outstanding(c)), money(0)),
  );
}
