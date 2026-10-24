import { beforeEach, describe, expect, it } from "vitest";

import { getEntityHistory } from "@/server/audit-log/entity-history";
import { db } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createLease, terminateLease } from "@/server/leases/service";
import {
  createBuilding,
  listBuildings,
  setBuildingArchived,
  updateBuilding,
} from "@/server/property/buildings";
import {
  createUnitType,
  listUnitTypes,
  setUnitTypeArchived,
  updateUnitType,
} from "@/server/property/unit-types";
import {
  createUnit,
  getUnit,
  listUnits,
  setUnitArchived,
  setUnitReminderOverride,
  updateUnit,
} from "@/server/property/units";
import { getSettings, updateSettings } from "@/server/settings/service";
import {
  createTenant,
  getTenant,
  listTenants,
  setTenantArchived,
  updateTenant,
} from "@/server/tenants/service";
import { makeProperty, makeTenant, makeUser, meta, resetDb, terms } from "./helpers";

beforeEach(resetDb);
const NOW = new Date("2026-10-23T02:00:00Z");

describe("buildings, unit types and units", () => {
  it("Admins manage them; codes and unit numbers must be unique", async () => {
    const admin = await makeUser("ADMIN");
    const { building, unitType, units } = await makeProperty(admin, {
      code: "TWR1",
      units: ["12A"],
    });
    await expect(
      createBuilding(admin, { name: "Other", code: "twr1", address: "x", type: "MIXED" }, meta),
    ).rejects.toMatchObject({ fieldErrors: { code: expect.stringMatching(/already uses/) } });
    await expect(
      createUnit(
        admin,
        { buildingId: building.id, unitNumber: "12a", unitTypeId: unitType.id },
        meta,
      ),
    ).rejects.toMatchObject({
      fieldErrors: { unitNumber: expect.stringMatching(/already has a unit/) },
    });

    await updateBuilding(
      admin,
      building.id,
      { name: "Tower One", code: "TWR1", address: "1 Ayala Ave", type: "COMMERCIAL" },
      meta,
    );
    await updateUnit(
      admin,
      units[0]!.id,
      {
        buildingId: building.id,
        unitNumber: "12A",
        unitTypeId: unitType.id,
        floorArea: "1,250.5",
        floor: "12",
      },
      meta,
    );
    const unit = await getUnit(admin, units[0]!.id, NOW);
    expect(unit).toMatchObject({
      floorArea: "1250.50",
      floor: "12",
      building: { name: "Tower One" },
      occupancy: "VACANT",
    });
  });

  it("archiving is blocked while something still depends on the record", async () => {
    const admin = await makeUser("ADMIN");
    const { building, unitType, units } = await makeProperty(admin);
    const tenant = await makeTenant(admin);
    const lease = await createLease(
      admin,
      { unitId: units[0]!.id, tenantId: tenant.id, ...terms() },
      meta,
      NOW,
    );

    await expect(setBuildingArchived(admin, building.id, true, meta)).rejects.toThrow(
      /Archive the units first/,
    );
    await expect(setUnitTypeArchived(admin, unitType.id, true, meta)).rejects.toThrow(
      /uses this type/,
    );
    await expect(setUnitArchived(admin, units[0]!.id, true, meta, NOW)).rejects.toThrow(
      /current or upcoming lease/,
    );
    await expect(setTenantArchived(admin, tenant.id, true, meta, NOW)).rejects.toThrow(
      /current or upcoming lease/,
    );

    await terminateLease(
      admin,
      lease.id,
      { terminationDate: "2026-10-01", reason: "Ended by agreement" },
      meta,
      NOW,
    );
    await setUnitArchived(admin, units[0]!.id, true, meta, NOW);
    await setTenantArchived(admin, tenant.id, true, meta, NOW);
    await setBuildingArchived(admin, building.id, true, meta);
    expect(await listBuildings(admin)).toHaveLength(0);
    await setBuildingArchived(admin, building.id, false, meta);
    await setUnitArchived(admin, units[0]!.id, false, meta, NOW);
  });

  it("units show occupancy, overrides and the current tenant", async () => {
    const admin = await makeUser("ADMIN");
    const { building, unitType, units } = await makeProperty(admin, {
      units: ["101", "102", "103"],
    });
    const tenant = await makeTenant(admin);
    await createLease(admin, { unitId: units[0]!.id, tenantId: tenant.id, ...terms() }, meta, NOW);
    await updateUnit(
      admin,
      units[1]!.id,
      {
        buildingId: building.id,
        unitNumber: "102",
        unitTypeId: unitType.id,
        statusOverride: "UNDER_RENOVATION",
      },
      meta,
    );
    const list = await listUnits(admin, {}, NOW);
    expect(
      list.map((u) => [u.unitNumber, u.occupancy, u.currentLease?.tenantName ?? null]),
    ).toEqual([
      ["101", "OCCUPIED", "ABC Corporation"],
      ["102", "UNDER_RENOVATION", null],
      ["103", "VACANT", null],
    ]);
    expect((await listUnits(admin, { occupancy: "VACANT" }, NOW)).map((u) => u.unitNumber)).toEqual(
      ["103"],
    );
    expect((await listUnits(admin, { q: "abc" }, NOW)).map((u) => u.unitNumber)).toEqual(["101"]);
    expect((await listBuildings(admin, {}, NOW))[0]?.occupancy).toMatchObject({
      occupied: 1,
      vacant: 1,
      unavailable: 1,
      occupancyPercent: 50,
    });
  });
});

describe("reminder settings inheritance", () => {
  it("unit override → unit type → system default", async () => {
    const admin = await makeUser("ADMIN");
    const { unitType, units } = await makeProperty(admin, { reminderConfig: null });
    const id = units[0]!.id;
    expect((await getUnit(admin, id)).reminders).toMatchObject({
      source: "system",
      effective: { leadDays: [90, 60, 30] },
    });

    await updateSettings(
      admin,
      {
        reminderDefaults: {
          leadDays: [45, 15],
          repeat: "NONE",
          repeatWeekday: null,
          afterExpiryDays: 0,
        },
      },
      meta,
    );
    expect((await getUnit(admin, id)).reminders.effective.leadDays).toEqual([45, 15]);

    await updateUnitType(
      admin,
      unitType.id,
      {
        name: unitType.name,
        reminderConfig: {
          leadDays: [60, 30, 7],
          repeat: "NONE",
          repeatWeekday: null,
          afterExpiryDays: 0,
        },
      },
      meta,
    );
    expect((await getUnit(admin, id)).reminders).toMatchObject({
      source: "unitType",
      effective: { leadDays: [60, 30, 7] },
    });

    await setUnitReminderOverride(
      admin,
      id,
      {
        reminderConfig: {
          leadDays: [7, 14],
          repeat: "DAILY",
          repeatWeekday: null,
          afterExpiryDays: 10,
        },
      },
      meta,
    );
    expect((await getUnit(admin, id)).reminders).toMatchObject({
      source: "unit",
      effective: { leadDays: [14, 7], repeat: "DAILY" },
    });

    await setUnitReminderOverride(admin, id, { reminderConfig: null }, meta);
    expect((await getUnit(admin, id)).reminders.source).toBe("unitType");
    expect((await listUnitTypes(admin))[0]?.reminderConfig?.leadDays).toEqual([60, 30, 7]);
  });
});

describe("tenants", () => {
  it("require the privacy notice to be acknowledged, and record how", async () => {
    const staff = await makeUser("LEASING_STAFF");
    const err = await createTenant(
      staff,
      { type: "COMPANY", displayName: "No Ack Inc", privacyAckMethod: "EMAIL" },
      meta,
    ).catch((e: unknown) => e);
    expect((err as ValidationError).fieldErrors.privacyAcknowledged).toMatch(/privacy notice/);

    const t = await createTenant(
      staff,
      {
        type: "INDIVIDUAL",
        displayName: "Juan dela Cruz",
        tin: "123 456 789 000",
        privacyAcknowledged: true,
        privacyAckMethod: "EMAIL",
      },
      meta,
      NOW,
    );
    const detail = await getTenant(staff, t.id);
    expect(detail).toMatchObject({
      tin: "123-456-789-000",
      privacyAckMethod: "EMAIL",
      privacyAckDate: "2026-10-23",
    });
  });

  it.each([
    [{ tin: "12345" }, "tin"],
    [{ email: "not-an-email" }, "email"],
    [{ phone: "call me" }, "phone"],
    [{ displayName: "" }, "displayName"],
  ])("validates %j", async (override, field) => {
    const staff = await makeUser("LEASING_STAFF");
    const err = await createTenant(
      staff,
      {
        type: "COMPANY",
        displayName: "X Corp",
        privacyAcknowledged: true,
        privacyAckMethod: "EMAIL",
        ...override,
      },
      meta,
    ).catch((e: unknown) => e);
    expect((err as ValidationError).fieldErrors[field]).toBeTruthy();
  });

  it("forgiving search, and the audit log never stores personal values", async () => {
    const staff = await makeUser("LEASING_STAFF");
    const t = await makeTenant(staff, "A.B.C. Corporation");
    expect((await listTenants(staff, { q: "abc corp" })).map((x) => x.displayName)).toEqual([
      "A.B.C. Corporation",
    ]);
    expect((await listTenants(staff, { q: "maria" })).length).toBe(1); // contact person

    await updateTenant(
      staff,
      t.id,
      {
        type: "COMPANY",
        displayName: "A.B.C. Corporation",
        email: "new@abc.example",
        phone: "0917 765 4321",
      },
      meta,
    );
    const history = await getEntityHistory(staff, "Tenant", t.id);
    const all = JSON.stringify(history);
    expect(all).not.toContain("new@abc.example");
    expect(all).not.toContain("maria@abc.example");
    expect(all).not.toContain("0917");
    expect(history[0]?.changes).toMatchObject({
      email: { before: "[personal data]", after: "[personal data]" },
    });
  });
});

describe("what Viewers can and can't get", () => {
  it("see units with tenant display name and dates only; never contact or money fields", async () => {
    const admin = await makeUser("ADMIN");
    const viewer = await makeUser("VIEWER");
    const { units } = await makeProperty(admin);
    const tenant = await makeTenant(admin);
    await createLease(admin, { unitId: units[0]!.id, tenantId: tenant.id, ...terms() }, meta, NOW);

    const list = await listUnits(viewer, {}, NOW);
    expect(list[0]?.currentLease).toEqual({
      tenantName: "ABC Corporation",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      terminationDate: null,
    });
    const detail = await getUnit(viewer, units[0]!.id, NOW);
    const json = JSON.stringify(detail);
    for (const forbidden of [
      "maria",
      "0917",
      "50000",
      "100000",
      "monthlyRent",
      "refNo",
      "LSE-",
      tenant.id,
    ]) {
      expect(json, `viewer payload must not contain ${forbidden}`).not.toContain(forbidden);
    }
    expect(detail.notes).toBeNull();
  });

  it("are refused by tenant and property-management services", async () => {
    const admin = await makeUser("ADMIN");
    const viewer = await makeUser("VIEWER");
    const staff = await makeUser("LEASING_STAFF");
    const { building, unitType, units } = await makeProperty(admin);
    const tenant = await makeTenant(admin);
    const viewerAttempts = [
      listTenants(viewer),
      getTenant(viewer, tenant.id),
      createTenant(viewer, {}, meta),
      updateTenant(viewer, tenant.id, {}, meta),
      setTenantArchived(viewer, tenant.id, true, meta),
    ];
    const nonAdminAttempts = (who: typeof staff) => [
      createBuilding(who, {}, meta),
      updateBuilding(who, building.id, {}, meta),
      setBuildingArchived(who, building.id, true, meta),
      createUnitType(who, {}, meta),
      updateUnitType(who, unitType.id, {}, meta),
      createUnit(who, {}, meta),
      updateUnit(who, units[0]!.id, {}, meta),
      setUnitReminderOverride(who, units[0]!.id, { reminderConfig: null }, meta),
      setUnitArchived(who, units[0]!.id, true, meta),
      getEntityHistory(who, "Unit", units[0]!.id),
    ];
    for (const a of [...viewerAttempts, ...nonAdminAttempts(viewer), ...nonAdminAttempts(staff)]) {
      await expect(a).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});

describe("privacy settings", () => {
  it("have compliant defaults that Admins can change", async () => {
    const admin = await makeUser("ADMIN");
    const s = await getSettings();
    expect(s.retentionYears).toBe(10);
    for (const required of [
      "Data Privacy Act",
      "{{dpoEmail}}",
      "National Privacy Commission",
      "{{retentionYears}}",
      "Your rights",
    ]) {
      expect(s.privacyNotice).toContain(required);
    }
    await updateSettings(admin, { retentionYears: 7, dpoEmail: "dpo@sample.test" }, meta);
    expect(await getSettings()).toMatchObject({ retentionYears: 7, dpoEmail: "dpo@sample.test" });
    await expect(updateSettings(admin, { retentionYears: 0 }, meta)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("a bad stored value falls back to its default without affecting other settings", async () => {
    await db.setting.create({ data: { key: "retentionYears", value: "ten" } });
    await db.setting.create({ data: { key: "companyName", value: "Kept Corp" } });
    expect(await getSettings()).toMatchObject({ retentionYears: 10, companyName: "Kept Corp" });
  });
});
