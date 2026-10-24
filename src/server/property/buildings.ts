import type { Building } from "@prisma/client";

import { countOccupancy, unitOccupancy, type OccupancyCounts } from "@/domain/leases/occupancy";
import { fromDbDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { buildingSchema } from "@/schemas/property";
import { diffFields, writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUniqueViolation, isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";

export interface BuildingSummary {
  id: string;
  name: string;
  code: string;
  address: string;
  type: Building["type"];
  notes: string | null;
  archived: boolean;
  occupancy: OccupancyCounts;
}

const codeTaken = () =>
  new ValidationError("Please check the highlighted fields.", {
    code: "Another building already uses this code.",
  });

/** Buildings with occupancy counts. Everyone (including Viewers) can see these. */
export async function listBuildings(
  actor: AuditActor,
  opts: { includeArchived?: boolean } = {},
  now = new Date(),
): Promise<BuildingSummary[]> {
  assertCan(actor, "occupancy.view");
  const today = manilaToday(now);
  const buildings = await db.building.findMany({
    where: opts.includeArchived ? {} : { archivedAt: null },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    include: {
      units: {
        where: { archivedAt: null },
        select: {
          statusOverride: true,
          leases: {
            where: {
              archivedAt: null,
              startDate: { lte: new Date(today) },
              endDate: { gte: new Date(today) },
            },
            select: { startDate: true, endDate: true, terminationDate: true },
          },
        },
      },
    },
  });
  return buildings.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    address: b.address,
    type: b.type,
    notes: b.notes,
    archived: b.archivedAt !== null,
    occupancy: countOccupancy(
      b.units.map((u) =>
        unitOccupancy(
          u.statusOverride,
          u.leases.map((l) => ({
            startDate: fromDbDate(l.startDate),
            endDate: fromDbDate(l.endDate),
            terminationDate: l.terminationDate ? fromDbDate(l.terminationDate) : null,
          })),
          today,
        ),
      ),
    ),
  }));
}

async function findBuilding(id: string) {
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that building.");
  const b = await db.building.findUnique({ where: { id } });
  if (!b) throw new NotFoundError("We couldn't find that building.");
  return b;
}

export async function createBuilding(actor: AuditActor, input: unknown, meta: RequestMeta) {
  assertCan(actor, "property.manage");
  const data = parseInput(buildingSchema, input);
  try {
    return await db.$transaction(async (tx) => {
      const b = await tx.building.create({
        data: { ...data, createdById: actor.id, updatedById: actor.id },
      });
      await writeAudit(
        {
          actor,
          action: "building.create",
          entityType: "Building",
          entityId: b.id,
          changes: data,
          meta,
        },
        tx,
      );
      return b;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw codeTaken();
    throw err;
  }
}

export async function updateBuilding(
  actor: AuditActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
) {
  assertCan(actor, "property.manage");
  const data = parseInput(buildingSchema, input);
  const before = await findBuilding(id);
  const changes = diffFields(before, data, ["name", "code", "address", "type", "notes"]);
  if (Object.keys(changes).length === 0) return before;
  try {
    return await db.$transaction(async (tx) => {
      const b = await tx.building.update({
        where: { id },
        data: { ...data, updatedById: actor.id },
      });
      await writeAudit(
        { actor, action: "building.update", entityType: "Building", entityId: id, changes, meta },
        tx,
      );
      return b;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw codeTaken();
    throw err;
  }
}

/** Archive (never delete). Only possible once all its units are archived. */
export async function setBuildingArchived(
  actor: AuditActor,
  id: string,
  archived: boolean,
  meta: RequestMeta,
) {
  assertCan(actor, "property.manage");
  const before = await findBuilding(id);
  if ((before.archivedAt !== null) === archived) return before;
  if (archived) {
    const activeUnits = await db.unit.count({ where: { buildingId: id, archivedAt: null } });
    if (activeUnits > 0) {
      throw new ValidationError(
        `This building still has ${activeUnits} unit${activeUnits === 1 ? "" : "s"}. Archive the units first.`,
      );
    }
  }
  return db.$transaction(async (tx) => {
    const b = await tx.building.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null, updatedById: actor.id },
    });
    await writeAudit(
      {
        actor,
        action: archived ? "building.archive" : "building.restore",
        entityType: "Building",
        entityId: id,
        meta,
      },
      tx,
    );
    return b;
  });
}
