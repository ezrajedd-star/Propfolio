import { beforeEach, describe, expect, it } from "vitest";

import { base32Decode, totpCode, totpStep } from "@/domain/auth/totp";
import type { Actor } from "@/server/auth/authorize";
import { changeOwnPassword } from "@/server/auth/passwords";
import { validateSessionToken } from "@/server/auth/session";
import { completeSignInWithCode, signIn } from "@/server/auth/sign-in";
import {
  adminResetTwoStep,
  confirmTwoStepSetup,
  forgetMyDevices,
  getTwoStepSummary,
  newRecoveryCodesFor,
  startTwoStepSetup,
  turnOffTwoStep,
} from "@/server/auth/two-step";
import { asSystem, db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { DEFAULT_PASSWORD, auditActions, makeAccount, makeUser, meta, resetDb } from "./helpers";

beforeEach(resetDb);

const T0 = new Date("2026-11-03T02:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const codeAt = (secret: string, when: Date) => totpCode(base32Decode(secret), totpStep(when));

/** Turn two-step sign-in on for someone; returns their secret and recovery codes. */
async function enrol(actor: Actor) {
  const setup = await startTwoStepSetup(actor);
  const secret = setup.secret.replace(/ /g, "");
  const codes = await confirmTwoStepSetup(actor, { code: codeAt(secret, T0) }, meta, T0);
  return { secret, codes };
}

async function passwordStep(email: string, when: Date, device?: string) {
  const r = await signIn(email, DEFAULT_PASSWORD, meta, when, device);
  if (r.ok || r.reason !== "code_needed")
    throw new Error(`expected the code step, got ${JSON.stringify(r)}`);
  return r.challengeToken;
}

describe("who has to use two-step sign-in", () => {
  it("Owners and Admins must set it up before anything else; others may", async () => {
    for (const [role, state] of [
      ["OWNER", "setup_required"],
      ["ADMIN", "setup_required"],
      ["LEASING_STAFF", "optional"],
      ["VIEWER", "optional"],
    ] as const) {
      const user = await makeUser(role);
      const r = await signIn(user.email, DEFAULT_PASSWORD, meta, T0);
      if (!r.ok) throw new Error("sign-in failed");
      expect((await validateSessionToken(r.token, T0))?.user.twoStep, role).toBe(state);
    }
  });

  it("a grace period lets an Owner wait (used for new sign-ups)", async () => {
    const owner = await makeUser("OWNER");
    await asSystem(() =>
      db.user.update({ where: { id: owner.id }, data: { twoStepGraceUntil: at(86_400) } }),
    );
    const r = await signIn(owner.email, DEFAULT_PASSWORD, meta, T0);
    expect(r.ok && (await validateSessionToken(r.token, T0))?.user.twoStep).toBe("grace");
  });
});

describe("setting it up", () => {
  it("needs a right code from the app, stores the secret encrypted, and gives ten recovery codes once", async () => {
    const admin = await makeUser("ADMIN");
    const setup = await startTwoStepSetup(admin);
    expect(setup.qrSvg).toMatch(/^<svg/);
    // Reloading the page shows the same secret until it's confirmed.
    expect((await startTwoStepSetup(admin)).secret).toBe(setup.secret);
    await expect(confirmTwoStepSetup(admin, { code: "000000" }, meta, T0)).rejects.toBeInstanceOf(
      ValidationError,
    );
    const secret = setup.secret.replace(/ /g, "");
    const codes = await confirmTwoStepSetup(admin, { code: codeAt(secret, T0) }, meta, T0);
    expect(codes).toHaveLength(10);

    const row = await asSystem(() => db.user.findUniqueOrThrow({ where: { id: admin.id } }));
    expect(row.totpSecretEnc).not.toContain(secret);
    const stored = await asSystem(() => db.recoveryCode.findMany({ where: { userId: admin.id } }));
    expect(stored.map((c) => c.codeHash).join()).not.toContain(codes[0]!.replace("-", ""));
    expect(await getTwoStepSummary(admin, T0)).toMatchObject({
      state: "on",
      required: true,
      recoveryCodesLeft: 10,
    });
    expect(await auditActions(admin.id)).toContain("auth.two_step_enabled");
    await expect(startTwoStepSetup(admin)).rejects.toThrow(/already on/);
  });
});

describe("signing in with two-step on", () => {
  it("asks for the code after the password; the code opens the session", async () => {
    const admin = await makeUser("ADMIN");
    const { secret } = await enrol(admin);
    const challenge = await passwordStep(admin.email, at(60));
    // No session yet: only the code step.
    expect(await asSystem(() => db.session.count())).toBe(0);
    expect(await completeSignInWithCode(challenge, "000000", false, meta, at(61))).toEqual({
      ok: false,
      reason: "invalid",
    });
    const r = await completeSignInWithCode(challenge, codeAt(secret, at(62)), false, meta, at(62));
    if (!r.ok) throw new Error("code step failed");
    expect(await validateSessionToken(r.token, at(62))).toMatchObject({ user: { twoStep: "on" } });
    // The sign-in step can't be used again, nor can the code.
    expect(
      await completeSignInWithCode(challenge, codeAt(secret, at(63)), false, meta, at(63)),
    ).toEqual({
      ok: false,
      reason: "expired",
    });
    const again = await passwordStep(admin.email, at(64));
    expect(
      (await completeSignInWithCode(again, codeAt(secret, at(64)), false, meta, at(64))).ok,
    ).toBe(false);
  });

  it("the code step expires after 5 minutes, and after 5 wrong codes", async () => {
    const admin = await makeUser("ADMIN");
    const { secret } = await enrol(admin);
    const slow = await passwordStep(admin.email, at(60));
    expect(
      await completeSignInWithCode(slow, codeAt(secret, at(60 + 301)), false, meta, at(60 + 301)),
    ).toEqual({ ok: false, reason: "expired" });

    await asSystem(() =>
      db.user.update({ where: { id: admin.id }, data: { failedLoginCount: 0 } }),
    );
    const guessed = await passwordStep(admin.email, at(1000));
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(
        (await completeSignInWithCode(guessed, "111111", false, meta, at(1001))).ok === false,
      );
    }
    expect(results.every(Boolean)).toBe(true);
  });

  it("wrong codes count towards the lockout, like wrong passwords", async () => {
    const admin = await makeUser("ADMIN");
    const { secret } = await enrol(admin);
    let last;
    for (let i = 0; i < 5; i++) {
      const challenge = await passwordStep(admin.email, at(60 + i));
      last = await completeSignInWithCode(challenge, "222222", false, meta, at(60 + i));
    }
    expect(last).toMatchObject({ ok: false, reason: "locked" });
    expect(await signIn(admin.email, DEFAULT_PASSWORD, meta, at(120))).toMatchObject({
      ok: false,
      reason: "locked",
    });
    void secret;
  });

  it("each recovery code works once", async () => {
    const admin = await makeUser("ADMIN");
    const { codes } = await enrol(admin);
    const first = await passwordStep(admin.email, at(60));
    const r = await completeSignInWithCode(first, codes[3]!.toLowerCase(), false, meta, at(60));
    expect(r.ok).toBe(true);
    expect((await getTwoStepSummary(admin, at(60))).recoveryCodesLeft).toBe(9);
    const second = await passwordStep(admin.email, at(90));
    expect((await completeSignInWithCode(second, codes[3]!, false, meta, at(90))).ok).toBe(false);
  });

  it("'Don't ask again on this device' skips the code for 30 days on that browser only", async () => {
    const admin = await makeUser("ADMIN");
    const { secret } = await enrol(admin);
    const challenge = await passwordStep(admin.email, at(60));
    const r = await completeSignInWithCode(challenge, codeAt(secret, at(60)), true, meta, at(60));
    if (!r.ok || !r.deviceToken) throw new Error("expected a remembered device");
    const device = r.deviceToken.token;

    const skip = await signIn(admin.email, DEFAULT_PASSWORD, meta, at(3600), device);
    expect(skip.ok).toBe(true);
    // Another browser (no token, or someone else's) still gets the code step.
    await passwordStep(admin.email, at(3601));
    const other = await makeUser("ADMIN", { email: "other.admin@example.test" });
    await enrol(other);
    await passwordStep(other.email, at(3602), device);
    // After 30 days, the code again.
    await passwordStep(admin.email, at(31 * 86_400), device);
  });

  it("changing the password, or 'Forget remembered devices', ends remembered devices", async () => {
    const admin = await makeUser("ADMIN");
    const { secret } = await enrol(admin);
    const remember = async (when: Date) => {
      const c = await passwordStep(admin.email, when);
      const r = await completeSignInWithCode(c, codeAt(secret, when), true, meta, when);
      if (!r.ok || !r.deviceToken) throw new Error("expected a remembered device");
      return r.deviceToken.token;
    };
    const device = await remember(at(60));
    expect(await forgetMyDevices(admin, meta, at(70))).toBe(1);
    await passwordStep(admin.email, at(80), device);

    const device2 = await remember(at(120));
    await changeOwnPassword(
      admin,
      {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: "a brand new passphrase",
        confirmPassword: "a brand new passphrase",
      },
      meta,
      at(130),
    );
    const r = await signIn(admin.email, "a brand new passphrase", meta, at(140), device2);
    expect(r).toMatchObject({ ok: false, reason: "code_needed" });
  });

  it("sign-ins record how the second step was done, never the code", async () => {
    const admin = await makeUser("ADMIN");
    const { secret, codes } = await enrol(admin);
    const c1 = await passwordStep(admin.email, at(60));
    await completeSignInWithCode(c1, codeAt(secret, at(60)), false, meta, at(60));
    const c2 = await passwordStep(admin.email, at(90));
    await completeSignInWithCode(c2, codes[0]!, false, meta, at(90));
    const logins = await db.auditLog.findMany({
      where: { action: "auth.login" },
      orderBy: { seq: "asc" },
    });
    expect(logins.map((l) => l.metadata)).toEqual([
      { twoStep: "app" },
      { twoStep: "recovery_code", recoveryCodesLeft: 9 },
    ]);
    expect(JSON.stringify(logins.map((l) => l.metadata))).not.toContain(codes[0]!);
  });
});

describe("managing it", () => {
  it("new recovery codes need a current app code and replace the old ones", async () => {
    const staff = await makeUser("LEASING_STAFF");
    const { secret, codes } = await enrol(staff);
    await expect(
      newRecoveryCodesFor(staff, { code: codes[0]! }, meta, at(60)),
    ).rejects.toBeInstanceOf(ValidationError);
    const fresh = await newRecoveryCodesFor(staff, { code: codeAt(secret, at(60)) }, meta, at(60));
    expect(fresh).toHaveLength(10);
    const challenge = await passwordStep(staff.email, at(120));
    expect((await completeSignInWithCode(challenge, codes[1]!, false, meta, at(120))).ok).toBe(
      false,
    );
    const challenge2 = await passwordStep(staff.email, at(150));
    expect((await completeSignInWithCode(challenge2, fresh[1]!, false, meta, at(150))).ok).toBe(
      true,
    );
  });

  it("Leasing Staff can turn it off with password and code; Owners and Admins can't", async () => {
    const staff = await makeUser("LEASING_STAFF");
    const { secret } = await enrol(staff);
    await expect(
      turnOffTwoStep(
        staff,
        { password: "wrong password!", code: codeAt(secret, at(60)) },
        meta,
        at(60),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await turnOffTwoStep(
      staff,
      { password: DEFAULT_PASSWORD, code: codeAt(secret, at(90)) },
      meta,
      at(90),
    );
    expect((await signIn(staff.email, DEFAULT_PASSWORD, meta, at(120))).ok).toBe(true);

    const admin = await makeUser("ADMIN");
    const { secret: s2 } = await enrol(admin);
    await expect(
      turnOffTwoStep(admin, { password: DEFAULT_PASSWORD, code: codeAt(s2, at(60)) }, meta, at(60)),
    ).rejects.toThrow(/must keep two-step sign-in on/);
  });

  it("someone who is an Admin in any of their accounts must keep it on", async () => {
    const staff = await makeUser("LEASING_STAFF");
    const { secret } = await enrol(staff);
    const other = await makeAccount();
    await asSystem(() =>
      db.membership.create({ data: { accountId: other, userId: staff.id, role: "ADMIN" } }),
    );
    await expect(
      turnOffTwoStep(
        staff,
        { password: DEFAULT_PASSWORD, code: codeAt(secret, at(60)) },
        meta,
        at(60),
      ),
    ).rejects.toThrow(/must keep/);
  });

  it("an Admin can reset it for a member who lost their phone; they set it up again", async () => {
    const owner = await makeUser("OWNER");
    const admin = await makeUser("ADMIN");
    await enrol(admin);
    const r = await signIn(admin.email, DEFAULT_PASSWORD, meta, at(30));
    expect(r).toMatchObject({ reason: "code_needed" });

    await adminResetTwoStep(owner, admin.id, meta, at(60));
    const after = await signIn(admin.email, DEFAULT_PASSWORD, meta, at(90));
    if (!after.ok) throw new Error("expected sign-in without a code");
    expect((await validateSessionToken(after.token, at(90)))?.user.twoStep).toBe("setup_required");
    expect(await auditActions(admin.id)).toContain("auth.two_step_reset");

    await expect(adminResetTwoStep(owner, owner.id, meta, at(60))).rejects.toThrow(/My account/);
    const staff = await makeUser("LEASING_STAFF");
    await expect(adminResetTwoStep(staff, admin.id, meta, at(60))).rejects.toThrow();
  });

  it("an Admin can't reset it for someone in another account, or who also belongs elsewhere", async () => {
    const owner = await makeUser("OWNER");
    const otherAccount = await makeAccount();
    const outsider = await makeUser("ADMIN", { accountId: otherAccount });
    await expect(adminResetTwoStep(owner, outsider.id, meta, at(60))).rejects.toThrow(
      /couldn't find/,
    );

    const shared = await makeUser("LEASING_STAFF");
    await asSystem(() =>
      db.membership.create({
        data: { accountId: otherAccount, userId: shared.id, role: "VIEWER" },
      }),
    );
    await expect(adminResetTwoStep(owner, shared.id, meta, at(60))).rejects.toThrow(
      /another company/,
    );
  });
});
