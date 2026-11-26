/**
 * Pure helpers for the console's Today page: Manila day/week/month boundaries and monthly
 * recurring revenue. No I/O.
 */
import { PLAN_CONFIG, type PlanName } from "@/domain/plans/plans";
import { money, type Money } from "@/domain/money/money";
import { addDays, weekday, type IsoDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";

/** The instant a Manila calendar day starts (00:00 Manila = 16:00 UTC the day before). */
export function manilaDayStart(day: IsoDate): Date {
  return new Date(`${day}T00:00:00+08:00`);
}

export interface ManilaPeriods {
  today: IsoDate;
  /** Monday of this week (weeks start on Monday). */
  weekStartDay: IsoDate;
  monthStartDay: IsoDate;
  todayStart: Date;
  weekStart: Date;
  monthStart: Date;
  /** The same moments one week earlier, for "vs last week". */
  lastWeekStart: Date;
}

export function manilaPeriods(now: Date): ManilaPeriods {
  const today = manilaToday(now) as IsoDate;
  const dow = weekday(today); // 0 = Sunday
  const weekStartDay = addDays(today, -((dow + 6) % 7));
  const monthStartDay = `${today.slice(0, 8)}01` as IsoDate;
  return {
    today,
    weekStartDay,
    monthStartDay,
    todayStart: manilaDayStart(today),
    weekStart: manilaDayStart(weekStartDay),
    monthStart: manilaDayStart(monthStartDay),
    lastWeekStart: manilaDayStart(addDays(weekStartDay, -7)),
  };
}

/** What each paying customer pays a month, summed (list prices; manual annual deals included). */
export function monthlyRecurringRevenue(plans: readonly PlanName[]): Money {
  return plans.reduce((sum, p) => sum.plus(PLAN_CONFIG[p].pricePerMonth), money(0));
}

export type TicketAgeBucket = "under1d" | "1to3d" | "over3d";

/** How long a ticket has been open, in the buckets the Today page shows. */
export function ticketAgeBucket(openedAt: Date, now: Date): TicketAgeBucket {
  const hours = (now.getTime() - openedAt.getTime()) / 3_600_000;
  if (hours < 24) return "under1d";
  if (hours < 72) return "1to3d";
  return "over3d";
}

/** Change against last week, in plain words: "+3 vs last week", "same as last week". */
export function versusLastWeek(current: number, previous: number): string {
  const d = current - previous;
  if (d === 0) return "same as last week";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)} vs last week`;
}
