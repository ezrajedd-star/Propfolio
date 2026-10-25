import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";

import { getEntityHistory } from "@/server/audit-log/entity-history";
import { getCalendarEvents } from "@/server/calendar/service";
import { db } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { exportLeases } from "@/server/leases/export";
import { quickEditLease } from "@/server/leases/quick-edit";
import { createLease, listLeases, terminateLease } from "@/server/leases/service";
import { getGridLayout, saveGridLayout } from "@/server/preferences";
import { getTenant, listTenants } from "@/server/tenants/service";
import { makeProperty, makeTenant, makeUser, meta, resetDb, terms } from "./helpers";

beforeEach(resetDb);
const NOW = new Date("2026-10-23T02:00:00Z");

async function setup() {
  const admin = await makeUser("ADMIN");
  const staff = await makeUser("LEASING_STAFF");
  const viewer = await makeUser("VIEWER");
  const { units } = await makeProperty(admin, { units: ["101", "102"] });
  const tenant = await makeTenant(staff);
  const lease = await createLease(
    staff,
    {
      unitId: units[0]!.id,
      tenantId: tenant.id,
      ...terms({ startDate: "2026-01-01", endDate: "2026-12-31", rentDueDay: 5 }),
    },
    meta,
    NOW,
  );
  return { admin, staff, viewer, units, tenant, lease };
}

describe("calendar", () => {
  it("gives staff end, start and reminder events with lease details", async () => {
    const { staff, lease } = await setup();
    const events = await getCalendarEvents(staff, { from: "2026-09-01", to: "2026-12-31" }, NOW);
    expect(events.map((e) => [e.type, e.date])).toEqual([
      ["REMINDER", "2026-10-02"],
      ["REMINDER", "2026-11-01"],
      ["REMINDER", "2026-12-01"],
      ["END", "2026-12-31"],
    ]);
    expect(events.at(-1)).toMatchObject({
      tenantName: "ABC Corporation",
      unitLabel: "Unit 101",
      status: "EXPIRING",
      lease: { id: lease.id, refNo: "LSE-2026-0001", monthlyRent: "50000.00", canRenew: true },
    });
  });

  it("includes rent due dates only when asked", async () => {
    const { staff } = await setup();
    const events = await getCalendarEvents(
      staff,
      { from: "2026-10-01", to: "2026-11-30", types: "RENT_DUE" },
      NOW,
    );
    expect(events.map((e) => e.date)).toEqual(["2026-10-05", "2026-11-05"]);
  });

  it("gives Viewers only start/end dates and the tenant's display name", async () => {
    const { viewer } = await setup();
    const events = await getCalendarEvents(
      viewer,
      { from: "2025-12-01", to: "2026-12-31", types: "END,START,REMINDER,RENT_DUE" },
      NOW,
    );
    expect(events.map((e) => e.type)).toEqual(["START", "END"]);
    const json = JSON.stringify(events);
    for (const forbidden of ["lease", "LSE-", "50000", "maria", "monthlyRent"])
      expect(json).not.toContain(forbidden);
  });

  it("filters by status and rejects silly ranges", async () => {
    const { staff } = await setup();
    expect(
      await getCalendarEvents(
        staff,
        { from: "2026-01-01", to: "2026-12-31", status: "ACTIVE" },
        NOW,
      ),
    ).toEqual([]);
    await expect(
      getCalendarEvents(staff, { from: "2026-01-01", to: "2028-01-01" }, NOW),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      getCalendarEvents(staff, { from: "nope", to: "2026-01-01" }, NOW),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("shows the termination date as the end and stops reminders", async () => {
    const { staff, lease } = await setup();
    await terminateLease(
      staff,
      lease.id,
      { terminationDate: "2026-11-15", reason: "Moved out early" },
      meta,
      NOW,
    );
    const events = await getCalendarEvents(staff, { from: "2026-10-23", to: "2026-12-31" }, NOW);
    expect(events.map((e) => [e.type, e.date])).toEqual([["END", "2026-11-15"]]);
  });
});

describe("quick edits from the grid", () => {
  it("saves remarks, due day and contact person, returns the previous value, and audits", async () => {
    const { staff, lease, tenant } = await setup();
    expect(
      await quickEditLease(staff, lease.id, { field: "remarks", value: "Prefers email" }, meta),
    ).toEqual({
      field: "remarks",
      previous: null,
      value: "Prefers email",
    });
    expect(
      await quickEditLease(staff, lease.id, { field: "rentDueDay", value: "10" }, meta),
    ).toMatchObject({ previous: 5, value: 10 });
    expect(
      await quickEditLease(staff, lease.id, { field: "contactPerson", value: "Pedro Cruz" }, meta),
    ).toMatchObject({
      previous: "Maria Santos",
      value: "Pedro Cruz",
    });
    const row = (await listLeases(staff, {}, NOW))[0]!;
    expect(row).toMatchObject({
      remarks: "Prefers email",
      rentDueDay: 10,
      tenant: { contactPerson: "Pedro Cruz" },
    });
    // Search follows the new contact person.
    expect((await listTenants(staff, { q: "pedro" })).length).toBe(1);
    expect((await listTenants(staff, { q: "maria santos" })).length).toBe(0);

    const leaseHistory = await getEntityHistory(staff, "Lease", lease.id);
    expect(leaseHistory[0]?.changes).toEqual({ rentDueDay: { before: 5, after: 10 } });
    const tenantHistory = JSON.stringify(await getEntityHistory(staff, "Tenant", tenant.id));
    expect(tenantHistory).not.toContain("Pedro");

    // Undo is just another edit back.
    await quickEditLease(staff, lease.id, { field: "rentDueDay", value: 5 }, meta);
    expect((await getTenant(staff, tenant.id)).leases[0]).toBeTruthy();
  });

  it.each([
    [{ field: "rentDueDay", value: "31" }, /1 to 28/],
    [{ field: "rentDueDay", value: "abc" }, /1 to 28/],
    [{ field: "startDate", value: "2026-01-01" }, /isn't valid|Invalid/],
    [{ field: "remarks", value: "x".repeat(2001) }, /too long/],
  ])("rejects %j", async (input, message) => {
    const { staff, lease } = await setup();
    await expect(quickEditLease(staff, lease.id, input, meta)).rejects.toThrow(message);
  });

  it("is refused to Viewers", async () => {
    const { viewer, lease } = await setup();
    await expect(
      quickEditLease(viewer, lease.id, { field: "remarks", value: "x" }, meta),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("grid layout", () => {
  it("is saved per user and repaired on read", async () => {
    const { staff, admin, viewer } = await setup();
    expect((await getGridLayout(staff)).hidden).toContain("contactPerson");
    await saveGridLayout(staff, {
      order: ["tenant", "refNo", "nonsense"],
      hidden: ["remarks"],
      groupByBuilding: true,
    });
    const saved = await getGridLayout(staff);
    expect(saved.order.slice(0, 2)).toEqual(["tenant", "refNo"]);
    expect(saved).toMatchObject({ hidden: ["remarks"], groupByBuilding: true });
    // Another user's layout is unaffected.
    expect((await getGridLayout(admin)).groupByBuilding).toBe(false);
    await expect(getGridLayout(viewer)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("export", () => {
  it("exports the filtered rows as CSV and Excel, and audits every export", async () => {
    const { staff, units } = await setup();
    const other = await makeTenant(staff, "Santo Niño Trading");
    await createLease(staff, { unitId: units[1]!.id, tenantId: other.id, ...terms() }, meta, NOW);

    const csv = await exportLeases(
      staff,
      {
        format: "csv",
        columns: ["refNo", "tenant", "monthlyRent", "endDate"],
        filters: { q: "nino" },
      },
      meta,
      NOW,
    );
    const text = csv.body.toString("utf8");
    expect(text).toBe(
      "﻿Ref No.,Tenant,Monthly rent,End\r\nLSE-2026-0002,Santo Niño Trading,50000,31 Dec 2027\r\n",
    );

    const xlsx = await exportLeases(
      staff,
      { format: "xlsx", columns: ["refNo", "monthlyRent", "endDate", "balanceDue"], filters: {} },
      meta,
      NOW,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Leases")!;
    expect(ws.getRow(1).values).toEqual([
      undefined,
      "Ref No.",
      "Monthly rent",
      "End",
      "Balance due",
    ]);
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(2).getCell(2).value).toBe(50000);
    expect(typeof ws.getRow(2).getCell(4).value).toBe("number");

    const exports = await db.auditLog.findMany({ where: { action: "data.export" } });
    expect(exports).toHaveLength(2);
    expect(exports[0]?.metadata).toMatchObject({ format: "csv", rows: 1 });
  });

  it("is refused to Viewers", async () => {
    const { viewer } = await setup();
    await expect(
      exportLeases(viewer, { format: "csv", columns: [], filters: {} }, meta),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
