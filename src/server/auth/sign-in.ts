import { afterFailedAttempt, afterSuccessfulLogin, isLocked } from "@/domain/auth/lockout";
import { writeAudit } from "@/server/audit";
import type { Role } from "@/domain/auth/roles";
import { asSystem, db } from "@/server/db";
import type { RequestMeta } from "@/server/request-meta";
import { anyAccountOf, signInTarget } from "./memberships";
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
 * - Someone turned off everywhere (or whose accounts are all suspended) is only told so once
 *   the password is correct.
 * - The session opens in the account they used most recently.
 *
 * Runs outside any one account's work: the person isn't known yet.
 */
export function signIn(
  email: string,
  password: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<SignInResult> {
  return asSystem(() => signInAsSystem(email, password, meta, now));
}

async function signInAsSystem(
  email: string,
  password: string,
  meta: RequestMeta,
  now: Date,
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
      accountId: null,
    });
    return { ok: false, reason: "invalid" };
  }

  const target = await signInTarget(user.id);
  // Failed attempts are recorded in the account the person would have signed into.
  const accountId = target?.accountId ?? (await anyAccountOf(user.id));
  const actor = { id: user.id, name: user.name, role: target?.role ?? null };

  if (isLocked(user, now)) {
    await writeAudit({
      actor,
      action: "auth.login_failed",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "locked" },
      meta,
      accountId,
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
          accountId,
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
            accountId,
          },
          tx,
        );
      }
    });
    return next.justLocked && next.lockedUntil
      ? { ok: false, reason: "locked", lockedUntil: next.lockedUntil }
      : { ok: false, reason: "invalid" };
  }

  if (!target) {
    await writeAudit({
      actor,
      action: "auth.login_failed",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "inactive" },
      meta,
      accountId,
    });
    return { ok: false, reason: "inactive" };
  }

  await db.user.update({
    where: { id: user.id },
    data: { ...afterSuccessfulLogin(), lastLoginAt: now },
  });
  await db.membership.update({
    where: { accountId_userId: { accountId: target.accountId, userId: user.id } },
    data: { lastUsedAt: now },
  });
  const session = await createSession(user.id, target.accountId, meta, now);
  await writeAudit({
    actor: { ...actor, role: target.role },
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    meta,
    accountId: target.accountId,
  });

  return { ok: true, ...session, mustChangePassword: user.mustChangePassword };
}

export async function signOut(
  session: {
    sessionId: string;
    accountId: string;
    user: { id: string; name: string; role: Role };
  },
  meta: RequestMeta,
): Promise<void> {
  await revokeSession(session.sessionId);
  await asSystem(() =>
    writeAudit({
      actor: session.user,
      action: "auth.logout",
      entityType: "User",
      entityId: session.user.id,
      meta,
      accountId: session.accountId,
    }),
  );
}
