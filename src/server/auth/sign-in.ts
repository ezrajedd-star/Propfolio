import { afterFailedAttempt, afterSuccessfulLogin, isLocked } from "@/domain/auth/lockout";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import type { RequestMeta } from "@/server/request-meta";
import { burnPasswordCheck, verifyPassword } from "./password";
import { createSession, revokeSession } from "./session";

export type SignInResult =
  | { ok: true; token: string; expiresAt: Date; mustChangePassword: boolean }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; lockedUntil: Date }
  | { ok: false; reason: "inactive" };

/**
 * Check credentials and start a session.
 *
 * - Wrong email and wrong password give the same answer, in the same time.
 * - 5 failures in a row lock the account for 15 minutes; while locked, even the right
 *   password is refused.
 * - A deactivated account is only reported as such once the password is correct.
 */
export async function signIn(
  email: string,
  password: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<SignInResult> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  if (!user) {
    await burnPasswordCheck(password);
    await writeAudit({
      actor: null,
      action: "auth.login_failed",
      entityType: "User",
      // Only the domain is kept for unknown accounts, to spot targeted guessing.
      metadata: { reason: "unknown_account", emailDomain: email.split("@")[1] ?? null },
      meta,
    });
    return { ok: false, reason: "invalid" };
  }

  const actor = { id: user.id, name: user.name, role: user.role };

  if (isLocked(user, now)) {
    await writeAudit({
      actor,
      action: "auth.login_failed",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "locked" },
      meta,
    });
    return { ok: false, reason: "locked", lockedUntil: user.lockedUntil! };
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    const next = afterFailedAttempt(user, now);
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: next.failedLoginCount, lockedUntil: next.lockedUntil },
      });
      await writeAudit(
        {
          actor,
          action: "auth.login_failed",
          entityType: "User",
          entityId: user.id,
          metadata: { reason: "wrong_password" },
          meta,
        },
        tx,
      );
      if (next.justLocked) {
        await writeAudit(
          {
            actor,
            action: "auth.account_locked",
            entityType: "User",
            entityId: user.id,
            metadata: { lockedUntil: next.lockedUntil?.toISOString() },
            meta,
          },
          tx,
        );
      }
    });
    return next.justLocked && next.lockedUntil
      ? { ok: false, reason: "locked", lockedUntil: next.lockedUntil }
      : { ok: false, reason: "invalid" };
  }

  if (!user.isActive) {
    await writeAudit({
      actor,
      action: "auth.login_failed",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "inactive" },
      meta,
    });
    return { ok: false, reason: "inactive" };
  }

  await db.user.update({
    where: { id: user.id },
    data: { ...afterSuccessfulLogin(), lastLoginAt: now },
  });
  const session = await createSession(user.id, meta, now);
  await writeAudit({ actor, action: "auth.login", entityType: "User", entityId: user.id, meta });

  return { ok: true, ...session, mustChangePassword: user.mustChangePassword };
}

export async function signOut(
  session: {
    sessionId: string;
    user: { id: string; name: string; role: "ADMIN" | "LEASING_STAFF" | "VIEWER" };
  },
  meta: RequestMeta,
): Promise<void> {
  await revokeSession(session.sessionId);
  await writeAudit({
    actor: session.user,
    action: "auth.logout",
    entityType: "User",
    entityId: session.user.id,
    meta,
  });
}
