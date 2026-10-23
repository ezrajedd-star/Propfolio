import { beforeEach, describe, expect, it } from "vitest";

import { adminSendPasswordReset } from "@/server/auth/passwords";
import { signIn } from "@/server/auth/sign-in";
import { validateSessionToken } from "@/server/auth/session";
import { listAuditLog } from "@/server/audit-log/service";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { logOutbox } from "@/server/mail/transport";
import { getSettings, updateSettings } from "@/server/settings/service";
import {
  createUser,
  getUser,
  listUsers,
  setUserActive,
  unlockUser,
  updateUser,
} from "@/server/users/service";
import { DEFAULT_PASSWORD, auditActions, makeUser, meta, resetDb } from "./helpers";

beforeEach(resetDb);

describe("Admin manages users", () => {
  it("creates a user with a temporary password that must be changed at first sign-in", async () => {
    const admin = await makeUser("ADMIN");
    const { user, temporaryPassword } = await createUser(
      admin,
      { name: "Maria Santos", email: "  Maria.Santos@Example.TEST ", role: "LEASING_STAFF" },
      meta,
    );
    expect(user).toMatchObject({
      email: "maria.santos@example.test",
      role: "LEASING_STAFF",
      status: "invited",
    });
    expect(user).not.toHaveProperty("passwordHash");
    expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);

    const login = await signIn("maria.santos@example.test", temporaryPassword, meta);
    expect(login).toMatchObject({ ok: true, mustChangePassword: true });

    const created = await db.auditLog.findFirstOrThrow({ where: { action: "user.create" } });
    expect(created.actorId).toBe(admin.id);
    expect(JSON.stringify(created.changes)).not.toContain(temporaryPassword);
  });

  it("rejects a duplicate email with a field message", async () => {
    const admin = await makeUser("ADMIN");
    await createUser(admin, { name: "A", email: "dup@example.test", role: "VIEWER" }, meta);
    const err = await createUser(
      admin,
      { name: "B", email: "DUP@example.test", role: "VIEWER" },
      meta,
    ).catch((e: unknown) => e);
    expect((err as ValidationError).fieldErrors.email).toMatch(/already/);
  });

  it("does not let users change their own role", async () => {
    const admin = await makeUser("ADMIN");
    await makeUser("ADMIN");
    await expect(updateUser(admin, admin.id, { role: "VIEWER" }, meta)).rejects.toThrow(/own role/);
  });

  it("does not let Admins turn off their own account", async () => {
    const admin = await makeUser("ADMIN");
    await makeUser("ADMIN");
    await expect(setUserActive(admin, admin.id, false, meta)).rejects.toThrow(/own account/);
  });

  it("refuses to turn off or demote the last active Admin", async () => {
    const admin = await makeUser("ADMIN");
    const lone = await makeUser("ADMIN");
    // After this, `lone` is the only active Admin.
    await setUserActive(lone, admin.id, false, meta);
    // An inactive Admin's own session is gone, but the service rule must hold regardless of caller.
    await expect(updateUser(admin, lone.id, { role: "VIEWER" }, meta)).rejects.toThrow(
      /only active Admin/,
    );
    await expect(setUserActive(admin, lone.id, false, meta)).rejects.toThrow(/only active Admin/);
  });

  it("signs a user out everywhere when their role changes or they are turned off", async () => {
    const admin = await makeUser("ADMIN");
    const staff = await makeUser("LEASING_STAFF");
    const s1 = await signIn(staff.email, DEFAULT_PASSWORD, meta);
    if (!s1.ok) throw new Error();
    await updateUser(admin, staff.id, { role: "VIEWER" }, meta);
    expect(await validateSessionToken(s1.token)).toBeNull();

    const s2 = await signIn(staff.email, DEFAULT_PASSWORD, meta);
    if (!s2.ok) throw new Error();
    await setUserActive(admin, staff.id, false, meta);
    expect(await validateSessionToken(s2.token)).toBeNull();
    expect(await auditActions(staff.id)).toEqual(
      expect.arrayContaining(["user.update", "user.deactivate"]),
    );
  });

  it("emails the old and new address when an email changes", async () => {
    const admin = await makeUser("ADMIN");
    const staff = await makeUser("LEASING_STAFF", { email: "old@example.test" });
    await updateUser(admin, staff.id, { email: "new@example.test" }, meta);
    const mail = logOutbox.find((m) => m.subject === "Your Propfolio email address was changed");
    expect(mail?.to).toEqual(["old@example.test", "new@example.test"]);

    const entry = await db.auditLog.findFirstOrThrow({ where: { action: "user.update" } });
    expect(entry.changes).toEqual({
      email: { before: "old@example.test", after: "new@example.test" },
    });
  });

  it("unlocks a locked account and emails reset links", async () => {
    const admin = await makeUser("ADMIN");
    const staff = await makeUser("LEASING_STAFF");
    for (let i = 0; i < 5; i++) await signIn(staff.email, "wrong-password", meta);
    expect((await getUser(admin, staff.id)).status).toBe("locked");
    expect((await unlockUser(admin, staff.id, meta)).status).toBe("active");

    expect(await adminSendPasswordReset(admin, staff.id, meta)).toBe(true);
    expect(logOutbox.at(-1)?.to).toEqual([staff.email]);
  });

  it("returns 404-style errors for unknown or malformed ids", async () => {
    const admin = await makeUser("ADMIN");
    await expect(getUser(admin, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getUser(admin, "01890000-0000-7000-8000-000000000000")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe.each(["LEASING_STAFF", "VIEWER"] as const)("%s cannot use admin functions", (role) => {
  it("is refused by every admin service", async () => {
    const admin = await makeUser("ADMIN");
    const someone = await makeUser(role);
    const target = await makeUser("VIEWER");
    const attempts: Promise<unknown>[] = [
      listUsers(someone),
      getUser(someone, target.id),
      createUser(someone, { name: "X", email: "x@example.test", role: "ADMIN" }, meta),
      updateUser(someone, someone.id, { role: "ADMIN" }, meta),
      setUserActive(someone, admin.id, false, meta),
      unlockUser(someone, target.id, meta),
      adminSendPasswordReset(someone, target.id, meta),
      listAuditLog(someone, {}),
      updateSettings(someone, { companyName: "Hacked" }, meta),
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.user.count({ where: { role: "ADMIN" } })).toBe(1);
    expect((await getSettings()).companyName).not.toBe("Hacked");
  });
});

describe("settings", () => {
  it("validates, saves and audits changes", async () => {
    const admin = await makeUser("ADMIN");
    await expect(
      updateSettings(admin, { mailReplyTo: "not-an-email" }, meta),
    ).rejects.toBeInstanceOf(ValidationError);
    const saved = await updateSettings(admin, { companyName: "Sample Realty Corp." }, meta);
    expect(saved.companyName).toBe("Sample Realty Corp.");
    const log = await listAuditLog(admin, { action: "settings.update" });
    expect(log.rows[0]?.changes).toEqual({
      companyName: { before: "Your Company", after: "Sample Realty Corp." },
    });
  });
});
