import { toString as qrSvg } from "qrcode";

import { afterFailedAttempt, afterSuccessfulLogin, isLocked } from "@/domain/auth/lockout";
import { PASSWORD_PROBLEM_MESSAGES, checkPassword } from "@/domain/auth/password-policy";
import { checkSession, shouldTouch } from "@/domain/auth/session-policy";
import { newTotpSecret, totpUri, verifyTotp } from "@/domain/auth/totp";
import { platformSetupSchema, platformSignInSchema } from "@/schemas/platform";
import { writeAudit } from "@/server/audit";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/server/auth/password";
import { randomToken, sha256 } from "@/server/auth/tokens";
import { asSystem, db } from "@/server/db";
import { env } from "@/server/env";
import { ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { decryptSecret, encryptSecret } from "@/server/auth/secrets";

/**
 * Sign-in for Propfolio's own staff (the platform admin). Separate from customer sign-in: its
 * own people, sessions and cookie, and always two steps (password + authenticator code).
 * Everything here runs outside any customer account and is written to the audit log with no
 * account.
 */

/** Set-up links work for 24 hours. */
export const SETUP_LINK_HOURS = 24;
/** Platform sessions end after 30 idle minutes (as for customers) and always after 8 hours. */
export const PLATFORM_SESSION_HOURS = 8;

export interface PlatformActor {
  id: string;
  name: string;
  email: string;
  sessionId: string;
}

function audit(
  action: string,
  admin: { id: string; name: string } | null,
  meta: RequestMeta | null,
  metadata?: Record<string, unknown>,
) {
  return writeAudit({
    actor: admin ? { id: admin.id, name: admin.name, role: null } : null,
    action,
    entityType: "PlatformAdmin",
    entityId: admin?.id ?? null,
    metadata: { platform: true, ...metadata },
    meta,
    accountId: null,
  });
}

/**
 * Add a platform admin, or start set-up again for one who lost their phone (their password,
 * authenticator and sessions are cleared). Returns the one-time set-up link. Run from the
 * server's command line only (scripts/platform-admin.ts).
 */
export function issuePlatformSetupLink(
  input: { email: string; name?: string },
  now = new Date(),
): Promise<string> {
  return asSystem(async () => {
    const email = input.email.trim().toLowerCase();
    const token = randomToken();
    const expires = new Date(now.getTime() + SETUP_LINK_HOURS * 3_600_000);
    const reset = {
      passwordHash: null,
      totpSecretEnc: null,
      totpConfirmedAt: null,
      totpLastStep: null,
      setupTokenHash: sha256(token),
      setupTokenExpiresAt: expires,
      failedLoginCount: 0,
      lockedUntil: null,
      isActive: true,
    };
    const admin = await db.platformAdmin.upsert({
      where: { email },
      create: { email, name: input.name?.trim() || email, ...reset },
      update: { ...reset, ...(input.name ? { name: input.name.trim() } : {}) },
    });
    await db.platformSession.updateMany({
      where: { adminId: admin.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await audit("platform.setup_link_issued", admin, null);
    return `${env().APP_URL}/platform/setup?token=${encodeURIComponent(token)}`;
  });
}

async function adminForSetupToken(token: string, now: Date) {
  const admin = await db.platformAdmin.findUnique({ where: { setupTokenHash: sha256(token) } });
  if (!admin || !admin.isActive || !admin.setupTokenExpiresAt || admin.setupTokenExpiresAt <= now) {
    return null;
  }
  return admin;
}

/**
 * The set-up page: the authenticator secret to scan (made once per link, stored encrypted) and
 * its QR code. Null when the link is unknown, used or expired.
 */
export function getPlatformSetup(token: string, now = new Date()) {
  return asSystem(async () => {
    const admin = await adminForSetupToken(token, now);
    if (!admin) return null;
    let secret = admin.totpSecretEnc ? decryptSecret(admin.totpSecretEnc) : null;
    if (!secret) {
      secret = newTotpSecret();
      await db.platformAdmin.update({
        where: { id: admin.id },
        data: { totpSecretEnc: encryptSecret(secret) },
      });
    }
    const uri = totpUri(secret, admin.email);
    return {
      name: admin.name,
      email: admin.email,
      /** Shown in groups of four for typing by hand. */
      secret: secret.replace(/(.{4})/g, "$1 ").trim(),
      qrSvg: await qrSvg(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
    };
  });
}

/** Finish set-up: a password and a first code, proving the authenticator app works. */
export async function completePlatformSetup(input: unknown, meta: RequestMeta, now = new Date()) {
  const data = parseInput(platformSetupSchema, input);
  return asSystem(async () => {
    const admin = await adminForSetupToken(data.token, now);
    if (!admin || !admin.totpSecretEnc) {
      throw new ValidationError(
        "This set-up link has expired or was already used. Ask for a new one.",
      );
    }
    const problem = checkPassword(data.password, admin.email);
    if (problem) {
      throw new ValidationError("Please choose a different password.", {
        password: PASSWORD_PROBLEM_MESSAGES[problem],
      });
    }
    const step = verifyTotp(decryptSecret(admin.totpSecretEnc), data.code, now);
    if (step === null) {
      throw new ValidationError("Please check the code.", {
        code: "That code didn't work. Type the 6-digit code your app shows right now.",
      });
    }
    await db.$transaction(async (tx) => {
      const claimed = await tx.platformAdmin.updateMany({
        where: { id: admin.id, setupTokenHash: admin.setupTokenHash },
        data: {
          passwordHash: await hashPassword(data.password),
          totpConfirmedAt: now,
          totpLastStep: BigInt(step),
          setupTokenHash: null,
          setupTokenExpiresAt: null,
        },
      });
      if (claimed.count !== 1) throw new ValidationError("This set-up link was already used.");
    });
    await audit("platform.setup_completed", admin, meta);
  });
}

export type PlatformSignInResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; lockedUntil: Date };

/**
 * Email, password and authenticator code, all at once. Any mistake gives the same answer, so
 * the form doesn't reveal which part was wrong. 5 failures in a row lock sign-in for 15 minutes.
 */
export async function platformSignIn(
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<PlatformSignInResult> {
  const data = parseInput(platformSignInSchema, input);
  return asSystem(async () => {
    const admin = await db.platformAdmin.findUnique({ where: { email: data.email } });
    if (
      !admin ||
      !admin.isActive ||
      !admin.passwordHash ||
      !admin.totpSecretEnc ||
      !admin.totpConfirmedAt
    ) {
      await burnPasswordCheck(data.password);
      await audit("platform.login_failed", null, meta, {
        reason: "unknown_admin",
        emailDomain: data.email.split("@")[1] ?? null,
      });
      return { ok: false, reason: "invalid" };
    }
    if (isLocked(admin, now)) {
      await audit("platform.login_failed", admin, meta, { reason: "locked" });
      return { ok: false, reason: "locked", lockedUntil: admin.lockedUntil! };
    }

    const passwordOk = await verifyPassword(admin.passwordHash, data.password);
    const lastStep = admin.totpLastStep === null ? null : Number(admin.totpLastStep);
    const step = passwordOk
      ? verifyTotp(decryptSecret(admin.totpSecretEnc), data.code, now, lastStep)
      : null;
    if (step === null) {
      const next = afterFailedAttempt(admin, now);
      await db.platformAdmin.update({
        where: { id: admin.id },
        data: { failedLoginCount: next.failedLoginCount, lockedUntil: next.lockedUntil },
      });
      await audit("platform.login_failed", admin, meta, {
        reason: passwordOk ? "wrong_code" : "wrong_password",
      });
      return next.justLocked && next.lockedUntil
        ? { ok: false, reason: "locked", lockedUntil: next.lockedUntil }
        : { ok: false, reason: "invalid" };
    }

    // Claim the code's time step, so the same code can't be used again.
    const claimed = await db.platformAdmin.updateMany({
      where: {
        id: admin.id,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: BigInt(step) } }],
      },
      data: { ...afterSuccessfulLogin(), totpLastStep: BigInt(step), lastLoginAt: now },
    });
    if (claimed.count !== 1) return { ok: false, reason: "invalid" };

    const token = randomToken();
    const expiresAt = new Date(now.getTime() + PLATFORM_SESSION_HOURS * 3_600_000);
    await db.platformSession.create({
      data: {
        tokenHash: sha256(token),
        adminId: admin.id,
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    await audit("platform.login", admin, meta);
    return { ok: true, token, expiresAt };
  });
}

export function validatePlatformSession(
  token: string,
  now = new Date(),
): Promise<PlatformActor | null> {
  return asSystem(async () => {
    const session = await db.platformSession.findUnique({
      where: { tokenHash: sha256(token) },
      include: { admin: true },
    });
    if (!session) return null;
    if (checkSession(session, now) !== "valid" || !session.admin.isActive) {
      if (!session.revokedAt) {
        await db.platformSession.update({ where: { id: session.id }, data: { revokedAt: now } });
      }
      return null;
    }
    if (shouldTouch(session, now)) {
      await db.platformSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    const { admin } = session;
    return { id: admin.id, name: admin.name, email: admin.email, sessionId: session.id };
  });
}

export function platformSignOut(admin: PlatformActor, meta: RequestMeta, now = new Date()) {
  return asSystem(async () => {
    await db.platformSession.updateMany({
      where: { id: admin.sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
    await audit("platform.logout", admin, meta);
  });
}
