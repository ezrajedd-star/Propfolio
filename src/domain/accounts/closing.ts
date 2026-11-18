import { addDays, type IsoDate } from "@/domain/time/calendar-date";

/** A closed account can be reopened for this many days; then its data is deleted (decision 3). */
export const CLOSED_KEEP_DAYS = 90;
/** The "your data will be deleted soon, download it now" email goes this many days before. */
export const DELETION_REMINDER_DAYS = 7;

/** The last day a closed account can be reopened; its data goes the day after. */
export function deleteAfterFor(closedOn: IsoDate): IsoDate {
  return addDays(closedOn, CLOSED_KEEP_DAYS);
}

export type ClosedAccountStep = "wait" | "remind" | "delete";

/** What the daily job does for a closed account today. */
export function closedAccountStep(
  deleteAfter: IsoDate,
  today: IsoDate,
  reminderSent: boolean,
): ClosedAccountStep {
  if (today > deleteAfter) return "delete";
  if (!reminderSent && today >= addDays(deleteAfter, -DELETION_REMINDER_DAYS)) return "remind";
  return "wait";
}

/** Typing the account's name confirms closing it: spaces and letter case don't matter. */
export function confirmsName(typed: string, accountName: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(typed).length > 0 && norm(typed) === norm(accountName);
}
