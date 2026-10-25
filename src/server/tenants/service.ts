import type { Tenant } from "@prisma/client";

import { effectiveEndDate, type LeaseStatus } from "@/domain/leases/status";
import { buildSearchText, searchTokens } from "@/domain/search/search";
import { fromDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { createTenantSchema, updateTenantSchema } from "@/schemas/tenant";
import { diffFields, maskPersonal, writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import { leaseDatesOf, leaseStatusInclude, statusOf } from "@/server/leases/status-context";
import type { RequestMeta } from "@/server/request-meta";
import { getSettings } from "@/server/settings/service";
import { parseInput } from "@/server/validation";

/** Tenant fields that are personal data (for individuals) and never go into the audit log as values. */
const PERSONAL_FIELDS = [
  "displayName",
  "registeredName",
  "tin",
  "contactPerson",
  "phone",
  "email",
  "billingAddress",
  "notes",
];

const SEARCHABLE = [
  "displayName",
  "registeredName",
  "contactPerson",
  "email",
  "phone",
  "tin",
] as const;

export function searchTextOf(t: Pick<Tenant, (typeof SEARCHABLE)[number]>): string {
  return buildSearchText(...SEARCHABLE.map((f) => t[f]));
}

export interface TenantListItem {
  id: string;
  type: Tenant["type"];
  displayName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  archived: boolean;
  anonymized: boolean;
  currentLeaseCount: number;
  totalLeaseCount: number;
}

/** Leasing staff only: contact details are personal data that Viewers never receive. */
export async function listTenants(
  actor: AuditActor,
  opts: { q?: string; includeArchived?: boolean } = {},
  now = new Date(),
): Promise<TenantListItem[]> {
  assertCan(actor, "tenant.view");
  const today = new Date(manilaToday(now));
  const tokens = searchTokens(opts.q ?? "");
  const rows = await db.tenant.findMany({
    where: {
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      ...(tokens.length ? { AND: tokens.map((t) => ({ searchText: { contains: t } })) } : {}),
    },
    orderBy: { displayName: "asc" },
    take: 500,
    include: {
      leases: {
        where: { archivedAt: null },
        select: { startDate: true, endDate: true, terminationDate: true },
      },
    },
  });
  const todayIso = manilaToday(now);
  return rows.map((t) => ({
    id: t.id,
    type: t.type,
    displayName: t.displayName,
    contactPerson: t.contactPerson,
    phone: t.phone,
    email: t.email,
    archived: t.archivedAt !== null,
    anonymized: t.anonymizedAt !== null,
    totalLeaseCount: t.leases.length,
    currentLeaseCount: t.leases.filter(
      (l) =>
        l.startDate <= today &&
        effectiveEndDate({
          endDate: fromDbDate(l.endDate),
          terminationDate: l.terminationDate ? fromDbDate(l.terminationDate) : null,
        }) >= todayIso,
    ).length,
  }));
}

export interface TenantLeaseRow {
  id: string;
  refNo: string;
  unitLabel: string;
  unitId: string;
  startDate: IsoDate;
  endDate: IsoDate;
  terminationDate: IsoDate | null;
  monthlyRent: string;
  status: LeaseStatus;
}

export interface TenantDetail extends Omit<Tenant, "searchText" | "privacyAckDate"> {
  privacyAckDate: IsoDate | null;
  leases: TenantLeaseRow[];
}

export async function getTenant(
  actor: AuditActor,
  id: string,
  now = new Date(),
): Promise<TenantDetail> {
  assertCan(actor, "tenant.view");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that tenant.");
  const [t, settings] = await Promise.all([
    db.tenant.findUnique({
      where: { id },
      include: {
        leases: {
          where: { archivedAt: null },
          orderBy: { startDate: "desc" },
          include: { ...leaseStatusInclude, unit: { include: { building: true, unitType: true } } },
        },
      },
    }),
    getSettings(),
  ]);
  if (!t) throw new NotFoundError("We couldn't find that tenant.");
  const today = manilaToday(now);
  const { searchText: _s, leases, privacyAckDate, ...rest } = t;
  return {
    ...rest,
    privacyAckDate: privacyAckDate ? fromDbDate(privacyAckDate) : null,
    leases: leases.map((l) => {
      const d = leaseDatesOf(l);
      return {
        id: l.id,
        refNo: l.refNo,
        unitId: l.unitId,
        unitLabel: `${l.unit.building.name} · ${l.unit.unitNumber}`,
        startDate: d.startDate,
        endDate: d.endDate,
        terminationDate: d.terminationDate,
        monthlyRent: l.monthlyRent.toFixed(2),
        status: statusOf(l, settings.reminderDefaults, today),
      };
    }),
  };
}

/** Small list for pickers (wizard step 2). */
export async function searchTenantsForPicker(actor: AuditActor, q: string) {
  assertCan(actor, "tenant.view");
  const tokens = searchTokens(q);
  const rows = await db.tenant.findMany({
    where: {
      archivedAt: null,
      anonymizedAt: null,
      ...(tokens.length ? { AND: tokens.map((t) => ({ searchText: { contains: t } })) } : {}),
    },
    orderBy: { displayName: "asc" },
    take: 20,
    select: { id: true, displayName: true, type: true, contactPerson: true, email: true },
  });
  return rows;
}

export async function createTenant(
  actor: AuditActor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "tenant.edit");
  const {
    privacyAcknowledged: _ack,
    privacyAckMethod,
    ...data
  } = parseInput(createTenantSchema, input);
  return db.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: {
        ...data,
        privacyAckDate: new Date(manilaToday(now)),
        privacyAckMethod,
        searchText: searchTextOf(data),
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    await writeAudit(
      {
        actor,
        action: "tenant.create",
        entityType: "Tenant",
        entityId: t.id,
        // Contact details are already in the tenant record; the log keeps which fields were set.
        changes: {
          fieldsSet: Object.entries(data)
            .filter(([, v]) => v !== null)
            .map(([k]) => k),
        },
        metadata: { privacyAckMethod, privacyAckDate: manilaToday(now) },
        meta,
      },
      tx,
    );
    return t;
  });
}

export async function updateTenant(
  actor: AuditActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
) {
  assertCan(actor, "tenant.edit");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that tenant.");
  const data = parseInput(updateTenantSchema, input);
  const before = await db.tenant.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("We couldn't find that tenant.");
  if (before.anonymizedAt)
    throw new ValidationError("This tenant's details were anonymised and can't be edited.");
  const rawChanges = diffFields(before, data, [
    "type",
    "displayName",
    "registeredName",
    "tin",
    "contactPerson",
    "phone",
    "email",
    "billingAddress",
    "notes",
  ]);
  if (Object.keys(rawChanges).length === 0) return before;
  const changes = maskPersonal(rawChanges, PERSONAL_FIELDS);
  return db.$transaction(async (tx) => {
    const t = await tx.tenant.update({
      where: { id },
      data: { ...data, searchText: searchTextOf(data), updatedById: actor.id },
    });
    await writeAudit(
      { actor, action: "tenant.update", entityType: "Tenant", entityId: id, changes, meta },
      tx,
    );
    return t;
  });
}

/** Archive a tenant. Blocked while they have a current or upcoming lease. */
export async function setTenantArchived(
  actor: AuditActor,
  id: string,
  archived: boolean,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "record.archive");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that tenant.");
  const before = await db.tenant.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("We couldn't find that tenant.");
  if ((before.archivedAt !== null) === archived) return before;
  if (archived) {
    const today = manilaToday(now);
    const live = await db.lease.findMany({
      where: { tenantId: id, archivedAt: null, endDate: { gte: new Date(today) } },
      select: { endDate: true, terminationDate: true },
    });
    const hasLive = live.some(
      (l) =>
        effectiveEndDate({
          endDate: fromDbDate(l.endDate),
          terminationDate: l.terminationDate ? fromDbDate(l.terminationDate) : null,
        }) >= today,
    );
    if (hasLive)
      throw new ValidationError(
        "This tenant has a current or upcoming lease. End or archive that lease first.",
      );
  }
  return db.$transaction(async (tx) => {
    const t = await tx.tenant.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null, updatedById: actor.id },
    });
    await writeAudit(
      {
        actor,
        action: archived ? "tenant.archive" : "tenant.restore",
        entityType: "Tenant",
        entityId: id,
        meta,
      },
      tx,
    );
    return t;
  });
}

export type TenantPickerItem = Awaited<ReturnType<typeof searchTenantsForPicker>>[number];
