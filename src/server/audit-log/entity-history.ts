import type { Prisma } from "@prisma/client";

import type { Permission } from "@/domain/auth/roles";
import type { AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUuid } from "@/server/db-errors";

const VIEW_PERMISSION: Record<string, Permission> = {
  Lease: "lease.view",
  Tenant: "tenant.view",
  Unit: "property.manage",
  Building: "property.manage",
};

export interface HistoryEntry {
  seq: string;
  at: Date;
  actorName: string | null;
  action: string;
  changes: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
}

/** The audit trail for one record, for its History tab. IP addresses are left out here. */
export async function getEntityHistory(
  actor: AuditActor,
  entityType: string,
  entityId: string,
): Promise<HistoryEntry[]> {
  const permission = VIEW_PERMISSION[entityType];
  if (!permission) return [];
  assertCan(actor, permission);
  if (!isUuid(entityId)) return [];
  const rows = await db.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { seq: "desc" },
    take: 200,
  });
  return rows.map((r) => ({
    seq: r.seq.toString(),
    at: r.at,
    actorName: r.actorName,
    action: r.action,
    changes: r.changes,
    metadata: r.metadata,
  }));
}
