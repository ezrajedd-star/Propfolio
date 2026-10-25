import type { Money } from "../money/money";
import type { IsoDate } from "../time/calendar-date";
import type { ChargeType, PlannedCharge } from "./rent-schedule";

export interface ExistingCharge {
  id: string;
  type: ChargeType;
  /** Rent: period start; deposit/advance: the type name; other: null (never regenerated). */
  key: string | null;
  dueDate: IsoDate;
  amount: Money;
  paid: Money;
  description: string;
}

export interface RegenerationPlan {
  create: PlannedCharge[];
  cancel: ExistingCharge[];
  /** Charges the new terms would change, left as they are because they are paid or already due. */
  keptDifferent: { existing: ExistingCharge; planned: PlannedCharge | null }[];
}

/** A charge is locked once anything was paid against it, or its due date has passed. */
export function isLocked(c: ExistingCharge, today: IsoDate): boolean {
  return c.paid.greaterThan(0) || c.dueDate < today;
}

/**
 * What changes when lease terms change: only future, unpaid charges are replaced; paid or
 * already-due charges are never changed silently (they are listed in `keptDifferent` so the
 * person can review them). Manually added "other" charges are never touched.
 */
export function planRegeneration(
  existing: ExistingCharge[],
  planned: PlannedCharge[],
  today: IsoDate,
): RegenerationPlan {
  const plan: RegenerationPlan = { create: [], cancel: [], keptDifferent: [] };
  const generated = existing.filter((c) => c.type !== "OTHER" && c.key !== null);
  const byKey = new Map(generated.map((c) => [`${c.type}:${c.key}`, c]));
  const matched = new Set<string>();

  for (const p of planned) {
    const e = byKey.get(`${p.type}:${p.key}`);
    if (!e) {
      plan.create.push(p);
      continue;
    }
    matched.add(e.id);
    const same = e.amount.equals(p.amount) && e.dueDate === p.dueDate;
    if (same) continue;
    if (isLocked(e, today)) plan.keptDifferent.push({ existing: e, planned: p });
    else {
      plan.cancel.push(e);
      plan.create.push(p);
    }
  }
  for (const e of generated) {
    if (matched.has(e.id)) continue;
    if (isLocked(e, today)) plan.keptDifferent.push({ existing: e, planned: null });
    else plan.cancel.push(e);
  }
  return plan;
}

/** Charges cancelled when a lease ends early: unpaid ones due after the last day. */
export function chargesToCancelOnTermination(
  existing: ExistingCharge[],
  terminationDate: IsoDate,
): ExistingCharge[] {
  return existing.filter(
    (c) => c.type === "RENT" && c.dueDate > terminationDate && c.paid.lessThanOrEqualTo(0),
  );
}
