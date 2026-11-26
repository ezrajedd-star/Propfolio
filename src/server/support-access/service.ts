import {
  grantIsActive,
  supportAccessEnds,
  supportSessionEnds,
  SUPPORT_ACCESS_LABELS,
} from "@/domain/auth/support-access";
import { grantSupportAccessSchema } from "@/schemas/support-access";
import { writeAudit } from "@/server/audit";
import { assertCan, SUPPORT_REFUSED, type Actor } from "@/server/auth/authorize";
import { hashPassword } from "@/server/auth/password";
import { randomToken, sha256 } from "@/server/auth/tokens";
import { asSystem, db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import type { PlatformActor } from "@/server/platform/auth";
import { assertPlatformCan } from "@/server/platform/staff-log";
import { logSupportAction } from "@/server/platform/support-tools";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";

/**
 * "Allow Propfolio support access": the Owner or a User Admin lets Propfolio support into the
 * app for 24 hours, 3 days or 7 days. It ends by itself and can be turned off at any time.
 * Support then works only through the normal app screens; every page it opens and every change
 * goes in the account's audit log.
 */

export interface SupportAccessView {
  id: string;
  grantedByName: string;
  grantedAt: Date;
  expiresAt: Date;
}

function activeGrant(accountId: string, now: Date) {
  return asSystem(() =>
    db.supportAccessGrant.findFirst({
      where: { accountId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { grantedAt: "desc" },
    }),
  );
}

/** The account's support access, if it is on (for the banner and the Settings page). */
export async function getSupportAccess(
  actor: Pick<Actor, "accountId">,
  now = new Date(),
): Promise<SupportAccessView | null> {
  const g = await activeGrant(actor.accountId, now);
  return g
    ? { id: g.id, grantedByName: g.grantedByName, grantedAt: g.grantedAt, expiresAt: g.expiresAt }
    : null;
}

function assertCustomerAdmin(actor: Actor) {
  if (actor.support) throw new ForbiddenError(SUPPORT_REFUSED);
  assertCan(actor, "settings.manage");
}

/** Turn support access on (or change how long it lasts, from now). */
export async function grantSupportAccess(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<SupportAccessView> {
  assertCustomerAdmin(actor);
  const { duration } = parseInput(grantSupportAccessSchema, input);
  const expiresAt = supportAccessEnds(now, duration);
  const grant = await asSystem(() =>
    db.$transaction(async (tx) => {
      await tx.supportAccessGrant.updateMany({
        where: { accountId: actor.accountId, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now, revokedById: actor.id },
      });
      const g = await tx.supportAccessGrant.create({
        data: {
          accountId: actor.accountId,
          grantedById: actor.id,
          grantedByName: actor.name,
          grantedAt: now,
          expiresAt,
        },
      });
      await writeAudit(
        {
          actor,
          action: "support_access.granted",
          entityType: "SupportAccessGrant",
          entityId: g.id,
          metadata: { duration: SUPPORT_ACCESS_LABELS[duration], until: expiresAt.toISOString() },
          meta,
          accountId: actor.accountId,
        },
        tx,
      );
      return g;
    }),
  );
  return {
    id: grant.id,
    grantedByName: grant.grantedByName,
    grantedAt: grant.grantedAt,
    expiresAt: grant.expiresAt,
  };
}

/** Turn support access off now. Any open support session ends at once. */
export async function revokeSupportAccess(actor: Actor, meta: RequestMeta, now = new Date()) {
  assertCustomerAdmin(actor);
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const grants = await tx.supportAccessGrant.findMany({
        where: { accountId: actor.accountId, revokedAt: null, expiresAt: { gt: now } },
        select: { id: true },
      });
      if (grants.length === 0) return;
      const ids = grants.map((g) => g.id);
      await tx.supportAccessGrant.updateMany({
        where: { id: { in: ids } },
        data: { revokedAt: now, revokedById: actor.id },
      });
      await tx.session.updateMany({
        where: { supportGrantId: { in: ids }, revokedAt: null },
        data: { revokedAt: now },
      });
      await writeAudit(
        {
          actor,
          action: "support_access.revoked",
          entityType: "SupportAccessGrant",
          entityId: ids[0]!,
          meta,
          accountId: actor.accountId,
        },
        tx,
      );
    }),
  );
}

// ─── Propfolio staff ─────────────────────────────────────────────────────────────────────

/** For the console's account page: is support access on, and until when? */
export async function supportAccessForConsole(
  admin: PlatformActor,
  accountId: string,
  now = new Date(),
): Promise<SupportAccessView | null> {
  assertPlatformCan(admin, "accounts.view");
  if (!isUuid(accountId)) return null;
  return getSupportAccess({ accountId }, now);
}

/** The stand-in person a staff member uses in support mode (made on first use). */
async function supportUserFor(admin: PlatformActor) {
  const email = `support-${admin.id}@support.propfolio.invalid`;
  const name = `Propfolio support (${admin.name})`;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.name !== name)
      await db.user.update({ where: { id: existing.id }, data: { name } });
    return existing;
  }
  return db.user.create({
    data: {
      email,
      name,
      isSupportStaff: true,
      // Nobody knows this password: support users can't sign in, only open support sessions.
      passwordHash: await hashPassword(randomToken()),
      mustChangePassword: false,
    },
  });
}

/**
 * Open the customer's app in support mode. Only while the account's support access is on.
 * Returns the session token for the customer-app cookie.
 */
export async function startSupportSession(
  admin: PlatformActor,
  accountId: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  assertPlatformCan(admin, "accounts.support");
  if (!isUuid(accountId)) throw new NotFoundError("We couldn't find that account.");
  return asSystem(async () => {
    const grant = await activeGrant(accountId, now);
    if (!grant || !grantIsActive(grant, now)) {
      throw new ConflictError(
        "This account hasn't allowed Propfolio support access, or it has ended. Ask the Owner or a User Admin to turn it on in Settings.",
      );
    }
    const account = await db.account.findUnique({ where: { id: accountId } });
    if (!account || account.status !== "ACTIVE") {
      throw new ConflictError("Only an active account can be opened in support mode.");
    }
    const user = await supportUserFor(admin);
    const token = randomToken();
    const expiresAt = supportSessionEnds(now, grant.expiresAt);
    await db.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          tokenHash: sha256(token),
          userId: user.id,
          accountId,
          createdAt: now,
          lastSeenAt: now,
          expiresAt,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          supportGrantId: grant.id,
          supportAdminId: admin.id,
          supportAdminName: admin.name,
        },
      });
      await logSupportAction(
        tx,
        admin,
        "support.session_started",
        { accountId, entityType: "SupportAccessGrant", entityId: grant.id },
        meta,
        { until: expiresAt.toISOString() },
      );
    });
    return { token, expiresAt };
  });
}
