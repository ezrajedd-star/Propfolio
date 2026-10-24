import { Prisma } from "@prisma/client";

import type { Role } from "@/domain/auth/roles";
import { db, type DbClient } from "@/server/db";
import type { RequestMeta } from "@/server/request-meta";

/** Who did something. `null` actor means the system (worker jobs). */
export interface AuditActor {
  id: string;
  name: string;
  role: Role;
}

export type FieldChanges = Record<string, { before: unknown; after: unknown }>;

export interface AuditEntry {
  actor: AuditActor | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  changes?: FieldChanges | Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  meta?: RequestMeta | null;
}

/** Fields that must never be written to the audit log, even as before/after values. */
const REDACTED_FIELDS = new Set(["passwordHash", "password", "tokenHash", "token"]);

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value == null) return Prisma.JsonNull;
  return JSON.parse(
    JSON.stringify(value, (key, v: unknown) => (REDACTED_FIELDS.has(key) ? "[redacted]" : v)),
  ) as Prisma.InputJsonValue;
}

/** Append an entry to the audit log. Pass the transaction client so it commits atomically. */
export async function writeAudit(entry: AuditEntry, client: DbClient = db): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: entry.actor?.id ?? null,
      actorName: entry.actor?.name ?? null,
      actorRole: entry.actor?.role ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      changes: toJson(entry.changes),
      metadata: toJson(entry.metadata),
      ipAddress: entry.meta?.ipAddress ?? null,
      userAgent: entry.meta?.userAgent ?? null,
    },
  });
}

function normalise(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Prisma.Decimal) return v.toString();
  return v;
}

/** Before/after values for the fields that actually changed. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: readonly (keyof T & string)[],
): FieldChanges {
  const changes: FieldChanges = {};
  for (const f of fields) {
    if (!(f in after)) continue;
    const b = normalise(before[f]);
    const a = normalise(after[f]);
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[f] = REDACTED_FIELDS.has(f)
        ? { before: "[redacted]", after: "[redacted]" }
        : { before: b ?? null, after: a ?? null };
    }
  }
  return changes;
}

/**
 * Replace personal values with a marker. The audit log is append-only and can't be anonymised
 * later, so for personal data it records *that* a field changed, not what it said.
 */
export function maskPersonal(
  changes: FieldChanges,
  personalFields: readonly string[],
): FieldChanges {
  const out: FieldChanges = {};
  for (const [k, v] of Object.entries(changes)) {
    out[k] = personalFields.includes(k)
      ? { before: "[personal data]", after: "[personal data]" }
      : v;
  }
  return out;
}
