import { summariseReminders, type ReminderSummary } from "@/domain/reminders/digest";
import { fromDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { db } from "@/server/db";

/** Reminder status for many leases at once (leases grid). */
export async function reminderSummaries(
  leases: { id: string; handled: boolean; stopped: boolean }[],
): Promise<Map<string, ReminderSummary>> {
  const events = await db.reminderEvent.findMany({
    where: { leaseId: { in: leases.map((l) => l.id) } },
    select: { leaseId: true, scheduledDate: true, status: true },
  });
  const byLease = new Map<string, { date: IsoDate; status: (typeof events)[number]["status"] }[]>();
  for (const e of events) {
    const list = byLease.get(e.leaseId) ?? [];
    list.push({ date: fromDbDate(e.scheduledDate), status: e.status });
    byLease.set(e.leaseId, list);
  }
  return new Map(
    leases.map((l) => [
      l.id,
      summariseReminders({
        handled: l.handled,
        stopped: l.stopped,
        events: byLease.get(l.id) ?? [],
      }),
    ]),
  );
}
