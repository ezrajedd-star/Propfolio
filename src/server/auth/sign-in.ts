import type { User } from "@prisma/client";

import { afterFailedAttempt, afterSuccessfulLogin, isLocked } from "@/domain/auth/lockout";
import type { Role } from "@/domain/auth/roles";
import { CODE_STEP_MINUTES, MAX_CODE_ATTEMPTS } from "@/domain/auth/two-step";
import { writeAudit } from "@/server/audit";
import { asSystem, db } from "@/server/db";
import { hitRateLimit, hitRateLimits } from "@/server/rate-limit";
import type { RequestMeta } from "@/server/request-meta";
import { anyAccountOf, signInTarget, type SignInTarget } from "./memberships";
import { burnPasswordCheck, verifyPassword } from "./password";
import { createSession, revokeSession } from "./session";
import { randomToken, sha256 } from "./tokens";
import { checkSecondStep, rememberDevice, trustedDeviceFor } from "./two-step";

export interface SignedIn {
  ok: true;
  token: string;
  expiresAt: Date;
  mustChangePassword: boolean;
  /** Set when the person ticked "Don't ask again on this device": the device cookie's value. */
  deviceToken?: { token: string; expiresAt: Date };
}

export type SignInResult =
  | SignedIn
  /** Password right; now the 6-digit code (or a recovery code) is needed. */
  | { ok: false; reason: "code_needed"; challengeToken: string; expiresAt: Date }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; lockedUntil: Date }
  /** Too many attempts from this network or for this email: wait and try again. */
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "inactive" }
  /** Turned on in an account, but the platform admin suspended that account. */
  | { ok: false; reason: "suspended" }
  /** Turned on, but the account's plan includes fewer users (e.g. after a trial ended). */
  | { ok: false; reason: "user_limit" };

/**
 * Check credentials and start a session.
 *
 * - Wrong email and wrong password give the same answer, in the same time.
 * - 5 failures in a row lock the account for 15 minutes; while locked, even the right
 *   password is refused.
 * - Someone turned off everywhere (or whose accounts are all suspended) is only told so once
 *   the password is correct.
 * - The session opens in the account they used most recently.
 * - With two-step sign-in on, a right password only opens the code step (5 minutes), unless
 *   this browser was remembered (`deviceToken`).
 *
 * Runs outside any one account's work: the person isn't known yet.
 */
export function signIn(
  email: string,
  password: string,
  meta: RequestMeta,
  now = new Date(),
  deviceToken?: string,
): Promise<SignInResult> {
  return asSystem(() => signInAsSystem(email, password, meta, now, deviceToken));
}

async function signInAsSystem(
  email: string,
  password: string,
  meta: RequestMeta,
  now: Date,
  deviceToken: string | undefined,
): Promise<SignInResult> {
  const limit = await hitRateLimits(
    [
      ["signInByIp", meta.ipAddress],
      ["signInByEmail", email],
    ],
    now,
  );
  if (!limit.allowed) {
    return { ok: false, reason: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };
  }
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

  const target = await signInTarget(user.id, now);
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
    const suspended = await db.membership.count({
      where: { userId: user.id, isActive: true, account: { status: "SUSPENDED" } },
    });
    const turnedOn = await db.membership.count({
      where: { userId: user.id, isActive: true, account: { status: "ACTIVE" } },
    });
    const reason = suspended > 0 ? "suspended" : turnedOn > 0 ? "user_limit" : "inactive";
    await writeAudit({
      actor,
      action: "auth.login_failed",
      entityType: "User",
      entityId: user.id,
      metadata: { reason },
      meta,
      accountId,
    });
    return { ok: false, reason };
  }

  if (user.totpConfirmedAt && !(await trustedDeviceFor(user.id, deviceToken, now))) {
    const challengeToken = randomToken();
    const expiresAt = new Date(now.getTime() + CODE_STEP_MINUTES * 60_000);
    await db.signInChallenge.create({
      data: {
        tokenHash: sha256(challengeToken),
        userId: user.id,
        accountId: target.accountId,
        createdAt: now,
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    return { ok: false, reason: "code_needed", challengeToken, expiresAt };
  }

  return finishSignIn(user, target, meta, now, {
    twoStep: user.totpConfirmedAt ? "remembered_device" : "off",
  });
}

/** The person is who they say: open the session and record it. */
async function finishSignIn(
  user: User,
  target: SignInTarget,
  meta: RequestMeta,
  now: Date,
  details: Record<string, unknown>,
): Promise<SignedIn> {
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
    actor: { id: user.id, name: user.name, role: target.role },
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    metadata: details,
    meta,
    accountId: target.accountId,
  });
  return { ok: true, ...session, mustChangePassword: user.mustChangePassword };
}

export type CodeStepResult =
  | SignedIn
  | { ok: false; reason: "invalid" }
  /** The 5 minutes ran out, the tries ran out, or the step was already used: start again. */
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "locked"; lockedUntil: Date };

/**
 * The second step: a code from the authenticator app, or one of the recovery codes. Wrong codes
 * count towards the same lockout as wrong passwords; after 5 on one sign-in, start again.
 */
export function completeSignInWithCode(
  challengeToken: string,
  code: string,
  remember: boolean,
  meta: RequestMeta,
  now = new Date(),
): Promise<CodeStepResult> {
  return asSystem(async () => {
    const limit = await hitRateLimit("codeByIp", meta.ipAddress, now);
    if (!limit.allowed) {
      return { ok: false, reason: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };
    }
    const challenge = await db.signInChallenge.findUnique({
      where: { tokenHash: sha256(challengeToken) },
      include: { user: true },
    });
    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= MAX_CODE_ATTEMPTS
    ) {
      return { ok: false, reason: "expired" };
    }
    const { user } = challenge;
    const target = await signInTarget(user.id, now);
    if (!target || target.accountId !== challenge.accountId)
      return { ok: false, reason: "expired" };
    const actor = { id: user.id, name: user.name, role: target.role };
    if (isLocked(user, now)) return { ok: false, reason: "locked", lockedUntil: user.lockedUntil! };

    const check = await checkSecondStep(user, code, now);
    if (!check) {
      const next = afterFailedAttempt(user, now);
      await db.$transaction(async (tx) => {
        await tx.signInChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
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
            metadata: { reason: "wrong_code" },
            meta,
            accountId: target.accountId,
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
              accountId: target.accountId,
            },
            tx,
          );
        }
      });
      if (next.justLocked && next.lockedUntil) {
        return { ok: false, reason: "locked", lockedUntil: next.lockedUntil };
      }
      return challenge.attempts + 1 >= MAX_CODE_ATTEMPTS
        ? { ok: false, reason: "expired" }
        : { ok: false, reason: "invalid" };
    }

    const claimed = await db.signInChallenge.updateMany({
      where: { id: challenge.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return { ok: false, reason: "expired" };

    const signedIn = await finishSignIn(user, target, meta, now, {
      twoStep: check.method,
      ...(check.method === "recovery_code" ? { recoveryCodesLeft: check.left } : {}),
    });
    if (!remember) return signedIn;
    return { ...signedIn, deviceToken: await rememberDevice(user.id, meta, now) };
  });
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
