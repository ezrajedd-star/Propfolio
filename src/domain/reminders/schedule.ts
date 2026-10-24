import { WEEKDAY_NAMES, addDays, weekday, type IsoDate } from "../time/calendar-date";
import { formatIsoDate } from "../time/manila";
import type { ReminderConfig } from "./config";

export type ReminderKind = "EXPIRY" | "REPEAT";

export interface ScheduledReminder {
  date: IsoDate;
  kind: ReminderKind;
  /** Days before the end date (negative after it). */
  daysBefore: number;
}

/**
 * All expiry reminder dates for a lease ending on `endDate`.
 *
 * - One EXPIRY reminder per lead time (`endDate - n days`).
 * - Then, if repeats are on, REPEAT reminders after the last lead-time reminder: daily, or
 *   weekly on the chosen weekday, up to `afterExpiryDays` after the end date.
 * - Dates before the lease starts are dropped.
 *
 * Whether a reminder is still sent (lease handled, renewed, terminated) is decided by the
 * reminder engine, not here.
 */
export function reminderSchedule(
  startDate: IsoDate,
  endDate: IsoDate,
  config: ReminderConfig,
): ScheduledReminder[] {
  const leadDays = [...new Set(config.leadDays)].sort((a, b) => b - a);
  const out: ScheduledReminder[] = leadDays.map((n) => ({
    date: addDays(endDate, -n),
    kind: "EXPIRY" as const,
    daysBefore: n,
  }));

  if (config.repeat !== "NONE" && leadDays.length > 0) {
    const lastLead = Math.min(...leadDays);
    const until = config.afterExpiryDays;
    for (let before = lastLead - 1; before >= -until; before--) {
      const date = addDays(endDate, -before);
      if (config.repeat === "DAILY" || weekday(date) === config.repeatWeekday) {
        out.push({ date, kind: "REPEAT", daysBefore: before });
      }
    }
  }
  return out.filter((r) => r.date >= startDate);
}

/** Plain-language list of dates: "2 Aug, 1 Sep and 1 Oct 2027". */
export function formatDateList(dates: IsoDate[]): string {
  if (dates.length === 0) return "";
  const parts = dates.map((d, i) => {
    const full = formatIsoDate(d);
    const next = dates[i + 1];
    // Drop the year when the next date is in the same year.
    return next && next.slice(0, 4) === d.slice(0, 4) ? full.replace(/ \d{4}$/, "") : full;
  });
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** One-sentence description of the repeat rule, or null when repeats are off. */
export function describeRepeat(config: ReminderConfig, endDate: IsoDate): string | null {
  if (config.repeat === "NONE") return null;
  const stop =
    config.afterExpiryDays > 0
      ? `until ${formatIsoDate(addDays(endDate, config.afterExpiryDays))} (${config.afterExpiryDays} days after the lease ends)`
      : `until the lease ends on ${formatIsoDate(endDate)}`;
  const every =
    config.repeat === "DAILY" ? "every day" : `every ${WEEKDAY_NAMES[config.repeatWeekday ?? 1]}`;
  return `After that, we remind you ${every} ${stop}, unless the lease is marked as handled, renewed or terminated.`;
}

/** Short summary for settings screens: "90, 60 and 30 days before · then weekly on Mondays". */
export function describeConfig(config: ReminderConfig): string {
  const days = [...config.leadDays].sort((a, b) => b - a);
  const lead =
    days.length === 1
      ? `${days[0]} days before`
      : `${days.slice(0, -1).join(", ")} and ${days.at(-1)} days before`;
  if (config.repeat === "NONE") return lead;
  const after = config.afterExpiryDays > 0 ? ` (until ${config.afterExpiryDays} days after)` : "";
  return config.repeat === "DAILY"
    ? `${lead} · then daily${after}`
    : `${lead} · then weekly on ${WEEKDAY_NAMES[config.repeatWeekday ?? 1]}s${after}`;
}
