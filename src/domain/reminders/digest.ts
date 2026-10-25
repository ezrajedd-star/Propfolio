import { timeLeftText } from "../leases/status";
import { daysBetween, type IsoDate } from "../time/calendar-date";
import { formatIsoDate } from "../time/manila";

/** How far back the daily job still sends a reminder that was missed (e.g. the server was down). */
export const CATCH_UP_DAYS = 7;

export interface DueReminder {
  date: IsoDate;
  kind: "EXPIRY" | "REPEAT";
  daysBefore: number;
}

export interface DigestLease {
  leaseId: string;
  refNo: string;
  tenantName: string;
  unitLabel: string;
  buildingName: string;
  startDate: IsoDate;
  endDate: IsoDate;
  reminders: DueReminder[];
}

export interface DigestItem extends DigestLease {
  timeLeft: string;
  daysLeft: number;
  reason: string;
  url: string;
}

export interface Digest {
  subject: string;
  dateLabel: string;
  items: DigestItem[];
}

/** Why this lease is in today's email, in plain words. Uses the most recent due reminder. */
export function reminderReason(reminders: DueReminder[], today: IsoDate): string {
  const r = [...reminders].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!r) return "";
  let text: string;
  if (r.kind === "EXPIRY") text = `${r.daysBefore}-day reminder before the lease ends`;
  else if (r.daysBefore > 0)
    text = "Repeat reminder: the lease hasn't been renewed or marked as handled yet";
  else if (r.daysBefore === 0)
    text = "The lease ends today and hasn't been renewed or marked as handled";
  else
    text = `The lease ended ${-r.daysBefore} day${r.daysBefore === -1 ? "" : "s"} ago and hasn't been renewed or marked as handled`;
  return r.date < today ? `${text} (was due ${formatIsoDate(r.date)})` : text;
}

export function digestSubject(count: number, today: IsoDate): string {
  return `Lease reminders – ${count} lease${count === 1 ? " needs" : "s need"} attention (${formatIsoDate(today)})`;
}

/** Build the one daily email: every lease that needs attention, soonest first. */
export function buildDigest(leases: DigestLease[], today: IsoDate, appUrl: string): Digest {
  const items = leases
    .filter((l) => l.reminders.length > 0)
    .map((l) => ({
      ...l,
      daysLeft: daysBetween(today, l.endDate),
      timeLeft: timeLeftText(
        { startDate: l.startDate, endDate: l.endDate, terminationDate: null, renewed: false },
        today,
      ),
      reason: reminderReason(l.reminders, today),
      url: `${appUrl.replace(/\/$/, "")}/leases/${l.leaseId}`,
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft || a.refNo.localeCompare(b.refNo));
  return { subject: digestSubject(items.length, today), dateLabel: formatIsoDate(today), items };
}

// ─── Reminder status shown in the leases grid ─────────────────────────────────

export type ReminderState = "HANDLED" | "STOPPED" | "SENT" | "SCHEDULED" | "FAILED" | "NONE";

export interface ReminderSummary {
  state: ReminderState;
  label: string;
  nextDate: IsoDate | null;
  lastSentDate: IsoDate | null;
}

/**
 * One-line reminder status for a lease:
 * - "Handled" once someone marked it handled; "No more reminders" once renewed/ended,
 * - "Couldn't send" when the last attempt failed,
 * - "Sent 1 Nov" when a reminder went out (and the next one, if any),
 * - "Next: 1 Dec 2026" when one is scheduled, else "None scheduled".
 */
export function summariseReminders(input: {
  handled: boolean;
  stopped: boolean;
  events: { date: IsoDate; status: "PENDING" | "SENT" | "FAILED" | "SKIPPED" }[];
}): ReminderSummary {
  const sent = input.events
    .filter((e) => e.status === "SENT")
    .map((e) => e.date)
    .sort();
  const pending = input.events
    .filter((e) => e.status === "PENDING")
    .map((e) => e.date)
    .sort();
  const failed = input.events.some((e) => e.status === "FAILED");
  const lastSentDate = sent.at(-1) ?? null;
  const nextDate = pending[0] ?? null;
  if (input.handled) return { state: "HANDLED", label: "Handled", nextDate: null, lastSentDate };
  if (input.stopped)
    return { state: "STOPPED", label: "No more reminders", nextDate: null, lastSentDate };
  if (failed)
    return { state: "FAILED", label: "Couldn't send — will retry", nextDate, lastSentDate };
  if (lastSentDate) {
    const short = formatIsoDate(lastSentDate).replace(/ \d{4}$/, "");
    return {
      state: "SENT",
      label: nextDate ? `Sent ${short} · next ${formatIsoDate(nextDate)}` : `Sent ${short}`,
      nextDate,
      lastSentDate,
    };
  }
  if (nextDate)
    return {
      state: "SCHEDULED",
      label: `Next: ${formatIsoDate(nextDate)}`,
      nextDate,
      lastSentDate,
    };
  return { state: "NONE", label: "None scheduled", nextDate: null, lastSentDate: null };
}
