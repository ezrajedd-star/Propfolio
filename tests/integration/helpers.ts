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

import type { ReminderConfig } from "@/domain/reminders/config";
import { createBuilding } from "@/server/property/buildings";
import { createUnitType } from "@/server/property/unit-types";
import { createUnit } from "@/server/property/units";
import { createTenant } from "@/server/tenants/service";

/** A building with one unit type and the given unit numbers. */
export async function makeProperty(
  admin: Actor,
  opts: { units?: string[]; reminderConfig?: ReminderConfig | null; code?: string } = {},
) {
  const code = opts.code ?? `B${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const building = await createBuilding(
    admin,
    { name: `Building ${code}`, code, address: "1 Ayala Ave, Makati", type: "COMMERCIAL" },
    meta,
  );
  const unitType = await createUnitType(
    admin,
    {
      name: `Office ${code}`,
      reminderConfig:
        opts.reminderConfig === undefined
          ? { leadDays: [90, 60, 30], repeat: "NONE", repeatWeekday: null, afterExpiryDays: 0 }
          : opts.reminderConfig,
    },
    meta,
  );
  const units = [];
  for (const unitNumber of opts.units ?? ["101"]) {
    units.push(
      await createUnit(
        admin,
        { buildingId: building.id, unitNumber, unitTypeId: unitType.id },
        meta,
      ),
    );
  }
  return { building, unitType, units };
}

export async function makeTenant(actor: Actor, name = "ABC Corporation") {
  return createTenant(
    actor,
    {
      type: "COMPANY",
      displayName: name,
      contactPerson: "Maria Santos",
      email: "maria@abc.example",
      phone: "0917 123 4567",
      privacyAcknowledged: true,
      privacyAckMethod: "SIGNED_FORM",
    },
    meta,
  );
}

export const terms = (o: Record<string, unknown> = {}) => ({
  startDate: "2026-01-01",
  endDate: "2027-12-31",
  monthlyRent: "50,000.00",
  rentDueDay: 5,
  securityDeposit: "100000",
  advanceRentType: "MONTHS",
  advanceRentMonths: 2,
  escalationType: "PERCENT",
  escalationPercent: "5",
  escalationEveryMonths: 12,
  remarks: "",
  ...o,
});
