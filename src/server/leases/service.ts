import { Prisma, type Lease } from "@prisma/client";

import { can } from "@/domain/auth/roles";
import {
  daysLeft,
  findOverlap,
  formatLeaseRef,
  statusDetail,
  timeLeftText,
  type LeaseStatus,
} from "@/domain/leases/status";
import type { ReminderConfig, ReminderSource } from "@/domain/reminders/config";
import { reminderSchedule, type ScheduledReminder } from "@/domain/reminders/schedule";
import { searchTokens } from "@/domain/search/search";
import { formatDuration, fromDbDate, toDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import {
  createLeaseSchema,
  leaseTermsSchema,
  terminateLeaseSchema,
  updateLeaseSchema,
  type LeaseTerms,
} from "@/schemas/lease";
import { diffFields, writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db, type Tx } from "@/server/db";
import { isLeaseOverlapViolation, isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { getSettings } from "@/server/settings/service";
import { parseInput } from "@/server/validation";
import { syncReminders } from "@/server/reminders/sync";
import { reminderSummaries } from "@/server/reminders/summary";
import { syncLeaseCharges } from "@/server/billing/charges";
import { balancesForLeases } from "@/server/billing/balances";
import type { ReminderSummary } from "@/domain/reminders/digest";
import { leaseDatesOf, leaseStatusInclude, statusOf, unitReminderConfig } from "./status-context";

// ─── Reading ───────────────────────────────────────────────────────────────────

export interface EscalationStep {
  date: IsoDate;
  monthlyRent: string;
}

export interface LeaseTermsView {
  startDate: IsoDate;
  endDate: IsoDate;
  monthlyRent: string;
  rentDueDay: number;
  securityDeposit: string;
  advanceRentType: Lease["advanceRentType"];
  advanceRentMonths: number | null;
  advanceRentAmount: string | null;
  escalationType: Lease["escalationType"];
  escalationPercent: string | null;
  escalationEveryMonths: number | null;
  escalationSteps: EscalationStep[] | null;
  remarks: string | null;
}

export interface LeaseRow {
  id: string;
  refNo: string;
  status: LeaseStatus;
  building: { id: string; name: string; code: string };
  unit: { id: string; unitNumber: string };
  tenant: { id: string; displayName: string; contactPerson: string | null };
  unitType: { id: string; name: string };
  startDate: IsoDate;
  endDate: IsoDate;
  terminationDate: IsoDate | null;
  daysLeft: number;
  timeLeft: string;
  monthlyRent: string;
  rentDueDay: number;
  remarks: string | null;
  archived: boolean;
  /** Filled in for list views (leases grid); null elsewhere. */
  reminder: ReminderSummary | null;
  /** Amount due now and the overdue part of it (list views); null elsewhere. */
  balanceDue: string | null;
  overdue: string | null;
}

export interface LeaseDetail extends LeaseRow, LeaseTermsView {
  duration: string;
  statusDetail: string | null;
  terminationReason: string | null;
  previousLeaseId: string | null;
  chain: {
    id: string;
    refNo: string;
    startDate: IsoDate;
    endDate: IsoDate;
    status: LeaseStatus;
    current: boolean;
  }[];
  reminders: { config: ReminderConfig; source: ReminderSource; schedule: ScheduledReminder[] };
  actions: {
    canEdit: boolean;
    canRenew: boolean;
    canTerminate: boolean;
    canArchive: boolean;
    canRestore: boolean;
  };
}

const rowInclude = {
  ...leaseStatusInclude,
  unit: {
    select: {
      id: true,
      unitNumber: true,
      reminderConfig: true,
      archivedAt: true,
      building: { select: { id: true, name: true, code: true, archivedAt: true } },
      unitType: { select: { id: true, name: true, reminderConfig: true } },
    },
  },
  tenant: {
    select: {
      id: true,
      displayName: true,
      contactPerson: true,
      archivedAt: true,
      anonymizedAt: true,
    },
  },
} satisfies Prisma.LeaseInclude;

type LeaseWithRow = Prisma.LeaseGetPayload<{ include: typeof rowInclude }>;

function termsView(l: Lease): LeaseTermsView {
  return {
    startDate: fromDbDate(l.startDate),
    endDate: fromDbDate(l.endDate),
    monthlyRent: l.monthlyRent.toFixed(2),
    rentDueDay: l.rentDueDay,
    securityDeposit: l.securityDeposit.toFixed(2),
    advanceRentType: l.advanceRentType,
    advanceRentMonths: l.advanceRentMonths,
    advanceRentAmount: l.advanceRentAmount?.toFixed(2) ?? null,
    escalationType: l.escalationType,
    escalationPercent: l.escalationPercent ? String(Number(l.escalationPercent)) : null,
    escalationEveryMonths: l.escalationEveryMonths,
    escalationSteps: (l.escalationSteps as EscalationStep[] | null) ?? null,
    remarks: l.remarks,
  };
}

function toRow(l: LeaseWithRow, system: ReminderConfig, today: IsoDate): LeaseRow {
  const dates = leaseDatesOf(l);
  return {
    id: l.id,
    refNo: l.refNo,
    status: statusOf(l, system, today),
    building: { id: l.unit.building.id, name: l.unit.building.name, code: l.unit.building.code },
    unit: { id: l.unit.id, unitNumber: l.unit.unitNumber },
    tenant: {
      id: l.tenant.id,
      displayName: l.tenant.displayName,
      contactPerson: l.tenant.contactPerson,
    },
    unitType: { id: l.unit.unitType.id, name: l.unit.unitType.name },
    startDate: dates.startDate,
    endDate: dates.endDate,
    terminationDate: dates.terminationDate,
    daysLeft: daysLeft(dates, today),
    timeLeft: timeLeftText(dates, today),
    monthlyRent: l.monthlyRent.toFixed(2),
    rentDueDay: l.rentDueDay,
    remarks: l.remarks,
    archived: l.archivedAt !== null,
    reminder: null,
    balanceDue: null,
    overdue: null,
  };
}

export interface LeaseFilters {
  q?: string;
  status?: LeaseStatus;
  /** Current leases (Active/Expiring) whose last day is within this many days. */
  endingWithinDays?: number;
  buildingId?: string;
  unitTypeId?: string;
  /** Only leases with an overdue balance. */
  overdueOnly?: boolean;
  /** Only these leases (e.g. rows selected for export). */
  ids?: string[];
  includeArchived?: boolean;
}

export async function listLeases(
  actor: AuditActor,
  filters: LeaseFilters = {},
  now = new Date(),
): Promise<LeaseRow[]> {
  assertCan(actor, "lease.view");
  const today = manilaToday(now);
  const tokens = searchTokens(filters.q ?? "");
  const ci = { mode: "insensitive" as const };
  const [rows, settings] = await Promise.all([
    db.lease.findMany({
      where: {
        ...(filters.includeArchived ? {} : { archivedAt: null }),
        unit: {
          ...(filters.buildingId && isUuid(filters.buildingId)
            ? { buildingId: filters.buildingId }
            : {}),
          ...(filters.unitTypeId && isUuid(filters.unitTypeId)
            ? { unitTypeId: filters.unitTypeId }
            : {}),
        },
        ...(filters.ids ? { id: { in: filters.ids.filter(isUuid) } } : {}),
        ...(tokens.length
          ? {
              AND: tokens.map((t) => ({
                OR: [
                  { refNo: { contains: t, ...ci } },
                  { tenant: { searchText: { contains: t } } },
                  { unit: { unitNumber: { contains: t, ...ci } } },
                  { unit: { building: { name: { contains: t, ...ci } } } },
                  { unit: { building: { code: { contains: t, ...ci } } } },
                ],
              })),
            }
          : {}),
      },
      include: rowInclude,
      orderBy: [{ endDate: "asc" }],
      take: 1000,
    }),
    getSettings(),
  ]);
  let out = rows.map((l) => toRow(l, settings.reminderDefaults, today));
  // Status is computed, so filter after computing it (the stored value may be a day old).
  if (filters.status) out = out.filter((r) => r.status === filters.status);
  if (filters.endingWithinDays !== undefined) {
    const limit = filters.endingWithinDays;
    out = out.filter(
      (r) => (r.status === "ACTIVE" || r.status === "EXPIRING") && r.daysLeft <= limit,
    );
  }
  const handled = new Set(rows.filter((l) => l.reminderHandledAt).map((l) => l.id));
  const summaries = await reminderSummaries(
    out.map((r) => ({
      id: r.id,
      handled: handled.has(r.id),
      stopped: r.archived || r.status === "RENEWED" || r.status === "TERMINATED",
    })),
  );
  const balances = await balancesForLeases(
    out.map((r) => r.id),
    now,
  );
  const withExtras = out.map((r) => ({
    ...r,
    reminder: summaries.get(r.id) ?? null,
    balanceDue: balances.get(r.id)?.balanceDue ?? "0.00",
    overdue: balances.get(r.id)?.overdue ?? "0.00",
  }));
  return filters.overdueOnly ? withExtras.filter((r) => Number(r.overdue) > 0) : withExtras;
}

async function loadLease(id: string): Promise<LeaseWithRow> {
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that lease.");
  const l = await db.lease.findUnique({ where: { id }, include: rowInclude });
  if (!l) throw new NotFoundError("We couldn't find that lease.");
  return l;
}

export async function getLease(
  actor: AuditActor,
  id: string,
  now = new Date(),
): Promise<LeaseDetail> {
  assertCan(actor, "lease.view");
  const today = manilaToday(now);
  const [l, settings] = await Promise.all([loadLease(id), getSettings()]);
  const system = settings.reminderDefaults;
  const row = toRow(l, system, today);
  const { config, source } = unitReminderConfig(system, l.unit);

  // Walk the renewal chain both ways.
  const chainRows: LeaseWithRow[] = [l];
  let cursor = l;
  while (cursor.previousLeaseId) {
    const prev = await db.lease.findUnique({
      where: { id: cursor.previousLeaseId },
      include: rowInclude,
    });
    if (!prev || chainRows.length > 50) break;
    chainRows.unshift(prev);
    cursor = prev;
  }
  cursor = l;
  while (cursor.nextLease) {
    const next = await db.lease.findUnique({
      where: { id: cursor.nextLease.id },
      include: rowInclude,
    });
    if (!next || chainRows.length > 50) break;
    chainRows.push(next);
    cursor = next;
  }

  const editable = can(actor.role, "lease.edit") && !row.archived;
  const terminated = l.terminationDate !== null;
  const renewed = l.nextLease !== null && l.nextLease.archivedAt === null;
  return {
    ...row,
    ...termsView(l),
    duration: formatDuration(row.startDate, row.endDate),
    statusDetail: statusDetail(row.status, leaseDatesOf(l)),
    terminationReason: l.terminationReason,
    previousLeaseId: l.previousLeaseId,
    chain: chainRows
      .filter((c) => c.archivedAt === null || c.id === l.id)
      .map((c) => ({
        id: c.id,
        refNo: c.refNo,
        startDate: fromDbDate(c.startDate),
        endDate: fromDbDate(c.endDate),
        status: statusOf(c, system, today),
        current: c.id === l.id,
      })),
    reminders: { config, source, schedule: reminderSchedule(row.startDate, row.endDate, config) },
    actions: {
      canEdit: editable && !terminated,
      canRenew: editable && !terminated && !renewed,
      canTerminate: editable && !terminated && !renewed,
      canArchive: can(actor.role, "record.archive") && !row.archived,
      canRestore: can(actor.role, "record.archive") && row.archived,
    },
  };
}

// ─── Writing ───────────────────────────────────────────────────────────────────

function termsData(t: LeaseTerms) {
  return {
    startDate: toDbDate(t.startDate),
    endDate: toDbDate(t.endDate),
    monthlyRent: t.monthlyRent,
    rentDueDay: t.rentDueDay,
    securityDeposit: t.securityDeposit,
    advanceRentType: t.advanceRentType,
    advanceRentMonths: t.advanceRentMonths,
    advanceRentAmount: t.advanceRentAmount,
    escalationType: t.escalationType,
    escalationPercent: t.escalationPercent,
    escalationEveryMonths: t.escalationEveryMonths,
    escalationSteps: t.escalationSteps
      ? (t.escalationSteps as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull,
    remarks: t.remarks,
  };
}

/** Non-personal snapshot of the terms for the audit log. */
function termsAudit(t: LeaseTerms & { unitId?: string; tenantId?: string }) {
  return { ...t };
}

async function nextRefNo(tx: Tx, now: Date): Promise<string> {
  const year = Number(manilaToday(now).slice(0, 4));
  const [row] = await tx.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "LeaseCounter" ("year", "lastSeq") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "lastSeq" = "LeaseCounter"."lastSeq" + 1
    RETURNING "lastSeq"`;
  return formatLeaseRef(year, row!.lastSeq);
}

/** Load the unit and tenant for a new or edited lease, with friendly errors if unusable. */
async function loadParties(client: Tx, unitId: string, tenantId: string) {
  const [unit, tenant] = await Promise.all([
    client.unit.findUnique({
      where: { id: unitId },
      include: { building: true, unitType: { select: { reminderConfig: true } } },
    }),
    client.tenant.findUnique({ where: { id: tenantId } }),
  ]);
  const errors: Record<string, string> = {};
  if (!unit || unit.archivedAt || unit.building.archivedAt)
    errors.unitId = "Choose a unit from the list.";
  if (!tenant || tenant.archivedAt || tenant.anonymizedAt)
    errors.tenantId = "Choose a tenant from the list.";
  if (Object.keys(errors).length)
    throw new ValidationError("Please check the highlighted fields.", errors);
  return { unit: unit!, tenant: tenant! };
}

/** Friendly overlap check (the database enforces it too). */
async function assertNoOverlap(
  client: Tx,
  unit: { id: string; unitNumber: string },
  period: { startDate: IsoDate; endDate: IsoDate },
  excludeLeaseId?: string,
) {
  const existing = await client.lease.findMany({
    where: {
      unitId: unit.id,
      archivedAt: null,
      ...(excludeLeaseId ? { id: { not: excludeLeaseId } } : {}),
    },
    include: { tenant: { select: { displayName: true } } },
  });
  const clash = findOverlap(
    period,
    existing.map((l) => ({ ...leaseDatesOf({ ...l, nextLease: null }), row: l })),
  );
  if (clash)
    throw overlapError(
      unit.unitNumber,
      clash.row.tenant.displayName,
      clash.row.refNo,
      clash.startDate,
      clash.terminationDate ?? clash.endDate,
    );
}

function overlapError(
  unitNumber: string,
  tenantName?: string,
  refNo?: string,
  start?: IsoDate,
  end?: IsoDate,
) {
  const who =
    tenantName && start && end
      ? ` is already leased to ${tenantName} (${refNo}) from ${formatIsoDate(start)} to ${formatIsoDate(end)}`
      : " already has a lease for some of these dates";
  return new ValidationError(
    `Unit ${unitNumber}${who}. Choose dates that don't overlap, or another unit.`,
    {
      startDate: "These dates overlap another lease on this unit.",
    },
  );
}

function computeInitialStatus(
  dates: { startDate: IsoDate; endDate: IsoDate },
  unit: { reminderConfig: Prisma.JsonValue; unitType: { reminderConfig: Prisma.JsonValue } },
  system: ReminderConfig,
  today: IsoDate,
): LeaseStatus {
  return statusOf(
    {
      startDate: toDbDate(dates.startDate),
      endDate: toDbDate(dates.endDate),
      terminationDate: null,
      unit,
      nextLease: null,
    },
    system,
    today,
  );
}

async function withOverlapGuard<T>(unitNumber: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isLeaseOverlapViolation(err)) throw overlapError(unitNumber);
    throw err;
  }
}

export async function createLease(
  actor: AuditActor & { id: string },
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "lease.edit");
  const data = parseInput(createLeaseSchema, input);
  const settings = await getSettings();
  const today = manilaToday(now);
  const { unit } = await loadParties(db, data.unitId, data.tenantId);

  const created = await withOverlapGuard(unit.unitNumber, () =>
    db.$transaction(async (tx) => {
      await assertNoOverlap(tx, unit, data);
      const refNo = await nextRefNo(tx, now);
      const lease = await tx.lease.create({
        data: {
          refNo,
          unitId: data.unitId,
          tenantId: data.tenantId,
          ...termsData(data),
          status: computeInitialStatus(data, unit, settings.reminderDefaults, today),
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(
        {
          actor,
          action: "lease.create",
          entityType: "Lease",
          entityId: lease.id,
          changes: termsAudit(data),
          metadata: { refNo },
          meta,
        },
        tx,
      );
      await tx.leaseDraft.deleteMany({ where: { userId: actor.id } });
      return lease;
    }),
  );
  await syncLeaseCharges(created.id, actor, now, "New lease");
  await syncReminders({ leaseIds: [created.id] }, now);
  return created;
}

const AUDITED_FIELDS = [
  "unitId",
  "tenantId",
  "startDate",
  "endDate",
  "monthlyRent",
  "rentDueDay",
  "securityDeposit",
  "advanceRentType",
  "advanceRentMonths",
  "advanceRentAmount",
  "escalationType",
  "escalationPercent",
  "escalationEveryMonths",
  "escalationSteps",
  "remarks",
] as const;

function comparable(l: Lease) {
  return {
    ...termsView(l),
    unitId: l.unitId,
    tenantId: l.tenantId,
    escalationPercent: l.escalationPercent?.toFixed(3) ?? null,
  };
}

/** Change the important terms of a lease (dates, rent, unit, tenant…). Used after a confirmation step. */
export async function updateLease(
  actor: AuditActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "lease.edit");
  const data = parseInput(updateLeaseSchema, input);
  const before = await loadLease(id);
  if (before.archivedAt) throw new ValidationError("Restore this lease before changing it.");
  if (before.terminationDate)
    throw new ValidationError("This lease ended early, so its terms can no longer be changed.");
  const settings = await getSettings();
  const today = manilaToday(now);

  const changes = diffFields(comparable(before), { ...data }, AUDITED_FIELDS);
  if (Object.keys(changes).length === 0) return before;

  const { unit } =
    data.unitId !== before.unitId || data.tenantId !== before.tenantId
      ? await loadParties(db, data.unitId, data.tenantId)
      : { unit: before.unit };

  const updated = await withOverlapGuard(unit.unitNumber, () =>
    db.$transaction(async (tx) => {
      await assertNoOverlap(tx, unit, data, id);
      const status = statusOf(
        {
          startDate: toDbDate(data.startDate),
          endDate: toDbDate(data.endDate),
          terminationDate: null,
          unit,
          nextLease: before.nextLease,
        },
        settings.reminderDefaults,
        today,
      );
      const lease = await tx.lease.update({
        where: { id },
        data: {
          unitId: data.unitId,
          tenantId: data.tenantId,
          ...termsData(data),
          status,
          updatedById: actor.id,
        },
      });
      await writeAudit(
        { actor, action: "lease.update", entityType: "Lease", entityId: id, changes, meta },
        tx,
      );
      return lease;
    }),
  );
  await syncLeaseCharges(id, actor, now, "Lease terms changed");
  await syncReminders({ leaseIds: [id] }, now);
  return updated;
}

/**
 * Renew: create a new lease for the same unit and tenant, linked to the old one, and mark the
 * old one RENEWED.
 */
export async function renewLease(
  actor: AuditActor,
  previousId: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "lease.edit");
  const terms = parseInput(leaseTermsSchema, input);
  const prev = await loadLease(previousId);
  if (prev.archivedAt)
    throw new ValidationError("This lease is archived. Restore it before renewing.");
  if (prev.terminationDate)
    throw new ValidationError(
      "This lease ended early, so it can't be renewed. Create a new lease instead.",
    );
  if (prev.nextLease && !prev.nextLease.archivedAt)
    throw new ValidationError("This lease has already been renewed.");
  const prevEnd = fromDbDate(prev.endDate);
  if (terms.startDate <= prevEnd) {
    throw new ValidationError("Please check the highlighted fields.", {
      startDate: `The renewal must start after the current lease ends (${formatIsoDate(prevEnd)}).`,
    });
  }
  await loadParties(db, prev.unitId, prev.tenantId);
  const settings = await getSettings();
  const today = manilaToday(now);

  const renewal = await withOverlapGuard(prev.unit.unitNumber, () =>
    db.$transaction(async (tx) => {
      // An archived earlier renewal releases the link so this one can take its place.
      if (prev.nextLease?.archivedAt) {
        await tx.lease.update({
          where: { id: prev.nextLease.id },
          data: { previousLeaseId: null },
        });
      }
      await assertNoOverlap(tx, prev.unit, terms);
      const refNo = await nextRefNo(tx, now);
      const lease = await tx.lease.create({
        data: {
          refNo,
          unitId: prev.unitId,
          tenantId: prev.tenantId,
          previousLeaseId: prev.id,
          ...termsData(terms),
          status: computeInitialStatus(terms, prev.unit, settings.reminderDefaults, today),
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await tx.lease.update({
        where: { id: prev.id },
        data: { status: "RENEWED", updatedById: actor.id },
      });
      await writeAudit(
        {
          actor,
          action: "lease.create",
          entityType: "Lease",
          entityId: lease.id,
          changes: termsAudit(terms),
          metadata: { refNo, renewalOf: prev.refNo },
          meta,
        },
        tx,
      );
      await writeAudit(
        {
          actor,
          action: "lease.renew",
          entityType: "Lease",
          entityId: prev.id,
          metadata: { renewedBy: refNo, newLeaseId: lease.id },
          meta,
        },
        tx,
      );
      return lease;
    }),
  );
  // Renewing stops the old lease's reminders and schedules the new one's.
  await syncLeaseCharges(renewal.id, actor, now, "Renewal");
  await syncReminders({ leaseIds: [prev.id, renewal.id] }, now);
  return renewal;
}

/** End a lease early. Requires the last day and a reason. */
export async function terminateLease(
  actor: AuditActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "lease.edit");
  const data = parseInput(terminateLeaseSchema, input);
  const l = await loadLease(id);
  if (l.archivedAt) throw new ValidationError("Restore this lease before ending it.");
  if (l.terminationDate) throw new ValidationError("This lease has already ended early.");
  if (l.nextLease && !l.nextLease.archivedAt) {
    throw new ValidationError(
      "This lease was renewed. To end the tenancy early, end the newer lease instead.",
    );
  }
  const start = fromDbDate(l.startDate);
  const end = fromDbDate(l.endDate);
  if (data.terminationDate < start || data.terminationDate > end) {
    throw new ValidationError("Please check the highlighted fields.", {
      terminationDate: `Choose a date between ${formatIsoDate(start)} and ${formatIsoDate(end)}.`,
    });
  }
  const terminated = await db.$transaction(async (tx) => {
    const lease = await tx.lease.update({
      where: { id },
      data: {
        terminationDate: toDbDate(data.terminationDate),
        terminationReason: data.reason,
        terminatedAt: now,
        terminatedById: actor.id,
        status: "TERMINATED",
        updatedById: actor.id,
      },
    });
    await writeAudit(
      {
        actor,
        action: "lease.terminate",
        entityType: "Lease",
        entityId: id,
        changes: { terminationDate: { before: null, after: data.terminationDate } },
        metadata: { reason: data.reason },
        meta,
      },
      tx,
    );
    return lease;
  });
  // Ending a lease early stops its expiry reminders.
  await syncLeaseCharges(id, actor, now);
  await syncReminders({ leaseIds: [id] }, now);
  return terminated;
}

/** Archive (hide) or restore a lease. Nothing is deleted. */
export async function setLeaseArchived(
  actor: AuditActor,
  id: string,
  archived: boolean,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "record.archive");
  const l = await loadLease(id);
  if ((l.archivedAt !== null) === archived) return l;
  if (!archived) {
    if (l.unit.archivedAt || l.unit.building.archivedAt)
      throw new ValidationError("Restore the unit first.");
    if (l.tenant.archivedAt) throw new ValidationError("Restore the tenant first.");
  }
  const settings = await getSettings();
  const result = await withOverlapGuard(l.unit.unitNumber, () =>
    db.$transaction(async (tx) => {
      if (!archived) await assertNoOverlap(tx, l.unit, leaseDatesOf(l), id);
      const lease = await tx.lease.update({
        where: { id },
        data: {
          archivedAt: archived ? now : null,
          status: statusOf(l, settings.reminderDefaults, manilaToday(now)),
          updatedById: actor.id,
        },
      });
      // Archiving a renewal re-opens the previous lease for renewal.
      if (l.previousLeaseId) {
        const prev = await tx.lease.findUnique({
          where: { id: l.previousLeaseId },
          include: { ...leaseStatusInclude },
        });
        if (prev) {
          const status = statusOf(
            { ...prev, nextLease: archived ? null : { id, archivedAt: null } },
            settings.reminderDefaults,
            manilaToday(now),
          );
          await tx.lease.update({ where: { id: prev.id }, data: { status } });
        }
      }
      await writeAudit(
        {
          actor,
          action: archived ? "lease.archive" : "lease.restore",
          entityType: "Lease",
          entityId: id,
          meta,
        },
        tx,
      );
      return lease;
    }),
  );
  await syncReminders({ leaseIds: [id, ...(l.previousLeaseId ? [l.previousLeaseId] : [])] }, now);
  return result;
}

// ─── Daily status sync ─────────────────────────────────────────────────────────

/** Bring the stored status column in line with today. Idempotent; run daily by the worker. */
export async function syncLeaseStatuses(now = new Date()): Promise<number> {
  const today = manilaToday(now);
  const settings = await getSettings();
  const leases = await db.lease.findMany({
    where: { archivedAt: null },
    include: leaseStatusInclude,
  });
  let changed = 0;
  for (const l of leases) {
    const status = statusOf(l, settings.reminderDefaults, today);
    if (status !== l.status) {
      await db.lease.update({ where: { id: l.id }, data: { status } });
      changed++;
    }
  }
  if (changed > 0) {
    await writeAudit({
      actor: null,
      action: "lease.status_sync",
      entityType: "Lease",
      metadata: { changed, date: today },
    });
  }
  return changed;
}
