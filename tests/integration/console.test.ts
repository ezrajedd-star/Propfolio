import { beforeEach, describe, expect, it } from "vitest";

import { asSystem, db } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import {
  changePlan,
  extendTrial,
  getAccountDetail,
  listAccounts,
  recordManualPayment,
  setAccountSuspended,
} from "@/server/platform/accounts";
import { issuePlatformSetupLink, validatePlatformSession } from "@/server/platform/auth";
import {
  addStaff,
  changeStaffRole,
  listStaff,
  resetStaffSignIn,
  setStaffActive,
} from "@/server/platform/staff";
import { assertPlatformCan, listStaffLog, writeStaffLog } from "@/server/platform/staff-log";
import { getTodayMetrics } from "@/server/platform/today";
import { listDemoRequests, setDemoRequestHandled } from "@/server/demo/service";
import { exportPayments } from "@/server/subscription/export";
import { TEST_ACCOUNT_ID, makeAccount, makeStaff, makeUser, meta, resetDb } from "./helpers";

beforeEach(resetDb);

const NOW = new Date("2026-11-26T02:00:00Z"); // Thu 26 Nov 2026, 10:00 Manila

describe("console roles are enforced in every service", () => {
  it("Read-only can look but not change anything", async () => {
    const ro = await makeStaff("PLATFORM_READONLY");
    await expect(listAccounts(ro, {}, NOW)).resolves.toBeDefined();
    await expect(getAccountDetail(ro, TEST_ACCOUNT_ID, NOW)).resolves.toBeDefined();
    await expect(getTodayMetrics(ro, NOW)).resolves.toBeDefined();
    await expect(
      extendTrial(ro, TEST_ACCOUNT_ID, { trialEndsOn: "2026-12-31", reason: "x" }, meta, NOW),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      changePlan(ro, TEST_ACCOUNT_ID, { plan: "PRO", reason: "x" }, meta),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      exportPayments(ro, { from: "2026-11-01", to: "2026-11-30" }, meta),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listStaff(ro)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listStaffLog(ro)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("Support can use support tools but not billing, staff or the staff log", async () => {
    const support = await makeStaff("PLATFORM_SUPPORT");
    await extendTrial(
      support,
      TEST_ACCOUNT_ID,
      { trialEndsOn: "2026-12-31", reason: "Still importing" },
      meta,
      NOW,
    );
    await expect(
      recordManualPayment(
        support,
        TEST_ACCOUNT_ID,
        { amount: "1500", paidUntil: "2026-12-31", reference: "R1" },
        meta,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      setAccountSuspended(support, TEST_ACCOUNT_ID, true, { reason: "x" }, meta, NOW),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      changePlan(support, TEST_ACCOUNT_ID, { plan: "PRO", reason: "x" }, meta),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      addStaff(support, { name: "X", email: "x@propfolio.test", role: "PLATFORM_OWNER" }, meta),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listStaffLog(support)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      exportPayments(support, { from: "2026-11-01", to: "2026-11-30" }, meta),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it("pipeline lists are open to read-only; marking handled needs Support", async () => {
    const ro = await makeStaff("PLATFORM_READONLY");
    const support = await makeStaff("PLATFORM_SUPPORT");
    const req = await asSystem(() =>
      db.demoRequest.create({
        data: {
          name: "Made Up",
          email: "made.up@example.test",
          company: "Example Co",
          units: "1–10",
        },
      }),
    );
    await expect(listDemoRequests(ro)).resolves.toHaveLength(1);
    await expect(setDemoRequestHandled(ro, req.id, true, meta)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await setDemoRequestHandled(support, req.id, true, meta);
  });

  it("assertPlatformCan names the role in plain words", () => {
    expect(() =>
      assertPlatformCan({ id: "x", name: "x", role: "PLATFORM_READONLY" }, "billing.manage"),
    ).toThrow(/Platform Read-only/);
  });
});

describe("staff log", () => {
  it("is append-only and kept apart from customer work", async () => {
    const owner = await makeStaff("PLATFORM_OWNER");
    await asSystem(() =>
      writeStaffLog({ actor: owner, kind: "VIEW", action: "console.today_viewed", meta }),
    );
    await expect(
      asSystem(() => db.staffLog.updateMany({ data: { action: "changed" } })),
    ).rejects.toThrow(/append-only/);
    await expect(asSystem(() => db.staffLog.deleteMany({}))).rejects.toThrow(/append-only/);
    // Customer work (the tenant role) can't read it at all.
    await expect(db.staffLog.findMany()).rejects.toThrow();
  });

  it("records changes with the account, and never secrets", async () => {
    const owner = await makeStaff("PLATFORM_OWNER");
    await extendTrial(
      owner,
      TEST_ACCOUNT_ID,
      { trialEndsOn: "2026-12-31", reason: "Asked nicely" },
      meta,
      NOW,
    );
    await asSystem(() =>
      writeStaffLog({
        actor: owner,
        kind: "SETTING",
        action: "test",
        metadata: { password: "hunter22", token: "abc", note: "kept" },
      }),
    );
    const { rows } = await listStaffLog(owner);
    expect(rows[1]).toMatchObject({
      kind: "CHANGE",
      action: "platform.trial_extended",
      accountId: TEST_ACCOUNT_ID,
      adminName: owner.name,
      adminRole: "PLATFORM_OWNER",
      ipAddress: meta.ipAddress,
    });
    expect(rows[0]!.metadata).toEqual({
      password: "[redacted]",
      token: "[redacted]",
      note: "kept",
    });
  });

  it("filters by person and kind, newest first", async () => {
    const a = await makeStaff("PLATFORM_OWNER", "Ana");
    const b = await makeStaff("PLATFORM_SUPPORT", "Ben");
    await asSystem(async () => {
      await writeStaffLog({ actor: a, kind: "VIEW", action: "one" });
      await writeStaffLog({ actor: b, kind: "VIEW", action: "two" });
      await writeStaffLog({ actor: b, kind: "EXPORT", action: "three" });
    });
    expect((await listStaffLog(a, { adminId: b.id })).rows.map((r) => r.action)).toEqual([
      "three",
      "two",
    ]);
    expect((await listStaffLog(a, { kind: "EXPORT" })).rows.map((r) => r.action)).toEqual([
      "three",
    ]);
  });

  it("platform sign-in events go to the staff log", async () => {
    await issuePlatformSetupLink({ email: "new@propfolio.test", name: "New" }, NOW);
    const rows = await asSystem(() => db.staffLog.findMany());
    expect(rows.map((r) => r.action)).toContain("platform.setup_link_issued");
  });
});

describe("staff management (Platform Owner)", () => {
  it("adds people with a one-time link; new people get the role chosen", async () => {
    const owner = await makeStaff("PLATFORM_OWNER");
    const link = await addStaff(
      owner,
      { name: "Sam Support", email: "Sam@Propfolio.test", role: "PLATFORM_SUPPORT" },
      meta,
      NOW,
    );
    expect(link).toMatch(/\/platform\/setup\?token=/);
    const sam = (await listStaff(owner)).find((s) => s.email === "sam@propfolio.test")!;
    expect(sam).toMatchObject({ role: "PLATFORM_SUPPORT", isActive: true, totpConfirmedAt: null });
    await expect(
      addStaff(owner, { name: "Again", email: "sam@propfolio.test", role: "PLATFORM_OWNER" }, meta),
    ).rejects.toThrow(/already on the staff list/);
    const log = (await listStaffLog(owner, { kind: "SETTING" })).rows.map((r) => r.action);
    expect(log).toContain("staff.added");
  });

  it("changes roles but never leaves the console without an Owner, or changes your own", async () => {
    const owner = await makeStaff("PLATFORM_OWNER");
    const other = await makeStaff("PLATFORM_SUPPORT");
    await expect(
      changeStaffRole(owner, owner.id, { role: "PLATFORM_SUPPORT" }, meta),
    ).rejects.toBeInstanceOf(ValidationError);
    await changeStaffRole(owner, other.id, { role: "PLATFORM_OWNER" }, meta);
    // Two owners now: one may demote the other.
    await changeStaffRole(owner, other.id, { role: "PLATFORM_READONLY" }, meta);
    const roles = Object.fromEntries((await listStaff(owner)).map((s) => [s.id, s.role]));
    expect(roles[other.id]).toBe("PLATFORM_READONLY");
  });

  it("turning someone off ends their sessions; they can be turned back on", async () => {
    const owner = await makeStaff("PLATFORM_OWNER");
    const other = await makeStaff("PLATFORM_SUPPORT");
    await asSystem(() =>
      db.platformSession.create({
        data: {
          tokenHash: "h".repeat(64),
          adminId: other.id,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      }),
    );
    await setStaffActive(owner, other.id, false, meta);
    const sessions = await asSystem(() =>
      db.platformSession.findMany({ where: { adminId: other.id } }),
    );
    expect(sessions.every((s) => s.revokedAt)).toBe(true);
    await expect(setStaffActive(owner, owner.id, false, meta)).rejects.toThrow(/your own role/);
    await setStaffActive(owner, other.id, true, meta);
    expect((await listStaff(owner)).find((s) => s.id === other.id)?.isActive).toBe(true);
  });

  it("resets someone's sign-in with a new link, but not your own", async () => {
    const owner = await makeStaff("PLATFORM_OWNER");
    const other = await makeStaff("PLATFORM_SUPPORT");
    await expect(resetStaffSignIn(owner, owner.id, meta)).rejects.toBeInstanceOf(ValidationError);
    const link = await resetStaffSignIn(owner, other.id, meta);
    expect(link).toMatch(/token=/);
    const row = await asSystem(() =>
      db.platformAdmin.findUniqueOrThrow({ where: { id: other.id } }),
    );
    expect(row).toMatchObject({ totpConfirmedAt: null, role: "PLATFORM_SUPPORT" });
  });

  it("a turned-off person's session stops working", async () => {
    const owner = await makeStaff("PLATFORM_OWNER");
    const other = await makeStaff("PLATFORM_SUPPORT");
    await asSystem(() =>
      db.platformSession.create({
        data: {
          tokenHash: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918",
          adminId: other.id,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      }),
    );
    expect((await validatePlatformSession("admin"))?.role).toBe("PLATFORM_SUPPORT");
    await setStaffActive(owner, other.id, false, meta);
    expect(await validatePlatformSession("admin")).toBeNull();
  });
});

describe("Today", () => {
  it("counts sign-ups, trials ending, paying customers, MRR and cancellations", async () => {
    const owner = await makeStaff("PLATFORM_OWNER");
    const day = 86_400_000;
    // Created this week (Mon 23 Nov) and today; one last week.
    const a = await makeAccount("A");
    const b = await makeAccount("B");
    const c = await makeAccount("C");
    await asSystem(async () => {
      await db.account.update({
        where: { id: TEST_ACCOUNT_ID },
        data: { createdAt: new Date("2026-10-01T00:00:00Z") },
      });
      await db.account.update({
        where: { id: a },
        data: {
          createdAt: new Date("2026-11-26T01:00:00Z"),
          trialEndsAt: new Date(NOW.getTime() + 3 * day),
        },
      });
      await db.account.update({
        where: { id: b },
        data: {
          createdAt: new Date("2026-11-23T01:00:00Z"),
          plan: "PRO",
          paidUntil: new Date("2026-12-31"),
        },
      });
      await db.account.update({
        where: { id: c },
        data: { createdAt: new Date("2026-11-18T01:00:00Z"), plan: "PREMIUM" },
      });
      await db.subscription.create({
        data: {
          accountId: c,
          plan: "PREMIUM",
          status: "ACTIVE",
          provider: "demo",
          currentPeriodStart: new Date("2026-11-18"),
          currentPeriodEnd: new Date("2026-12-17"),
        },
      });
      await db.auditLog.create({
        data: {
          accountId: c,
          action: "subscription.cancel_scheduled",
          entityType: "Subscription",
          at: NOW,
        },
      });
    });
    const m = await getTodayMetrics(owner, NOW);
    expect(m.signUps).toEqual({ today: 1, thisWeek: 2, lastWeek: 1 });
    expect(m.trialsEndingIn7Days).toBe(1);
    expect(m.payingByPlan).toEqual({ FREE: 0, PRO: 1, PREMIUM: 1 });
    expect(m.payingTotal).toBe(2);
    expect(m.mrr).toBe("5000.00");
    expect(m.cancellationsThisMonth).toBe(1);
  });
});

describe("Accounts", () => {
  it("filters by plan, status and trial end", async () => {
    const owner = await makeStaff("PLATFORM_OWNER");
    const a = await makeAccount("Trial Soon");
    const b = await makeAccount("Suspended Pro");
    await asSystem(async () => {
      await db.account.update({
        where: { id: a },
        data: { trialEndsAt: new Date(NOW.getTime() + 2 * 86_400_000) },
      });
      await db.account.update({ where: { id: b }, data: { plan: "PRO", status: "SUSPENDED" } });
    });
    const names = async (f: Parameters<typeof listAccounts>[1]) =>
      (await listAccounts(owner, f, NOW)).map((x) => x.name);
    expect(await names({ trial: "ending-7" })).toEqual(["Trial Soon"]);
    expect(await names({ plan: "PRO" })).toEqual(["Suspended Pro"]);
    expect(await names({ status: "SUSPENDED" })).toEqual(["Suspended Pro"]);
    expect(await names({ q: "trial" })).toEqual(["Trial Soon"]);
  });

  it("the account page shows people's names and roles and usage counts, never contact details of tenants", async () => {
    const owner = await makeStaff("PLATFORM_READONLY");
    await makeUser("OWNER", { name: "Olive Owner" });
    await makeUser("LEASING_STAFF", { name: "Lea Staff" });
    const d = await getAccountDetail(owner, TEST_ACCOUNT_ID, NOW);
    expect(d.users.map((u) => [u.name, u.role])).toEqual([
      ["Olive Owner", "OWNER"],
      ["Lea Staff", "LEASING_STAFF"],
    ]);
    expect(d).toHaveProperty("leases", 0);
    expect(d).toHaveProperty("lastActive");
    expect(JSON.stringify(d)).not.toMatch(/tenant/i);
  });
});
