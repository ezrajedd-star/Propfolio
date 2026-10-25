import type { LeaseStatus } from "../leases/status";
import { effectiveEndDate } from "../leases/status";
import type { ReminderConfig } from "../reminders/config";
import { reminderSchedule } from "../reminders/schedule";
import { addMonths, daysInMonth, type IsoDate } from "../time/calendar-date";

export const CALENDAR_EVENT_TYPES = ["END", "START", "REMINDER", "RENT_DUE"] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  END: "Lease ends",
  START: "Lease starts",
  REMINDER: "Reminder",
  RENT_DUE: "Rent due",
};

/** Event types Property Management (Viewers) may see: lease start and end dates only. */
export const VIEWER_EVENT_TYPES: readonly CalendarEventType[] = ["END", "START"];

export interface CalendarLease {
  id: string;
  startDate: IsoDate;
  endDate: IsoDate;
  terminationDate: IsoDate | null;
  status: LeaseStatus;
  rentDueDay: number;
  reminderConfig: ReminderConfig;
}

export interface CalendarEventCore {
  /** Stable id: `${leaseId}:${type}:${date}`. */
  id: string;
  leaseId: string;
  type: CalendarEventType;
  date: IsoDate;
  /** For reminders: days before the end date. */
  daysBefore?: number;
}

function inRange(date: IsoDate, from: IsoDate, to: IsoDate) {
  return date >= from && date <= to;
}

/** Rent due dates of a lease inside [from, to]: the due day of every month the lease covers. */
export function rentDueDates(
  lease: Pick<CalendarLease, "startDate" | "endDate" | "terminationDate" | "rentDueDay">,
  from: IsoDate,
  to: IsoDate,
): IsoDate[] {
  const first = lease.startDate > from ? lease.startDate : from;
  const last = effectiveEndDate(lease) < to ? effectiveEndDate(lease) : to;
  if (first > last) return [];
  const out: IsoDate[] = [];
  let cursor = `${first.slice(0, 7)}-01`;
  while (cursor <= last) {
    const [y, m] = cursor.split("-").map(Number) as [number, number];
    const day = Math.min(lease.rentDueDay, daysInMonth(y, m));
    const due = `${cursor.slice(0, 8)}${String(day).padStart(2, "0")}`;
    if (due >= first && due <= last) out.push(due);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

/**
 * Calendar events for one lease inside [from, to]:
 * - END on the (effective) last day, START on the first day,
 * - REMINDER on each lead-time reminder date, while reminders still apply (not renewed or
 *   terminated),
 * - RENT_DUE on each due date.
 */
export function leaseEvents(
  lease: CalendarLease,
  from: IsoDate,
  to: IsoDate,
  types: readonly CalendarEventType[],
): CalendarEventCore[] {
  const out: CalendarEventCore[] = [];
  const push = (type: CalendarEventType, date: IsoDate, extra: Partial<CalendarEventCore> = {}) => {
    if (types.includes(type) && inRange(date, from, to))
      out.push({ id: `${lease.id}:${type}:${date}`, leaseId: lease.id, type, date, ...extra });
  };
  push("START", lease.startDate);
  push("END", effectiveEndDate(lease));
  if (types.includes("REMINDER") && lease.status !== "RENEWED" && lease.status !== "TERMINATED") {
    for (const r of reminderSchedule(lease.startDate, lease.endDate, lease.reminderConfig)) {
      if (r.kind === "EXPIRY") push("REMINDER", r.date, { daysBefore: r.daysBefore });
    }
  }
  if (types.includes("RENT_DUE")) {
    for (const d of rentDueDates(lease, from, to)) push("RENT_DUE", d);
  }
  return out;
}
