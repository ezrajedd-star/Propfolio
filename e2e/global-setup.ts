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
      const user = await db.user.create({
        data: { ...u, role: roles[key], passwordHash, mustChangePassword: false },
      });
      // These test users have seen the welcome tour (e2e/phase6.spec.ts tests it on purpose).
      await db.userPreference.create({
        data: { userId: user.id, key: "guide", value: { tourDone: true, on: false } },
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

    // A lease covering today, for the calendar/grid flows (dates relative to today).
    const iso = (days: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + days);
      return new Date(d.toISOString().slice(0, 10));
    };
    const unit601 = await db.unit.create({
      data: { buildingId: building.id, unitNumber: "601", unitTypeId: office.id },
    });
    const calTenant = await db.tenant.create({
      data: {
        type: "COMPANY",
        displayName: "Calendar Test Co",
        contactPerson: "Celia Reyes",
        searchText: "calendar test co celia reyes",
        privacyAckDate: new Date("2026-01-01"),
        privacyAckMethod: "EMAIL",
      },
    });
    await db.lease.create({
      data: {
        refNo: "LSE-E2E-0001",
        unitId: unit601.id,
        tenantId: calTenant.id,
        startDate: iso(-60),
        endDate: iso(400),
        status: "ACTIVE",
        monthlyRent: "65000",
        rentDueDay: 5,
        securityDeposit: "130000",
      },
    });

    // A lease behind on rent, for the payment flows: two unpaid months, one upcoming.
    const unit701 = await db.unit.create({
      data: { buildingId: building.id, unitNumber: "701", unitTypeId: office.id },
    });
    const payTenant = await db.tenant.create({
      data: {
        type: "COMPANY",
        displayName: "Overdue Trading Inc.",
        contactPerson: "Paolo Cruz",
        searchText: "overdue trading inc paolo cruz",
        privacyAckDate: new Date("2026-01-01"),
        privacyAckMethod: "EMAIL",
      },
    });
    const payLease = await db.lease.create({
      data: {
        refNo: "LSE-E2E-0002",
        unitId: unit701.id,
        tenantId: payTenant.id,
        startDate: iso(-70),
        endDate: iso(300),
        status: "ACTIVE",
        monthlyRent: "40000",
        rentDueDay: 1,
        securityDeposit: "0",
        advanceRentType: "NONE",
        escalationType: "NONE",
      },
    });
    for (const [n, days] of [
      [1, -45],
      [2, -15],
      [3, 15],
    ] as const) {
      await db.charge.create({
        data: {
          leaseId: payLease.id,
          type: "RENT",
          key: iso(days).toISOString().slice(0, 10),
          dueDate: iso(days),
          amount: "40000",
          description: `Rent, month ${n}`,
        },
      });
    }
  } finally {
    await db.$disconnect();
  }
}
