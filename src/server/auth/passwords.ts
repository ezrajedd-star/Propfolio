import { PASSWORD_PROBLEM_MESSAGES, checkPassword } from "@/domain/auth/password-policy";
import { changePasswordSchema, resetPasswordSchema } from "@/schemas/auth";
import { writeAudit, type AuditActor } from "@/server/audit";
import { asSystem, db, runInAccount } from "@/server/db";
import { env } from "@/server/env";
import { NotFoundError, ValidationError } from "@/server/errors";
import { sendPasswordChangedEmail, sendPasswordResetEmail } from "@/server/mail/account-mail";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { assertCan, type Actor } from "./authorize";
import { signInTarget } from "./memberships";
import { hashPassword, verifyPassword } from "./password";
import { revokeUserSessions } from "./session";
import { randomToken, sha256 } from "./tokens";

export const RESET_TOKEN_MINUTES = 60;
/** At most this many self-service reset emails per account per hour (stops inbox flooding). */
export const RESET_REQUESTS_PER_HOUR = 3;

function assertPolicy(password: string, email: string) {
  const problem = checkPassword(password, email);
  if (problem) {
    throw new ValidationError("Please choose a different password.", {
      newPassword: PASSWORD_PROBLEM_MESSAGES[problem],
    });
  }
}

/**
 * A signed-in user changes their own password (also used for the first sign-in).
 * Other sessions are signed out; the current one stays.
 */
export async function changeOwnPassword(
  actor: AuditActor & { sessionId?: string },
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<void> {
  const data = parseInput(changePasswordSchema, input);
  // Only people in the current account are visible here (and the session checked they're on).
  const user = await db.user.findUnique({ where: { id: actor.id } });
  if (!user) throw new NotFoundError();

  if (!(await verifyPassword(user.passwordHash, data.currentPassword))) {
    throw new ValidationError("Please check the highlighted fields.", {
      currentPassword: "That isn't your current password.",
    });
  }
  assertPolicy(data.newPassword, user.email);

  const firstLogin = user.mustChangePassword;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(data.newPassword),
        mustChangePassword: false,
        passwordChangedAt: now,
        updatedById: actor.id,
      },
    });
    await writeAudit(
      {
        actor,
        action: "auth.password_changed",
        entityType: "User",
        entityId: user.id,
        metadata: { firstLogin },
        meta,
      },
      tx,
    );
  });
  await revokeUserSessions(user.id, { exceptSessionId: actor.sessionId }, now);
  await sendPasswordChangedEmail(user, now);
}

/** Reset links are sign-in internals, kept outside any one account's data. */
function issueResetToken(userId: string, createdById: string | null, now: Date) {
  return asSystem(async () => {
    const token = randomToken();
    // Only one live link per user.
    await db.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    await db.passwordResetToken.create({
      data: {
        tokenHash: sha256(token),
        userId,
        createdById,
        createdAt: now,
        expiresAt: new Date(now.getTime() + RESET_TOKEN_MINUTES * 60_000),
      },
    });
    return `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  });
}

/**
 * "Forgot password?" on the sign-in page. Always looks the same to the caller. Only people who
 * can sign in somewhere get a link; the email comes from the account they'd sign into.
 */
export async function requestPasswordReset(email: string, meta: RequestMeta, now = new Date()) {
  const found = await asSystem(async () => {
    const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) return null;
    const target = await signInTarget(user.id);
    if (!target) return null;
    const recent = await db.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - 3_600_000) } },
    });
    return { user, accountId: target.accountId, throttled: recent >= RESET_REQUESTS_PER_HOUR };
  });
  if (!found) return;
  const { user, accountId } = found;
  if (found.throttled) {
    await asSystem(() =>
      writeAudit({
        actor: null,
        action: "auth.password_reset_throttled",
        entityType: "User",
        entityId: user.id,
        meta,
        accountId,
      }),
    );
    return;
  }
  const url = await issueResetToken(user.id, null, now);
  await asSystem(() =>
    writeAudit({
      actor: null,
      action: "auth.password_reset_requested",
      entityType: "User",
      entityId: user.id,
      metadata: { by: "self" },
      meta,
      accountId,
    }),
  );
  await runInAccount(accountId, () => sendPasswordResetEmail(user, url, RESET_TOKEN_MINUTES));
}

/** Admin → Users → "Reset password". Emails a link; returns false if the email failed. */
export async function adminSendPasswordReset(
  actor: Actor,
  userId: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<boolean> {
  assertCan(actor, "user.manage");
  // Only members of the current account are found.
  const membership = await db.membership.findFirst({ where: { userId }, include: { user: true } });
  if (!membership) throw new NotFoundError("We couldn't find that user.");
  const user = membership.user;
  if (!membership.isActive) {
    throw new ValidationError(
      "This account is turned off. Turn it on before resetting the password.",
    );
  }
  const url = await issueResetToken(user.id, actor.id, now);
  await writeAudit({
    actor,
    action: "auth.password_reset_requested",
    entityType: "User",
    entityId: user.id,
    metadata: { by: "admin" },
    meta,
  });
  return sendPasswordResetEmail(user, url, RESET_TOKEN_MINUTES);
}

export type ResetTokenStatus = "valid" | "invalid";

export async function checkResetToken(token: string, now = new Date()): Promise<ResetTokenStatus> {
  const row = await asSystem(() =>
    db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } }),
  );
  return row && !row.usedAt && row.expiresAt > now ? "valid" : "invalid";
}

/** Complete a reset from the emailed link. Signs the user out everywhere and unlocks them. */
export async function resetPasswordWithToken(input: unknown, meta: RequestMeta, now = new Date()) {
  const data = parseInput(resetPasswordSchema, input);
  return asSystem(() => resetAsSystem(data, meta, now));
}

async function resetAsSystem(
  data: { token: string; newPassword: string },
  meta: RequestMeta,
  now: Date,
) {
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256(data.token) },
    include: { user: true },
  });
  const target = row ? await signInTarget(row.userId) : null;
  if (!row || row.usedAt || row.expiresAt <= now || !target) {
    throw new ValidationError(
      "This link has expired or was already used. Ask for a new one from the sign-in page.",
    );
  }
  assertPolicy(data.newPassword, row.user.email);
  const user = row.user;

  await db.$transaction(async (tx) => {
    // Mark used first; the conditional update stops the same link being used twice.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new ValidationError("This link was already used.");
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(data.newPassword),
        mustChangePassword: false,
        passwordChangedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await writeAudit(
      {
        actor: { id: user.id, name: user.name, role: target.role },
        action: "auth.password_reset_completed",
        entityType: "User",
        entityId: user.id,
        meta,
        accountId: target.accountId,
      },
      tx,
    );
  });
  await revokeUserSessions(user.id, {}, now);
  await runInAccount(target.accountId, () => sendPasswordChangedEmail(user, now));
}
