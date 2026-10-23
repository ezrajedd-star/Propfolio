import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/** All business dates and displayed times use Philippine time. */
export const BUSINESS_TIME_ZONE = "Asia/Manila";

/** Today's calendar date in Manila, as `YYYY-MM-DD`. */
export function manilaToday(now: Date = new Date()): string {
  return format(new TZDate(now, BUSINESS_TIME_ZONE), "yyyy-MM-dd");
}

/** Display an instant as Manila date, e.g. `23 Oct 2026`. */
export function formatDate(value: Date | string | null | undefined): string {
  if (value == null) return "—";
  if (typeof value === "string") return formatIsoDate(value);
  return format(new TZDate(value, BUSINESS_TIME_ZONE), "d MMM yyyy");
}

/** Display an instant as Manila date and time, e.g. `23 Oct 2026, 2:05 PM`. */
export function formatDateTime(value: Date | null | undefined): string {
  if (value == null) return "—";
  return format(new TZDate(value, BUSINESS_TIME_ZONE), "d MMM yyyy, h:mm a");
}

/** Display a time only, e.g. `2:05 PM` (Manila). */
export function formatTime(value: Date): string {
  return format(new TZDate(value, BUSINESS_TIME_ZONE), "h:mm a");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Display a business date stored as `YYYY-MM-DD` (no time zone shifting). */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`;
}
