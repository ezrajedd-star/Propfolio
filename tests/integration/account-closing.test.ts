import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";

import {
  closeAccount,
  deleteClosedAccountData,
  platformReopenAccount,
  reopenAccountWithLink,
  reopenableAccount,
  runClosedAccounts,
  type ClosingDeps,
} from "@/server/accounts/closing";
import { exportAccountData } from "@/server/accounts/export";
import { createSession, validateSessionToken } from "@/server/auth/session";
import { signIn } from "@/server/auth/sign-in";
import { recordPayment } from "@/server/billing/payments";
import { asSystem, db } from "@/server/db";
import { uploadDocument } from "@/server/documents/service";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createLease } from "@/server/leases/service";
import type { OutgoingMail } from "@/server/mail/transport";
import type { PlatformActor } from "@/server/platform/auth";
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

const NOW = new Date("2026-11-18T02:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF");
const admin: PlatformActor = {
  id: "0190f0a0-0000-7000-8000-000000000001",
  name: "Ana",
  email: "a@x.example",
  role: "PLATFORM_OWNER",
  sessionId: "s",
};

function mailbox() {
  const sent: OutgoingMail[] = [];
  const deps: ClosingDeps = { send: async (m) => void sent.push(m) };
  const link = () => /\/reopen-account\/([A-Za-z0-9_-]+)/.exec(sent.at(-1)!.html)![1]!;
  return { sent, deps, link };
}

async function setUp() {
  await asSystem(() =>
    db.account.update({ where: { id: TEST_ACCOUNT_ID }, data: { name: "Santos Realty" } }),
  );
  const owner = await makeUser("OWNER");
  const staff = await makeUser("LEASING_STAFF");
  const { units } = await makeProperty(owner);
  const tenant = await makeTenant(owner, "Secret Tenant Corp");
  const lease = await createLease(
    owner,
    { unitId: units[0]!.id, tenantId: tenant.id, ...terms() },
    meta,
    NOW,
  );
  await recordPayment(
    owner,
    {
      leaseId: lease.id,
      receivedDate: "2026-02-05",
      amount: "50000",
      method: "BANK_TRANSFER",
      reference: "R1",
    },
    meta,
    NOW,
  );
  await uploadDocument(
    owner,
    { leaseId: lease.id, category: "SIGNED_CONTRACT" },
    { name: "contract.pdf", bytes: PDF },
    meta,
  );
  return { owner, staff, lease };
}

const account = () =>
  asSystem(() => db.account.findUniqueOrThrow({ where: { id: TEST_ACCOUNT_ID } }));

describe("download all data", () => {
  it("the Owner gets every record in the import format; others can't", async () => {
    const { owner, staff } = await setUp();
    const { filename, body } = await exportAccountData(owner, meta, NOW);
    expect(filename).toBe("Santos Realty - all data 2026-11-18.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(body as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Buildings",
      "Units",
      "Tenants",
      "Leases",
      "Charges",
      "Payments",
      "Documents",
      "Read me",
    ]);
    expect(wb.getWorksheet("Tenants")!.getCell("A2").value).toBe("Secret Tenant Corp");
    expect(wb.getWorksheet("Leases")!.getRow(1).getCell(1).value).toBe("Building code*");
    expect(wb.getWorksheet("Payments")!.rowCount).toBe(2);
    expect(wb.getWorksheet("Documents")!.getCell("A2").value).toBe("contract.pdf");
    expect(await asSystem(() => db.auditLog.count({ where: { action: "account.export" } }))).toBe(
      1,
    );
    await expect(exportAccountData(staff, meta, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("closing an account", () => {
  it("needs the Owner and the account's name", async () => {
    const { owner, staff } = await setUp();
    const box = mailbox();
    await expect(
      closeAccount(staff, { confirmName: "Santos Realty" }, meta, NOW, box.deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const err = await closeAccount(owner, { confirmName: "Santos" }, meta, NOW, box.deps).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((await account()).status).toBe("ACTIVE");
  });

  it("signs everyone out, keeps the data 90 days, and the emailed link reopens it", async () => {
    const { owner, staff } = await setUp();
    const { token } = await createSession(staff.id, TEST_ACCOUNT_ID, meta, NOW);
    const box = mailbox();
    const r = await closeAccount(owner, { confirmName: "  santos realty " }, meta, NOW, box.deps);
    expect(r).toEqual({ deleteAfter: "2027-02-16" });
    expect(await account()).toMatchObject({ status: "CLOSED" });
    expect(await validateSessionToken(token, NOW)).toBeNull();
    expect(await signIn(staff.email, DEFAULT_PASSWORD, meta, NOW)).toMatchObject({
      ok: false,
      reason: "closed",
    });
    expect(box.sent[0]!.subject).toBe("Your Propfolio account is closed");
    expect(box.sent[0]!.text).toContain("16 Feb 2027");

    const link = box.link();
    expect(await reopenableAccount(link, NOW)).toMatchObject({ name: "Santos Realty" });
    await reopenAccountWithLink(link, meta, day(30));
    expect(await account()).toMatchObject({ status: "ACTIVE", closedAt: null, deleteAfter: null });
    expect(await signIn(staff.email, DEFAULT_PASSWORD, meta, day(30))).toMatchObject({ ok: true });
    // The link works once.
    await expect(reopenAccountWithLink(link, meta, day(30))).rejects.toThrow(
      /expired or was already used/,
    );
    // Nothing was lost.
    expect(await asSystem(() => db.lease.count({ where: { accountId: TEST_ACCOUNT_ID } }))).toBe(1);
  });

  it("reminds a week before, then deletes everything but Propfolio's payment records", async () => {
    const { owner } = await setUp();
    const other = await makeAccount();
    const both = await makeUser("ADMIN", { accountId: other });
    await asSystem(() =>
      db.membership.create({
        data: { accountId: TEST_ACCOUNT_ID, userId: both.id, role: "ADMIN" },
      }),
    );
    await asSystem(() =>
      db.subscriptionInvoice.create({
        data: {
          accountId: TEST_ACCOUNT_ID,
          number: "PF-2026-000001",
          plan: "PRO",
          description: "Pro",
          amount: "1500",
          method: "card",
          periodStart: new Date("2026-10-01"),
          periodEnd: new Date("2026-10-31"),
          customerName: "Santos Realty",
          customerAddress: "",
          provider: "xendit",
        },
      }),
    );
    const box = mailbox();
    await closeAccount(owner, { confirmName: "Santos Realty" }, meta, NOW, box.deps);

    expect(await runClosedAccounts(day(80), box.deps)).toEqual({ reminded: 0, deleted: 0 });
    expect(await runClosedAccounts(day(83), box.deps)).toEqual({ reminded: 1, deleted: 0 });
    expect(box.sent.at(-1)!.subject).toBe("Your Propfolio data will be deleted soon");
    expect(await runClosedAccounts(day(84), box.deps)).toEqual({ reminded: 0, deleted: 0 });
    expect(await runClosedAccounts(day(91), box.deps)).toEqual({ reminded: 0, deleted: 1 });

    const a = await account();
    expect(a).toMatchObject({ status: "CLOSED", name: "Closed account", reopenTokenHash: null });
    expect(a.dataDeletedAt).not.toBeNull();
    for (const model of [
      "lease",
      "tenant",
      "payment",
      "charge",
      "document",
      "unit",
      "building",
      "membership",
      "auditLog",
    ] as const) {
      const n = await asSystem(() =>
        (db[model] as unknown as { count: (a: unknown) => Promise<number> }).count({
          where:
            model === "auditLog"
              ? { accountId: TEST_ACCOUNT_ID, action: { not: "account.data_deleted" } }
              : { accountId: TEST_ACCOUNT_ID },
        }),
      );
      expect(n, model).toBe(0);
    }
    // The Owner is gone; someone who also works for another account keeps their sign-in there.
    expect(await asSystem(() => db.user.findUnique({ where: { id: owner.id } }))).toBeNull();
    expect(await asSystem(() => db.user.findUnique({ where: { id: both.id } }))).not.toBeNull();
    expect(
      await asSystem(() => db.auditLog.count({ where: { action: "account.data_deleted" } })),
    ).toBe(1);
    // The guard still holds for every other account.
    await asSystem(() =>
      db.auditLog.create({ data: { accountId: other, action: "test.entry", entityType: "Test" } }),
    );
    await expect(
      asSystem(() => db.auditLog.deleteMany({ where: { accountId: other } })),
    ).rejects.toThrow(/append-only/);
    // Propfolio's own payment record stays, for the bookkeeper and BIR.
    expect(
      await asSystem(() => db.subscriptionInvoice.count({ where: { accountId: TEST_ACCOUNT_ID } })),
    ).toBe(1);
    // Too late to reopen.
    await expect(platformReopenAccount(admin, TEST_ACCOUNT_ID, meta)).rejects.toThrow(
      /Only a closed account/,
    );
  });

  it("the platform admin can reopen a closed account", async () => {
    const { owner } = await setUp();
    await closeAccount(owner, { confirmName: "Santos Realty" }, meta, NOW, mailbox().deps);
    await platformReopenAccount(admin, TEST_ACCOUNT_ID, meta);
    expect((await account()).status).toBe("ACTIVE");
  });

  it("customer work can't use the audit log's deletion exception", async () => {
    await setUp();
    // Tests run as the customer account here, as on any customer request.
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('propfolio.purge_account', ${TEST_ACCOUNT_ID}, true)`;
        return tx.auditLog.deleteMany({ where: { accountId: TEST_ACCOUNT_ID } });
      }),
    ).rejects.toThrow(/append-only|permission denied/);
    expect(
      await asSystem(() => db.auditLog.count({ where: { accountId: TEST_ACCOUNT_ID } })),
    ).toBeGreaterThan(0);
  });

  it("an open account's data can never be deleted this way", async () => {
    await setUp();
    await expect(deleteClosedAccountData(TEST_ACCOUNT_ID, NOW)).rejects.toThrow(
      /Only a closed account/,
    );
  });
});
