import { z } from "zod";

import { writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { optionalText } from "@/schemas/common-fields";
import { syncReminders } from "./sync";

const handledSchema = z.object({ note: optionalText(500, "The note") });

async function loadLease(leaseId: string) {
  if (!isUuid(leaseId)) throw new NotFoundError("We couldn't find that lease.");
  const lease = await db.lease.findUnique({ where: { id: leaseId } });
  if (!lease) throw new NotFoundError("We couldn't find that lease.");
  if (lease.archivedAt) throw new ValidationError("This lease is archived.");
  return lease;
}

/** "Mark as handled": stops all further expiry reminders for this lease (brief §6). */
export async function markReminderHandled(
  actor: AuditActor,
  leaseId: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "reminder.handle");
  const { note } = parseInput(handledSchema, input ?? {});
  const lease = await loadLease(leaseId);
  if (lease.reminderHandledAt) return lease;
  const updated = await db.$transaction(async (tx) => {
    const l = await tx.lease.update({
      where: { id: leaseId },
      data: { reminderHandledAt: now, reminderHandledById: actor.id, reminderHandledNote: note },
    });
    await writeAudit(
      {
        actor,
        action: "reminder.handled",
        entityType: "Lease",
        entityId: leaseId,
        metadata: note ? { note } : null,
        meta,
      },
      tx,
    );
    return l;
  });
  await syncReminders({ leaseIds: [leaseId] }, now);
  return updated;
}

/** Undo "Mark as handled": reminders resume from today. */
export async function unmarkReminderHandled(
  actor: AuditActor,
  leaseId: string,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "reminder.handle");
  const lease = await loadLease(leaseId);
  if (!lease.reminderHandledAt) return lease;
  const updated = await db.$transaction(async (tx) => {
    const l = await tx.lease.update({
      where: { id: leaseId },
      data: { reminderHandledAt: null, reminderHandledById: null, reminderHandledNote: null },
    });
    await writeAudit(
      { actor, action: "reminder.unhandled", entityType: "Lease", entityId: leaseId, meta },
      tx,
    );
    return l;
  });
  await syncReminders({ leaseIds: [leaseId] }, now);
  return updated;
}
