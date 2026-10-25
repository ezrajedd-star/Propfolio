import { z } from "zod";

import { maskPersonal, writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { optionalText } from "@/schemas/common-fields";
import { searchTextOf } from "@/server/tenants/service";

/**
 * In-line edits from the leases grid. Only simple fields are allowed here; dates, rent, unit
 * and tenant go through the full form with a confirmation step (brief §5.3).
 */
export const QUICK_EDIT_FIELDS = ["remarks", "rentDueDay", "contactPerson"] as const;
export type QuickEditField = (typeof QUICK_EDIT_FIELDS)[number];

const quickEditSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("remarks"), value: optionalText(2000, "The remark") }),
  z.object({
    field: z.literal("rentDueDay"),
    value: z.coerce
      .number({ error: "Enter a day from 1 to 28." })
      .int("Enter a whole number from 1 to 28.")
      .min(1, "Enter a day from 1 to 28.")
      .max(28, "Use a day from 1 to 28, so it exists in every month."),
  }),
  z.object({ field: z.literal("contactPerson"), value: optionalText(120, "The contact person") }),
]);

export type QuickEditValue = string | number | null;

/**
 * Save one field. Returns the previous value so the grid can offer Undo (which is simply
 * another quick edit back to the previous value, and is audited like any change).
 */
export async function quickEditLease(
  actor: AuditActor,
  leaseId: string,
  input: unknown,
  meta: RequestMeta,
): Promise<{ field: QuickEditField; previous: QuickEditValue; value: QuickEditValue }> {
  assertCan(actor, "lease.edit");
  const parsed = quickEditSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "That value isn't valid.", {
      value: parsed.error.issues[0]?.message ?? "",
    });
  }
  const { field, value } = parsed.data;
  if (!isUuid(leaseId)) throw new NotFoundError("We couldn't find that lease.");
  const lease = await db.lease.findUnique({ where: { id: leaseId }, include: { tenant: true } });
  if (!lease) throw new NotFoundError("We couldn't find that lease.");
  if (lease.archivedAt) throw new ValidationError("Restore this lease before changing it.");

  if (field === "contactPerson") {
    assertCan(actor, "tenant.edit");
    const tenant = lease.tenant;
    if (tenant.anonymizedAt)
      throw new ValidationError("This tenant's details were anonymised and can't be edited.");
    const previous = tenant.contactPerson;
    if (previous === value) return { field, previous, value };
    await db.$transaction(async (tx) => {
      const searchText = searchTextOf({ ...tenant, contactPerson: value });
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { contactPerson: value, searchText, updatedById: actor.id },
      });
      await writeAudit(
        {
          actor,
          action: "tenant.update",
          entityType: "Tenant",
          entityId: tenant.id,
          changes: maskPersonal({ contactPerson: { before: previous, after: value } }, [
            "contactPerson",
          ]),
          metadata: { via: "leases grid", leaseId },
          meta,
        },
        tx,
      );
    });
    return { field, previous, value };
  }

  if (field === "rentDueDay" && lease.terminationDate) {
    throw new ValidationError("This lease ended early, so its terms can no longer be changed.");
  }
  const previous = field === "remarks" ? lease.remarks : lease.rentDueDay;
  if (previous === value) return { field, previous, value };
  await db.$transaction(async (tx) => {
    await tx.lease.update({
      where: { id: leaseId },
      data: { [field]: value, updatedById: actor.id },
    });
    await writeAudit(
      {
        actor,
        action: "lease.update",
        entityType: "Lease",
        entityId: leaseId,
        changes: { [field]: { before: previous, after: value } },
        metadata: { via: "leases grid" },
        meta,
      },
      tx,
    );
  });
  return { field, previous, value };
}
