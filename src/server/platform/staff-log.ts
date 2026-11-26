import { Prisma, type StaffLogKind } from "@prisma/client";

import {
  PLATFORM_ROLE_LABELS,
  platformCan,
  type PlatformPermission,
  type PlatformRole,
} from "@/domain/platform/roles";
import { asSystem, db, type DbClient } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";

/**
 * The staff log: everything Propfolio staff see and do in the console, separate from customers'
 * audit logs. Append-only in the database. Never passwords, tokens, hashes or tenant records.
 */

export interface StaffActor {
  id: string;
  name: string;
  role: PlatformRole;
}

export interface StaffLogEntry {
  actor: StaffActor | null;
  kind: StaffLogKind;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  accountId?: string | null;
  metadata?: Record<string, unknown> | null;
  meta?: RequestMeta | null;
}

const REDACTED = new Set(["password", "passwordHash", "token", "tokenHash", "secret", "code"]);

function toJson(value: Record<string, unknown> | null | undefined) {
  if (value == null) return Prisma.JsonNull;
  return JSON.parse(
    JSON.stringify(value, (k, v: unknown) => (REDACTED.has(k) ? "[redacted]" : v)),
  ) as Prisma.InputJsonValue;
}

/** Append to the staff log. Pass the transaction client so it commits with the change. */
export async function writeStaffLog(entry: StaffLogEntry, client: DbClient = db): Promise<void> {
  await client.staffLog.create({
    data: {
      adminId: entry.actor?.id ?? null,
      adminName: entry.actor?.name ?? null,
      adminRole: entry.actor?.role ?? null,
      kind: entry.kind,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      accountId: entry.accountId ?? null,
      metadata: toJson(entry.metadata),
      ipAddress: entry.meta?.ipAddress ?? null,
      userAgent: entry.meta?.userAgent ?? null,
    },
  });
}

/** Record that a staff member looked at something (a console page, an account, a ticket). */
export function logStaffView(
  actor: StaffActor,
  action: string,
  target: { entityType?: string; entityId?: string; accountId?: string | null } = {},
  meta: RequestMeta | null = null,
  metadata?: Record<string, unknown>,
) {
  return asSystem(() => writeStaffLog({ actor, kind: "VIEW", action, ...target, metadata, meta }));
}

/** Every console service starts with this: the staff member's role must allow it. */
export function assertPlatformCan(actor: StaffActor, permission: PlatformPermission): void {
  if (!platformCan(actor.role, permission)) {
    throw new ForbiddenError(
      `Your console role (${PLATFORM_ROLE_LABELS[actor.role]}) can't do this. Ask a Platform Owner.`,
    );
  }
}

export interface StaffLogFilters {
  adminId?: string;
  kind?: StaffLogKind;
  accountId?: string;
  before?: bigint;
}

export const STAFF_LOG_PAGE = 100;

/** The staff log, newest first (Platform Owner only). */
export async function listStaffLog(actor: StaffActor, filters: StaffLogFilters = {}) {
  assertPlatformCan(actor, "stafflog.view");
  return asSystem(async () => {
    const rows = await db.staffLog.findMany({
      where: {
        ...(filters.adminId ? { adminId: filters.adminId } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.accountId ? { accountId: filters.accountId } : {}),
        ...(filters.before ? { seq: { lt: filters.before } } : {}),
      },
      orderBy: { seq: "desc" },
      take: STAFF_LOG_PAGE + 1,
    });
    return {
      rows: rows.slice(0, STAFF_LOG_PAGE).map((r) => ({ ...r, seq: r.seq.toString() })),
      more: rows.length > STAFF_LOG_PAGE,
    };
  });
}
