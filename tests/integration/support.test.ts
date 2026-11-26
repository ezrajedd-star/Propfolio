import { beforeEach, describe, expect, it } from "vitest";

import { assertCan } from "@/server/auth/authorize";
import { signIn } from "@/server/auth/sign-in";
import { revokeSession, validateSessionToken } from "@/server/auth/session";
import { asSystem, db } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { listAuditLog } from "@/server/audit-log/service";
import type { OutgoingMail } from "@/server/mail/transport";
import {
  correctBillingDetails,
  findPendingSignUp,
  resendSignUpCodeForCustomer,
  resetTwoStepForCustomer,
  unlockUserForCustomer,
} from "@/server/platform/support-tools";
import {
  getSupportAccess,
  grantSupportAccess,
  revokeSupportAccess,
  startSupportSession,
} from "@/server/support-access/service";
import { createSession } from "@/server/auth/session";
import { TEST_ACCOUNT_ID, makeAccount, makeStaff, makeUser, meta, resetDb } from "./helpers";

beforeEach(resetDb);

const NOW = new Date();
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000);

const staffEntries = (action: string) =>
  asSystem(() => db.staffLog.findMany({ where: { action } }));
const auditEntries = (action: string) =>
  asSystem(() => db.auditLog.findMany({ where: { action } }));

describe("support tools", () => {
  it("are closed to Platform Read-only and need a reason", async () => {
    const ro = await makeStaff("PLATFORM_READONLY");
    const support = await makeStaff("PLATFORM_SUPPORT");
    const user = await makeUser("LEASING_STAFF");
    await expect(
      unlockUserForCustomer(ro, TEST_ACCOUNT_ID, user.id, { reason: "x" }, meta),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      unlockUserForCustomer(support, TEST_ACCOUNT_ID, user.id, { reason: " " }, meta),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      correctBillingDetails(ro, TEST_ACCOUNT_ID, { name: "X", address: "", reason: "x" }, meta),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(findPendingSignUp(ro, { email: "a@b.test" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("unlock clears the lock and is in the staff log and the customer's audit log", async () => {
    const support = await makeStaff("PLATFORM_SUPPORT");
    const owner = await makeUser("OWNER");
    const user = await makeUser("LEASING_STAFF");
    await asSystem(() =>
      db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 5, lockedUntil: hours(1) },
      }),
    );
    await unlockUserForCustomer(
      support,
      TEST_ACCOUNT_ID,
      user.id,
      { reason: "Ticket 12: typo" },
      meta,
    );
    const row = await asSystem(() => db.user.findUniqueOrThrow({ where: { id: user.id } }));
    expect(row).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
    expect(await staffEntries("support.user_unlocked")).toHaveLength(1);
    const customerLog = (await listAuditLog(owner, {})).rows;
    expect(customerLog.find((r) => r.action === "support.user_unlocked")?.metadata).toMatchObject({
      platform: true,
      reason: "Ticket 12: typo",
    });
  });

  it("only works on people in the account given", async () => {
    const support = await makeStaff("PLATFORM_SUPPORT");
    const other = await makeAccount();
    const stranger = await makeUser("LEASING_STAFF", { accountId: other });
    await expect(
      unlockUserForCustomer(support, TEST_ACCOUNT_ID, stranger.id, { reason: "x" }, meta),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("resetting two-step records the identity check and signs the person out", async () => {
    const support = await makeStaff("PLATFORM_SUPPORT");
    const user = await makeUser("ADMIN");
    await asSystem(() =>
      db.user.update({
        where: { id: user.id },
        data: { totpSecretEnc: "v1.x", totpConfirmedAt: NOW },
      }),
    );
    const s = await createSession(user.id, TEST_ACCOUNT_ID, meta);
    await expect(
      resetTwoStepForCustomer(support, TEST_ACCOUNT_ID, user.id, { reason: "lost phone" }, meta),
    ).rejects.toBeInstanceOf(ValidationError);
    await resetTwoStepForCustomer(
      support,
      TEST_ACCOUNT_ID,
      user.id,
      {
        reason: "Ticket 13: lost phone",
        identityMethod: "VIDEO_CALL_ID",
        identityNotes: "Driver's licence matched",
      },
      meta,
    );
    const row = await asSystem(() => db.user.findUniqueOrThrow({ where: { id: user.id } }));
    expect(row.totpConfirmedAt).toBeNull();
    expect(await validateSessionToken(s.token)).toBeNull();
    const [entry] = await auditEntries("support.two_step_reset");
    expect(entry!.metadata).toMatchObject({
      identityCheck: { method: "VIDEO_CALL_ID", notes: "Driver's licence matched" },
    });
    expect(entry!.accountId).toBe(TEST_ACCOUNT_ID);
  });

  it("correcting billing details changes future records only", async () => {
    const support = await makeStaff("PLATFORM_SUPPORT");
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
          customerName: "Old Name Inc.",
          customerAddress: "Old address",
          provider: "xendit",
        },
      }),
    );
    await correctBillingDetails(
      support,
      TEST_ACCOUNT_ID,
      { name: "New Name Corp.", address: "12 Ayala Ave, Makati", reason: "Ticket 14" },
      meta,
    );
    const account = await asSystem(() =>
      db.account.findUniqueOrThrow({ where: { id: TEST_ACCOUNT_ID } }),
    );
    expect(account.name).toBe("New Name Corp.");
    const setting = await asSystem(() =>
      db.setting.findUniqueOrThrow({
        where: { accountId_key: { accountId: TEST_ACCOUNT_ID, key: "companyAddress" } },
      }),
    );
    expect(setting.value).toBe("12 Ayala Ave, Makati");
    const invoice = await asSystem(() => db.subscriptionInvoice.findFirstOrThrow());
    expect(invoice.customerName).toBe("Old Name Inc.");
    const [entry] = await auditEntries("support.billing_details_corrected");
    expect(entry!.changes).toMatchObject({
      name: { before: "Test Leasing Co.", after: "New Name Corp." },
    });
  });

  it("resends a waiting sign-up's code and logs it", async () => {
    const support = await makeStaff("PLATFORM_SUPPORT");
    const pending = await asSystem(() =>
      db.pendingSignUp.create({
        data: {
          tokenHash: "t".repeat(64),
          email: "maria@example.test",
          name: "Maria",
          codeHash: "x",
          expiresAt: hours(-1),
        },
      }),
    );
    const found = await findPendingSignUp(support, { email: "MARIA@example.test" }, NOW);
    expect(found).toMatchObject({ id: pending.id, expired: true });
    const sent: OutgoingMail[] = [];
    await resendSignUpCodeForCustomer(
      support,
      pending.id,
      { reason: "Ticket 15: no email" },
      meta,
      NOW,
      { send: async (m) => void sent.push(m) },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual(["maria@example.test"]);
    const row = await asSystem(() =>
      db.pendingSignUp.findUniqueOrThrow({ where: { id: pending.id } }),
    );
    expect(row.codesSent).toBe(2);
    expect(row.expiresAt > NOW).toBe(true);
    expect(await staffEntries("support.signup_code_resent")).toHaveLength(1);
    expect(await findPendingSignUp(support, { email: "nobody@example.test" })).toBeNull();
  });
});

describe("customer-granted support access", () => {
  it("only the Owner or a User Admin can turn it on or off", async () => {
    const staff = await makeUser("LEASING_STAFF");
    const viewer = await makeUser("VIEWER");
    await expect(grantSupportAccess(staff, { duration: "24h" }, meta)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(grantSupportAccess(viewer, { duration: "24h" }, meta)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const admin = await makeUser("ADMIN");
    await expect(grantSupportAccess(admin, { duration: "1y" }, meta)).rejects.toBeInstanceOf(
      ValidationError,
    );
    const g = await grantSupportAccess(admin, { duration: "72h" }, meta, NOW);
    expect(g.expiresAt).toEqual(hours(72));
    expect((await getSupportAccess(staff, NOW))?.id).toBe(g.id);
    expect(await auditEntries("support_access.granted")).toHaveLength(1);
  });

  it("support can't open an account without it", async () => {
    const support = await makeStaff("PLATFORM_SUPPORT");
    await expect(startSupportSession(support, TEST_ACCOUNT_ID, meta)).rejects.toBeInstanceOf(
      ConflictError,
    );
    const ro = await makeStaff("PLATFORM_READONLY");
    await expect(startSupportSession(ro, TEST_ACCOUNT_ID, meta)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("a support session works like a User Admin, minus access, billing and data exports", async () => {
    const owner = await makeUser("OWNER");
    const support = await makeStaff("PLATFORM_SUPPORT", "Sam");
    await grantSupportAccess(owner, { duration: "24h" }, meta, NOW);
    const { token, expiresAt } = await startSupportSession(support, TEST_ACCOUNT_ID, meta, NOW);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(hours(8).getTime());
    const s = (await validateSessionToken(token, NOW))!;
    expect(s.user).toMatchObject({ role: "ADMIN", name: "Propfolio support (Sam)" });
    expect(s.support).toMatchObject({ adminId: support.id, adminName: "Sam" });
    const actor = { ...s.user, accountId: s.accountId, access: s.access, support: s.support };
    expect(() => assertCan(actor, "lease.edit")).not.toThrow();
    expect(() => assertCan(actor, "settings.manage")).not.toThrow();
    for (const p of [
      "user.manage",
      "billing.manage",
      "privacy.manage",
      "record.purge",
      "data.export",
    ] as const) {
      expect(() => assertCan(actor, p)).toThrow(ForbiddenError);
    }
    // It can't change the support access itself.
    await expect(grantSupportAccess(actor, { duration: "7d" }, meta)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(revokeSupportAccess(actor, meta)).rejects.toBeInstanceOf(ForbiddenError);
    // Logged in both places.
    expect(await staffEntries("support.session_started")).toHaveLength(1);
    expect((await auditEntries("support.session_started"))[0]!.accountId).toBe(TEST_ACCOUNT_ID);
  });

  it("turning it off ends open support sessions at once", async () => {
    const owner = await makeUser("OWNER");
    const support = await makeStaff("PLATFORM_SUPPORT");
    await grantSupportAccess(owner, { duration: "24h" }, meta, NOW);
    const { token } = await startSupportSession(support, TEST_ACCOUNT_ID, meta, NOW);
    await revokeSupportAccess(owner, meta, NOW);
    expect(await validateSessionToken(token, NOW)).toBeNull();
    expect(await getSupportAccess(owner, NOW)).toBeNull();
    await expect(startSupportSession(support, TEST_ACCOUNT_ID, meta)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("ends by itself when the time is up", async () => {
    const owner = await makeUser("OWNER");
    const support = await makeStaff("PLATFORM_SUPPORT");
    await grantSupportAccess(owner, { duration: "24h" }, meta, hours(-23.5));
    const { token } = await startSupportSession(support, TEST_ACCOUNT_ID, meta, NOW);
    expect(await validateSessionToken(token, NOW)).not.toBeNull();
    expect(await validateSessionToken(token, hours(0.6))).toBeNull();
  });

  it("one account's access never opens another account", async () => {
    const owner = await makeUser("OWNER");
    const support = await makeStaff("PLATFORM_SUPPORT");
    const other = await makeAccount();
    await grantSupportAccess(owner, { duration: "24h" }, meta, NOW);
    await expect(startSupportSession(support, other, meta, NOW)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("the stand-in support person can't sign in normally", async () => {
    const owner = await makeUser("OWNER");
    const support = await makeStaff("PLATFORM_SUPPORT");
    await grantSupportAccess(owner, { duration: "24h" }, meta, NOW);
    const { token } = await startSupportSession(support, TEST_ACCOUNT_ID, meta, NOW);
    const s = (await validateSessionToken(token, NOW))!;
    await revokeSession(s.sessionId);
    const shadow = await asSystem(() => db.user.findUniqueOrThrow({ where: { id: s.user.id } }));
    expect(shadow.isSupportStaff).toBe(true);
    expect(await asSystem(() => db.membership.count({ where: { userId: shadow.id } }))).toBe(0);
    expect((await signIn(shadow.email, "anything at all", meta)).ok).toBe(false);
  });
});
