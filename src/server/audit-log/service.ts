import type { Prisma } from "@prisma/client";
import { z } from "zod";

import type { Role } from "@/domain/auth/roles";
import type { AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { parseInput } from "@/server/validation";

export const auditLogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(60).optional(),
  /** Manila calendar dates, inclusive. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type AuditLogQuery = z.input<typeof auditLogQuerySchema>;

export const AUDIT_PAGE_SIZE = 50;

export interface AuditLogRow {
  seq: string;
  at: Date;
  actorName: string | null;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string | null;
  changes: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  ipAddress: string | null;
}

/** Start of a Manila calendar day as an instant (Manila is UTC+8, no daylight saving). */
function manilaDayStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+08:00`);
}

export async function listAuditLog(actor: AuditActor, query: unknown) {
  assertCan(actor, "audit.view");
  const f = parseInput(auditLogQuerySchema, query);

  const where: Prisma.AuditLogWhereInput = {
    ...(f.action ? { action: f.action } : {}),
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.from || f.to
      ? {
          at: {
            ...(f.from ? { gte: manilaDayStart(f.from) } : {}),
            ...(f.to ? { lt: new Date(manilaDayStart(f.to).getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
    ...(f.q
      ? {
          OR: [
            { actorName: { contains: f.q, mode: "insensitive" } },
            { action: { contains: f.q, mode: "insensitive" } },
            { entityType: { contains: f.q, mode: "insensitive" } },
            { entityId: { contains: f.q, mode: "insensitive" } },
            { ipAddress: { contains: f.q } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { seq: "desc" },
      skip: (f.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
  ]);

  return {
    total,
    page: f.page,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    rows: rows.map((r): AuditLogRow => ({
      seq: r.seq.toString(),
      at: r.at,
      actorName: r.actorName,
      actorRole: r.actorRole,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      changes: r.changes,
      metadata: r.metadata,
      ipAddress: r.ipAddress,
    })),
  };
}

/** Distinct action names, for the filter dropdown. */
export async function listAuditActions(actor: AuditActor): Promise<string[]> {
  assertCan(actor, "audit.view");
  const rows = await db.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
}
