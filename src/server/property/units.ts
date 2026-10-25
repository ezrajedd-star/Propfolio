import type { Prisma, UnitStatusOverride } from "@prisma/client";

import { can } from "@/domain/auth/roles";
import { unitOccupancy, type Occupancy } from "@/domain/leases/occupancy";
import { effectiveEndDate, type LeaseStatus } from "@/domain/leases/status";
import type { ReminderConfig, ReminderSource } from "@/domain/reminders/config";
import { parseStoredReminderConfig } from "@/domain/reminders/config";
import { fromDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { searchTokens } from "@/domain/search/search";
import { unitReminderSchema, unitSchema } from "@/schemas/property";
import { diffFields, writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUniqueViolation, isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import {
  leaseDatesOf,
  leaseStatusInclude,
  statusOf,
  unitReminderConfig,
} from "@/server/leases/status-context";
import type { RequestMeta } from "@/server/request-meta";
import { getSettings } from "@/server/settings/service";
import { parseInput } from "@/server/validation";
import { syncReminders } from "@/server/reminders/sync";
import { reminderJson } from "./unit-types";

/**
 * Lease info on unit screens. Viewers (Property Management) get only the tenant's display name
 * and the dates; Leasing staff also get the lease id, reference and status.
 */
export interface UnitLeaseInfo {
  tenantName: string;
  startDate: IsoDate;
  endDate: IsoDate;
  terminationDate: IsoDate | null;
  lease?: { id: string; refNo: string; status: LeaseStatus };
}

export interface UnitSummary {
  id: string;
  unitNumber: string;
  building: { id: string; name: string; code: string };
  unitType: { id: string; name: string };
  floor: string | null;
  floorArea: string | null;
  isStandalone: boolean;
  statusOverride: UnitStatusOverride | null;
  occupancy: Occupancy;
  archived: boolean;
  /** The reminder settings that apply to this unit (not sensitive). */
  reminderConfig: ReminderConfig;
  /** Internal notes; Leasing staff and Admins only. */
  notes: string | null;
  currentLease: UnitLeaseInfo | null;
  nextLease: UnitLeaseInfo | null;
}

export interface UnitFilters {
  buildingId?: string;
  unitTypeId?: string;
  occupancy?: Occupancy;
  q?: string;
  /** Only units with no lease covering this date or later (for the new-lease wizard). */
  includeArchived?: boolean;
}

const unitInclude = (today: IsoDate) =>
  ({
    building: { select: { id: true, name: true, code: true } },
    unitType: { select: { id: true, name: true, reminderConfig: true } },
    leases: {
      // Leases that are current or still to come.
      where: { archivedAt: null, endDate: { gte: new Date(today) } },
      orderBy: { startDate: "asc" },
      include: { tenant: { select: { displayName: true } }, ...leaseStatusInclude },
    },
  }) satisfies Prisma.UnitInclude;

type UnitRow = Prisma.UnitGetPayload<{ include: ReturnType<typeof unitInclude> }>;

function toSummary(
  u: UnitRow,
  actor: AuditActor,
  system: ReminderConfig,
  today: IsoDate,
): UnitSummary {
  const staff = can(actor.role, "lease.view");
  const leases = u.leases.map((l) => ({ row: l, dates: leaseDatesOf(l) }));
  const info = (l: (typeof leases)[number]): UnitLeaseInfo => ({
    tenantName: l.row.tenant.displayName,
    startDate: l.dates.startDate,
    endDate: l.dates.endDate,
    terminationDate: l.dates.terminationDate,
    ...(staff
      ? { lease: { id: l.row.id, refNo: l.row.refNo, status: statusOf(l.row, system, today) } }
      : {}),
  });
  const current = leases.find(
    (l) => l.dates.startDate <= today && today <= effectiveEndDate(l.dates),
  );
  const next = leases.find((l) => l.dates.startDate > today);
  return {
    id: u.id,
    unitNumber: u.unitNumber,
    building: u.building,
    unitType: { id: u.unitType.id, name: u.unitType.name },
    floor: u.floor,
    floorArea: u.floorArea?.toFixed(2) ?? null,
    isStandalone: u.isStandalone,
    statusOverride: u.statusOverride,
    occupancy: unitOccupancy(
      u.statusOverride,
      leases.map((l) => l.dates),
      today,
    ),
    archived: u.archivedAt !== null,
    reminderConfig: unitReminderConfig(system, u).config,
    notes: staff ? u.notes : null,
    currentLease: current ? info(current) : null,
    nextLease: next ? info(next) : null,
  };
}

export async function listUnits(
  actor: AuditActor,
  filters: UnitFilters = {},
  now = new Date(),
): Promise<UnitSummary[]> {
  assertCan(actor, "occupancy.view");
  const today = manilaToday(now);
  const tokens = searchTokens(filters.q ?? "");
  const where: Prisma.UnitWhereInput = {
    ...(filters.includeArchived ? {} : { archivedAt: null, building: { archivedAt: null } }),
    ...(filters.buildingId && isUuid(filters.buildingId) ? { buildingId: filters.buildingId } : {}),
    ...(filters.unitTypeId && isUuid(filters.unitTypeId) ? { unitTypeId: filters.unitTypeId } : {}),
    ...(tokens.length
      ? {
          AND: tokens.map((t) => ({
            OR: [
              { unitNumber: { contains: t, mode: "insensitive" as const } },
              { building: { name: { contains: t, mode: "insensitive" as const } } },
              { building: { code: { contains: t, mode: "insensitive" as const } } },
              { unitType: { name: { contains: t, mode: "insensitive" as const } } },
              {
                leases: {
                  some: {
                    archivedAt: null,
                    endDate: { gte: new Date(today) },
                    tenant: { searchText: { contains: t } },
                  },
                },
              },
            ],
          })),
        }
      : {}),
  };
  const [rows, settings] = await Promise.all([
    db.unit.findMany({
      where,
      include: unitInclude(today),
      orderBy: [{ building: { name: "asc" } }, { unitNumber: "asc" }],
    }),
    getSettings(),
  ]);
  const units = rows
    .map((u) => toSummary(u, actor, settings.reminderDefaults, today))
    .sort(
      (a, b) =>
        a.building.name.localeCompare(b.building.name) ||
        a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }),
    );
  return filters.occupancy ? units.filter((u) => u.occupancy === filters.occupancy) : units;
}

export interface UnitDetail extends UnitSummary {
  /** All leases, newest first. Viewers see names and dates only. */
  history: UnitLeaseInfo[];
  reminders: {
    effective: ReminderConfig;
    source: ReminderSource;
    unitOverride: ReminderConfig | null;
    unitTypeConfig: ReminderConfig | null;
    systemDefault: ReminderConfig;
  };
}

export async function getUnit(
  actor: AuditActor,
  id: string,
  now = new Date(),
): Promise<UnitDetail> {
  assertCan(actor, "occupancy.view");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that unit.");
  const today = manilaToday(now);
  const [u, settings] = await Promise.all([
    db.unit.findUnique({ where: { id }, include: unitInclude(today) }),
    getSettings(),
  ]);
  if (!u) throw new NotFoundError("We couldn't find that unit.");
  const staff = can(actor.role, "lease.view");
  const all = await db.lease.findMany({
    where: { unitId: id, archivedAt: null },
    orderBy: { startDate: "desc" },
    include: { tenant: { select: { displayName: true } }, ...leaseStatusInclude },
  });
  const system = settings.reminderDefaults;
  const { config, source } = unitReminderConfig(system, u);
  return {
    ...toSummary(u, actor, system, today),
    history: all.map((l) => {
      const d = leaseDatesOf(l);
      return {
        tenantName: l.tenant.displayName,
        startDate: d.startDate,
        endDate: d.endDate,
        terminationDate: d.terminationDate,
        ...(staff
          ? { lease: { id: l.id, refNo: l.refNo, status: statusOf(l, system, today) } }
          : {}),
      };
    }),
    reminders: {
      effective: config,
      source,
      unitOverride: parseStoredReminderConfig(u.reminderConfig),
      unitTypeConfig: parseStoredReminderConfig(u.unitType.reminderConfig),
      systemDefault: system,
    },
  };
}

const numberTaken = () =>
  new ValidationError("Please check the highlighted fields.", {
    unitNumber: "This building already has a unit with this number.",
  });

async function assertRefsUsable(buildingId: string, unitTypeId: string) {
  const [b, t] = await Promise.all([
    db.building.findUnique({ where: { id: buildingId }, select: { archivedAt: true } }),
    db.unitType.findUnique({ where: { id: unitTypeId }, select: { archivedAt: true } }),
  ]);
  const errors: Record<string, string> = {};
  if (!b || b.archivedAt) errors.buildingId = "Choose a building from the list.";
  if (!t || t.archivedAt) errors.unitTypeId = "Choose a unit type from the list.";
  if (Object.keys(errors).length)
    throw new ValidationError("Please check the highlighted fields.", errors);
}

export async function createUnit(actor: AuditActor, input: unknown, meta: RequestMeta) {
  assertCan(actor, "property.manage");
  const data = parseInput(unitSchema, input);
  await assertRefsUsable(data.buildingId, data.unitTypeId);
  try {
    return await db.$transaction(async (tx) => {
      const u = await tx.unit.create({
        data: { ...data, createdById: actor.id, updatedById: actor.id },
      });
      await writeAudit(
        { actor, action: "unit.create", entityType: "Unit", entityId: u.id, changes: data, meta },
        tx,
      );
      return u;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw numberTaken();
    throw err;
  }
}

export async function updateUnit(actor: AuditActor, id: string, input: unknown, meta: RequestMeta) {
  assertCan(actor, "property.manage");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that unit.");
  const data = parseInput(unitSchema, input);
  const before = await db.unit.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("We couldn't find that unit.");
  if (data.buildingId !== before.buildingId || data.unitTypeId !== before.unitTypeId) {
    await assertRefsUsable(data.buildingId, data.unitTypeId);
  }
  const changes = diffFields({ ...before, floorArea: before.floorArea?.toFixed(2) ?? null }, data, [
    "buildingId",
    "unitNumber",
    "unitTypeId",
    "floor",
    "floorArea",
    "isStandalone",
    "statusOverride",
    "notes",
  ]);
  if (Object.keys(changes).length === 0) return before;
  try {
    const result = await db.$transaction(async (tx) => {
      const u = await tx.unit.update({ where: { id }, data: { ...data, updatedById: actor.id } });
      await writeAudit(
        { actor, action: "unit.update", entityType: "Unit", entityId: id, changes, meta },
        tx,
      );
      return u;
    });
    if (data.unitTypeId !== before.unitTypeId) await syncReminders({ unitId: id });
    return result;
  } catch (err) {
    if (isUniqueViolation(err)) throw numberTaken();
    throw err;
  }
}

/** Set or clear (null) the unit's reminder override. */
export async function setUnitReminderOverride(
  actor: AuditActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
) {
  assertCan(actor, "property.manage");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that unit.");
  const { reminderConfig } = parseInput(unitReminderSchema, input);
  const before = await db.unit.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("We couldn't find that unit.");
  const result = await db.$transaction(async (tx) => {
    const u = await tx.unit.update({
      where: { id },
      data: { reminderConfig: reminderJson(reminderConfig), updatedById: actor.id },
    });
    await writeAudit(
      {
        actor,
        action: "unit.reminders_update",
        entityType: "Unit",
        entityId: id,
        changes: {
          reminderConfig: {
            before: parseStoredReminderConfig(before.reminderConfig),
            after: reminderConfig,
          },
        },
        meta,
      },
      tx,
    );
    return u;
  });
  // Future reminder dates of this unit's leases follow the new settings.
  await syncReminders({ unitId: id });
  return result;
}

/** Archive a unit. Blocked while it has a current or upcoming lease. */
export async function setUnitArchived(
  actor: AuditActor,
  id: string,
  archived: boolean,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "property.manage");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that unit.");
  const before = await db.unit.findUnique({
    where: { id },
    include: { building: { select: { archivedAt: true } } },
  });
  if (!before) throw new NotFoundError("We couldn't find that unit.");
  if ((before.archivedAt !== null) === archived) return before;
  const today = manilaToday(now);
  if (archived) {
    const live = await db.lease.findMany({
      where: { unitId: id, archivedAt: null, endDate: { gte: new Date(today) } },
      select: { startDate: true, endDate: true, terminationDate: true },
    });
    if (
      live.some(
        (l) =>
          effectiveEndDate({
            endDate: fromDbDate(l.endDate),
            terminationDate: l.terminationDate ? fromDbDate(l.terminationDate) : null,
          }) >= today,
      )
    ) {
      throw new ValidationError(
        "This unit has a current or upcoming lease. End or archive that lease first.",
      );
    }
  } else if (before.building.archivedAt) {
    throw new ValidationError("Restore the building first.");
  }
  try {
    return await db.$transaction(async (tx) => {
      const u = await tx.unit.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null, updatedById: actor.id },
      });
      await writeAudit(
        {
          actor,
          action: archived ? "unit.archive" : "unit.restore",
          entityType: "Unit",
          entityId: id,
          meta,
        },
        tx,
      );
      return u;
    });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new ValidationError(
        "Another unit in this building now uses the same number. Rename one of them first.",
      );
    throw err;
  }
}
