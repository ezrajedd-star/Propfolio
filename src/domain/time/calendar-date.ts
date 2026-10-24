/**
 * Business dates (lease start/end, due dates, reminder dates) are plain calendar dates in
 * Asia/Manila, written as ISO strings `YYYY-MM-DD`. They have no time and no time zone, so all
 * arithmetic here is done on UTC midnight to avoid any daylight-saving or offset surprises.
 */

export type IsoDate = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = ISO.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function toUtc(date: IsoDate): Date {
  const m = ISO.exec(date);
  if (!m) throw new Error(`Not an ISO date: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

/** A `date` column value from Prisma (UTC midnight) to an ISO date. */
export function fromDbDate(d: Date): IsoDate {
  return fromUtc(d);
}

/** An ISO date to the value Prisma expects for a `date` column. */
export function toDbDate(date: IsoDate): Date {
  return toUtc(date);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Add calendar months, clamping to the end of shorter months (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = toUtc(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const day = Math.min(d.getUTCDate(), daysInMonth(targetYear, targetMonth + 1));
  return fromUtc(new Date(Date.UTC(targetYear, targetMonth, day)));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: IsoDate): number {
  return toUtc(date).getUTCDay();
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Lease length in whole years and months, counting the end date as the last day of the lease:
 * 1 Jan 2026 – 31 Dec 2027 is exactly "2 years, 0 months". Remaining days are reported too.
 */
export function leaseDuration(
  start: IsoDate,
  end: IsoDate,
): { years: number; months: number; days: number } {
  const exclusiveEnd = addDays(end, 1);
  let months = 0;
  while (addMonths(start, months + 1) <= exclusiveEnd) months++;
  const days = daysBetween(addMonths(start, months), exclusiveEnd);
  return { years: Math.floor(months / 12), months: months % 12, days };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "2 years, 0 months", "11 months, 15 days", "3 months". */
export function formatDuration(start: IsoDate, end: IsoDate): string {
  const { years, months, days } = leaseDuration(start, end);
  const parts: string[] = [];
  if (years > 0) parts.push(plural(years, "year"), plural(months, "month"));
  else parts.push(plural(months, "month"));
  if (days > 0) parts.push(plural(days, "day"));
  if (years === 0 && months === 0) return plural(days, "day");
  return parts.join(", ");
}
