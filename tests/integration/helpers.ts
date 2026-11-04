import type { Role } from "@prisma/client";

import type { Actor } from "@/server/auth/authorize";
import { hashPassword } from "@/server/auth/password";
import { asSystem, db, setTestScope } from "@/server/db";
import { logOutbox } from "@/server/mail/transport";
import { loadPlanAccess } from "@/server/plans/access";
import type { RequestMeta } from "@/server/request-meta";

export const meta: RequestMeta = { ipAddress: "203.0.113.10", userAgent: "vitest" };

/** The account tests work in unless they say otherwise. */
export const TEST_ACCOUNT_ID = "00000000-0000-7000-8000-00000000aaaa";

/**
 * Wipe all data between tests and start with one empty account, which services called directly
 * by tests work in. The audit log's append-only triggers are paused for the wipe only.
 */
export async function resetDb() {
  setTestScope({ kind: "system" });
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$transaction([
    db.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE TRIGGER USER`),
    db.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
    ),
    db.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER USER`),
  ]);
  await db.account.create({ data: { id: TEST_ACCOUNT_ID, name: "Test Leasing Co." } });
  logOutbox.length = 0;
  setTestScope({ kind: "account", accountId: TEST_ACCOUNT_ID });
}

/** Another customer account, for checking that accounts can't reach each other. */
export async function makeAccount(name = "Other Leasing Inc."): Promise<string> {
  const account = await asSystem(() => db.account.create({ data: { name } }));
  return account.id;
}

export const DEFAULT_PASSWORD = "correct horse battery";

/** A person with a role in an account (by default the test account). */
export async function makeUser(
  role: Role,
  overrides: Partial<{
    name: string;
    email: string;
    password: string;
    mustChangePassword: boolean;
    isActive: boolean;
    accountId: string;
  }> = {},
): Promise<Actor> {
  const accountId = overrides.accountId ?? TEST_ACCOUNT_ID;
  const email =
    overrides.email ??
    `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const passwordHash = await hashPassword(overrides.password ?? DEFAULT_PASSWORD);
  const user = await asSystem(() =>
    db.user.create({
      data: {
        name: overrides.name ?? `Test ${role}`,
        email,
        passwordHash,
        mustChangePassword: overrides.mustChangePassword ?? false,
        memberships: {
          create: { accountId, role, isActive: overrides.isActive ?? true },
        },
      },
    }),
  );
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    accountId,
    access: await loadPlanAccess(accountId),
  };
}

/** The same person with their account's plan read again (after a test changes the plan or units). */
export async function refreshAccess(actor: Actor): Promise<Actor> {
  return { ...actor, access: await loadPlanAccess(actor.accountId) };
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
