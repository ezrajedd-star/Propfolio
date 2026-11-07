import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";

import { IMPORT_COLUMNS, IMPORT_SHEETS } from "@/domain/import/rows";
import { asSystem, db } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { checkImportFile, importTemplate, runImport } from "@/server/import/service";
import { getSignUpFunnel } from "@/server/platform/accounts";
import { makeProperty, makeUser, meta, refreshAccess, resetDb } from "./helpers";

beforeEach(resetDb);

type Sheets = Partial<Record<(typeof IMPORT_SHEETS)[number], (string | number | Date)[][]>>;

/** An .xlsx like a person would fill in from the template. */
async function workbook(sheets: Sheets) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Read me");
  for (const s of IMPORT_SHEETS) {
    const ws = wb.addWorksheet(s);
    ws.addRow(IMPORT_COLUMNS[s]);
    for (const row of sheets[s] ?? []) ws.addRow(row);
  }
  return { name: "My units.xlsx", bytes: new Uint8Array(await wb.xlsx.writeBuffer()) };
}

const goodFile = () =>
  workbook({
    Buildings: [["TWR1", "Tower One", "1 Ayala Ave, Makati", "Commercial"]],
    Units: [
      ["TWR1", "201", "Office", "2", "85.5"],
      ["TWR1", "202", "Office"],
    ],
    Tenants: [
      [
        "ABC Corporation",
        "Company",
        "Maria Santos",
        "0917 123 4567",
        "ap@abc.example",
        "",
        "",
        "Signed form",
      ],
    ],
    Leases: [
      // An Excel date and a typed date both work.
      [
        "TWR1",
        "201",
        "ABC Corporation",
        new Date(Date.UTC(2026, 0, 1)),
        "2027-12-31",
        50000,
        5,
        "100,000",
        2,
        5,
        12,
      ],
    ],
  });

async function owner() {
  const o = await makeUser("OWNER");
  // The standard unit types a new account gets.
  await asSystem(() =>
    db.unitType.createMany({
      data: ["Office", "Residential"].map((name) => ({ accountId: o.accountId, name })),
    }),
  );
  return o;
}

describe("Excel import", () => {
  it("the template has a Read me and the four sheets, with their columns", async () => {
    const o = await owner();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await importTemplate(o)) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Read me", ...IMPORT_SHEETS]);
    expect(wb.getWorksheet("Leases")!.getRow(1).getCell(6).value).toBe("Monthly rent*");
  });

  it("checking saves nothing; importing saves everything, with rent schedules and reminders", async () => {
    const o = await owner();
    const check = await checkImportFile(o, await goodFile());
    expect(check.ok).toBe(true);
    expect(await db.building.count()).toBe(0);

    const r = await runImport(o, await goodFile(), meta);
    expect(r).toEqual({ ok: true, summary: { buildings: 1, units: 2, tenants: 1, leases: 1 } });
    const lease = await db.lease.findFirstOrThrow({ include: { unit: true, tenant: true } });
    expect(lease.unit.unitNumber).toBe("201");
    expect(lease.tenant.displayName).toBe("ABC Corporation");
    expect(lease.monthlyRent.toString()).toBe("50000");
    expect(await db.charge.count({ where: { leaseId: lease.id } })).toBeGreaterThan(20);
    expect(await db.reminderEvent.count({ where: { leaseId: lease.id } })).toBeGreaterThan(0);
    expect(
      (await db.auditLog.findFirstOrThrow({ where: { action: "import.completed" } })).metadata,
    ).toMatchObject({
      units: 2,
      leases: 1,
    });
  });

  it("a file with problems lists them row by row and saves nothing", async () => {
    const o = await owner();
    const r = await runImport(
      o,
      await workbook({
        Buildings: [["TWR1", "Tower One", "", "Commercial"]],
        Units: [["TWR1", "201", "Spaceship"]],
        Leases: [["TWR1", "201", "Nobody", "2026-01-01", "2025-01-01", "", 31, 0]],
      }),
      meta,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => `${e.sheet}:${e.row}`)).toEqual(
      expect.arrayContaining(["Buildings:2", "Units:2", "Leases:2"]),
    );
    expect(r.errors.length).toBeGreaterThanOrEqual(5);
    expect(await db.building.count()).toBe(0);
  });

  it("respects the plan's unit limit", async () => {
    const o = await owner();
    await asSystem(() => db.account.update({ where: { id: o.accountId }, data: { plan: "FREE" } }));
    const free = await refreshAccess(o);
    const r = await runImport(
      free,
      await workbook({
        Buildings: [["TWR1", "Tower One", "1 Ayala Ave", "Commercial"]],
        Units: [1, 2, 3, 4].map((n) => ["TWR1", String(n), "Office"]),
      }),
      meta,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/Free plan includes up to 3 units/);
    expect(await db.unit.count()).toBe(0);
  });

  it("units and leases can refer to what is already in Propfolio", async () => {
    const o = await owner();
    const { building } = await makeProperty(o, { units: ["101"], code: "OLD" });
    const r = await runImport(
      o,
      await workbook({
        Units: [["OLD", "102", "Office"]],
        Tenants: [["New Tenant", "Individual", "", "", "", "", "", "Email"]],
        Leases: [["OLD", "102", "New Tenant", "2026-01-01", "2026-12-31", 20000, 1, 0]],
      }),
      meta,
    );
    expect(r.ok).toBe(true);
    expect(await db.unit.count({ where: { buildingId: building.id } })).toBe(2);
  });

  it("refuses files that aren't Excel, and people who can't add leases", async () => {
    const o = await owner();
    await expect(
      checkImportFile(o, { name: "notes.txt", bytes: new TextEncoder().encode("hello") }),
    ).rejects.toBeInstanceOf(ValidationError);
    const viewer = await makeUser("VIEWER");
    await expect(checkImportFile(viewer, await goodFile())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("counts the first unit and the first lease for the platform admin's sign-up numbers", async () => {
    const o = await owner();
    await runImport(o, await goodFile(), meta);
    const funnel = await getSignUpFunnel({ id: "x", name: "x", email: "x", sessionId: "x" });
    expect(funnel).toMatchObject({ firstUnit: 1, firstLease: 1 });
  });
});
