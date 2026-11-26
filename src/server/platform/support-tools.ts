import { Prisma } from "@prisma/client";

import {
  billingDetailsSchema,
  findSignUpSchema,
  resetTwoStepSupportSchema,
  supportReasonSchema,
} from "@/schemas/platform";
import { writeAudit } from "@/server/audit";
import { revokeUserSessions } from "@/server/auth/session";
import { clearTwoStep } from "@/server/auth/two-step";
import { asSystem, db, type Tx } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { supportResendSignUpCode } from "@/server/signup/service";
import type { SignUpDeps } from "@/server/signup/service";
import { parseInput } from "@/server/validation";
import type { PlatformActor } from "./auth";
import { assertPlatformCan, writeStaffLog } from "./staff-log";

/**
 * Support tools for Propfolio staff (Platform Support and Owner). Each needs a reason and is
 * written to the staff log and to the customer's own audit log, in one transaction. No AI agent
 * can call these: they are not part of the agent API.
 */

/** Staff log + the customer's audit log (shown there as "Propfolio staff"). */
export async function logSupportAction(
  tx: Tx,
  admin: PlatformActor,
  action: string,
  target: { accountId: string | null; entityType: string; entityId: string },
  meta: RequestMeta,
  metadata: Record<string, unknown>,
  changes?: Record<string, unknown>,
) {
  await writeStaffLog(
    {
      actor: admin,
      kind: "CHANGE",
      action,
      entityType: target.entityType,
      entityId: target.entityId,
      accountId: target.accountId,
      metadata: { ...metadata, ...(changes ? { changes } : {}) },
      meta,
    },
    tx,
  );
  await writeAudit(
    {
      actor: { id: admin.id, name: admin.name, role: null },
      action,
      entityType: target.entityType,
      entityId: target.entityId,
      changes: changes ?? null,
      metadata: { platform: true, ...metadata },
      meta,
      accountId: target.accountId,
    },
    tx,
  );
}

async function memberOf(tx: Tx, accountId: string, userId: string) {
  if (!isUuid(accountId) || !isUuid(userId))
    throw new NotFoundError("We couldn't find that person.");
  const m = await tx.membership.findFirst({
    where: { accountId, userId },
    select: { user: { select: { id: true, name: true, lockedUntil: true } } },
  });
  if (!m) throw new NotFoundError("We couldn't find that person in this account.");
  return m.user;
}

// ─── Sign-ups waiting for their code ─────────────────────────────────────────────────────

/** Find a sign-up still waiting for its email code, by the exact email the customer gives. */
export async function findPendingSignUp(actor: PlatformActor, input: unknown, now = new Date()) {
  assertPlatformCan(actor, "accounts.support");
  const { email } = parseInput(findSignUpSchema, input);
  const p = await asSystem(() =>
    db.pendingSignUp.findFirst({
      where: { email, codeHash: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        codesSent: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
  );
  return p ? { ...p, expired: p.expiresAt <= now } : null;
}

/** Send a fresh code to a waiting sign-up. */
export async function resendSignUpCodeForCustomer(
  actor: PlatformActor,
  pendingId: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
  deps?: Pick<SignUpDeps, "send">,
) {
  assertPlatformCan(actor, "accounts.support");
  const { reason } = parseInput(supportReasonSchema, input);
  if (!isUuid(pendingId))
    throw new NotFoundError("This sign-up has gone. Ask them to start again.");
  const ok = await supportResendSignUpCode(pendingId, now, deps);
  if (!ok) throw new NotFoundError("This sign-up has gone. Ask them to start again.");
  // No customer account exists yet: Propfolio's own audit entry (no account) and the staff log.
  await asSystem(() =>
    db.$transaction((tx) =>
      logSupportAction(
        tx,
        actor,
        "support.signup_code_resent",
        { accountId: null, entityType: "PendingSignUp", entityId: pendingId },
        meta,
        { reason },
      ),
    ),
  );
}

// ─── People in an account ────────────────────────────────────────────────────────────────

/** Unlock someone locked out after too many wrong passwords. */
export async function unlockUserForCustomer(
  actor: PlatformActor,
  accountId: string,
  userId: string,
  input: unknown,
  meta: RequestMeta,
) {
  assertPlatformCan(actor, "accounts.support");
  const { reason } = parseInput(supportReasonSchema, input);
  await asSystem(() =>
    db.$transaction(async (tx) => {
      await memberOf(tx, accountId, userId);
      await tx.user.update({
        where: { id: userId },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      await logSupportAction(
        tx,
        actor,
        "support.user_unlocked",
        { accountId, entityType: "User", entityId: userId },
        meta,
        { reason },
      );
    }),
  );
}

/**
 * Reset someone's two-step sign-in after checking who they are; the check is recorded. They are
 * signed out and set it up again at their next sign-in.
 */
export async function resetTwoStepForCustomer(
  actor: PlatformActor,
  accountId: string,
  userId: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(actor, "accounts.support");
  const data = parseInput(resetTwoStepSupportSchema, input);
  await asSystem(() =>
    db.$transaction(async (tx) => {
      await memberOf(tx, accountId, userId);
      await clearTwoStep(tx, userId, now);
      await logSupportAction(
        tx,
        actor,
        "support.two_step_reset",
        { accountId, entityType: "User", entityId: userId },
        meta,
        {
          reason: data.reason,
          identityCheck: { method: data.identityMethod, notes: data.identityNotes },
        },
      );
    }),
  );
  await revokeUserSessions(userId, {}, now);
}

// ─── Billing details ─────────────────────────────────────────────────────────────────────

/**
 * Correct the name and address printed on future payment records. Records already issued keep
 * what they said (they are never edited).
 */
export async function correctBillingDetails(
  actor: PlatformActor,
  accountId: string,
  input: unknown,
  meta: RequestMeta,
) {
  assertPlatformCan(actor, "accounts.support");
  const data = parseInput(billingDetailsSchema, input);
  if (!isUuid(accountId)) throw new NotFoundError("We couldn't find that account.");
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) throw new NotFoundError("We couldn't find that account.");
      const key = { accountId_key: { accountId, key: "companyAddress" } };
      const before = await tx.setting.findUnique({ where: key });
      const beforeAddress = typeof before?.value === "string" ? before.value : "";
      await tx.account.update({ where: { id: accountId }, data: { name: data.name } });
      await tx.setting.upsert({
        where: key,
        create: { accountId, key: "companyAddress", value: data.address as Prisma.InputJsonValue },
        update: { value: data.address as Prisma.InputJsonValue },
      });
      await logSupportAction(
        tx,
        actor,
        "support.billing_details_corrected",
        { accountId, entityType: "Account", entityId: accountId },
        meta,
        { reason: data.reason },
        {
          ...(account.name !== data.name
            ? { name: { before: account.name, after: data.name } }
            : {}),
          ...(beforeAddress !== data.address
            ? { address: { before: beforeAddress, after: data.address } }
            : {}),
        },
      );
    }),
  );
}
