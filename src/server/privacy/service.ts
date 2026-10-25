import { z } from "zod";

import { anonymisedName, isPastRetention, retentionDueDate } from "@/domain/privacy/retention";
import { fromDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { storage } from "@/server/documents/storage";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { getSettings } from "@/server/settings/service";
import { parseInput } from "@/server/validation";

/** Manila calendar date of an instant. */
const manilaDate = (d: Date) => manilaToday(d);

async function loadTenant(tenantId: string) {
  if (!isUuid(tenantId)) throw new NotFoundError("We couldn't find that tenant.");
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      leases: {
        include: {
          unit: { select: { unitNumber: true, building: { select: { name: true } } } },
          charges: { orderBy: { dueDate: "asc" } },
          payments: { include: { allocations: true }, orderBy: { receivedDate: "asc" } },
        },
        orderBy: { startDate: "asc" },
      },
    },
  });
  if (!t) throw new NotFoundError("We couldn't find that tenant.");
  return t;
}

/**
 * Everything Propfolio holds about a tenant (DPA right of access / data portability), as JSON.
 * Admins only; audited.
 */
export async function exportTenantData(
  actor: AuditActor,
  tenantId: string,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "privacy.manage");
  const t = await loadTenant(tenantId);
  const documents = await db.document.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  const data = {
    exportedAt: now.toISOString(),
    note: "Personal data held by Propfolio about this tenant, under the Data Privacy Act of 2012 (RA 10173).",
    tenant: {
      type: t.type,
      displayName: t.displayName,
      registeredName: t.registeredName,
      tin: t.tin,
      contactPerson: t.contactPerson,
      phone: t.phone,
      email: t.email,
      billingAddress: t.billingAddress,
      notes: t.notes,
      privacyNoticeAcknowledged: t.privacyAckDate ? fromDbDate(t.privacyAckDate) : null,
      privacyNoticeMethod: t.privacyAckMethod,
      addedAt: t.createdAt.toISOString(),
      archivedAt: t.archivedAt?.toISOString() ?? null,
      anonymisedAt: t.anonymizedAt?.toISOString() ?? null,
    },
    leases: t.leases.map((l) => ({
      reference: l.refNo,
      unit: `Unit ${l.unit.unitNumber}, ${l.unit.building.name}`,
      firstDay: fromDbDate(l.startDate),
      lastDay: fromDbDate(l.endDate),
      endedEarlyOn: l.terminationDate ? fromDbDate(l.terminationDate) : null,
      monthlyRent: l.monthlyRent.toFixed(2),
      rentDueDay: l.rentDueDay,
      securityDeposit: l.securityDeposit.toFixed(2),
      remarks: l.remarks,
      charges: l.charges.map((c) => ({
        description: c.description,
        dueDate: fromDbDate(c.dueDate),
        amount: c.amount.toFixed(2),
        status: c.status,
      })),
      payments: l.payments.map((p) => ({
        number: p.paymentNo,
        received: fromDbDate(p.receivedDate),
        amount: p.amount.toFixed(2),
        method: p.method,
        reference: p.reference,
        notes: p.notes,
        status: p.status,
      })),
    })),
    documents: documents.map((d) => ({
      fileName: d.fileName,
      category: d.category,
      uploadedAt: d.createdAt.toISOString(),
      removed: d.archivedAt !== null,
    })),
  };
  await writeAudit({
    actor,
    action: "tenant.privacy_export",
    entityType: "Tenant",
    entityId: tenantId,
    metadata: { leases: t.leases.length, documents: documents.length },
    meta,
  });
  return data;
}

function hasLiveLease(
  leases: { archivedAt: Date | null; endDate: Date; terminationDate: Date | null }[],
  today: IsoDate,
) {
  return leases.some((l) => !l.archivedAt && fromDbDate(l.terminationDate ?? l.endDate) >= today);
}

const anonymiseSchema = z.object({
  reason: z.string().trim().min(5, "Please give the reason in a few words.").max(500),
});

/**
 * Replace a tenant's personal data with placeholders (DPA right to erasure, or retention).
 * Money records stay so the accounts still add up: rent, charges, payments and totals are kept.
 * Uploaded files are deleted. This cannot be undone.
 */
export async function anonymiseTenant(
  actor: AuditActor | null,
  tenantId: string,
  input: unknown,
  meta: RequestMeta | null,
  now = new Date(),
  opts: { retention?: boolean } = {},
) {
  if (actor) assertCan(actor, "privacy.manage");
  else if (!opts.retention)
    throw new Error("Anonymising needs a person unless it is a retention run");
  const { reason } = parseInput(anonymiseSchema, input);
  const t = await loadTenant(tenantId);
  if (t.anonymizedAt) throw new ValidationError("This tenant was already anonymised.");
  if (hasLiveLease(t.leases, manilaToday(now))) {
    throw new ValidationError(
      "This tenant still has a current or future lease. End or archive it before anonymising.",
    );
  }
  const docs = await db.document.findMany({
    where: { tenantId },
    select: { id: true, storageKey: true, fileName: true },
  });
  await db.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        displayName: anonymisedName(tenantId),
        registeredName: null,
        tin: null,
        contactPerson: null,
        phone: null,
        email: null,
        billingAddress: null,
        notes: null,
        searchText: "",
        anonymizedAt: now,
        archivedAt: t.archivedAt ?? now,
        updatedById: actor?.id ?? null,
      },
    });
    // Free-text fields may mention people; amounts, dates and references stay.
    await tx.lease.updateMany({
      where: { tenantId },
      data: { remarks: null, terminationReason: null, reminderHandledNote: null },
    });
    await tx.payment.updateMany({ where: { lease: { tenantId } }, data: { notes: null } });
    for (const d of docs) {
      const ext = d.fileName.split(".").pop() ?? "file";
      await tx.document.update({
        where: { id: d.id },
        data: {
          fileName: `removed.${ext}`,
          archivedAt: now,
          archivedById: actor?.id ?? null,
          archiveReason: "Tenant anonymised",
        },
      });
    }
    await writeAudit(
      {
        actor,
        action: opts.retention ? "retention.purge" : "tenant.anonymize",
        entityType: "Tenant",
        entityId: tenantId,
        metadata: { reason, leases: t.leases.length, documentsDeleted: docs.length },
        meta,
      },
      tx,
    );
  });
  // Delete the files after the database change has committed.
  for (const d of docs)
    await storage()
      .remove(d.storageKey)
      .catch(() => undefined);
}

export interface RetentionRow {
  tenantId: string;
  name: string;
  leases: number;
  lastLeaseEnd: IsoDate | null;
  dueOn: IsoDate;
}

/** Tenants whose retention period has passed (Settings → Privacy). */
export async function recordsPastRetention(
  actor: AuditActor,
  now = new Date(),
): Promise<{ years: number; rows: RetentionRow[] }> {
  assertCan(actor, "privacy.manage");
  const { retentionYears } = await getSettings();
  const today = manilaToday(now);
  const tenants = await db.tenant.findMany({
    where: { anonymizedAt: null },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      archivedAt: true,
      leases: { select: { archivedAt: true, endDate: true, terminationDate: true } },
    },
  });
  const rows: RetentionRow[] = [];
  for (const t of tenants) {
    const ends = t.leases
      .filter((l) => !l.archivedAt)
      .map((l) => fromDbDate(l.terminationDate ?? l.endDate));
    const input = {
      leaseEndDates: ends,
      hasLiveLease: hasLiveLease(t.leases, today),
      archivedOn: t.archivedAt ? manilaDate(t.archivedAt) : null,
      createdOn: manilaDate(t.createdAt),
    };
    if (!isPastRetention(input, retentionYears, today)) continue;
    rows.push({
      tenantId: t.id,
      name: t.displayName,
      leases: t.leases.length,
      lastLeaseEnd: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
      dueOn: retentionDueDate(input, retentionYears)!,
    });
  }
  return { years: retentionYears, rows: rows.sort((a, b) => a.dueOn.localeCompare(b.dueOn)) };
}

/** Anonymise every tenant past retention (Admin button). Returns how many were anonymised. */
export async function purgePastRetention(
  actor: AuditActor,
  meta: RequestMeta,
  now = new Date(),
): Promise<number> {
  assertCan(actor, "privacy.manage");
  const { rows, years } = await recordsPastRetention(actor, now);
  for (const r of rows) {
    await anonymiseTenant(
      actor,
      r.tenantId,
      { reason: `Retention period of ${years} years has passed` },
      meta,
      now,
      { retention: true },
    );
  }
  return rows.length;
}
