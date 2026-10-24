import { beforeEach, describe, expect, it } from "vitest";

import { getEntityHistory } from "@/server/audit-log/entity-history";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { discardLeaseDraft, getLeaseDraft, saveLeaseDraft } from "@/server/leases/drafts";
import {
  createLease,
  getLease,
  listLeases,
  renewLease,
  setLeaseArchived,
  syncLeaseStatuses,
  terminateLease,
  updateLease,
} from "@/server/leases/service";
import { getDashboard } from "@/server/dashboard";
import { makeProperty, makeTenant, makeUser, meta, resetDb, terms } from "./helpers";

beforeEach(resetDb);

// "Today" for these tests: 23 Oct 2026, 10:00 in Manila.
const NOW = new Date("2026-10-23T02:00:00Z");

async function setup() {
  const admin = await makeUser("ADMIN");
  const staff = await makeUser("LEASING_STAFF");
  const viewer = await makeUser("VIEWER");
  const { units, unitType, building } = await makeProperty(admin, { units: ["101", "102"] });
  const tenant = await makeTenant(staff);
  return { admin, staff, viewer, units, unitType, building, tenant };
}

describe("creating leases", () => {
  it("creates a lease with a reference number, stores exact money, and audits it", async () => {
    const { staff, units, tenant } = await setup();
    const lease = await createLease(
      staff,
      { unitId: units[0]!.id, tenantId: tenant.id, ...terms() },
      meta,
      NOW,
    );
    expect(lease.refNo).toBe("LSE-2026-0001");
    expect(lease.monthlyRent.toFixed(2)).toBe("50000.00");
    expect(lease.escalationPercent?.toFixed(3)).toBe("5.000");

    const second = await createLease(
      staff,
      { unitId: units[1]!.id, tenantId: tenant.id, ...terms() },
      meta,
      NOW,
    );
    expect(second.refNo).toBe("LSE-2026-0002");

    const history = await getEntityHistory(staff, "Lease", lease.id);
    expect(history.map((h) => h.action)).toEqual(["lease.create"]);
  });

  it("blocks overlapping leases on the same unit with a clear message", async () => {
    const { staff, units, tenant } = await setup();
    const other = await makeTenant(staff, "XYZ Trading");
    await createLease(staff, { unitId: units[0]!.id, tenantId: tenant.id, ...terms() }, meta, NOW);

    const err = await createLease(
      staff,
      {
        unitId: units[0]!.id,
        tenantId: other.id,
        ...terms({ startDate: "2027-12-31", endDate: "2028-12-31" }),
      },
      meta,
      NOW,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toBe(
      "Unit 101 is already leased to ABC Corporation (LSE-2026-0001) from 1 Jan 2026 to 31 Dec 2027. Choose dates that don't overlap, or another unit.",
    );

    // The day after is fine, and so is another unit.
    await createLease(
      staff,
      {
        unitId: units[0]!.id,
        tenantId: other.id,
        ...terms({ startDate: "2028-01-01", endDate: "2028-12-31" }),
      },
      meta,
      NOW,
    );
    await createLease(staff, { unitId: units[1]!.id, tenantId: other.id, ...terms() }, meta, NOW);
  });

  it("the database itself refuses overlaps, even if the service check is bypassed", async () => {
    const { staff, units, tenant } = await setup();
    const lease = await createLease(
      staff,
      { unitId: units[0]!.id, tenantId: tenant.id, ...terms() },
      meta,
      NOW,
    );
    await expect(
      db.lease.create({
        data: {
          refNo: "LSE-TEST-9999",
          unitId: units[0]!.id,
          tenantId: tenant.id,
          startDate: new Date("2026-06-01"),
          endDate: new Date("2026-07-01"),
          status: "ACTIVE",
          monthlyRent: "1",
          rentDueDay: 1,
          securityDeposit: "0",
        },
      }),
    ).rejects.toThrow(/Lease_no_overlap/);
    expect(lease).toBeTruthy();
  });

  it.each([
    [{ endDate: "2025-12-31" }, "endDate"],
    [{ rentDueDay: 31 }, "rentDueDay"],
    [{ monthlyRent: "0" }, "monthlyRent"],
    [{ monthlyRent: "12.345" }, "monthlyRent"],
    [{ securityDeposit: "-5" }, "securityDeposit"],
    [{ advanceRentType: "AMOUNT", advanceRentAmount: "" }, "advanceRentAmount"],
    [{ escalationType: "SCHEDULE", escalationSteps: [] }, "escalationSteps"],
    [
      {
        escalationType: "SCHEDULE",
        escalationSteps: [{ date: "2029-01-01", monthlyRent: "60000" }],
      },
      "escalationSteps.0.date",
    ],
  ])("rejects invalid terms %j with a message on %s", async (override, field) => {
    const { staff, units, tenant } = await setup();
    const err = await createLease(
      staff,
      { unitId: units[0]!.id, tenantId: tenant.id, ...terms(override) },
      meta,
      NOW,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).fieldErrors[field]).toBeTruthy();
  });

  it("refuses archived units and tenants", async () => {
    const { staff, units, tenant } = await setup();
    await db.tenant.update({ where: { id: tenant.id }, data: { archivedAt: new Date() } });
    const err = await createLease(
      staff,
      { unitId: units[0]!.id, tenantId: tenant.id, ...terms() },
      meta,
      NOW,
    ).catch((e: unknown) => e);
    expect((err as ValidationError).fieldErrors.tenantId).toBeTruthy();
  });
});

describe("statuses", () => {
  it.each([
    ["active", "2026-01-01", "2027-12-31", "ACTIVE"],
    ["expiring (inside 90 days)", "2025-01-01", "2026-12-31", "EXPIRING"],
    ["expired", "2025-01-01", "2026-10-22", "EXPIRED"],
    ["ends today", "2025-10-24", "2026-10-23", "EXPIRING"],
    ["upcoming", "2026-11-01", "2027-10-31", "UPCOMING"],
  ])("%s", async (_label, startDate, endDate, expected) => {
    const { staff, units, tenant } = await setup();
    const l = await createLease(
      staff,
      {
        unitId: units[0]!.id,
        tenantId: tenant.id,
        ...terms({ startDate, endDate, escalationType: "NONE" }),
      },
      meta,
      NOW,
    );
    expect(l.status).toBe(expected);
    expect((await getLease(staff, l.id, NOW)).status).toBe(expected);
  });

  it("uses the unit type's reminder window for EXPIRING", async () => {
    const admin = await makeUser("ADMIN");
    const { units } = await makeProperty(admin, {
      reminderConfig: {
        leadDays: [180, 30],
        repeat: "NONE",
        repeatWeekday: null,
        afterExpiryDays: 0,
      },
    });
    const tenant = await makeTenant(admin);
    const l = await createLease(
      admin,
      {
        unitId: units[0]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2025-06-01", endDate: "2027-03-31" }),
      },
      meta,
      NOW,
    );
    expect(l.status).toBe("EXPIRING"); // 159 days left, window is 180
  });

  it("the daily sync updates stored statuses as days pass", async () => {
    const { staff, units, tenant } = await setup();
    const l = await createLease(
      staff,
      {
        unitId: units[0]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2026-01-01", endDate: "2027-03-31" }),
      },
      meta,
      NOW,
    );
    expect(l.status).toBe("ACTIVE");
    expect(await syncLeaseStatuses(NOW)).toBe(0);
    expect(await syncLeaseStatuses(new Date("2027-01-15T02:00:00Z"))).toBe(1);
    expect((await db.lease.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("EXPIRING");
    expect(await syncLeaseStatuses(new Date("2027-04-01T02:00:00Z"))).toBe(1);
    expect((await db.lease.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("EXPIRED");
  });
});

describe("renewal", () => {
  it("creates a linked lease starting after the old one, and marks the old one RENEWED", async () => {
    const { staff, units, tenant } = await setup();
    const old = await createLease(
      staff,
      {
        unitId: units[0]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2025-01-01", endDate: "2026-12-31" }),
      },
      meta,
      NOW,
    );
    expect(old.status).toBe("EXPIRING");

    const err = await renewLease(
      staff,
      old.id,
      terms({ startDate: "2026-12-31", endDate: "2028-12-31" }),
      meta,
      NOW,
    ).catch((e: unknown) => e);
    expect((err as ValidationError).fieldErrors.startDate).toMatch(
      /after the current lease ends \(31 Dec 2026\)/,
    );

    const renewal = await renewLease(
      staff,
      old.id,
      terms({ startDate: "2027-01-01", endDate: "2028-12-31", monthlyRent: "55000" }),
      meta,
      NOW,
    );
    expect(renewal.previousLeaseId).toBe(old.id);
    expect(renewal.unitId).toBe(old.unitId);
    expect(renewal.tenantId).toBe(old.tenantId);

    const oldView = await getLease(staff, old.id, NOW);
    expect(oldView.status).toBe("RENEWED");
    expect(oldView.actions.canRenew).toBe(false);
    expect(oldView.chain.map((c) => [c.refNo, c.current])).toEqual([
      ["LSE-2026-0001", true],
      ["LSE-2026-0002", false],
    ]);
    expect((await getLease(staff, renewal.id, NOW)).status).toBe("UPCOMING");

    await expect(
      renewLease(
        staff,
        old.id,
        terms({ startDate: "2029-01-01", endDate: "2029-12-31" }),
        meta,
        NOW,
      ),
    ).rejects.toThrow(/already been renewed/);
    expect(
      await getEntityHistory(staff, "Lease", old.id).then((h) => h.map((e) => e.action)),
    ).toContain("lease.renew");
  });

  it("archiving a renewal lets the old lease be renewed again", async () => {
    const { staff, units, tenant } = await setup();
    const old = await createLease(
      staff,
      {
        unitId: units[0]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2025-01-01", endDate: "2026-12-31" }),
      },
      meta,
      NOW,
    );
    const r1 = await renewLease(
      staff,
      old.id,
      terms({ startDate: "2027-01-01", endDate: "2027-12-31" }),
      meta,
      NOW,
    );
    await setLeaseArchived(staff, r1.id, true, meta, NOW);
    expect((await getLease(staff, old.id, NOW)).status).toBe("EXPIRING");
    const r2 = await renewLease(
      staff,
      old.id,
      terms({ startDate: "2027-01-01", endDate: "2028-12-31" }),
      meta,
      NOW,
    );
    expect(r2.previousLeaseId).toBe(old.id);
    // The archived one can't come back on top of the new renewal.
    await expect(setLeaseArchived(staff, r1.id, false, meta, NOW)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("termination", () => {
  it("needs a date inside the lease and a reason; frees the unit after that date", async () => {
    const { staff, units, tenant } = await setup();
    const l = await createLease(
      staff,
      { unitId: units[0]!.id, tenantId: tenant.id, ...terms() },
      meta,
      NOW,
    );
    await expect(
      terminateLease(
        staff,
        l.id,
        { terminationDate: "2028-01-15", reason: "Moving out" },
        meta,
        NOW,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      terminateLease(staff, l.id, { terminationDate: "2026-11-30", reason: "" }, meta, NOW),
    ).rejects.toBeInstanceOf(ValidationError);

    await terminateLease(
      staff,
      l.id,
      { terminationDate: "2026-11-30", reason: "Tenant is relocating" },
      meta,
      NOW,
    );
    const view = await getLease(staff, l.id, NOW);
    expect(view.status).toBe("TERMINATED");
    expect(view.statusDetail).toBe("Ended early on 30 Nov 2026");
    expect(view.actions).toMatchObject({ canEdit: false, canRenew: false, canTerminate: false });

    // The unit can be let from the next day.
    const other = await makeTenant(staff, "New Tenant Inc");
    await createLease(
      staff,
      {
        unitId: units[0]!.id,
        tenantId: other.id,
        ...terms({ startDate: "2026-12-01", endDate: "2027-11-30" }),
      },
      meta,
      NOW,
    );
    const entry = (await getEntityHistory(staff, "Lease", l.id))[0];
    expect(entry).toMatchObject({
      action: "lease.terminate",
      metadata: { reason: "Tenant is relocating" },
    });
  });

  it("can't terminate a renewed lease", async () => {
    const { staff, units, tenant } = await setup();
    const old = await createLease(
      staff,
      {
        unitId: units[0]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2025-01-01", endDate: "2026-12-31" }),
      },
      meta,
      NOW,
    );
    await renewLease(
      staff,
      old.id,
      terms({ startDate: "2027-01-01", endDate: "2027-12-31" }),
      meta,
      NOW,
    );
    await expect(
      terminateLease(
        staff,
        old.id,
        { terminationDate: "2026-11-30", reason: "Something" },
        meta,
        NOW,
      ),
    ).rejects.toThrow(/end the newer lease/);
  });
});

describe("editing terms", () => {
  it("records before/after values and checks overlap again", async () => {
    const { staff, units, tenant } = await setup();
    const a = await createLease(
      staff,
      { unitId: units[0]!.id, tenantId: tenant.id, ...terms() },
      meta,
      NOW,
    );
    const b = await createLease(
      staff,
      { unitId: units[1]!.id, tenantId: tenant.id, ...terms() },
      meta,
      NOW,
    );

    await updateLease(
      staff,
      a.id,
      { unitId: units[0]!.id, tenantId: tenant.id, ...terms({ monthlyRent: "52,500" }) },
      meta,
      NOW,
    );
    const [entry] = await getEntityHistory(staff, "Lease", a.id);
    expect(entry?.changes).toEqual({ monthlyRent: { before: "50000.00", after: "52500.00" } });

    // Moving lease B onto unit 101 would overlap lease A.
    await expect(
      updateLease(
        staff,
        b.id,
        { unitId: units[0]!.id, tenantId: tenant.id, ...terms() },
        meta,
        NOW,
      ),
    ).rejects.toThrow(/already leased/);
  });
});

describe("archiving", () => {
  it("hides archived leases from lists and frees their dates", async () => {
    const { staff, units, tenant } = await setup();
    const l = await createLease(
      staff,
      { unitId: units[0]!.id, tenantId: tenant.id, ...terms() },
      meta,
      NOW,
    );
    await setLeaseArchived(staff, l.id, true, meta, NOW);
    expect(await listLeases(staff, {}, NOW)).toHaveLength(0);
    expect(await listLeases(staff, { includeArchived: true }, NOW)).toHaveLength(1);
    await setLeaseArchived(staff, l.id, false, meta, NOW);
    expect(await listLeases(staff, {}, NOW)).toHaveLength(1);
  });
});

describe("search", () => {
  it("is forgiving: 'abc corp' finds ABC Corporation; ref numbers and units work too", async () => {
    const { staff, units, tenant } = await setup();
    const other = await makeTenant(staff, "Santo Niño Trading");
    await createLease(staff, { unitId: units[0]!.id, tenantId: tenant.id, ...terms() }, meta, NOW);
    await createLease(staff, { unitId: units[1]!.id, tenantId: other.id, ...terms() }, meta, NOW);
    expect(
      (await listLeases(staff, { q: "abc corp" }, NOW)).map((l) => l.tenant.displayName),
    ).toEqual(["ABC Corporation"]);
    expect((await listLeases(staff, { q: "nino" }, NOW)).map((l) => l.tenant.displayName)).toEqual([
      "Santo Niño Trading",
    ]);
    expect(await listLeases(staff, { q: "lse-2026-0002" }, NOW)).toHaveLength(1);
    expect(await listLeases(staff, { q: "102" }, NOW)).toHaveLength(1);
  });
});

describe("drafts", () => {
  it("are kept per user on the server and cleared when the lease is saved", async () => {
    const { staff, units, tenant } = await setup();
    await saveLeaseDraft(staff, {
      step: 3,
      values: { unitId: units[0]!.id, tenantId: tenant.id, monthlyRent: "50000" },
    });
    expect((await getLeaseDraft(staff))?.step).toBe(3);
    await createLease(staff, { unitId: units[0]!.id, tenantId: tenant.id, ...terms() }, meta, NOW);
    expect(await getLeaseDraft(staff)).toBeNull();
    await saveLeaseDraft(staff, { step: 1, values: {} });
    await discardLeaseDraft(staff);
    expect(await getLeaseDraft(staff)).toBeNull();
  });
});

describe("dashboard", () => {
  it("counts active, expiring and expired leases for staff only", async () => {
    const { staff, viewer, units, tenant } = await setup();
    await createLease(
      staff,
      {
        unitId: units[0]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2025-01-01", endDate: "2026-12-15" }),
      },
      meta,
      NOW,
    );
    await createLease(
      staff,
      {
        unitId: units[1]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2025-01-01", endDate: "2026-10-01" }),
      },
      meta,
      NOW,
    );
    const d = await getDashboard(staff, NOW);
    expect(d.leases).toMatchObject({ active: 1, expiringIn90: 1, expiredNotRenewed: 1 });
    expect(d.buildings[0]?.occupancy).toMatchObject({
      occupied: 1,
      vacant: 1,
      occupancyPercent: 50,
    });

    const v = await getDashboard(viewer, NOW);
    expect(v.leases).toBeUndefined();
    expect(v.buildings[0]?.occupancy.occupied).toBe(1);
  });
});

describe("Viewers and lease data", () => {
  it("are refused by every lease service", async () => {
    const { staff, viewer, units, tenant } = await setup();
    const l = await createLease(
      staff,
      { unitId: units[0]!.id, tenantId: tenant.id, ...terms() },
      meta,
      NOW,
    );
    const attempts = [
      listLeases(viewer),
      getLease(viewer, l.id),
      createLease(viewer, { unitId: units[1]!.id, tenantId: tenant.id, ...terms() }, meta),
      updateLease(viewer, l.id, {}, meta),
      renewLease(viewer, l.id, {}, meta),
      terminateLease(viewer, l.id, {}, meta),
      setLeaseArchived(viewer, l.id, true, meta),
      saveLeaseDraft(viewer, { step: 1, values: {} }),
      getEntityHistory(viewer, "Lease", l.id),
    ];
    for (const a of attempts) await expect(a).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("unknown or malformed lease ids are 'not found'", async () => {
    const { staff } = await setup();
    await expect(getLease(staff, "nope")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getLease(staff, "01890000-0000-7000-8000-000000000000")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
