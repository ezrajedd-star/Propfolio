import { render } from "@react-email/render";

import { receivesReminders } from "@/domain/auth/roles";
import { CATCH_UP_DAYS, buildDigest, type DigestLease } from "@/domain/reminders/digest";
import { addDays, fromDbDate, toDbDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { DigestEmail } from "@/server/mail/templates/digest-email";
import { deliver, type OutgoingMail } from "@/server/mail/transport";
import { getSettings } from "@/server/settings/service";
import { syncLeaseStatuses } from "@/server/leases/service";
import { syncReminders } from "./sync";
import { computeOverdue } from "@/server/billing/balances";
import { formatPeso } from "@/domain/money/money";

export interface DigestDeps {
  /** Sends the email; replaced in tests to simulate failures. */
  send: (mail: OutgoingMail, fromName: string) => Promise<void>;
}

export type DigestOutcome =
  | { status: "SENT"; leaseCount: number; recipientCount: number }
  | { status: "EMPTY" }
  | { status: "ALREADY_DONE"; previous: "SENT" | "EMPTY" }
  | { status: "IN_PROGRESS" };

/** Error text for the Admin screen, with any email addresses removed. */
function safeError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return raw.replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[address]").slice(0, 300);
}

/** Leases still needing reminders: not archived, handled, ended early or renewed. */
const liveLease = {
  archivedAt: null,
  reminderHandledAt: null,
  terminationDate: null,
  OR: [{ nextLease: { is: null } }, { nextLease: { archivedAt: { not: null } } }],
};

/**
 * The daily reminder email (run at 06:00 Asia/Manila by the worker).
 *
 * - One digest per day, to every active Admin and Leasing Staff user (never Viewers).
 * - Idempotent: once today's digest is SENT (or there was nothing to send), running again does
 *   nothing. A FAILED digest is attempted again; throwing lets the job runner retry later.
 * - Includes reminders due today and any missed in the last CATCH_UP_DAYS (e.g. failed sends).
 * - `now` and `deps` are injectable so tests control the clock and the mail server.
 */
export async function sendDailyDigest(
  now = new Date(),
  deps: DigestDeps = { send: deliver },
): Promise<DigestOutcome> {
  const today = manilaToday(now);
  const digestDate = toDbDate(today);

  const existing = await db.reminderDigest.findUnique({ where: { digestDate } });
  if (existing?.status === "SENT" || existing?.status === "EMPTY")
    return { status: "ALREADY_DONE", previous: existing.status };
  // Another run is sending right now (a stale claim older than 10 minutes is taken over).
  if (existing?.status === "SENDING" && now.getTime() - existing.updatedAt.getTime() < 10 * 60_000)
    return { status: "IN_PROGRESS" };

  const digest = existing
    ? await db.reminderDigest.update({
        where: { id: existing.id },
        data: { status: "SENDING", attempts: { increment: 1 } },
      })
    : await db.reminderDigest.create({ data: { digestDate, status: "SENDING", attempts: 1 } });

  // Make sure statuses and pending reminders are current before deciding what to send.
  await syncLeaseStatuses(now);
  await syncReminders("all", now);

  // Failed reminders for leases that no longer need them are not retried.
  await db.reminderEvent.updateMany({
    where: { status: "FAILED", lease: { NOT: liveLease } },
    data: {
      status: "SKIPPED",
      skippedReason: "No longer needed (handled, renewed, ended or archived)",
    },
  });

  const due = await db.reminderEvent.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      scheduledDate: { gte: toDbDate(addDays(today, -CATCH_UP_DAYS)), lte: digestDate },
      lease: liveLease,
    },
    include: {
      lease: {
        select: {
          id: true,
          refNo: true,
          startDate: true,
          endDate: true,
          tenant: { select: { displayName: true } },
          unit: { select: { unitNumber: true, building: { select: { name: true } } } },
        },
      },
    },
  });

  const settings = await getSettings();
  const byLease = new Map<string, DigestLease>();
  for (const e of due) {
    const l = e.lease;
    const entry =
      byLease.get(l.id) ??
      ({
        leaseId: l.id,
        refNo: l.refNo,
        tenantName: l.tenant.displayName,
        unitLabel: `Unit ${l.unit.unitNumber}`,
        buildingName: l.unit.building.name,
        startDate: fromDbDate(l.startDate),
        endDate: fromDbDate(l.endDate),
        reminders: [],
      } satisfies DigestLease);
    entry.reminders.push({
      date: fromDbDate(e.scheduledDate),
      kind: e.kind,
      daysBefore: e.daysBefore,
    });
    byLease.set(l.id, entry);
  }
  const appUrl = env().APP_URL;
  const content = buildDigest([...byLease.values()], today, appUrl);

  const overdue = settings.digestIncludeOverdue ? await computeOverdue(now) : null;
  const overdueSummary =
    overdue && overdue.count > 0
      ? {
          count: overdue.count,
          totalLabel: formatPeso(overdue.total),
          url: `${appUrl}/payments#overdue`,
        }
      : undefined;

  // Overdue payments alone don't trigger an email; they ride along with the lease reminders.
  if (content.items.length === 0) {
    await db.reminderDigest.update({
      where: { id: digest.id },
      data: { status: "EMPTY", leaseCount: 0, lastError: null },
    });
    return { status: "EMPTY" };
  }

  const recipients = (
    await db.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, role: true },
    })
  ).filter((u) => receivesReminders(u.role));
  const eventIds = due.map((e) => e.id);

  try {
    if (recipients.length === 0)
      throw new Error("There are no active Admin or Leasing Staff users to send reminders to.");
    const element = (
      <DigestEmail
        companyName={settings.companyName}
        dateLabel={content.dateLabel}
        items={content.items}
        overdue={overdueSummary}
        leasesUrl={`${appUrl}/leases`}
      />
    );
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    await deps.send(
      {
        to: recipients.map((r) => r.email),
        subject: content.subject,
        html,
        text,
        replyTo: settings.mailReplyTo || undefined,
      },
      settings.mailFromName,
    );
  } catch (err) {
    const message = safeError(err);
    await db.$transaction([
      db.reminderDigest.update({
        where: { id: digest.id },
        data: {
          status: "FAILED",
          lastError: message,
          leaseCount: content.items.length,
          recipientIds: recipients.map((r) => r.id),
        },
      }),
      db.reminderEvent.updateMany({
        where: { id: { in: eventIds } },
        data: { status: "FAILED", digestId: digest.id },
      }),
    ]);
    await writeAudit({
      actor: null,
      action: "reminder.digest_failed",
      entityType: "ReminderDigest",
      entityId: digest.id,
      metadata: {
        date: today,
        attempt: digest.attempts,
        leases: content.items.length,
        error: message,
      },
    });
    throw err;
  }

  const sentAt = new Date();
  await db.$transaction([
    db.reminderDigest.update({
      where: { id: digest.id },
      data: {
        status: "SENT",
        sentAt,
        lastError: null,
        leaseCount: content.items.length,
        recipientIds: recipients.map((r) => r.id),
      },
    }),
    db.reminderEvent.updateMany({
      where: { id: { in: eventIds } },
      data: { status: "SENT", sentAt, digestId: digest.id },
    }),
  ]);
  await writeAudit({
    actor: null,
    action: "reminder.digest_sent",
    entityType: "ReminderDigest",
    entityId: digest.id,
    metadata: {
      date: today,
      leases: content.items.length,
      recipients: recipients.length,
      attempt: digest.attempts,
    },
  });
  return { status: "SENT", leaseCount: content.items.length, recipientCount: recipients.length };
}
