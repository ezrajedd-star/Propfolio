import { beforeEach, describe, expect, it } from "vitest";

import { listAuditLog } from "@/server/audit-log/service";
import { createSession, validateSessionToken } from "@/server/auth/session";
import { signIn } from "@/server/auth/sign-in";
import { recordPayment } from "@/server/billing/payments";
import { asSystem, db } from "@/server/db";
import { uploadDocument } from "@/server/documents/service";
import { PlanLimitError } from "@/server/errors";
import { exportLeases } from "@/server/leases/export";
import { createLease } from "@/server/leases/service";
import { logOutbox } from "@/server/mail/transport";
import { loadPlanAccess } from "@/server/plans/access";
import { sendTrialReminders } from "@/server/plans/trial-reminders";
import { changePlan } from "@/server/platform/accounts";
import { updateUnitType } from "@/server/property/unit-types";
import { createUnit, createUnits, setUnitArchived, updateUnit } from "@/server/property/units";
import { runReport } from "@/server/reports/service";
import { updateSettings } from "@/server/settings/service";
import { createUser, setUserActive } from "@/server/users/service";
import {
  DEFAULT_PASSWORD,
  TEST_ACCOUNT_ID,
  makeProperty,
  makeTenant,
  makeUser,
  meta,
  refreshAccess,
  resetDb,
  terms,
} from "./helpers";

beforeEach(resetDb);

const DAY = 86_400_000;
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF");

async function setAccount(data: {
  plan?: "FREE" | "PRO" | "PREMIUM";
  trialEndsAt?: Date | null;
  paidUntil?: Date | null;
}) {
  await asSystem(() => db.account.update({ where: { id: TEST_ACCOUNT_ID }, data }));
}

/** An Owner, and a building with `units` units, made while the account is on Premium. */
async function setUp(units: string[]) {
  const owner = await makeUser("OWNER");
  const property = await makeProperty(owner, { units });
  return { owner, ...property };
}

const expectPlanLimit = (p: Promise<unknown>, message?: RegExp) =>
  expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof PlanLimitError && (!message || message.test(e.message)),
  );

describe("which plan an account is on", () => {
  it("the first customer (no trial, no payment dates) keeps Premium with no end", async () => {
    const access = await loadPlanAccess(TEST_ACCOUNT_ID);
    expect(access).toMatchObject({ plan: "PREMIUM", trial: null, lapsed: false, readOnly: false });
    expect(access.units.limit).toBe(200);
    expect(access.users.limit).toBe(5);
  });

  it("a running trial is Premium; once it ends the account is on Free and nothing is deleted", async () => {
    const { units } = await setUp(["101", "102"]);
    await setAccount({ plan: "PREMIUM", trialEndsAt: new Date(Date.now() + 3 * DAY) });
    expect((await loadPlanAccess(TEST_ACCOUNT_ID)).trial?.daysLeft).toBe(3);

    await setAccount({ trialEndsAt: new Date(Date.now() - 1000) });
    const access = await loadPlanAccess(TEST_ACCOUNT_ID);
    expect(access).toMatchObject({ plan: "FREE", lapsed: true, readOnly: false });
    expect(await db.unit.count()).toBe(units.length);
  });

  it("every request's session carries the plan as it is now", async () => {
    const owner = await makeUser("OWNER");
    const { token } = await createSession(owner.id, TEST_ACCOUNT_ID, meta);
    expect((await validateSessionToken(token))?.access.plan).toBe("PREMIUM");
    await setAccount({ plan: "PRO" });
    expect((await validateSessionToken(token))?.access.plan).toBe("PRO");
  });
});

describe("features by plan, checked on the server", () => {
  it("Free: leases, tenants and export work; payments, reports, documents, users and the audit log are refused", async () => {
    const { owner, units } = await setUp(["101"]);
    const tenant = await makeTenant(owner);
    const lease = await createLease(
      owner,
      { unitId: units[0]!.id, tenantId: tenant.id, ...terms() },
      meta,
    );
    await setAccount({ plan: "FREE" });
    const free = await refreshAccess(owner);

    const csv = await exportLeases(
      free,
      { format: "csv", columns: ["refNo", "tenant"], filters: {} },
      meta,
    );
    expect(csv.body.length).toBeGreaterThan(0);

    await expectPlanLimit(
      recordPayment(
        free,
        {
          leaseId: lease.id,
          receivedDate: "2026-04-09",
          amount: "1000",
          method: "CASH",
          reference: "",
        },
        meta,
      ),
      /Available on Pro/,
    );
    await expectPlanLimit(runReport(free, "expiry", { days: 365 }), /Available on Pro/);
    await expectPlanLimit(
      uploadDocument(
        free,
        { leaseId: lease.id, category: "SIGNED_CONTRACT" },
        { name: "c.pdf", bytes: PDF },
        meta,
      ),
      /Available on Premium/,
    );
    await expectPlanLimit(
      createUser(free, { name: "New Person", email: "new@example.test", role: "VIEWER" }, meta),
      /Available on Premium/,
    );
    await expectPlanLimit(listAuditLog(free, {}), /Available on Premium/);
  });

  it("Pro: payments and reports work; documents and more users still need Premium", async () => {
    const { owner } = await setUp(["101"]);
    await setAccount({ plan: "PRO" });
    const pro = await refreshAccess(owner);
    await expect(runReport(pro, "expiry", { days: 365 })).resolves.toBeTruthy();
    await expectPlanLimit(
      createUser(pro, { name: "New Person", email: "new@example.test", role: "VIEWER" }, meta),
      /Available on Premium/,
    );
  });

  it("custom reminder lead times need Pro; going back to the standard ones is always allowed", async () => {
    const { owner, unitType } = await setUp(["101"]);
    await setAccount({ plan: "FREE" });
    const free = await refreshAccess(owner);
    const custom = { leadDays: [45], repeat: "NONE", repeatWeekday: null, afterExpiryDays: 0 };
    await expectPlanLimit(
      updateUnitType(free, unitType.id, { name: unitType.name, reminderConfig: custom }, meta),
      /Available on Pro/,
    );
    await expectPlanLimit(
      updateSettings(free, { reminderDefaults: custom }, meta),
      /Available on Pro/,
    );
    await expect(
      updateUnitType(free, unitType.id, { name: unitType.name, reminderConfig: null }, meta),
    ).resolves.toBeTruthy();
  });
});

describe("unit limits", () => {
  it("Free allows 3 units: the 4th is refused, one by one or in bulk, and restoring counts too", async () => {
    const { owner, building, unitType, units } = await setUp(["101", "102"]);
    await setAccount({ plan: "FREE" });
    const free = await refreshAccess(owner);
    await createUnit(
      free,
      { buildingId: building.id, unitNumber: "103", unitTypeId: unitType.id },
      meta,
    );
    await expectPlanLimit(
      createUnit(
        free,
        { buildingId: building.id, unitNumber: "104", unitTypeId: unitType.id },
        meta,
      ),
      /Free plan includes up to 3 units/,
    );
    await expectPlanLimit(
      createUnits(
        free,
        { buildingId: building.id, unitTypeId: unitType.id, unitNumbers: "201 to 202" },
        meta,
      ),
    );
    await setUnitArchived(free, units[0]!.id, true, meta);
    await createUnit(
      free,
      { buildingId: building.id, unitNumber: "104", unitTypeId: unitType.id },
      meta,
    );
    await expectPlanLimit(setUnitArchived(free, units[0]!.id, false, meta));
    expect(await db.unit.count({ where: { archivedAt: null } })).toBe(3);
  });

  it("two people adding the last unit at the same moment can't both get it", async () => {
    const { owner, building, unitType } = await setUp(["101", "102"]);
    await setAccount({ plan: "FREE" });
    const free = await refreshAccess(owner);
    const add = (n: string) =>
      createUnit(free, { buildingId: building.id, unitNumber: n, unitTypeId: unitType.id }, meta);
    const results = await Promise.allSettled([add("103"), add("104")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.unit.count({ where: { archivedAt: null } })).toBe(3);
  });
});

describe("read-only after a downgrade", () => {
  it("over the limit: looking and exporting work, changes are refused, archiving units gets it back", async () => {
    const { owner, building, unitType, units } = await setUp(["101", "102", "103", "104"]);
    const tenant = await makeTenant(owner);
    await setAccount({ plan: "PREMIUM", trialEndsAt: new Date(Date.now() - DAY) });
    let free = await refreshAccess(owner);
    expect(free.access).toMatchObject({ plan: "FREE", readOnly: true });

    await expectPlanLimit(
      createLease(free, { unitId: units[0]!.id, tenantId: tenant.id, ...terms() }, meta),
      /read-only/,
    );
    await expectPlanLimit(
      updateUnit(
        free,
        units[0]!.id,
        { buildingId: building.id, unitNumber: "101A", unitTypeId: unitType.id },
        meta,
      ),
      /read-only/,
    );
    await expect(
      exportLeases(free, { format: "csv", columns: ["refNo"], filters: {} }, meta),
    ).resolves.toBeTruthy();

    await setUnitArchived(free, units[3]!.id, true, meta);
    free = await refreshAccess(free);
    expect(free.access.readOnly).toBe(false);
    await expect(
      createLease(free, { unitId: units[0]!.id, tenantId: tenant.id, ...terms() }, meta),
    ).resolves.toBeTruthy();
  });
});

describe("user limits", () => {
  it("Premium includes 5 people: the 6th is refused, adding or turning back on", async () => {
    const owner = await makeUser("OWNER");
    for (let i = 0; i < 3; i++) await makeUser("LEASING_STAFF");
    const fifth = await createUser(
      owner,
      { name: "Fifth", email: "fifth@example.test", role: "VIEWER" },
      meta,
    );
    await expectPlanLimit(
      createUser(owner, { name: "Sixth", email: "sixth@example.test", role: "VIEWER" }, meta),
      /up to 5 users/,
    );
    await setUserActive(owner, fifth.user.id, false, meta);
    const sixth = await createUser(
      owner,
      { name: "Sixth", email: "sixth@example.test", role: "VIEWER" },
      meta,
    );
    await expectPlanLimit(setUserActive(owner, fifth.user.id, true, meta));
    expect(sixth.user).toBeTruthy();
  });

  it("after a downgrade only the Owner can sign in; the others are paused, not deleted", async () => {
    const owner = await makeUser("OWNER");
    const staff = await makeUser("LEASING_STAFF");
    const ownerSession = await createSession(owner.id, TEST_ACCOUNT_ID, meta);
    const staffSession = await createSession(staff.id, TEST_ACCOUNT_ID, meta);
    await setAccount({ plan: "PRO" });

    expect(await validateSessionToken(ownerSession.token)).not.toBeNull();
    expect(await validateSessionToken(staffSession.token)).toBeNull();
    expect(await signIn(staff.email, DEFAULT_PASSWORD, meta)).toEqual({
      ok: false,
      reason: "user_limit",
    });
    const membership = await db.membership.findFirstOrThrow({ where: { userId: staff.id } });
    expect(membership.isActive).toBe(true);

    // Upgrading gives the sign-in back straight away.
    await setAccount({ plan: "PREMIUM" });
    expect(await signIn(staff.email, DEFAULT_PASSWORD, meta)).toMatchObject({ ok: true });
  });
});

describe("trial reminder emails", () => {
  // 4 Nov 2026, 09:00 in Manila.
  const NOW = new Date("2026-11-04T01:00:00Z");
  const endOfDay = (iso: string) => new Date(`${iso}T23:59:59.999+08:00`);

  it("go to the Owner and Admins 7 days and 1 day before, once each", async () => {
    await makeUser("OWNER", { email: "owner@company.example" });
    await makeUser("ADMIN", { email: "admin@company.example" });
    await makeUser("LEASING_STAFF", { email: "staff@company.example" });
    await setAccount({ plan: "PREMIUM", trialEndsAt: endOfDay("2026-11-11") });

    expect(await sendTrialReminders(new Date(NOW.getTime() - DAY))).toEqual({ sent: 0, failed: 0 });
    expect(await sendTrialReminders(NOW)).toEqual({ sent: 1, failed: 0 });
    expect(logOutbox.flatMap((m) => m.to).sort()).toEqual([
      "admin@company.example",
      "owner@company.example",
    ]);
    expect(logOutbox[0]!.subject).toBe("Your free Premium trial ends in 7 days");

    expect(await sendTrialReminders(NOW)).toEqual({ sent: 0, failed: 0 });
    expect(await sendTrialReminders(new Date(NOW.getTime() + 6 * DAY))).toEqual({
      sent: 1,
      failed: 0,
    });
    expect(logOutbox.at(-1)!.subject).toBe("Your free Premium trial ends tomorrow");
    expect(logOutbox).toHaveLength(4);
  });

  it("a failed send is tried again on the next run", async () => {
    await makeUser("OWNER");
    await setAccount({ plan: "PREMIUM", trialEndsAt: endOfDay("2026-11-11") });
    await expect(
      sendTrialReminders(NOW, { send: () => Promise.reject(new Error("SMTP down")) }),
    ).rejects.toThrow(/failed for 1 account/);
    expect(await sendTrialReminders(NOW)).toEqual({ sent: 1, failed: 0 });
  });
});

describe("platform admin: change plan", () => {
  it("applies straight away, replaces the trial, and is audited", async () => {
    await setUp(["101"]);
    await setAccount({ plan: "PREMIUM", trialEndsAt: new Date(Date.now() - DAY) });
    expect((await loadPlanAccess(TEST_ACCOUNT_ID)).plan).toBe("FREE");
    const admin = await asSystem(() =>
      db.platformAdmin.create({
        data: { email: "ana@propfolio.ph", name: "Ana Platform", passwordHash: "x" },
      }),
    );
    await changePlan(
      { ...admin, sessionId: "test" },
      TEST_ACCOUNT_ID,
      { plan: "PRO", reason: "Corporate deal" },
      meta,
    );
    expect((await loadPlanAccess(TEST_ACCOUNT_ID)).plan).toBe("PRO");
    const audit = await asSystem(() =>
      db.auditLog.findFirstOrThrow({ where: { action: "platform.plan_changed" } }),
    );
    expect(audit.metadata).toMatchObject({ reason: "Corporate deal" });
  });
});
