import type { Role } from "@prisma/client";

import type { Actor } from "@/server/auth/authorize";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { logOutbox } from "@/server/mail/transport";
import type { RequestMeta } from "@/server/request-meta";

export const meta: RequestMeta = { ipAddress: "203.0.113.10", userAgent: "vitest" };

/** Wipe all data between tests. The audit log's append-only triggers are paused for this only. */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$transaction([
    db.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE TRIGGER USER`),
    db.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
    ),
    db.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER USER`),
  ]);
  logOutbox.length = 0;
}

export const DEFAULT_PASSWORD = "correct horse battery";

export async function makeUser(
  role: Role,
  overrides: Partial<{
    name: string;
    email: string;
    password: string;
    mustChangePassword: boolean;
    isActive: boolean;
  }> = {},
): Promise<Actor> {
  const email =
    overrides.email ??
    `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const user = await db.user.create({
    data: {
      name: overrides.name ?? `Test ${role}`,
      email,
      role,
      passwordHash: await hashPassword(overrides.password ?? DEFAULT_PASSWORD),
      mustChangePassword: overrides.mustChangePassword ?? false,
      isActive: overrides.isActive ?? true,
    },
  });
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function auditActions(entityId?: string): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    where: entityId ? { entityId } : {},
    orderBy: { seq: "asc" },
  });
  return rows.map((r) => r.action);
}
