import { beforeEach, describe, expect, it } from "vitest";

import {
  changeOwnPassword,
  checkResetToken,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/server/auth/passwords";
import { signIn } from "@/server/auth/sign-in";
import { validateSessionToken } from "@/server/auth/session";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { logOutbox } from "@/server/mail/transport";
import { DEFAULT_PASSWORD, auditActions, makeUser, meta, resetDb } from "./helpers";

beforeEach(resetDb);

const t0 = new Date("2026-10-23T01:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60_000);

describe("sign in", () => {
  it("signs in with the right password and records the login", async () => {
    const user = await makeUser("LEASING_STAFF");
    const result = await signIn(user.email.toUpperCase(), DEFAULT_PASSWORD, meta, t0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const session = await validateSessionToken(result.token, at(1));
    expect(session?.user.id).toBe(user.id);
    expect(await auditActions(user.id)).toContain("auth.login");

    const row = await db.auditLog.findFirst({ where: { action: "auth.login" } });
    expect(row?.ipAddress).toBe(meta.ipAddress);
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    const user = await makeUser("LEASING_STAFF");
    expect(await signIn("nobody@example.test", "whatever-password", meta, t0)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await signIn(user.email, "wrong-password", meta, t0)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("locks the account for 15 minutes after 5 failed attempts", async () => {
    const user = await makeUser("LEASING_STAFF");
    for (let i = 0; i < 4; i++) {
      expect(await signIn(user.email, "wrong-password", meta, at(i))).toMatchObject({
        reason: "invalid",
      });
    }
    const fifth = await signIn(user.email, "wrong-password", meta, at(4));
    expect(fifth).toMatchObject({ ok: false, reason: "locked" });

    // Even the right password is refused while locked.
    expect(await signIn(user.email, DEFAULT_PASSWORD, meta, at(10))).toMatchObject({
      reason: "locked",
    });
    // After 15 minutes the right password works again.
    expect(await signIn(user.email, DEFAULT_PASSWORD, meta, at(4 + 15))).toMatchObject({
      ok: true,
    });

    const actions = await auditActions(user.id);
    expect(actions.filter((a) => a === "auth.login_failed")).toHaveLength(6);
    expect(actions).toContain("auth.account_locked");
  });

  it("refuses deactivated accounts, but only says so after the right password", async () => {
    const user = await makeUser("LEASING_STAFF", { isActive: false });
    expect(await signIn(user.email, "wrong-password", meta, t0)).toMatchObject({
      reason: "invalid",
    });
    expect(await signIn(user.email, DEFAULT_PASSWORD, meta, t0)).toMatchObject({
      reason: "inactive",
    });
  });

  it("reports when a password change is required", async () => {
    const user = await makeUser("VIEWER", { mustChangePassword: true });
    expect(await signIn(user.email, DEFAULT_PASSWORD, meta, t0)).toMatchObject({
      ok: true,
      mustChangePassword: true,
    });
  });
});

describe("sessions", () => {
  it("expire after 30 minutes without activity", async () => {
    const user = await makeUser("LEASING_STAFF");
    const r = await signIn(user.email, DEFAULT_PASSWORD, meta, t0);
    if (!r.ok) throw new Error("sign-in failed");
    expect(await validateSessionToken(r.token, at(20))).not.toBeNull();
    // Activity at minute 20 keeps it alive until minute 50.
    expect(await validateSessionToken(r.token, at(45))).not.toBeNull();
    expect(await validateSessionToken(r.token, at(45 + 30))).toBeNull();
    // Once ended, it stays ended.
    expect(await validateSessionToken(r.token, at(46))).toBeNull();
  });

  it("end immediately when the account is turned off", async () => {
    const user = await makeUser("LEASING_STAFF");
    const r = await signIn(user.email, DEFAULT_PASSWORD, meta, t0);
    if (!r.ok) throw new Error("sign-in failed");
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await validateSessionToken(r.token, at(1))).toBeNull();
  });
});

describe("first sign-in password change", () => {
  it("clears the flag, keeps this session, signs out other sessions and emails the user", async () => {
    const user = await makeUser("LEASING_STAFF", { mustChangePassword: true });
    const a = await signIn(user.email, DEFAULT_PASSWORD, meta, t0);
    const b = await signIn(user.email, DEFAULT_PASSWORD, meta, t0);
    if (!a.ok || !b.ok) throw new Error("sign-in failed");
    const current = await validateSessionToken(a.token, at(1));

    await changeOwnPassword(
      { ...user, sessionId: current!.sessionId },
      {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: "a brand new secret",
        confirmPassword: "a brand new secret",
      },
      meta,
      at(1),
    );

    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.mustChangePassword).toBe(false);
    expect(await validateSessionToken(a.token, at(2))).not.toBeNull();
    expect(await validateSessionToken(b.token, at(2))).toBeNull();
    expect(await signIn(user.email, "a brand new secret", meta, at(3))).toMatchObject({
      ok: true,
      mustChangePassword: false,
    });
    expect(logOutbox.map((m) => m.subject)).toContain("Your Propfolio password was changed");
  });

  it.each([
    [
      {
        currentPassword: "nope-nope-nope",
        newPassword: "a brand new secret",
        confirmPassword: "a brand new secret",
      },
      "currentPassword",
    ],
    [
      { currentPassword: DEFAULT_PASSWORD, newPassword: "short", confirmPassword: "short" },
      "newPassword",
    ],
    [
      {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: "a brand new secret",
        confirmPassword: "different one!!",
      },
      "confirmPassword",
    ],
    [
      {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: DEFAULT_PASSWORD,
        confirmPassword: DEFAULT_PASSWORD,
      },
      "newPassword",
    ],
  ])("rejects bad input with a field message (%#)", async (input, field) => {
    const user = await makeUser("LEASING_STAFF", { mustChangePassword: true });
    const err = await changeOwnPassword(user, input, meta).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).fieldErrors[field]).toBeTruthy();
  });
});

describe("password reset by email", () => {
  function tokenFromOutbox(): string {
    const mail = logOutbox.find((m) => m.subject === "Set a new Propfolio password");
    const match = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(mail?.text ?? "");
    if (!match?.[1]) throw new Error("no reset link sent");
    return match[1];
  }

  it("lets the user set a new password once, and unlocks the account", async () => {
    const user = await makeUser("LEASING_STAFF");
    await db.user.update({ where: { id: user.id }, data: { lockedUntil: at(15) } });
    await requestPasswordReset(user.email, meta, t0);
    const token = tokenFromOutbox();
    expect(await checkResetToken(token, at(1))).toBe("valid");

    await resetPasswordWithToken(
      { token, newPassword: "fresh password 42", confirmPassword: "fresh password 42" },
      meta,
      at(1),
    );
    expect(await signIn(user.email, "fresh password 42", meta, at(2))).toMatchObject({ ok: true });

    await expect(
      resetPasswordWithToken(
        { token, newPassword: "another password 1", confirmPassword: "another password 1" },
        meta,
        at(3),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("links expire after 60 minutes", async () => {
    const user = await makeUser("LEASING_STAFF");
    await requestPasswordReset(user.email, meta, t0);
    expect(await checkResetToken(tokenFromOutbox(), at(61))).toBe("invalid");
  });

  it("sends at most 3 self-service links per hour", async () => {
    const user = await makeUser("LEASING_STAFF");
    for (let i = 0; i < 5; i++) await requestPasswordReset(user.email, meta, at(i));
    expect(logOutbox).toHaveLength(3);
    expect(await auditActions(user.id)).toContain("auth.password_reset_throttled");
    await requestPasswordReset(user.email, meta, at(61));
    expect(logOutbox).toHaveLength(4);
  });

  it("sends nothing for unknown emails", async () => {
    await requestPasswordReset("ghost@example.test", meta, t0);
    expect(logOutbox).toHaveLength(0);
  });
});

describe("audit log", () => {
  it("is append-only", async () => {
    const user = await makeUser("ADMIN");
    await signIn(user.email, DEFAULT_PASSWORD, meta, t0);
    await expect(db.auditLog.updateMany({ data: { action: "tampered" } })).rejects.toThrow(
      /append-only/,
    );
    await expect(db.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`TRUNCATE "AuditLog"`)).rejects.toThrow(/append-only/);
  });

  it("never stores password hashes", async () => {
    await makeUser("ADMIN");
    const rows = await db.auditLog.findMany();
    expect(
      JSON.stringify(rows, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
    ).not.toMatch(/\$argon2/);
  });
});
