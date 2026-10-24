import { execSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

import { E2E_DATABASE_URL } from "../playwright.config";
import { PASSWORD, USERS } from "./fixtures";

export default async function globalSetup() {
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
  });

  const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await db.$transaction([
      db.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE TRIGGER USER`),
      db.$executeRawUnsafe(
        `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
      ),
      db.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER USER`),
    ]);
    const passwordHash = await hash(PASSWORD);
    const roles = {
      admin: "ADMIN",
      staff: "LEASING_STAFF",
      viewer: "VIEWER",
      lockme: "LEASING_STAFF",
    } as const;
    for (const [key, u] of Object.entries(USERS) as [
      keyof typeof USERS,
      (typeof USERS)[keyof typeof USERS],
    ][]) {
      await db.user.create({
        data: { ...u, role: roles[key], passwordHash, mustChangePassword: false },
      });
    }

    // A small synthetic property for the lease flows.
    const office = await db.unitType.create({
      data: {
        name: "Office",
        reminderConfig: {
          leadDays: [90, 60, 30],
          repeat: "NONE",
          repeatWeekday: null,
          afterExpiryDays: 0,
        },
      },
    });
    const building = await db.building.create({
      data: {
        name: "E2E Tower",
        code: "E2E",
        address: "1 Test Street, Makati",
        type: "COMMERCIAL",
      },
    });
    for (const unitNumber of ["501", "502", "503"]) {
      await db.unit.create({
        data: { buildingId: building.id, unitNumber, unitTypeId: office.id },
      });
    }
    await db.tenant.create({
      data: {
        type: "COMPANY",
        displayName: "ABC Corporation",
        contactPerson: "Maria Santos",
        email: "maria@abc.example",
        searchText: "abc corporation maria santos maria@abc example",
        privacyAckDate: new Date("2026-01-01"),
        privacyAckMethod: "SIGNED_FORM",
      },
    });
  } finally {
    await db.$disconnect();
  }
}
