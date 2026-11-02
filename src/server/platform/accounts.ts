import type { AccountStatus, Plan } from "@prisma/client";

import { moneyString } from "@/domain/money/money";
import { fromDbDate, toDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { extendTrialSchema, manualPaymentSchema, suspendAccountSchema } from "@/schemas/platform";
import { writeAudit } from "@/server/audit";
import { asSystem, db, type Tx } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { isUuid } from "@/server/db-errors";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import type { PlatformActor } from "./auth";

/**
 * The platform admin's view of customer accounts: account-level facts only (plan, trial,
 * payments, status, how many people and units). Never tenants, leases, payments from tenants or
 * documents: those are the customers' own records.
 */

export interface AccountSummary {
  id: string;
  name: string;
  plan: Plan;
  status: AccountStatus;
  /** The trial's last day (Manila), while it lasts or after it ended. */
  trialEndsOn: IsoDate | null;
  trialDaysLeft: number | null;
  paidUntil: IsoDate | null;
  createdAt: Date;
  activeUsers: number;
  units: number;
}

/** The Manila day a trial end moment falls on, and the moment for "end of that day". */
function trialEndDay(trialEndsAt: Date | null): IsoDate | null {
  return trialEndsAt ? manilaToday(new Date(trialEndsAt.getTime() - 1)) : null;
}
function endOfManilaDay(date: IsoDate): Date {
  return new Date(`${date}T23:59:59.999+08:00`);
}

function daysLeft(trialEndsAt: Date | null, now: Date): number | null {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000));
}

async function counts(accountIds: string[]) {
  const [members, units] = await Promise.all([
    db.membership.groupBy({
      by: ["accountId"],
      where: { accountId: { in: accountIds }, isActive: true },
      _count: { _all: true },
    }),
    db.unit.groupBy({
      by: ["accountId"],
      where: { accountId: { in: accountIds }, archivedAt: null },
      _count: { _all: true },
    }),
  ]);
  const map = (rows: { accountId: string; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.accountId, r._count._all]));
  return { members: map(members), units: map(units) };
}

type AccountRow = Awaited<ReturnType<typeof db.account.findMany>>[number];

function summary(a: AccountRow, c: Awaited<ReturnType<typeof counts>>, now: Date): AccountSummary {
  return {
    id: a.id,
    name: a.name,
    plan: a.plan,
    status: a.status,
    trialEndsOn: trialEndDay(a.trialEndsAt),
    trialDaysLeft: daysLeft(a.trialEndsAt, now),
    paidUntil: a.paidUntil ? fromDbDate(a.paidUntil) : null,
    createdAt: a.createdAt,
    activeUsers: c.members.get(a.id) ?? 0,
    units: c.units.get(a.id) ?? 0,
  };
}

export function listAccounts(
  _admin: PlatformActor,
  opts: { q?: string } = {},
  now = new Date(),
): Promise<AccountSummary[]> {
  return asSystem(async () => {
    const q = opts.q?.trim();
    const accounts = await db.account.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : {},
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const c = await counts(accounts.map((a) => a.id));
    return accounts.map((a) => summary(a, c, now));
  });
}

export function getAccountDetail(_admin: PlatformActor, id: string, now = new Date()) {
  return asSystem(async () => {
    if (!isUuid(id)) throw new NotFoundError("We couldn't find that account.");
    const account = await db.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundError("We couldn't find that account.");
    const [c, owner, payments, history] = await Promise.all([
      counts([id]),
      db.membership.findFirst({
        where: { accountId: id, role: "OWNER" },
        select: { user: { select: { name: true, email: true } } },
      }),
      db.manualPayment.findMany({ where: { accountId: id }, orderBy: { recordedAt: "desc" } }),
      db.auditLog.findMany({
        where: { accountId: null, entityType: "Account", entityId: id },
        orderBy: { seq: "desc" },
        take: 50,
        select: { seq: true, at: true, actorName: true, action: true, metadata: true },
      }),
    ]);
    return {
      ...summary(account, c, now),
      suspendedAt: account.suspendedAt,
      suspendedReason: account.suspendedReason,
      /** The Owner's name and email, to contact the customer. */
      owner: owner?.user ?? null,
      payments: payments.map((p) => ({
        id: p.id,
        amount: moneyString(p.amount),
        paidUntil: fromDbDate(p.paidUntil),
        reference: p.reference,
        note: p.note,
        recordedAt: p.recordedAt,
      })),
      history: history.map((h) => ({ ...h, seq: h.seq.toString() })),
    };
  });
}

/** Platform actions are recorded with no account, against the account they changed. */
function auditAccount(
  tx: Tx,
  admin: PlatformActor,
  action: string,
  accountId: string,
  meta: RequestMeta,
  changes: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
) {
  return writeAudit(
    {
      actor: { id: admin.id, name: admin.name, role: null },
      action,
      entityType: "Account",
      entityId: accountId,
      changes,
      metadata: { platform: true, ...metadata },
      meta,
      accountId: null,
    },
    tx,
  );
}

async function lockAccount(tx: Tx, id: string) {
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that account.");
  const account = await tx.account.findUnique({ where: { id } });
  if (!account) throw new NotFoundError("We couldn't find that account.");
  return account;
}

/** Give an account (more) free Premium days, up to the chosen day. */
export async function extendTrial(
  admin: PlatformActor,
  accountId: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  const data = parseInput(extendTrialSchema, input);
  if (data.trialEndsOn < manilaToday(now)) {
    throw new ValidationError("Please check the date.", {
      trialEndsOn: "Choose today or a later day.",
    });
  }
  return asSystem(() =>
    db.$transaction(async (tx) => {
      const before = await lockAccount(tx, accountId);
      const trialEndsAt = endOfManilaDay(data.trialEndsOn);
      await tx.account.update({ where: { id: accountId }, data: { trialEndsAt, plan: "PREMIUM" } });
      await auditAccount(
        tx,
        admin,
        "platform.trial_extended",
        accountId,
        meta,
        {
          trialEndsOn: { before: trialEndDay(before.trialEndsAt), after: data.trialEndsOn },
          ...(before.plan !== "PREMIUM" ? { plan: { before: before.plan, after: "PREMIUM" } } : {}),
        },
        { reason: data.reason },
      );
    }),
  );
}

/**
 * Record a bank transfer (annual or corporate customers). The account is then paid until the
 * given day, unless it was already paid for longer. Not an official receipt.
 */
export async function recordManualPayment(
  admin: PlatformActor,
  accountId: string,
  input: unknown,
  meta: RequestMeta,
) {
  const data = parseInput(manualPaymentSchema, input);
  return asSystem(() =>
    db.$transaction(async (tx) => {
      const before = await lockAccount(tx, accountId);
      const previous = before.paidUntil ? fromDbDate(before.paidUntil) : null;
      const paidUntil = previous && previous > data.paidUntil ? previous : data.paidUntil;
      const payment = await tx.manualPayment.create({
        data: {
          accountId,
          amount: data.amount,
          paidUntil: toDbDate(data.paidUntil),
          reference: data.reference,
          note: data.note || null,
          recordedById: admin.id,
        },
      });
      await tx.account.update({
        where: { id: accountId },
        data: { paidUntil: toDbDate(paidUntil) },
      });
      await auditAccount(
        tx,
        admin,
        "platform.manual_payment",
        accountId,
        meta,
        { paidUntil: { before: previous, after: paidUntil } },
        { paymentId: payment.id, amount: data.amount, reference: data.reference },
      );
      return payment;
    }),
  );
}

/**
 * Suspend an account (nobody in it can sign in; open sessions end) or reactivate it. Nothing is
 * deleted, and reminder emails stop while it is suspended.
 */
export async function setAccountSuspended(
  admin: PlatformActor,
  accountId: string,
  suspended: boolean,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  const reason = suspended ? parseInput(suspendAccountSchema, input).reason : null;
  return asSystem(() =>
    db.$transaction(async (tx) => {
      const before = await lockAccount(tx, accountId);
      const status = suspended ? "SUSPENDED" : "ACTIVE";
      if (before.status === status) return;
      await tx.account.update({
        where: { id: accountId },
        data: { status, suspendedAt: suspended ? now : null, suspendedReason: reason },
      });
      if (suspended) {
        await tx.session.updateMany({
          where: { accountId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      await auditAccount(
        tx,
        admin,
        suspended ? "platform.account_suspended" : "platform.account_reactivated",
        accountId,
        meta,
        { status: { before: before.status, after: status } },
        reason ? { reason } : {},
      );
    }),
  );
}
