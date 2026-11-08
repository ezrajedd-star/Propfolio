import {
  planAccess,
  withinUserLimit,
  type AccountPlanFacts,
  type PlanAccess,
  type PlanName,
  unitLimitMessage,
  userLimitMessage,
} from "@/domain/plans/plans";
import { fromDbDate } from "@/domain/time/calendar-date";
import { asSystem, db, type Tx } from "@/server/db";
import { PlanLimitError } from "@/server/errors";

type Client = Tx | typeof db;

export function planFacts(account: {
  plan: PlanName;
  trialEndsAt: Date | null;
  paidUntil: Date | null;
}): AccountPlanFacts {
  return {
    plan: account.plan,
    trialEndsAt: account.trialEndsAt,
    paidUntil: account.paidUntil ? fromDbDate(account.paidUntil) : null,
  };
}

/** Active (not archived) units: what the unit limit counts. */
export function countActiveUnits(client: Client, accountId: string): Promise<number> {
  return client.unit.count({ where: { accountId, archivedAt: null } });
}

/** What the account may do right now. Reads across the account, so it runs as the system. */
export async function loadPlanAccess(
  accountId: string,
  now = new Date(),
  client?: Client,
): Promise<PlanAccess> {
  const run = async (c: Client) => {
    const account = await c.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { plan: true, trialEndsAt: true, paidUntil: true },
    });
    return planAccess(planFacts(account), await countActiveUnits(c, accountId), now);
  };
  return client ? run(client) : asSystem(() => run(db));
}

/**
 * Whether a member may sign in under the plan's user limit: the Owner always, plus the
 * longest-standing other active members up to the limit (by when they joined).
 */
export async function memberWithinUserLimit(
  client: Client,
  member: { accountId: string; role: string; createdAt: Date },
  plan: PlanName,
): Promise<boolean> {
  if (member.role === "OWNER") return true;
  const earlier = await client.membership.count({
    where: {
      accountId: member.accountId,
      isActive: true,
      role: { not: "OWNER" },
      createdAt: { lt: member.createdAt },
    },
  });
  return withinUserLimit(plan, member.role, earlier);
}

/** Active members who can sign in count towards the user limit (the Owner included). */
export function countActiveMembers(client: Client, accountId: string): Promise<number> {
  return client.membership.count({ where: { accountId, isActive: true } });
}

/**
 * Serialise limit checks per account, so two people adding at the same moment can't both slip
 * past the limit. Held until the transaction ends.
 */
async function lockAccountLimits(tx: Tx, accountId: string, what: "units" | "users") {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`plan-${what}:${accountId}`}, 0))`;
}

/** Refuse adding (or restoring) units beyond the plan's limit. Call inside the transaction. */
export async function assertUnitRoom(
  tx: Tx,
  actor: { accountId: string; access: Pick<PlanAccess, "plan" | "units"> },
  adding = 1,
): Promise<void> {
  await lockAccountLimits(tx, actor.accountId, "units");
  const used = await countActiveUnits(tx, actor.accountId);
  if (used + adding > actor.access.units.limit) {
    throw new PlanLimitError(unitLimitMessage(actor.access.plan));
  }
}

/** Refuse adding (or turning back on) a user beyond the plan's limit. Call inside the transaction. */
export async function assertUserRoom(
  tx: Tx,
  actor: { accountId: string; access: Pick<PlanAccess, "plan" | "users"> },
): Promise<void> {
  await lockAccountLimits(tx, actor.accountId, "users");
  // Open invitations hold a seat until they are used, withdrawn or expire. They are Propfolio's
  // own records (not reachable from customer work), so they are read as the system.
  const invitations = await asSystem(() =>
    db.invitation.count({
      where: {
        accountId: actor.accountId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
  );
  if (
    (await countActiveMembers(tx, actor.accountId)) + invitations + 1 >
    actor.access.users.limit
  ) {
    throw new PlanLimitError(userLimitMessage(actor.access.plan));
  }
}
