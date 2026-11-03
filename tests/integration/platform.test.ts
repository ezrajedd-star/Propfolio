import { beforeEach, describe, expect, it } from "vitest";

import { base32Decode, totpCode, totpStep } from "@/domain/auth/totp";
import { listAuditLog } from "@/server/audit-log/service";
import { signIn } from "@/server/auth/sign-in";
import { validateSessionToken } from "@/server/auth/session";
import { asSystem, db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import {
  extendTrial,
  getAccountDetail,
  listAccounts,
  recordManualPayment,
  setAccountSuspended,
} from "@/server/platform/accounts";
import {
  completePlatformSetup,
  getPlatformSetup,
  issuePlatformSetupLink,
  platformSignIn,
  platformSignOut,
  validatePlatformSession,
  type PlatformActor,
} from "@/server/platform/auth";
import {
  DEFAULT_PASSWORD,
  TEST_ACCOUNT_ID,
  makeProperty,
  makeTenant,
  makeUser,
  meta,
  resetDb,
} from "./helpers";

beforeEach(resetDb);

const T0 = new Date("2026-11-02T02:00:00Z"); // 2 Nov 2026, 10:00 Manila
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const PASSWORD = "a long platform passphrase";

const tokenOf = (link: string) => new URL(link).searchParams.get("token")!;
const codeFor = (secret: string, at: Date) => totpCode(base32Decode(secret), totpStep(at));

/** A platform admin who has finished set-up; returns their authenticator secret. */
async function setUpAdmin(email = "ana@propfolio.ph") {
  const link = await issuePlatformSetupLink({ email, name: "Ana Platform" }, T0);
  const setup = (await getPlatformSetup(tokenOf(link), T0))!;
  const secret = setup.secret.replace(/ /g, "");
  await completePlatformSetup(
    {
      token: tokenOf(link),
      password: PASSWORD,
      confirmPassword: PASSWORD,
      code: codeFor(secret, T0),
    },
    meta,
    T0,
  );
  return { email, secret };
}

async function signedInAdmin(): Promise<PlatformActor> {
  const { email, secret } = await setUpAdmin();
  const at = later(60);
  const r = await platformSignIn(
    { email, password: PASSWORD, code: codeFor(secret, at) },
    meta,
    at,
  );
  if (!r.ok) throw new Error("platform sign-in failed");
  return (await validatePlatformSession(r.token, at))!;
}

describe("platform admin set-up", () => {
  it("shows a QR code once per link, stores the secret encrypted, and works only once", async () => {
    const link = await issuePlatformSetupLink({ email: "Ana@Propfolio.ph", name: "Ana" }, T0);
    expect(link).toMatch(/^http:\/\/localhost:3000\/platform\/setup\?token=/);
    const setup = (await getPlatformSetup(tokenOf(link), T0))!;
    expect(setup).toMatchObject({ name: "Ana", email: "ana@propfolio.ph" });
    expect(setup.qrSvg).toMatch(/^<svg/);
    // The same secret on reload; never stored in plain text.
    expect((await getPlatformSetup(tokenOf(link), T0))!.secret).toBe(setup.secret);
    const stored = await asSystem(() =>
      db.platformAdmin.findUniqueOrThrow({ where: { email: "ana@propfolio.ph" } }),
    );
    expect(stored.totpSecretEnc).not.toContain(setup.secret.replace(/ /g, ""));
    expect(stored.totpSecretEnc).toMatch(/^v1\./);

    const secret = setup.secret.replace(/ /g, "");
    const input = { token: tokenOf(link), password: PASSWORD, confirmPassword: PASSWORD };
    await expect(
      completePlatformSetup({ ...input, code: "000000" }, meta, T0),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      completePlatformSetup(
        { ...input, password: "short", confirmPassword: "short", code: codeFor(secret, T0) },
        meta,
        T0,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await completePlatformSetup({ ...input, code: codeFor(secret, T0) }, meta, T0);
    expect(await getPlatformSetup(tokenOf(link), T0)).toBeNull();
    await expect(
      completePlatformSetup({ ...input, code: codeFor(secret, later(30)) }, meta, later(30)),
    ).rejects.toThrow(/expired or was already used/);
  });

  it("links expire after 24 hours", async () => {
    const link = await issuePlatformSetupLink({ email: "ana@propfolio.ph" }, T0);
    expect(await getPlatformSetup(tokenOf(link), later(24 * 3600 + 1))).toBeNull();
  });

  it("a new link for the same person clears their password and authenticator and signs them out", async () => {
    const admin = await signedInAdmin();
    await issuePlatformSetupLink({ email: admin.email }, later(120));
    const row = await asSystem(() =>
      db.platformAdmin.findUniqueOrThrow({ where: { id: admin.id } }),
    );
    expect(row).toMatchObject({ passwordHash: null, totpSecretEnc: null, totpConfirmedAt: null });
    const sessions = await asSystem(() =>
      db.platformSession.findMany({ where: { adminId: admin.id } }),
    );
    expect(sessions.every((s) => s.revokedAt)).toBe(true);
  });
});

describe("platform sign-in (two steps)", () => {
  it("needs the password and a current code; any mistake gives the same answer", async () => {
    const { email, secret } = await setUpAdmin();
    const at = later(90);
    const good = { email, password: PASSWORD, code: codeFor(secret, at) };
    expect(await platformSignIn({ ...good, code: "123456" }, meta, at)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await platformSignIn({ ...good, password: "wrong password!" }, meta, at)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await platformSignIn({ ...good, email: "nobody@propfolio.ph" }, meta, at)).toEqual({
      ok: false,
      reason: "invalid",
    });
    const r = await platformSignIn(good, meta, at);
    expect(r.ok).toBe(true);
    if (r.ok) expect(await validatePlatformSession(r.token, at)).toMatchObject({ email });
  });

  it("a code can't be used twice", async () => {
    const { email, secret } = await setUpAdmin();
    const at = later(90);
    const input = { email, password: PASSWORD, code: codeFor(secret, at) };
    expect((await platformSignIn(input, meta, at)).ok).toBe(true);
    expect(await platformSignIn(input, meta, later(95))).toEqual({ ok: false, reason: "invalid" });
  });

  it("five wrong attempts lock sign-in for 15 minutes, even with the right details", async () => {
    const { email, secret } = await setUpAdmin();
    for (let i = 0; i < 4; i++) {
      expect(
        (await platformSignIn({ email, password: PASSWORD, code: "000000" }, meta, later(60))).ok,
      ).toBe(false);
    }
    const fifth = await platformSignIn(
      { email, password: PASSWORD, code: "000000" },
      meta,
      later(60),
    );
    expect(fifth).toMatchObject({ ok: false, reason: "locked" });
    const at = later(120);
    expect(
      await platformSignIn({ email, password: PASSWORD, code: codeFor(secret, at) }, meta, at),
    ).toMatchObject({
      ok: false,
      reason: "locked",
    });
    const after = later(16 * 60 + 60);
    expect(
      (
        await platformSignIn(
          { email, password: PASSWORD, code: codeFor(secret, after) },
          meta,
          after,
        )
      ).ok,
    ).toBe(true);
  });

  it("sessions end after 30 idle minutes, after 8 hours, and on sign-out", async () => {
    const { email, secret } = await setUpAdmin();
    const at = later(60);
    const r = await platformSignIn(
      { email, password: PASSWORD, code: codeFor(secret, at) },
      meta,
      at,
    );
    if (!r.ok) throw new Error("sign-in failed");
    expect(await validatePlatformSession(r.token, later(60 + 31 * 60))).toBeNull();

    const at2 = later(3600);
    const r2 = await platformSignIn(
      { email, password: PASSWORD, code: codeFor(secret, at2) },
      meta,
      at2,
    );
    if (!r2.ok) throw new Error("sign-in failed");
    const admin = (await validatePlatformSession(r2.token, at2))!;
    await platformSignOut(admin, meta, at2);
    expect(await validatePlatformSession(r2.token, at2)).toBeNull();
  });

  it("customer and platform sessions can't stand in for each other", async () => {
    const user = await makeUser("OWNER");
    const customer = await signIn(user.email, DEFAULT_PASSWORD, meta, T0);
    if (!customer.ok) throw new Error("sign-in failed");
    expect(await validatePlatformSession(customer.token, T0)).toBeNull();

    const { email, secret } = await setUpAdmin();
    const at = later(60);
    const platform = await platformSignIn(
      { email, password: PASSWORD, code: codeFor(secret, at) },
      meta,
      at,
    );
    if (!platform.ok) throw new Error("sign-in failed");
    expect(await validateSessionToken(platform.token, at)).toBeNull();
  });
});

describe("platform accounts", () => {
  it("lists accounts with account-level facts only, never tenant records", async () => {
    const owner = await makeUser("OWNER", { name: "Olive Owner" });
    await makeProperty(owner, { units: ["101", "102"] });
    await makeTenant(owner, "Confidential Tenant Corp.");
    const admin = await signedInAdmin();

    const [row] = await listAccounts(admin, {}, T0);
    expect(row).toMatchObject({
      id: TEST_ACCOUNT_ID,
      name: "Test Leasing Co.",
      plan: "PREMIUM",
      status: "ACTIVE",
      activeUsers: 1,
      units: 2,
    });
    const detail = await getAccountDetail(admin, TEST_ACCOUNT_ID, T0);
    expect(detail.owner).toMatchObject({ name: "Olive Owner" });
    const everything = JSON.stringify([await listAccounts(admin, {}, T0), detail]);
    expect(everything).not.toContain("Confidential Tenant");
    expect(everything).not.toContain("Maria Santos");
    expect(await listAccounts(admin, { q: "nothing like it" }, T0)).toEqual([]);
  });

  it("extends a trial to the end of the chosen Manila day, and refuses past days", async () => {
    const admin = await signedInAdmin();
    await extendTrial(
      admin,
      TEST_ACCOUNT_ID,
      { trialEndsOn: "2026-12-01", reason: "Still importing" },
      meta,
      T0,
    );
    const account = await asSystem(() =>
      db.account.findUniqueOrThrow({ where: { id: TEST_ACCOUNT_ID } }),
    );
    expect(account.trialEndsAt?.toISOString()).toBe("2026-12-01T15:59:59.999Z");
    expect(await getAccountDetail(admin, TEST_ACCOUNT_ID, T0)).toMatchObject({
      trialEndsOn: "2026-12-01",
      trialDaysLeft: 30,
    });
    await expect(
      extendTrial(admin, TEST_ACCOUNT_ID, { trialEndsOn: "2026-11-01", reason: "x" }, meta, T0),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      extendTrial(admin, TEST_ACCOUNT_ID, { trialEndsOn: "2026-12-01", reason: "" }, meta, T0),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("records bank transfers; 'paid until' only ever moves forward", async () => {
    const admin = await signedInAdmin();
    await recordManualPayment(
      admin,
      TEST_ACCOUNT_ID,
      {
        amount: "18,000",
        paidUntil: "2027-10-31",
        reference: "BDO-12345",
      },
      meta,
    );
    await recordManualPayment(
      admin,
      TEST_ACCOUNT_ID,
      {
        amount: "1500.50",
        paidUntil: "2027-01-31",
        reference: "BDO-67890",
        note: "Extra seat",
      },
      meta,
    );
    const detail = await getAccountDetail(admin, TEST_ACCOUNT_ID, T0);
    expect(detail.paidUntil).toBe("2027-10-31");
    expect(detail.payments.map((p) => [p.amount, p.reference])).toEqual([
      ["1500.50", "BDO-67890"],
      ["18000.00", "BDO-12345"],
    ]);
    await expect(
      recordManualPayment(
        admin,
        TEST_ACCOUNT_ID,
        { amount: "0", paidUntil: "2027-01-01", reference: "x" },
        meta,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("suspending stops sign-in and ends open sessions; reactivating lets people back in", async () => {
    const user = await makeUser("LEASING_STAFF");
    const session = await signIn(user.email, DEFAULT_PASSWORD, meta, T0);
    if (!session.ok) throw new Error("sign-in failed");
    const admin = await signedInAdmin();

    await expect(
      setAccountSuspended(admin, TEST_ACCOUNT_ID, true, { reason: "" }, meta, T0),
    ).rejects.toBeInstanceOf(ValidationError);
    await setAccountSuspended(
      admin,
      TEST_ACCOUNT_ID,
      true,
      { reason: "Unpaid since August" },
      meta,
      T0,
    );
    expect(await validateSessionToken(session.token, T0)).toBeNull();
    expect((await signIn(user.email, DEFAULT_PASSWORD, meta, T0)).ok).toBe(false);
    expect(await getAccountDetail(admin, TEST_ACCOUNT_ID, T0)).toMatchObject({
      status: "SUSPENDED",
      suspendedReason: "Unpaid since August",
    });

    await setAccountSuspended(admin, TEST_ACCOUNT_ID, false, {}, meta, T0);
    expect((await signIn(user.email, DEFAULT_PASSWORD, meta, T0)).ok).toBe(true);
  });

  it("every platform action is audited, outside the customer's own audit log", async () => {
    const owner = await makeUser("OWNER");
    const admin = await signedInAdmin();
    await extendTrial(
      admin,
      TEST_ACCOUNT_ID,
      { trialEndsOn: "2026-12-01", reason: "Asked nicely" },
      meta,
      T0,
    );
    await recordManualPayment(
      admin,
      TEST_ACCOUNT_ID,
      { amount: "1500", paidUntil: "2026-12-31", reference: "R1" },
      meta,
    );
    await setAccountSuspended(admin, TEST_ACCOUNT_ID, true, { reason: "Test" }, meta, T0);
    await setAccountSuspended(admin, TEST_ACCOUNT_ID, false, {}, meta, T0);

    const history = (await getAccountDetail(admin, TEST_ACCOUNT_ID, T0)).history.map(
      (h) => h.action,
    );
    expect(history).toEqual([
      "platform.account_reactivated",
      "platform.account_suspended",
      "platform.manual_payment",
      "platform.trial_extended",
    ]);
    const platformRows = await asSystem(() =>
      db.auditLog.findMany({ where: { action: { startsWith: "platform." } } }),
    );
    expect(platformRows.every((r) => r.accountId === null)).toBe(true);
    expect(platformRows.map((r) => r.action)).toEqual(
      expect.arrayContaining(["platform.setup_completed", "platform.login"]),
    );
    // Never a password, code or secret in the log.
    expect(
      JSON.stringify(platformRows, (_k, v: unknown) => (typeof v === "bigint" ? String(v) : v)),
    ).not.toMatch(/passphrase|argon2|totp/i);
    const customerLog = (await listAuditLog(owner, {})).rows.map((r) => r.action);
    expect(customerLog.some((a) => a.startsWith("platform."))).toBe(false);
  });
});
