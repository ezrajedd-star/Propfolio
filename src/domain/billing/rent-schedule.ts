import type { Money } from "../money/money";
import { money, roundMoney } from "../money/money";
import { addDays, addMonths, daysBetween, daysInMonth, type IsoDate } from "../time/calendar-date";

/**
 * Rent schedule rules
 * - Monthly billing periods start on the lease start date: period k runs from
 *   start + k months (month ends clamp) to the day before period k+1 starts.
 * - The last period may be shorter; its rent is prorated by days (rounded to centavos).
 * - Each period's due date is the first date on or after the period start whose day of the month is
 *   the rent due day (1–28). Start 1 Jan, due day 5 → 5 Jan; start 15 Jan, due day 5 → 5 Feb.
 * - Escalation PERCENT: every N months rent rises by p%, compounding, rounded at each step.
 * - Escalation SCHEDULE: a rent change applies to periods that start on or after its date.
 * - The security deposit and advance rent are separate one-off charges due on the start date.
 */
export interface RentTerms {
  startDate: IsoDate;
  endDate: IsoDate;
  monthlyRent: string;
  rentDueDay: number;
  securityDeposit: string;
  advanceRentType: "NONE" | "MONTHS" | "AMOUNT";
  advanceRentMonths: number | null;
  advanceRentAmount: string | null;
  escalationType: "NONE" | "PERCENT" | "SCHEDULE";
  escalationPercent: string | null;
  escalationEveryMonths: number | null;
  escalationSteps: { date: IsoDate; monthlyRent: string }[] | null;
}

export type ChargeType = "RENT" | "DEPOSIT" | "ADVANCE" | "OTHER";

export interface PlannedCharge {
  type: ChargeType;
  /** For rent: the period key `YYYY-MM-DD` (period start). For one-offs: the type name. */
  key: string;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  dueDate: IsoDate;
  amount: Money;
  description: string;
}

/** First date on or after `from` whose day of the month is `day` (1–28). */
export function nextDueDate(from: IsoDate, day: number): IsoDate {
  const [y, m, d] = from.split("-").map(Number) as [number, number, number];
  if (d <= day)
    return `${from.slice(0, 8)}${String(Math.min(day, daysInMonth(y, m))).padStart(2, "0")}`;
  const next = addMonths(`${from.slice(0, 8)}01`, 1);
  return `${next.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

/** Monthly rent in force for the period starting on `periodStart` (k = period index). */
export function rentForPeriod(terms: RentTerms, k: number, periodStart: IsoDate): Money {
  const base = money(terms.monthlyRent);
  if (
    terms.escalationType === "PERCENT" &&
    terms.escalationPercent &&
    terms.escalationEveryMonths
  ) {
    const steps = Math.floor(k / terms.escalationEveryMonths);
    const factor = money(1).plus(money(terms.escalationPercent).div(100));
    let rent = base;
    for (let i = 0; i < steps; i++) rent = roundMoney(rent.times(factor));
    return rent;
  }
  if (terms.escalationType === "SCHEDULE" && terms.escalationSteps?.length) {
    const applicable = [...terms.escalationSteps]
      .filter((s) => s.date <= periodStart)
      .sort((a, b) => a.date.localeCompare(b.date));
    const last = applicable.at(-1);
    return last ? money(last.monthlyRent) : base;
  }
  return base;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (d: IsoDate) =>
  `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** Every charge the lease terms produce over the whole lease. */
export function planCharges(terms: RentTerms): PlannedCharge[] {
  const out: PlannedCharge[] = [];
  const base = money(terms.monthlyRent);

  if (money(terms.securityDeposit).greaterThan(0)) {
    out.push({
      type: "DEPOSIT",
      key: "DEPOSIT",
      periodStart: null,
      periodEnd: null,
      dueDate: terms.startDate,
      amount: roundMoney(terms.securityDeposit),
      description: "Security deposit",
    });
  }
  if (terms.advanceRentType === "MONTHS" && terms.advanceRentMonths) {
    out.push({
      type: "ADVANCE",
      key: "ADVANCE",
      periodStart: null,
      periodEnd: null,
      dueDate: terms.startDate,
      amount: roundMoney(base.times(terms.advanceRentMonths)),
      description: `Advance rent (${terms.advanceRentMonths} month${terms.advanceRentMonths === 1 ? "" : "s"})`,
    });
  } else if (terms.advanceRentType === "AMOUNT" && terms.advanceRentAmount) {
    out.push({
      type: "ADVANCE",
      key: "ADVANCE",
      periodStart: null,
      periodEnd: null,
      dueDate: terms.startDate,
      amount: roundMoney(terms.advanceRentAmount),
      description: "Advance rent",
    });
  }

  for (let k = 0; ; k++) {
    const periodStart = addMonths(terms.startDate, k);
    if (periodStart > terms.endDate) break;
    const nextStart = addMonths(terms.startDate, k + 1);
    const fullEnd = addDays(nextStart, -1);
    const periodEnd = fullEnd <= terms.endDate ? fullEnd : terms.endDate;
    const rent = rentForPeriod(terms, k, periodStart);
    const partial = periodEnd < fullEnd;
    const amount = partial
      ? roundMoney(
          rent
            .times(daysBetween(periodStart, periodEnd) + 1)
            .div(daysBetween(periodStart, nextStart)),
        )
      : rent;
    out.push({
      type: "RENT",
      key: periodStart,
      periodStart,
      periodEnd,
      dueDate: nextDueDate(periodStart, terms.rentDueDay),
      amount,
      description: `Rent ${short(periodStart)} – ${short(periodEnd)}${partial ? " (part month)" : ""}`,
    });
  }
  return out;
}
