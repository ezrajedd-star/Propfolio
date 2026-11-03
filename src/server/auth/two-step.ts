import { createHmac } from "node:crypto";

import type { User } from "@prisma/client";
import { toString as qrSvg } from "qrcode";

import { isAdminRole } from "@/domain/auth/roles";
import { newTotpSecret, totpUri, verifyTotp } from "@/domain/auth/totp";
import {
  TRUSTED_DEVICE_DAYS,
  looksLikeRecoveryCode,
  newRecoveryCodes,
  normaliseRecoveryCode,
  twoStepState,
  type TwoStepState,
} from "@/domain/auth/two-step";
import { writeAudit } from "@/server/audit";
import { asSystem, db, type Tx } from "@/server/db";
import { appSecret } from "@/server/env";
import { NotFoundError, ValidationError } from "@/server/errors";
import { isUuid } from "@/server/db-errors";
import type { RequestMeta } from "@/server/request-meta";
import { assertCan, type Actor } from "./authorize";
import { verifyPassword } from "./password";
import { decryptSecret, encryptSecret } from "./secrets";
import { revokeUserSessions } from "./session";
import { randomToken, sha256 } from "./tokens";

/**
 * Two-step sign-in for customers (rules in src/domain/auth/two-step.ts). Secrets, recovery codes
 * and remembered devices are sign-in internals: they are read and written outside any one
 * account's work, and only ever for the person themselves or by an Admin of their account.
 */

/** Recovery codes are keyed with APP_SECRET, so a stolen database alone can't test guesses. */
function recoveryHash(code: string): string {
  return createHmac("sha256", appSecret())
    .update(`recovery:${normaliseRecoveryCode(code)}`)
    .digest("hex");
}

const wrongCode = () =>
  new ValidationError("Please check the code.", {
    code: "That code didn't work. Type the 6-digit code your app shows right now.",
  });

// ─── At sign-in ──────────────────────────────────────────────────────────────────────────

/**
 * Check the second step and use it up: an app code (its 30-second step can't be used again) or
 * a recovery code (each works once). Null when it's wrong.
 */
export async function checkSecondStep(
  user: User,
  code: string,
  now: Date,
): Promise<{ method: "app" } | { method: "recovery_code"; left: number } | null> {
  if (!user.totpSecretEnc || !user.totpConfirmedAt) return null;
  if (looksLikeRecoveryCode(code)) {
    const used = await db.recoveryCode.updateMany({
      where: { userId: user.id, codeHash: recoveryHash(code), usedAt: null },
      data: { usedAt: now },
    });
    if (used.count !== 1) return null;
    const left = await db.recoveryCode.count({ where: { userId: user.id, usedAt: null } });
    return { method: "recovery_code", left };
  }
  const last = user.totpLastStep === null ? null : Number(user.totpLastStep);
  const step = verifyTotp(decryptSecret(user.totpSecretEnc), code, now, last);
  if (step === null) return null;
  const claimed = await db.user.updateMany({
    where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: BigInt(step) } }] },
    data: { totpLastStep: BigInt(step) },
  });
  return claimed.count === 1 ? { method: "app" } : null;
}

/** Is this browser one the person asked us to remember (and still valid)? */
export async function trustedDeviceFor(
  userId: string,
  token: string | undefined,
  now: Date,
): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const device = await db.trustedDevice.findUnique({ where: { tokenHash: sha256(token) } });
  if (!device || device.userId !== userId || device.revokedAt || device.expiresAt <= now) {
    return false;
  }
  await db.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: now } });
  return true;
}

export async function rememberDevice(userId: string, meta: RequestMeta, now: Date) {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + TRUSTED_DEVICE_DAYS * 86_400_000);
  await db.trustedDevice.create({
    data: {
      tokenHash: sha256(token),
      userId,
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, expiresAt };
}

/** Forget every remembered device (after a password change, a reset, or on request). */
export function forgetDevices(userId: string, now = new Date()) {
  return asSystem(() =>
    db.trustedDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  );
}

// ─── The person's own settings (My account → Two-step sign-in) ───────────────────────────

export interface TwoStepSummary {
  state: TwoStepState;
  /** Required because they're an Owner or Admin somewhere. */
  required: boolean;
  recoveryCodesLeft: number;
  rememberedDevices: number;
}

/** Owner or Admin in any account they can use: then two-step sign-in can't be turned off. */
async function requiredAnywhere(userId: string): Promise<boolean> {
  const memberships = await db.membership.findMany({
    where: { userId, isActive: true },
    select: { role: true },
  });
  return memberships.some((m) => isAdminRole(m.role));
}

export function getTwoStepSummary(actor: Actor, now = new Date()): Promise<TwoStepSummary> {
  return asSystem(async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
    const required = await requiredAnywhere(actor.id);
    const [recoveryCodesLeft, rememberedDevices] = await Promise.all([
      db.recoveryCode.count({ where: { userId: actor.id, usedAt: null } }),
      db.trustedDevice.count({
        where: { userId: actor.id, revokedAt: null, expiresAt: { gt: now } },
      }),
    ]);
    return {
      state: twoStepState(
        {
          role: required ? "ADMIN" : actor.role,
          enrolled: Boolean(user.totpConfirmedAt),
          graceUntil: user.twoStepGraceUntil,
        },
        now,
      ),
      required,
      recoveryCodesLeft,
      rememberedDevices,
    };
  });
}

/**
 * The set-up screen: a new secret to scan (kept, encrypted, until it's confirmed), as a QR code
 * and as text. Refused when two-step sign-in is already on.
 */
export function startTwoStepSetup(actor: Actor) {
  return asSystem(async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (user.totpConfirmedAt) throw new ValidationError("Two-step sign-in is already on.");
    let secret = user.totpSecretEnc ? decryptSecret(user.totpSecretEnc) : null;
    if (!secret) {
      secret = newTotpSecret();
      await db.user.update({
        where: { id: user.id },
        data: { totpSecretEnc: encryptSecret(secret), totpLastStep: null },
      });
    }
    return {
      secret: secret.replace(/(.{4})/g, "$1 ").trim(),
      qrSvg: await qrSvg(totpUri(secret, user.email), {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
      }),
    };
  });
}

async function replaceRecoveryCodes(tx: Tx, userId: string): Promise<string[]> {
  const codes = newRecoveryCodes();
  await tx.recoveryCode.deleteMany({ where: { userId } });
  await tx.recoveryCode.createMany({
    data: codes.map((c) => ({ userId, codeHash: recoveryHash(c) })),
  });
  return codes;
}

function auditOwn(tx: Tx, actor: Actor, action: string, meta: RequestMeta, metadata = {}) {
  return writeAudit(
    {
      actor,
      action,
      entityType: "User",
      entityId: actor.id,
      metadata,
      meta,
      accountId: actor.accountId,
    },
    tx,
  );
}

/** Confirm the first code: two-step sign-in is on. Returns the recovery codes, shown once. */
export async function confirmTwoStepSetup(
  actor: Actor,
  input: { code?: unknown },
  meta: RequestMeta,
  now = new Date(),
): Promise<string[]> {
  const code = typeof input.code === "string" ? input.code : "";
  return asSystem(async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (user.totpConfirmedAt) throw new ValidationError("Two-step sign-in is already on.");
    if (!user.totpSecretEnc) throw new ValidationError("Please start the set-up again.");
    const step = verifyTotp(decryptSecret(user.totpSecretEnc), code, now);
    if (step === null) throw wrongCode();
    return db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { totpConfirmedAt: now, totpLastStep: BigInt(step), twoStepGraceUntil: null },
      });
      const codes = await replaceRecoveryCodes(tx, user.id);
      await auditOwn(tx, actor, "auth.two_step_enabled", meta);
      return codes;
    });
  });
}

/** Ten new recovery codes (the old ones stop working). Needs a current code from the app. */
export async function newRecoveryCodesFor(
  actor: Actor,
  input: { code?: unknown },
  meta: RequestMeta,
  now = new Date(),
): Promise<string[]> {
  const code = typeof input.code === "string" ? input.code : "";
  return asSystem(async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!user.totpConfirmedAt) throw new ValidationError("Two-step sign-in isn't on.");
    if (looksLikeRecoveryCode(code) || !(await checkSecondStep(user, code, now))) {
      throw wrongCode();
    }
    return db.$transaction(async (tx) => {
      const codes = await replaceRecoveryCodes(tx, user.id);
      await auditOwn(tx, actor, "auth.recovery_codes_replaced", meta);
      return codes;
    });
  });
}

/**
 * Turn two-step sign-in off. Only for people who don't need it (not an Owner or Admin
 * anywhere), and only with the password and a current code.
 */
export async function turnOffTwoStep(
  actor: Actor,
  input: { password?: unknown; code?: unknown },
  meta: RequestMeta,
  now = new Date(),
): Promise<void> {
  const password = typeof input.password === "string" ? input.password : "";
  const code = typeof input.code === "string" ? input.code : "";
  return asSystem(async () => {
    if (await requiredAnywhere(actor.id)) {
      throw new ValidationError(
        "Owners and Admins must keep two-step sign-in on, to protect the whole company's data.",
      );
    }
    const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!user.totpConfirmedAt) return;
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new ValidationError("Please check the highlighted fields.", {
        password: "That isn't your current password.",
      });
    }
    if (!(await checkSecondStep(user, code, now))) throw wrongCode();
    await db.$transaction(async (tx) => {
      await clearTwoStep(tx, user.id, now);
      await auditOwn(tx, actor, "auth.two_step_disabled", meta);
    });
  });
}

/** "Forget remembered devices": every browser will ask for a code again. */
export async function forgetMyDevices(actor: Actor, meta: RequestMeta, now = new Date()) {
  const { count } = await forgetDevices(actor.id, now);
  await asSystem(() =>
    db.$transaction((tx) => auditOwn(tx, actor, "auth.devices_forgotten", meta, { count })),
  );
  return count;
}

async function clearTwoStep(tx: Tx, userId: string, now: Date) {
  await tx.user.update({
    where: { id: userId },
    data: { totpSecretEnc: null, totpConfirmedAt: null, totpLastStep: null },
  });
  await tx.recoveryCode.deleteMany({ where: { userId } });
  await tx.trustedDevice.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
}

// ─── An Admin helps someone who lost their phone ─────────────────────────────────────────

/**
 * Reset a member's two-step sign-in: they're signed out and set it up again at their next
 * sign-in (Owners and Admins must; others may). Like name and email, it can only be done here
 * for people who belong to this account only.
 */
export async function adminResetTwoStep(
  actor: Actor,
  userId: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<void> {
  assertCan(actor, "user.manage");
  if (!isUuid(userId)) throw new NotFoundError("We couldn't find that user.");
  // Only members of the current account are visible here.
  const member = await db.membership.findFirst({ where: { userId } });
  if (!member) throw new NotFoundError("We couldn't find that user.");
  if (userId === actor.id) {
    throw new ValidationError("Use My account → Two-step sign-in to change your own.");
  }
  await asSystem(async () => {
    const elsewhere = await db.membership.count({
      where: { userId, accountId: { not: actor.accountId } },
    });
    if (elsewhere > 0) {
      throw new ValidationError(
        "This person also uses Propfolio with another company, so they need to contact Propfolio to reset it.",
      );
    }
    await db.$transaction(async (tx) => {
      await clearTwoStep(tx, userId, now);
      await writeAudit(
        {
          actor,
          action: "auth.two_step_reset",
          entityType: "User",
          entityId: userId,
          meta,
          accountId: actor.accountId,
        },
        tx,
      );
    });
  });
  await revokeUserSessions(userId, {}, now);
}
