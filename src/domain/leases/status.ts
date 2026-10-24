import { addDays, addMonths, daysBetween, minDate, type IsoDate } from "../time/calendar-date";
import { formatIsoDate } from "../time/manila";

export const LEASE_STATUSES = [
  "UPCOMING",
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "RENEWED",
  "TERMINATED",
] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  UPCOMING: "Starts soon",
  ACTIVE: "Active",
  EXPIRING: "Expiring",
  EXPIRED: "Expired",
  RENEWED: "Renewed",
  TERMINATED: "Terminated",
};

/** Colour family for each status; the UI always shows the label (or an icon) as well. */
export const LEASE_STATUS_TONES: Record<
  LeaseStatus,
  "success" | "warning" | "danger" | "neutral" | "default"
> = {
  UPCOMING: "default",
  ACTIVE: "success",
  EXPIRING: "warning",
  EXPIRED: "danger",
  RENEWED: "neutral",
  TERMINATED: "neutral",
};

export interface LeaseDates {
  startDate: IsoDate;
  endDate: IsoDate;
  terminationDate: IsoDate | null;
  /** True when a newer lease replaces this one (renewal). */
  renewed: boolean;
}

/**
 * Status from dates and actions only, so it is always correct on read:
 * - TERMINATED once a termination is recorded,
 * - RENEWED once a renewal lease exists,
 * - EXPIRED after the end date,
 * - UPCOMING before the start date,
 * - EXPIRING from the first reminder (largest lead time) until the end date,
 * - otherwise ACTIVE.
 */
export function computeLeaseStatus(
  lease: LeaseDates,
  today: IsoDate,
  expiringWindowDays: number,
): LeaseStatus {
  if (lease.terminationDate) return "TERMINATED";
  if (lease.renewed) return "RENEWED";
  if (today > lease.endDate) return "EXPIRED";
  if (today < lease.startDate) return "UPCOMING";
  if (today >= addDays(lease.endDate, -expiringWindowDays)) return "EXPIRING";
  return "ACTIVE";
}

/** The last day the tenant actually occupies the unit. */
export function effectiveEndDate(lease: Pick<LeaseDates, "endDate" | "terminationDate">): IsoDate {
  return lease.terminationDate ? minDate(lease.terminationDate, lease.endDate) : lease.endDate;
}

/** True when the lease covers `date` (inclusive), taking an early termination into account. */
export function leaseCovers(
  lease: Pick<LeaseDates, "startDate" | "endDate" | "terminationDate">,
  date: IsoDate,
): boolean {
  return lease.startDate <= date && date <= effectiveEndDate(lease);
}

export interface Period {
  startDate: IsoDate;
  endDate: IsoDate;
}

/** Inclusive date ranges overlap if each starts on or before the other ends. */
export function periodsOverlap(a: Period, b: Period): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** The first existing lease whose occupied period overlaps the proposed one, if any. */
export function findOverlap<
  T extends Pick<LeaseDates, "startDate" | "endDate" | "terminationDate">,
>(proposed: Period, existing: T[]): T | undefined {
  return existing.find((l) =>
    periodsOverlap(proposed, { startDate: l.startDate, endDate: effectiveEndDate(l) }),
  );
}

/** Whole months from `from` to `to` (to > from). */
function wholeMonths(from: IsoDate, to: IsoDate): number {
  let n = 0;
  while (addMonths(from, n + 1) <= to) n++;
  return n;
}

/** "45 days", or for longer spans "5 months" / "2 years, 3 months". */
function spanText(from: IsoDate, to: IsoDate): string {
  const d = daysBetween(from, to);
  if (d <= 60) return `${d} days`;
  const months = wholeMonths(from, to);
  const y = Math.floor(months / 12);
  const m = months % 12;
  const mm = `${m} month${m === 1 ? "" : "s"}`;
  if (y === 0) return mm;
  const yy = `${y} year${y === 1 ? "" : "s"}`;
  return m === 0 ? yy : `${yy}, ${mm}`;
}

/** "Ends in 45 days", "Ends in 2 years, 5 months", "Ends today", "Ended 3 days ago", "Starts in 10 days". */
export function timeLeftText(lease: LeaseDates, today: IsoDate): string {
  const end = effectiveEndDate(lease);
  if (today < lease.startDate) {
    const d = daysBetween(today, lease.startDate);
    return d === 1 ? "Starts tomorrow" : `Starts in ${spanText(today, lease.startDate)}`;
  }
  const d = daysBetween(today, end);
  if (d > 1) return `Ends in ${spanText(today, end)}`;
  if (d === 1) return "Ends tomorrow";
  if (d === 0) return "Ends today";
  if (d === -1) return "Ended yesterday";
  return `Ended ${spanText(end, today)} ago`;
}

/** Days left until the effective end (negative once ended). */
export function daysLeft(
  lease: Pick<LeaseDates, "endDate" | "terminationDate">,
  today: IsoDate,
): number {
  return daysBetween(today, effectiveEndDate(lease));
}

/** Short phrase for the status, used in headers: "Ended early on 5 Mar 2027". */
export function statusDetail(status: LeaseStatus, lease: LeaseDates): string | null {
  if (status === "TERMINATED" && lease.terminationDate)
    return `Ended early on ${formatIsoDate(lease.terminationDate)}`;
  return null;
}

/** LSE-2026-0001 */
export function formatLeaseRef(year: number, sequence: number): string {
  return `LSE-${year}-${String(sequence).padStart(4, "0")}`;
}
