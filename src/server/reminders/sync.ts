import type { Prisma } from "@prisma/client";

import { CATCH_UP_DAYS } from "@/domain/reminders/digest";
import { reminderSchedule } from "@/domain/reminders/schedule";
import { addDays, fromDbDate, toDbDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings/service";
import {
  leaseDatesOf,
  leaseStatusInclude,
  unitReminderConfig,
} from "@/server/leases/status-context";

export type LeaseScope =
  { leaseIds: string[] } | { unitId: string } | { unitTypeId: string } | "all";

function whereFor(scope: LeaseScope): Prisma.LeaseWhereInput {
  if (scope === "all") return {};
  if ("leaseIds" in scope) return { id: { in: scope.leaseIds } };
  if ("unitId" in scope) return { unitId: scope.unitId };
  return { unit: { unitTypeId: scope.unitTypeId } };
}

/**
 * Recalculate the PENDING reminder dates of the given leases from their current dates and
 * effective reminder settings. History (SENT/FAILED/SKIPPED) is never touched.
 *
 * A lease gets no pending reminders once it is archived, terminated, renewed or marked as
 * handled. Dates up to CATCH_UP_DAYS in the past are kept, so a reminder missed while the
 * worker was down still goes out. Idempotent; returns the number of pending reminders.
 */
export async function syncReminders(scope: LeaseScope, now = new Date()): Promise<number> {
  const today = manilaToday(now);
  const earliest = addDays(today, -CATCH_UP_DAYS);
  const [leases, settings] = await Promise.all([
    db.lease.findMany({
      where: whereFor(scope),
      include: {
        ...leaseStatusInclude,
        reminderEvents: { where: { status: { not: "PENDING" } }, select: { scheduledDate: true } },
      },
    }),
    getSettings(),
  ]);

  let pending = 0;
  for (const l of leases) {
    const dates = leaseDatesOf(l);
    const stopped =
      l.archivedAt !== null ||
      dates.terminationDate !== null ||
      dates.renewed ||
      l.reminderHandledAt !== null;
    const recorded = new Set(l.reminderEvents.map((e) => fromDbDate(e.scheduledDate)));
    const wanted = stopped
      ? []
      : reminderSchedule(
          dates.startDate,
          dates.endDate,
          unitReminderConfig(settings.reminderDefaults, l.unit).config,
        ).filter((r) => r.date >= earliest && !recorded.has(r.date));
    await db.$transaction([
      db.reminderEvent.deleteMany({ where: { leaseId: l.id, status: "PENDING" } }),
      db.reminderEvent.createMany({
        data: wanted.map((r) => ({
          leaseId: l.id,
          scheduledDate: toDbDate(r.date),
          kind: r.kind,
          daysBefore: r.daysBefore,
        })),
        skipDuplicates: true,
      }),
    ]);
    pending += wanted.length;
  }
  return pending;
}
