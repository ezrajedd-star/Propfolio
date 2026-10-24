import { Prisma } from "@prisma/client";

import { parseStoredReminderConfig, type ReminderConfig } from "@/domain/reminders/config";
import { unitTypeSchema } from "@/schemas/property";
import { writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUniqueViolation, isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";

export interface UnitTypeView {
  id: string;
  name: string;
  /** Null = uses the system default. */
  reminderConfig: ReminderConfig | null;
  unitCount: number;
  archived: boolean;
}

export async function listUnitTypes(
  actor: AuditActor,
  opts: { includeArchived?: boolean } = {},
): Promise<UnitTypeView[]> {
  assertCan(actor, "occupancy.view");
  const rows = await db.unitType.findMany({
    where: opts.includeArchived ? {} : { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { units: { where: { archivedAt: null } } } } },
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    reminderConfig: parseStoredReminderConfig(t.reminderConfig),
    unitCount: t._count.units,
    archived: t.archivedAt !== null,
  }));
}

const nameTaken = () =>
  new ValidationError("Please check the highlighted fields.", {
    name: "Another unit type already has this name.",
  });

/** Null in a JSON column means "inherit"; store it as SQL NULL. */
export function reminderJson(
  c: ReminderConfig | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return c === null ? Prisma.DbNull : (c as unknown as Prisma.InputJsonValue);
}

export async function createUnitType(actor: AuditActor, input: unknown, meta: RequestMeta) {
  assertCan(actor, "property.manage");
  const data = parseInput(unitTypeSchema, input);
  try {
    return await db.$transaction(async (tx) => {
      const max = await tx.unitType.aggregate({ _max: { sortOrder: true } });
      const t = await tx.unitType.create({
        data: {
          name: data.name,
          reminderConfig: reminderJson(data.reminderConfig),
          sortOrder: (max._max.sortOrder ?? 0) + 1,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(
        {
          actor,
          action: "unitType.create",
          entityType: "UnitType",
          entityId: t.id,
          changes: data,
          meta,
        },
        tx,
      );
      return t;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }
}

export async function updateUnitType(
  actor: AuditActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
) {
  assertCan(actor, "property.manage");
  const data = parseInput(unitTypeSchema, input);
  if (!isUuid(id)) throw new NotFoundError();
  const before = await db.unitType.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("We couldn't find that unit type.");
  const beforeConfig = parseStoredReminderConfig(before.reminderConfig);
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  if (before.name !== data.name) changes.name = { before: before.name, after: data.name };
  if (JSON.stringify(beforeConfig) !== JSON.stringify(data.reminderConfig)) {
    changes.reminderConfig = { before: beforeConfig, after: data.reminderConfig };
  }
  if (Object.keys(changes).length === 0) return before;
  try {
    return await db.$transaction(async (tx) => {
      const t = await tx.unitType.update({
        where: { id },
        data: {
          name: data.name,
          reminderConfig: reminderJson(data.reminderConfig),
          updatedById: actor.id,
        },
      });
      await writeAudit(
        { actor, action: "unitType.update", entityType: "UnitType", entityId: id, changes, meta },
        tx,
      );
      return t;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }
}

export async function setUnitTypeArchived(
  actor: AuditActor,
  id: string,
  archived: boolean,
  meta: RequestMeta,
) {
  assertCan(actor, "property.manage");
  if (!isUuid(id)) throw new NotFoundError();
  const before = await db.unitType.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("We couldn't find that unit type.");
  if (archived) {
    const inUse = await db.unit.count({ where: { unitTypeId: id, archivedAt: null } });
    if (inUse > 0) {
      throw new ValidationError(
        `${inUse} unit${inUse === 1 ? " uses" : "s use"} this type. Change their type first.`,
      );
    }
  }
  return db.$transaction(async (tx) => {
    const t = await tx.unitType.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null, updatedById: actor.id },
    });
    await writeAudit(
      {
        actor,
        action: archived ? "unitType.archive" : "unitType.restore",
        entityType: "UnitType",
        entityId: id,
        meta,
      },
      tx,
    );
    return t;
  });
}
