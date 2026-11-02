import { beforeEach, describe, expect, it } from "vitest";

import { REPORT_IDS } from "@/domain/reports/definitions";
import { renderPrivacyNotice } from "@/schemas/settings";
import { forEachActiveAccount } from "@/server/accounts/each";
import { listAuditLog } from "@/server/audit-log/service";
import { getEntityHistory } from "@/server/audit-log/entity-history";
import { adminSendPasswordReset, requestPasswordReset } from "@/server/auth/passwords";
import { validateSessionToken } from "@/server/auth/session";
import { signIn } from "@/server/auth/sign-in";
import { overdueReport } from "@/server/billing/balances";
import { addOtherCharge, voidCharge } from "@/server/billing/charges";
import { exportOverdue } from "@/server/billing/export";
import {
  applyCredit,
  getLeaseLedger,
  getPaymentAcknowledgement,
  listPayments,
  openChargesForPayment,
  recordPayment,
  voidPayment,
} from "@/server/billing/payments";
import { getCalendarEvents } from "@/server/calendar/service";
import { getDashboard } from "@/server/dashboard";
import { MissingAccountScopeError, asSystem, db, runInAccount, setTestScope } from "@/server/db";
import {
  archiveDocument,
  documentLink,
  fileByKey,
  listDocuments,
  uploadDocument,
} from "@/server/documents/service";
import { NotFoundError, ValidationError } from "@/server/errors";
import { listFeedback, sendFeedback, setFeedbackDone } from "@/server/feedback/service";
import { exportLeases } from "@/server/leases/export";
import { getLeaseDraft, saveLeaseDraft } from "@/server/leases/drafts";
import { quickEditLease } from "@/server/leases/quick-edit";
import {
  createLease,
  getLease,
  listLeases,
  renewLease,
  setLeaseArchived,
  terminateLease,
  updateLease,
} from "@/server/leases/service";
import { getGridLayout, saveGridLayout } from "@/server/preferences";
import { anonymiseTenant, exportTenantData, recordsPastRetention } from "@/server/privacy/service";
import { listBuildings, setBuildingArchived, updateBuilding } from "@/server/property/buildings";
import { listUnitTypes, setUnitTypeArchived, updateUnitType } from "@/server/property/unit-types";
import { getUnit, listUnits, setUnitArchived, updateUnit } from "@/server/property/units";
import { markReminderHandled } from "@/server/reminders/handled";
import { listDigests } from "@/server/reminders/queries";
import { sendDailyDigest } from "@/server/reminders/digest-job";
import { exportReport } from "@/server/reports/export";
import { runReport } from "@/server/reports/service";
import { getSettings, updateSettings } from "@/server/settings/service";
import {
  getTenant,
  listTenants,
  searchTenantsForPicker,
  setTenantArchived,
  updateTenant,
} from "@/server/tenants/service";
import {
  createUser,
  getUser,
  listUsers,
  setUserActive,
  unlockUser,
  updateUser,
} from "@/server/users/service";
import {
  DEFAULT_PASSWORD,
  TEST_ACCOUNT_ID,
  makeAccount,
  makeProperty,
  makeTenant,
  makeUser,
  meta,
  resetDb,
  terms,
} from "./helpers";

beforeEach(resetDb);

const NOW = new Date("2026-04-10T02:00:00Z"); // 10 Apr 2026, Manila
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF");

/** Everything one account has, with names that make leaks easy to spot. */
async function seedAccount(label: string, accountId: string) {
  return runInAccount(accountId, async () => {
    const owner = await makeUser("OWNER", { name: `${label} Owner`, accountId });
    const staff = await makeUser("LEASING_STAFF", { name: `${label} Staff`, accountId });
    const { building, unitType, units } = await makeProperty(owner, {
      code: "TWR1",
      units: ["101", "102"],
    });
    await updateBuilding(
      owner,
      building.id,
      { name: `${label} Tower`, code: "TWR1", address: "1 Ayala Ave", type: "COMMERCIAL" },
      meta,
    );
    const tenant = await makeTenant(staff, `${label} Secret Tenant`);
    const lease = await createLease(
      staff,
      {
        unitId: units[0]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2026-01-01", endDate: "2026-12-31", monthlyRent: "50000" }),
      },
      meta,
      NOW,
    );
    const payment = await recordPayment(
      staff,
      {
        leaseId: lease.id,
        receivedDate: "2026-02-05",
        amount: "50000",
        method: "BANK_TRANSFER",
        reference: `${label}-REF`,
      },
      meta,
      NOW,
    );
    const charge = await addOtherCharge(
      staff,
      lease.id,
      { description: `${label} parking`, amount: "1500", dueDate: "2026-03-01" },
      meta,
    );
    const doc = await uploadDocument(
      staff,
      { leaseId: lease.id, category: "SIGNED_CONTRACT" },
      { name: `${label} contract.pdf`, bytes: PDF },
      meta,
    );
    await sendFeedback(staff, { pagePath: "/leases", message: `${label} feedback` }, meta);
    const [feedback] = await listFeedback(owner);
    return {
      accountId,
      owner,
      staff,
      building,
      unitType,
      units,
      tenant,
      lease,
      payment,
      charge,
      doc,
      feedback: feedback!,
    };
  });
}

type Seeded = Awaited<ReturnType<typeof seedAccount>>;

async function twoAccounts() {
  const a = await seedAccount("Alpha", TEST_ACCOUNT_ID);
  const b = await seedAccount("Bravo", await makeAccount("Bravo Leasing"));
  /** Run as B's people, in B's account. */
  const asB = <T>(fn: (b: Seeded) => Promise<T>) => runInAccount(b.accountId, () => fn(b));
  return { a, b, asB };
}

/** Text of any result, including file exports, to look for the other account's data. */
function textOf(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (typeof v === "bigint") return v.toString();
    const buf = v as { type?: unknown; data?: number[] } | null;
    if (buf && typeof buf === "object" && buf.type === "Buffer" && Array.isArray(buf.data)) {
      return Buffer.from(buf.data).toString("utf8");
    }
    return v;
  });
}

const ALPHA_MARKERS = [
  "Alpha Secret Tenant",
  "Alpha Tower",
  "Alpha Owner",
  "Alpha Staff",
  "Alpha-REF",
  "Alpha contract",
  "Alpha parking",
  "Alpha feedback",
];

describe("account separation: reading another account's records", () => {
  it("every lookup by id says 'not found'", async () => {
    const { a, asB } = await twoAccounts();
    await asB(async (b) => {
      const s = b.staff;
      const o = b.owner;
      const attempts: [string, () => Promise<unknown>][] = [
        ["getLease", () => getLease(s, a.lease.id, NOW)],
        ["getTenant", () => getTenant(s, a.tenant.id, NOW)],
        ["getUnit", () => getUnit(o, a.units[0]!.id, NOW)],
        ["getLeaseLedger", () => getLeaseLedger(s, a.lease.id, NOW)],
        ["openChargesForPayment", () => openChargesForPayment(s, a.lease.id, NOW)],
        ["getPaymentAcknowledgement", () => getPaymentAcknowledgement(s, a.payment.id)],
        ["documentLink", () => documentLink(s, a.doc.id, meta, NOW)],
        ["exportTenantData", () => exportTenantData(o, a.tenant.id, meta, NOW)],
        ["getUser", () => getUser(o, a.owner.id)],
      ];
      for (const [name, attempt] of attempts) {
        await expect(attempt(), name).rejects.toBeInstanceOf(NotFoundError);
      }
      // History and file lookups simply come back empty.
      expect(await getEntityHistory(o, "Lease", a.lease.id)).toEqual([]);
      expect(await fileByKey(a.doc.storageKey)).toBeNull();
      expect(await getLeaseDraft(s)).toBeNull();
    });
  });

  it("lists, searches, reports, exports, calendar and dashboard show only the account's own data", async () => {
    const { a, b } = await twoAccounts();
    const calls: [string, (x: Seeded) => Promise<unknown>][] = [
      ["listLeases", (x) => listLeases(x.staff, {}, NOW)],
      ["listTenants", (x) => listTenants(x.staff, { includeArchived: true })],
      ["searchTenantsForPicker", (x) => searchTenantsForPicker(x.staff, "Secret")],
      ["listUnits", (x) => listUnits(x.owner, {}, NOW)],
      ["listBuildings", (x) => listBuildings(x.owner, { includeArchived: true })],
      ["listUnitTypes", (x) => listUnitTypes(x.owner, { includeArchived: true })],
      ["listPayments", (x) => listPayments(x.staff, { from: "2026-01-01", to: "2026-12-31" })],
      ["overdueReport", (x) => overdueReport(x.staff, NOW)],
      ["exportOverdue", (x) => exportOverdue(x.staff, "csv", meta, NOW)],
      [
        "exportLeases",
        (x) =>
          exportLeases(
            x.staff,
            { format: "csv", columns: ["refNo", "tenant", "monthlyRent", "endDate"], filters: {} },
            meta,
            NOW,
          ),
      ],
      [
        "calendar",
        (x) => getCalendarEvents(x.staff, { from: "2026-01-01", to: "2026-12-31" }, NOW),
      ],
      ["dashboard", (x) => getDashboard(x.staff, NOW)],
      ["documents", (x) => listDocuments(x.staff, { tenantId: x.tenant.id })],
      ["auditLog", (x) => listAuditLog(x.owner, {})],
      ["users", (x) => listUsers(x.owner)],
      ["feedback", (x) => listFeedback(x.owner, { includeDone: true })],
      ["digests", (x) => listDigests(x.owner)],
      ["retention", (x) => recordsPastRetention(x.owner, NOW)],
      ["settings", () => getSettings()],
      ...REPORT_IDS.flatMap((id): [string, (x: Seeded) => Promise<unknown>][] => [
        [`report ${id}`, (x) => runReport(x.staff, id, { days: 365 }, NOW)],
        [`export ${id}`, (x) => exportReport(x.staff, id, { days: 365 }, "csv", meta, NOW)],
      ]),
    ];
    let compared = 0;
    for (const [name, call] of calls) {
      const alphaText = textOf(await runInAccount(a.accountId, () => call(a)));
      const bravoText = textOf(await runInAccount(b.accountId, () => call(b)));
      for (const marker of ALPHA_MARKERS)
        expect(bravoText, `${name}: ${marker}`).not.toContain(marker);
      // Where Alpha sees its own data, Bravo must see its own (so empty results can't pass).
      if (alphaText.includes("Alpha")) {
        expect(bravoText, name).toContain("Bravo");
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(20);
  });

  it("can't look across with search text or guessed filters either", async () => {
    const { a, asB } = await twoAccounts();
    await asB(async (b) => {
      expect(await listTenants(b.staff, { q: "Alpha" })).toHaveLength(0);
      expect(await searchTenantsForPicker(b.staff, "Alpha")).toHaveLength(0);
      expect((await listDocuments(b.staff, { tenantId: a.tenant.id })).rows).toEqual([]);
      expect((await listDocuments(b.staff, { leaseId: a.lease.id })).rows).toEqual([]);
    });
  });
});

describe("account separation: changing another account's records", () => {
  it("every change is refused and nothing in the other account moves", async () => {
    const { a, asB } = await twoAccounts();
    const auditBefore = await db.auditLog.count();

    await asB(async (b) => {
      const s = b.staff;
      const o = b.owner;
      const attempts: [string, () => Promise<unknown>][] = [
        ["updateLease", () => updateLease(s, a.lease.id, terms({ monthlyRent: "1" }), meta, NOW)],
        [
          "quickEditLease",
          () => quickEditLease(s, a.lease.id, { field: "remarks", value: "hacked" }, meta),
        ],
        [
          "renewLease",
          () =>
            renewLease(
              s,
              a.lease.id,
              terms({ startDate: "2027-01-01", endDate: "2027-12-31" }),
              meta,
              NOW,
            ),
        ],
        [
          "terminateLease",
          () =>
            terminateLease(
              s,
              a.lease.id,
              { terminationDate: "2026-06-30", reason: "x" },
              meta,
              NOW,
            ),
        ],
        ["setLeaseArchived", () => setLeaseArchived(s, a.lease.id, true, meta, NOW)],
        [
          "createLease on their unit",
          () =>
            createLease(
              s,
              { unitId: a.units[1]!.id, tenantId: b.tenant.id, ...terms() },
              meta,
              NOW,
            ),
        ],
        [
          "createLease for their tenant",
          () =>
            createLease(
              s,
              { unitId: b.units[1]!.id, tenantId: a.tenant.id, ...terms() },
              meta,
              NOW,
            ),
        ],
        [
          "updateTenant",
          () =>
            updateTenant(
              s,
              a.tenant.id,
              {
                type: "COMPANY",
                displayName: "hacked",
                privacyAcknowledged: true,
                privacyAckMethod: "EMAIL",
              },
              meta,
            ),
        ],
        ["setTenantArchived", () => setTenantArchived(s, a.tenant.id, true, meta)],
        ["anonymiseTenant", () => anonymiseTenant(o, a.tenant.id, { reason: "x" }, meta, NOW)],
        [
          "updateUnit",
          () =>
            updateUnit(
              o,
              a.units[0]!.id,
              { buildingId: b.building.id, unitNumber: "999", unitTypeId: b.unitType.id },
              meta,
            ),
        ],
        ["setUnitArchived", () => setUnitArchived(o, a.units[1]!.id, true, meta)],
        [
          "updateBuilding",
          () =>
            updateBuilding(
              o,
              a.building.id,
              { name: "hacked", code: "HACK", address: "x", type: "COMMERCIAL" },
              meta,
            ),
        ],
        ["setBuildingArchived", () => setBuildingArchived(o, a.building.id, true, meta)],
        ["updateUnitType", () => updateUnitType(o, a.unitType.id, { name: "hacked" }, meta)],
        ["setUnitTypeArchived", () => setUnitTypeArchived(o, a.unitType.id, true, meta)],
        [
          "recordPayment",
          () =>
            recordPayment(
              s,
              { leaseId: a.lease.id, receivedDate: "2026-04-01", amount: "1", method: "CASH" },
              meta,
              NOW,
            ),
        ],
        ["voidPayment", () => voidPayment(s, a.payment.id, { reason: "x" }, meta)],
        ["applyCredit", () => applyCredit(s, a.lease.id, meta)],
        [
          "addOtherCharge",
          () =>
            addOtherCharge(
              s,
              a.lease.id,
              { description: "x", amount: "1", dueDate: "2026-05-01" },
              meta,
            ),
        ],
        ["voidCharge", () => voidCharge(s, a.charge.id, { reason: "x" }, meta)],
        [
          "uploadDocument",
          () =>
            uploadDocument(
              s,
              { leaseId: a.lease.id, category: "OTHER" },
              { name: "x.pdf", bytes: PDF },
              meta,
            ),
        ],
        [
          "uploadDocument to their tenant",
          () =>
            uploadDocument(
              s,
              { tenantId: a.tenant.id, category: "OTHER" },
              { name: "x.pdf", bytes: PDF },
              meta,
            ),
        ],
        ["archiveDocument", () => archiveDocument(s, a.doc.id, { reason: "x" }, meta)],
        ["markReminderHandled", () => markReminderHandled(s, a.lease.id, {}, meta, NOW)],
        ["updateUser", () => updateUser(o, a.staff.id, { name: "hacked" }, meta)],
        ["setUserActive", () => setUserActive(o, a.staff.id, false, meta)],
        ["unlockUser", () => unlockUser(o, a.staff.id, meta)],
        ["adminSendPasswordReset", () => adminSendPasswordReset(o, a.staff.id, meta)],
        ["setFeedbackDone", () => setFeedbackDone(o, a.feedback.id, true, meta)],
      ];
      for (const [name, attempt] of attempts) {
        await expect(attempt(), name).rejects.toBeInstanceOf(Error);
      }
    });

    // Account A is exactly as it was.
    const lease = await getLease(a.staff, a.lease.id, NOW);
    expect(lease).toMatchObject({
      monthlyRent: "50000.00",
      archived: false,
      terminationDate: null,
      remarks: null,
    });
    expect((await getTenant(a.staff, a.tenant.id, NOW)).displayName).toBe("Alpha Secret Tenant");
    expect((await listBuildings(a.owner))[0]).toMatchObject({ name: "Alpha Tower", code: "TWR1" });
    expect((await listUnitTypes(a.owner)).map((t) => t.name)).not.toContain("hacked");
    expect((await listUnits(a.owner, {}, NOW)).map((u) => u.unitNumber).sort()).toEqual([
      "101",
      "102",
    ]);
    expect(await db.payment.count({ where: { status: "POSTED" } })).toBe(1);
    expect(await db.charge.count({ where: { status: "VOID" } })).toBe(0);
    expect(await db.document.count({ where: { archivedAt: null } })).toBe(1);
    expect(await db.lease.count()).toBe(1);
    expect((await getUser(a.owner, a.staff.id)).isActive).toBe(true);
    expect((await listFeedback(a.owner))[0]?.id).toBe(a.feedback.id);
    // Nothing was written to account A's audit log by the attempts.
    expect(await db.auditLog.count()).toBe(auditBefore);
  });

  it("saved layouts and drafts are per account", async () => {
    const { a, asB } = await twoAccounts();
    const layout = await saveGridLayout(a.staff, { groupByBuilding: true });
    await saveLeaseDraft(a.staff, { step: 2, values: { tenantName: "Alpha draft" } });
    await asB(async (b) => {
      expect(await getGridLayout(b.staff)).not.toEqual(layout);
      expect(await getLeaseDraft(b.staff)).toBeNull();
    });
    expect(await getLeaseDraft(a.staff)).toMatchObject({ step: 2 });
  });
});

describe("account separation: the database lock (row-level security)", () => {
  it("raw SQL inside an account's transaction only sees and changes that account's rows", async () => {
    const { a, asB } = await twoAccounts();
    await asB(async () => {
      const result = await db.$transaction(async (tx) => {
        const [tenants] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Tenant"`;
        const [users] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "User"`;
        const updated =
          await tx.$executeRaw`UPDATE "Lease" SET "remarks" = 'hacked' WHERE id = ${a.lease.id}::uuid`;
        const sessions = await tx.$queryRaw<
          { n: bigint }[]
        >`SELECT count(*) AS n FROM "Session"`.catch((e: unknown) => e);
        return { tenants: Number(tenants!.n), users: Number(users!.n), updated, sessions };
      });
      expect(result).toMatchObject({ tenants: 1, users: 2, updated: 0 });
      // Sign-in internals aren't reachable at all.
      expect(String(result.sessions)).toMatch(/permission denied/);

      // Writing a row into the other account is refused by the database itself.
      await expect(
        db.$transaction(
          (tx) =>
            tx.$executeRaw`INSERT INTO "Feedback" (id, "accountId", "userName", role, "pagePath", message)
              VALUES (gen_random_uuid(), ${a.accountId}::uuid, 'x', 'ADMIN', '/', 'planted')`,
        ),
      ).rejects.toThrow(/row-level security/);
    });
    expect((await getLease(a.staff, a.lease.id, NOW)).remarks ?? null).toBeNull();
  });

  it("customers can't change their own plan, trial or suspension, only their name", async () => {
    await expect(
      db.$transaction((tx) =>
        tx.account.update({
          where: { id: TEST_ACCOUNT_ID },
          data: { plan: "PREMIUM", paidUntil: new Date("2099-01-01") },
        }),
      ),
    ).rejects.toThrow(/permission denied/);
    await db.$transaction((tx) =>
      tx.account.update({ where: { id: TEST_ACCOUNT_ID }, data: { name: "Renamed" } }),
    );
    expect((await getSettings()).companyName).toBe("Renamed");
  });

  it("a query with no account is refused instead of reading everyone's data", async () => {
    await twoAccounts();
    setTestScope(null);
    await expect(db.lease.count()).rejects.toBeInstanceOf(MissingAccountScopeError);
    await expect(db.$transaction((tx) => tx.lease.count())).rejects.toBeInstanceOf(
      MissingAccountScopeError,
    );
    expect(await asSystem(() => db.lease.count())).toBe(2);
  });
});

describe("each account has its own numbering, codes and settings", () => {
  it("building codes can repeat across accounts; lease and payment numbers start at 1 in each", async () => {
    const { a, b } = await twoAccounts();
    expect(a.building.code).toBe(b.building.code);
    expect(a.lease.refNo).toBe("LSE-2026-0001");
    expect(b.lease.refNo).toBe("LSE-2026-0001");
    expect(a.payment.paymentNo).toBe("PAY-2026-0001");
    expect(b.payment.paymentNo).toBe("PAY-2026-0001");
  });

  it("settings are separate, and the privacy notice names the lessor and its address", async () => {
    const { a, asB } = await twoAccounts();
    await updateSettings(
      a.owner,
      {
        companyName: "Alpha Realty Corp.",
        companyAddress: "1 Ayala Ave, Makati",
        retentionYears: 7,
      },
      meta,
    );
    const alpha = await getSettings();
    const notice = renderPrivacyNotice(alpha);
    expect(notice).toContain('Alpha Realty Corp. ("we"), 1 Ayala Ave, Makati, collects');
    expect(notice).toContain("personal information controller");
    expect(notice).not.toContain("Propfolio");

    await asB(async () => {
      const bravo = await getSettings();
      expect(bravo).toMatchObject({
        companyName: "Bravo Leasing",
        retentionYears: 10,
        companyAddress: "",
      });
      expect(renderPrivacyNotice(bravo)).toContain("[address: add it in Settings → General]");
    });
  });
});

describe("signing in with accounts", () => {
  it("someone in two accounts works in the one they used last, and sees only its data", async () => {
    const { a, b } = await twoAccounts();
    // Alpha's staff member also helps Bravo, as a Viewer.
    await asSystem(() =>
      db.membership.create({
        data: { accountId: b.accountId, userId: a.staff.id, role: "VIEWER" },
      }),
    );
    const first = await signIn(a.staff.email, DEFAULT_PASSWORD, meta, NOW);
    if (!first.ok) throw new Error("sign-in failed");
    expect(await validateSessionToken(first.token, NOW)).toMatchObject({
      accountId: TEST_ACCOUNT_ID,
      user: { role: "LEASING_STAFF" },
    });

    await asSystem(() =>
      db.membership.update({
        where: { accountId_userId: { accountId: b.accountId, userId: a.staff.id } },
        data: { lastUsedAt: new Date(NOW.getTime() + 60_000) },
      }),
    );
    const second = await signIn(a.staff.email, DEFAULT_PASSWORD, meta, new Date(NOW.getTime() - 1));
    if (!second.ok) throw new Error("sign-in failed");
    const session = await validateSessionToken(second.token, NOW);
    expect(session).toMatchObject({ accountId: b.accountId, user: { role: "VIEWER" } });
  });

  it("turning someone off in one account leaves their other account working", async () => {
    const { a, b } = await twoAccounts();
    await asSystem(() =>
      db.membership.create({
        data: { accountId: b.accountId, userId: a.staff.id, role: "LEASING_STAFF" },
      }),
    );
    await setUserActive(a.owner, a.staff.id, false, meta);
    const r = await signIn(a.staff.email, DEFAULT_PASSWORD, meta, NOW);
    expect(r.ok && (await validateSessionToken(r.token, NOW))?.accountId).toBe(b.accountId);
  });

  it("a suspended account can't be used: sign-in is refused and open sessions end", async () => {
    const { a } = await twoAccounts();
    const r = await signIn(a.staff.email, DEFAULT_PASSWORD, meta, NOW);
    if (!r.ok) throw new Error("sign-in failed");
    await asSystem(() =>
      db.account.update({ where: { id: a.accountId }, data: { status: "SUSPENDED" } }),
    );
    expect(await validateSessionToken(r.token, NOW)).toBeNull();
    expect(await signIn(a.staff.email, DEFAULT_PASSWORD, meta, NOW)).toEqual({
      ok: false,
      reason: "suspended",
    });
    // No reset link either.
    await requestPasswordReset(a.staff.email, meta, NOW);
    expect(await asSystem(() => db.passwordResetToken.count())).toBe(0);
  });

  it("sign-in events are recorded in the person's account, not in others", async () => {
    const { a, asB } = await twoAccounts();
    await signIn(a.staff.email, DEFAULT_PASSWORD, meta, NOW);
    await signIn(a.staff.email, "wrong password!", meta, NOW);
    const actions = (await listAuditLog(a.owner, {})).rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["auth.login", "auth.login_failed"]));
    await asB(async (b) => {
      const bActions = (await listAuditLog(b.owner, {})).rows.map((r) => r.action);
      expect(bActions).not.toContain("auth.login");
    });
  });
});

describe("the Owner", () => {
  it("can't be turned off or have their role changed, and isn't a role Admins can give", async () => {
    const { a } = await twoAccounts();
    const admin = await makeUser("ADMIN");
    await expect(setUserActive(admin, a.owner.id, false, meta)).rejects.toThrow(
      /Owner can't be turned off/,
    );
    await expect(updateUser(admin, a.owner.id, { role: "VIEWER" }, meta)).rejects.toThrow(
      /Owner's role can't be changed/,
    );
    await expect(updateUser(admin, a.staff.id, { role: "OWNER" }, meta)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      createUser(admin, { name: "New", email: "new@example.test", role: "OWNER" }, meta),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await getUser(admin, a.owner.id)).role).toBe("OWNER");
  });

  it("an Admin added to an account belongs to that account only", async () => {
    const { a, asB } = await twoAccounts();
    const { user } = await createUser(
      a.owner,
      { name: "Alpha New Admin", email: "alpha.admin@example.test", role: "ADMIN" },
      meta,
    );
    expect((await listUsers(a.owner)).map((u) => u.id)).toContain(user.id);
    await asB(async (b) => {
      expect((await listUsers(b.owner)).map((u) => u.id)).not.toContain(user.id);
    });
  });
});

describe("background jobs run per account", () => {
  it("each account gets its own reminder email, to its own people, about its own leases", async () => {
    const { b } = await twoAccounts();
    const sent: { to: string[]; text: string }[] = [];
    // A lease ending soon in each account, so both have something to send.
    for (const acc of [TEST_ACCOUNT_ID, b.accountId]) {
      await runInAccount(acc, async () => {
        const staff = await db.membership.findFirstOrThrow({ where: { role: "LEASING_STAFF" } });
        const unit = await db.unit.findFirstOrThrow({ where: { unitNumber: "102" } });
        const tenant = await db.tenant.findFirstOrThrow();
        await createLease(
          { id: staff.userId, name: "x", role: "LEASING_STAFF" },
          {
            unitId: unit.id,
            tenantId: tenant.id,
            ...terms({ startDate: "2025-05-01", endDate: "2026-07-09" }),
          },
          meta,
          NOW,
        );
      });
    }
    const results = await forEachActiveAccount(() =>
      sendDailyDigest(new Date("2026-04-10T22:00:00Z"), {
        send: async (mail) => {
          sent.push({ to: mail.to, text: mail.text });
        },
      }),
    );
    expect(results.map((r) => r.result?.status)).toEqual(["SENT", "SENT"]);
    expect(sent).toHaveLength(2);
    const [alphaMail, bravoMail] = [
      sent.find((m) => m.text.includes("Alpha"))!,
      sent.find((m) => m.text.includes("Bravo"))!,
    ];
    expect(alphaMail.text).not.toContain("Bravo");
    expect(bravoMail.text).not.toContain("Alpha");
    expect(alphaMail.to.some((e) => bravoMail.to.includes(e))).toBe(false);
  });

  it("skips suspended accounts", async () => {
    const { b } = await twoAccounts();
    await asSystem(() =>
      db.account.update({ where: { id: b.accountId }, data: { status: "SUSPENDED" } }),
    );
    const seen: string[] = [];
    await forEachActiveAccount(async (id) => {
      seen.push(id);
    });
    expect(seen).toEqual([TEST_ACCOUNT_ID]);
  });

  it("one account's failure doesn't stop the others, and is reported", async () => {
    const { b } = await twoAccounts();
    const seen: string[] = [];
    await expect(
      forEachActiveAccount(async (id) => {
        seen.push(id);
        if (id === TEST_ACCOUNT_ID) throw new TypeError("boom");
      }),
    ).rejects.toThrow(/1 of 2/);
    expect(seen).toContain(b.accountId);
  });
});
