import { execSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

import { E2E_DATABASE_URL } from "../playwright.config";
import { TASK_TOUR_IDS } from "../src/domain/guide/content";
import { E2E_ACCOUNT_ID, OTHER_ACCOUNT_ID, PASSWORD, USERS } from "./fixtures";

export default async function globalSetup() {
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
  });

  const base = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  try {
    const db = base;
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await db.$transaction([
      db.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE TRIGGER USER`),
      db.$executeRawUnsafe(
        `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
      ),
      db.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER USER`),
    ]);
    await db.account.createMany({
      data: [
        { id: E2E_ACCOUNT_ID, name: "E2E Leasing Co." },
        { id: OTHER_ACCOUNT_ID, name: "Other Leasing Inc." },
      ],
    });
    const passwordHash = await hash(PASSWORD);
    const roles = {
      admin: ["OWNER", E2E_ACCOUNT_ID],
      staff: ["LEASING_STAFF", E2E_ACCOUNT_ID],
      viewer: ["VIEWER", E2E_ACCOUNT_ID],
      lockme: ["LEASING_STAFF", E2E_ACCOUNT_ID],
      other: ["OWNER", OTHER_ACCOUNT_ID],
    } as const;
    for (const [key, u] of Object.entries(USERS) as [
      keyof typeof USERS,
      (typeof USERS)[keyof typeof USERS],
    ][]) {
      const [role, accountId] = roles[key];
      const user = await db.user.create({
        data: {
          ...u,
          passwordHash,
          mustChangePassword: false,
          memberships: { create: { accountId, role } },
        },
      });
      // These test users have seen all tours (e2e/phase6.spec.ts and tours.spec.ts test them on purpose).
      await db.userPreference.create({
        data: {
          accountId,
          userId: user.id,
          key: "guide",
          value: { tourDone: true, on: false, toursDone: [...TASK_TOUR_IDS] },
        },
      });
    }

    // The other account has a little data of its own, so its screens aren't empty.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.account_id', ${OTHER_ACCOUNT_ID}, true)`;
      const type = await tx.unitType.create({ data: { name: "Office" } });
      const tower = await tx.building.create({
        data: { name: "Other Tower", code: "E2E", address: "2 Elsewhere St", type: "COMMERCIAL" },
      });
      await tx.unit.create({
        data: { buildingId: tower.id, unitNumber: "501", unitTypeId: type.id },
      });
      await tx.tenant.create({
        data: {
          type: "COMPANY",
          displayName: "Other Account Tenant",
          searchText: "other account tenant",
        },
      });
    });

    // Everything below belongs to the main e2e account (rows take the account from this setting).
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.account_id', ${E2E_ACCOUNT_ID}, true)`;
        await seedMainAccount(tx);
      },
      { timeout: 60_000 },
    );
  } finally {
    await base.$disconnect();
  }
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function seedMainAccount(db: Tx) {
  {
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
    // A document on the paying lease, for the separation checks (the file itself isn't needed).
    await db.document.create({
      data: {
        tenantId: payTenant.id,
        leaseId: payLease.id,
        category: "SIGNED_CONTRACT",
        fileName: "Overdue Trading contract.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        sha256: "0".repeat(64),
        storageKey: "e2e-separation-check",
      },
    });
  }
}
