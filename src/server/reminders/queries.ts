import { can, receivesReminders } from "@/domain/auth/roles";
import { fromDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { sendDailyDigest } from "./digest-job";

export interface LeaseReminderView {
  handled: { at: Date; byName: string | null; note: string | null } | null;
  /** Why reminders stopped, if they did for a reason other than "handled". */
  stoppedReason: string | null;
  canHandle: boolean;
  events: {
    id: string;
    date: IsoDate;
    kind: "EXPIRY" | "REPEAT";
    daysBefore: number;
    status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
    sentAt: Date | null;
    note: string | null;
  }[];
}

export async function getLeaseReminderView(
  actor: AuditActor,
  leaseId: string,
): Promise<LeaseReminderView> {
  assertCan(actor, "lease.view");
  if (!isUuid(leaseId)) throw new NotFoundError("We couldn't find that lease.");
  const lease = await db.lease.findUnique({
    where: { id: leaseId },
    include: {
      reminderEvents: { orderBy: { scheduledDate: "asc" } },
      nextLease: { select: { archivedAt: true } },
    },
  });
  if (!lease) throw new NotFoundError("We couldn't find that lease.");
  const handledBy = lease.reminderHandledById
    ? await db.user.findUnique({ where: { id: lease.reminderHandledById }, select: { name: true } })
    : null;
  const renewed = lease.nextLease !== null && lease.nextLease.archivedAt === null;
  const stoppedReason = lease.archivedAt
    ? "This lease is archived."
    : lease.terminationDate
      ? "This lease ended early."
      : renewed
        ? "This lease was renewed."
        : null;
  return {
    handled: lease.reminderHandledAt
      ? {
          at: lease.reminderHandledAt,
          byName: handledBy?.name ?? null,
          note: lease.reminderHandledNote,
        }
      : null,
    stoppedReason,
    canHandle: can(actor.role, "reminder.handle") && !lease.archivedAt,
    events: lease.reminderEvents.map((e) => ({
      id: e.id,
      date: fromDbDate(e.scheduledDate),
      kind: e.kind,
      daysBefore: e.daysBefore,
      status: e.status,
      sentAt: e.sentAt,
      note: e.skippedReason,
    })),
  };
}

/** Settings → Reminder emails: recent digests and who receives them. */
export async function listDigests(actor: AuditActor, limit = 30) {
  assertCan(actor, "settings.manage");
  const [digests, users] = await Promise.all([
    db.reminderDigest.findMany({ orderBy: { digestDate: "desc" }, take: limit }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    recipients: users
      .filter((u) => receivesReminders(u.role))
      .map((u) => ({ id: u.id, name: u.name, role: u.role })),
    digests: digests.map((d) => ({
      id: d.id,
      date: fromDbDate(d.digestDate),
      status: d.status,
      leaseCount: d.leaseCount,
      recipientCount: d.recipientIds.length,
      attempts: d.attempts,
      lastError: d.lastError,
      sentAt: d.sentAt,
    })),
  };
}

/** Admin "Try again now" for today's reminder email. */
export async function retryTodaysDigest(actor: AuditActor, meta: RequestMeta, now = new Date()) {
  assertCan(actor, "settings.manage");
  await writeAudit({
    actor,
    action: "reminder.digest_retry",
    entityType: "ReminderDigest",
    metadata: { date: manilaToday(now) },
    meta,
  });
  return sendDailyDigest(now);
}
