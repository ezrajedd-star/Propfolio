/**
 * Synthetic seed data for development and demos. NEVER run against production.
 *
 * - One user per role. Passwords are freshly generated on every run (printed below) unless
 *   SEED_PASSWORD is set. Emails use the reserved `.test` domain.
 * - 3 buildings (one industrial complex with standalone warehouses), 30 units, 20 tenants and
 *   about 25 leases in mixed states. Lease dates are relative to today, so the statuses stay
 *   realistic whenever you seed.
 * - Payments for most past charges. A few leases are left behind on rent (one in each overdue
 *   age group) and one has paid part of a month, so the overdue list has something to show.
 * - Everything goes through the real services, so it obeys the same rules as the app.
 * - All names, companies and contact details are fictional.
 */
import { randomBytes } from "node:crypto";

import { PrismaClient, type Role } from "@prisma/client";

import { UNIT_TYPE_REMINDER_DEFAULTS } from "../src/domain/reminders/config";
import { addDays, addMonths } from "../src/domain/time/calendar-date";
import { manilaToday } from "../src/domain/time/manila";
import type { Actor } from "../src/server/auth/authorize";
import { hashPassword } from "../src/server/auth/password";
import { recordPayment } from "../src/server/billing/payments";
import { createLease, renewLease, terminateLease } from "../src/server/leases/service";
import { createBuilding } from "../src/server/property/buildings";
import { createUnitType } from "../src/server/property/unit-types";
import { createUnit, setUnitReminderOverride } from "../src/server/property/units";
import { updateSettings } from "../src/server/settings/service";
import { createTenant } from "../src/server/tenants/service";

const db = new PrismaClient();
const meta = { ipAddress: null, userAgent: "seed" };

const SEED_USERS: { name: string; email: string; role: Role }[] = [
  { name: "Andrea Admin", email: "admin@propfolio.test", role: "ADMIN" },
  { name: "Lea Leasing", email: "leasing@propfolio.test", role: "LEASING_STAFF" },
  { name: "Victor Viewer", email: "viewer@propfolio.test", role: "VIEWER" },
];

async function seedUsers() {
  const credentials: { email: string; role: Role; password: string }[] = [];
  let admin: Actor | null = null;
  for (const u of SEED_USERS) {
    const password = process.env.SEED_PASSWORD || randomBytes(12).toString("base64url");
    const passwordHash = await hashPassword(password);
    const row = await db.user.upsert({
      where: { email: u.email },
      create: { ...u, passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
      update: { passwordHash, isActive: true, failedLoginCount: 0, lockedUntil: null },
    });
    if (u.role === "ADMIN")
      admin = { id: row.id, name: row.name, email: row.email, role: row.role };
    credentials.push({ email: u.email, role: u.role, password });
  }
  return { admin: admin!, credentials };
}

const TENANTS = [
  ["COMPANY", "Bayanihan Logistics Inc.", "Rosa Mendoza"],
  ["COMPANY", "Kalayaan Foods Corp.", "Jose Ramos"],
  ["COMPANY", "ABC Corporation", "Maria Santos"],
  ["COMPANY", "Mabuhay Tech Solutions", "Paolo Reyes"],
  ["COMPANY", "Pacific Lumber Trading", "Ana Villanueva"],
  ["COMPANY", "Santo Niño Trading", "Carlo Bautista"],
  ["COMPANY", "Luzon Pharma Distributors", "Grace Tan"],
  ["COMPANY", "Island Coffee Roasters", "Miguel Cruz"],
  ["COMPANY", "Northstar Cold Storage", "Liza Garcia"],
  ["COMPANY", "Bluewave Consulting", "Ramon Aquino"],
  ["COMPANY", "Sampaguita Bakeshop", "Teresa Flores"],
  ["COMPANY", "Mindoro Auto Parts", "Edgar Lim"],
  ["INDIVIDUAL", "Juan dela Cruz", null],
  ["INDIVIDUAL", "Maricel Navarro", null],
  ["INDIVIDUAL", "Antonio Lopez", null],
  ["INDIVIDUAL", "Bea Castillo", null],
  ["INDIVIDUAL", "Ramon Dizon", null],
  ["INDIVIDUAL", "Kristine Yap", null],
  ["COMPANY", "Golden Harvest Grains", "Ernesto Pascual"],
  ["COMPANY", "Visayas Print Shop", "Joy Manalo"],
] as const;

async function seedProperty(admin: Actor) {
  if ((await db.building.count()) > 0) {
    console.log("Buildings already exist — skipping property and lease seed data.");
    return;
  }
  await updateSettings(
    admin,
    {
      companyName: "Sample Realty Corp.",
      dpoName: "Data Protection Officer",
      dpoEmail: "privacy@samplerealty.test",
    },
    meta,
  );

  const types: Record<string, string> = {};
  for (const name of ["Office", "Retail", "Residential", "Warehouse", "Lot"]) {
    const t = await createUnitType(
      admin,
      { name, reminderConfig: UNIT_TYPE_REMINDER_DEFAULTS[name] ?? null },
      meta,
    );
    types[name] = t.id;
  }

  const tower = await createBuilding(
    admin,
    {
      name: "Tower One",
      code: "TWR1",
      address: "6789 Ayala Avenue, Makati City",
      type: "COMMERCIAL",
    },
    meta,
  );
  const garden = await createBuilding(
    admin,
    {
      name: "Garden Residences",
      code: "GRD",
      address: "21 Kalayaan Street, Quezon City",
      type: "RESIDENTIAL",
    },
    meta,
  );
  const park = await createBuilding(
    admin,
    {
      name: "North Industrial Park",
      code: "NIP",
      address: "Km 32 MacArthur Highway, Marilao, Bulacan",
      type: "INDUSTRIAL_COMPLEX",
    },
    meta,
  );

  const units: Record<string, string> = {};
  const add = async (
    buildingId: string,
    unitNumber: string,
    type: string,
    extra: Record<string, unknown> = {},
  ) => {
    const u = await createUnit(
      admin,
      { buildingId, unitNumber, unitTypeId: types[type], ...extra },
      meta,
    );
    units[unitNumber] = u.id;
  };
  for (const n of ["1001", "1002", "1003", "1004", "1005", "1006"])
    await add(tower.id, n, "Office", { floor: "10", floorArea: "120" });
  for (const n of ["G01", "G02", "G03"])
    await add(tower.id, n, "Retail", { floor: "G", floorArea: "85.5" });
  await add(tower.id, "G04", "Retail", {
    floor: "G",
    floorArea: "60",
    statusOverride: "UNDER_RENOVATION",
  });
  for (const n of ["2A", "2B", "2C", "2D", "2E", "2F", "3A", "3B", "3C", "3D"]) {
    await add(garden.id, n, "Residential", { floor: n.slice(0, 1), floorArea: "48" });
  }
  for (const n of ["WH-1", "WH-2", "WH-3", "WH-4", "WH-5", "WH-6"]) {
    await add(park.id, n, "Warehouse", { isStandalone: true, floorArea: "1500" });
  }
  for (const n of ["L-1", "L-2", "L-3"]) await add(park.id, n, "Lot", { floorArea: "2500" });
  await add(park.id, "L-4", "Lot", { floorArea: "2500", statusOverride: "UNAVAILABLE" });

  // A cold-storage warehouse that needs a longer warning, with daily repeats.
  await setUnitReminderOverride(
    admin,
    units["WH-1"]!,
    {
      reminderConfig: {
        leadDays: [240, 180, 120, 90, 60, 30],
        repeat: "DAILY",
        repeatWeekday: null,
        afterExpiryDays: 30,
      },
    },
    meta,
  );

  const tenantIds: string[] = [];
  for (const [i, [type, name, contact]] of TENANTS.entries()) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z]+/g, ".")
      .replace(/^\.|\.$/g, "");
    const t = await createTenant(
      admin,
      {
        type,
        displayName: name,
        registeredName: type === "COMPANY" ? name.replace(/\.$/, "").toUpperCase() : null,
        contactPerson: contact,
        phone: `0917 555 ${String(1000 + i).padStart(4, "0")}`,
        email: `${slug}@example.test`,
        billingAddress: `${100 + i} Sample Street, Metro Manila`,
        privacyAcknowledged: true,
        privacyAckMethod: i % 3 === 0 ? "EMAIL" : "SIGNED_FORM",
      },
      meta,
    );
    tenantIds.push(t.id);
  }

  const today = manilaToday();
  const m = (months: number) => addMonths(today, months);
  const d = (days: number) => addDays(today, days);
  const terms = (
    startDate: string,
    endDate: string,
    rent: string,
    o: Record<string, unknown> = {},
  ) => ({
    startDate,
    endDate,
    monthlyRent: rent,
    rentDueDay: 5,
    securityDeposit: String(Number(rent) * 2),
    advanceRentType: "MONTHS",
    advanceRentMonths: 1,
    escalationType: "PERCENT",
    escalationPercent: "5",
    escalationEveryMonths: 12,
    remarks: "",
    ...o,
  });
  const lease = (unit: string, tenant: number, t: ReturnType<typeof terms>) =>
    createLease(admin, { unitId: units[unit], tenantId: tenantIds[tenant], ...t }, meta);

  // Tower One — offices and retail
  await lease("1001", 2, terms(m(-18), addDays(m(30), -1), "85000")); // ABC Corporation, active
  await lease("1002", 3, terms(m(-23), d(20), "90000")); // expiring in 20 days
  await lease("1003", 9, terms(m(-11), d(45), "82000")); // expiring in 45 days
  await lease("1004", 1, terms(m(-35), d(-10), "88000")); // expired 10 days ago, not renewed
  const old1005 = await lease("1005", 6, terms(m(-48), addDays(m(-24), -1), "70000"));
  const mid1005 = await renewLease(
    admin,
    old1005.id,
    terms(m(-24), addDays(m(-12), -1), "75000"),
    meta,
  );
  await renewLease(
    admin,
    mid1005.id,
    terms(m(-12), addDays(m(24), -1), "80000", { escalationType: "NONE" }),
    meta,
  ); // 3-lease chain
  await lease("G01", 7, terms(m(-6), addDays(m(30), -1), "120000", { rentDueDay: 1 }));
  await lease("G02", 10, terms(m(-20), d(75), "95000")); // expiring in 75 days
  const g03 = await lease("G03", 19, terms(m(-14), addDays(m(10), -1), "110000"));
  await terminateLease(
    admin,
    g03.id,
    { terminationDate: d(-20), reason: "Tenant closed the branch; ended by mutual agreement." },
    meta,
  );

  // Garden Residences — residential
  await lease(
    "2A",
    12,
    terms(m(-6), addDays(m(6), -1), "25000", {
      advanceRentType: "NONE",
      escalationType: "NONE",
      rentDueDay: 15,
    }),
  );
  await lease("2B", 13, terms(m(-11), d(40), "28000", { escalationType: "NONE" })); // expiring (60-day window)
  await lease("2C", 14, terms(m(-12), d(-40), "26000", { escalationType: "NONE" })); // expired
  const old2D = await lease("2D", 15, terms(m(-12), d(5), "27000", { escalationType: "NONE" }));
  await renewLease(
    admin,
    old2D.id,
    terms(d(6), addDays(addMonths(d(6), 12), -1), "28500", { escalationType: "NONE" }),
    meta,
  ); // renewed, upcoming
  await lease(
    "2E",
    16,
    terms(d(15), addDays(addMonths(d(15), 12), -1), "30000", { escalationType: "NONE" }),
  ); // upcoming
  await lease("3A", 17, terms(m(-3), addDays(m(9), -1), "45000", { escalationType: "NONE" }));
  await lease(
    "3B",
    0,
    terms(m(-8), addDays(m(16), -1), "42000", {
      escalationType: "SCHEDULE",
      escalationSteps: [{ date: m(4), monthlyRent: "44000" }],
    }),
  );

  // North Industrial Park — warehouses and lots
  await lease("WH-1", 8, terms(m(-30), d(150), "350000", { advanceRentMonths: 3 })); // cold storage, 240-day window → expiring
  await lease("WH-2", 0, terms(m(-10), addDays(m(26), -1), "220000", { advanceRentMonths: 2 }));
  await lease("WH-3", 4, terms(m(-34), d(150), "180000")); // 180-day window → expiring
  await lease(
    "WH-4",
    11,
    terms(m(-5), addDays(m(31), -1), "195000", {
      escalationPercent: "7.5",
      escalationEveryMonths: 24,
    }),
  );
  await lease("WH-5", 18, terms(m(-24), d(-5), "240000")); // just expired
  await lease(
    "L-1",
    5,
    terms(m(-15), addDays(m(21), -1), "60000", {
      advanceRentType: "AMOUNT",
      advanceRentAmount: "120000",
    }),
  );
  await lease("L-2", 11, terms(m(-2), addDays(m(10), -1), "55000"));
}

/** Unpaid months to leave per unit (most recent first); everything else past due is paid. */
const LEAVE_UNPAID: Record<string, number> = { "1002": 1, "WH-3": 2, "2C": 3, "1004": 5 };
const PART_PAID = "G02";

async function seedPayments(admin: Actor) {
  if ((await db.payment.count()) > 0) return;
  const today = manilaToday();
  const leases = await db.lease.findMany({
    where: { archivedAt: null },
    select: { id: true, unit: { select: { unitNumber: true } } },
  });
  let count = 0;
  const pay = async (leaseId: string, receivedDate: string, amount: string, reference: string) => {
    await recordPayment(
      admin,
      {
        leaseId,
        receivedDate: receivedDate > today ? today : receivedDate,
        amount,
        method: "BANK_TRANSFER",
        reference,
      },
      meta,
    );
    count++;
  };
  for (const l of leases) {
    const due = await db.charge.findMany({
      where: { leaseId: l.id, status: "ACTIVE", dueDate: { lte: new Date(`${today}T00:00:00Z`) } },
      orderBy: { dueDate: "asc" },
    });
    const leave = LEAVE_UNPAID[l.unit.unitNumber] ?? 0;
    const toPay = due.slice(0, Math.max(0, due.length - leave));
    if (!toPay.length) continue;
    const iso = (c: (typeof toPay)[number]) => c.dueDate.toISOString().slice(0, 10);
    // Older history as one opening payment, the last three charges paid one by one.
    const older = toPay.slice(0, -3);
    const recent = toPay.slice(-3);
    if (older.length) {
      const total = older.reduce((s, c) => s + Math.round(Number(c.amount) * 100), 0);
      await pay(l.id, iso(older[older.length - 1]!), (total / 100).toFixed(2), "OPENING-BAL");
    }
    for (const [i, c] of recent.entries()) {
      const last = i === recent.length - 1;
      const amount =
        last && l.unit.unitNumber === PART_PAID
          ? (Number(c.amount) / 2).toFixed(2)
          : c.amount.toFixed(2);
      await pay(l.id, addDays(iso(c), 2), amount, `BT-${iso(c).replaceAll("-", "")}`);
    }
  }
  console.log(`Recorded ${count} synthetic payments.`);
}

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--allow-production")) {
    throw new Error("Refusing to seed a production database.");
  }
  const { admin, credentials } = await seedUsers();
  await seedProperty(admin);
  await seedPayments(admin);

  console.log("\nSeed users (synthetic test accounts):");
  console.table(credentials);
  console.log("These passwords change every time you run the seed unless SEED_PASSWORD is set.\n");
  const counts = await Promise.all([
    db.building.count(),
    db.unit.count(),
    db.tenant.count(),
    db.lease.count(),
  ]);
  console.log(
    `Buildings: ${counts[0]}, units: ${counts[1]}, tenants: ${counts[2]}, leases: ${counts[3]}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
