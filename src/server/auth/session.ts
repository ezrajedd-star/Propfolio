import type { Role } from "@/domain/auth/roles";
import type { PlanAccess } from "@/domain/plans/plans";
import { isAdminRole } from "@/domain/auth/roles";
import {
  checkSession,
  idleTimeoutApplies,
  sessionExpiry,
  shouldTouch,
} from "@/domain/auth/session-policy";
import { documentsToAccept, type LegalDocumentName } from "@/domain/legal/documents";
import { twoStepState, type TwoStepState } from "@/domain/auth/two-step";
import { grantIsActive } from "@/domain/auth/support-access";
import { asSystem, db } from "@/server/db";
import { loadPlanAccess, memberWithinUserLimit } from "@/server/plans/access";
import type { RequestMeta } from "@/server/request-meta";
import { randomToken, sha256 } from "./tokens";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  /** "setup_required": an Owner or Admin who must set up two-step sign-in before anything else. */
  twoStep: TwoStepState;
  /** Legal documents whose current version they haven't accepted (asked at the next page). */
  legalToAccept: LegalDocumentName[];
}

/** Propfolio support working in the account under its support access. */
export interface SupportContext {
  adminId: string;
  adminName: string;
  grantId: string;
  /** When the account's support access ends. */
  accessEndsAt: Date;
}

export interface ValidSession {
  sessionId: string;
  /** Set only for a Propfolio support session. */
  support?: SupportContext;
  /** The account this session works in. */
  accountId: string;
  /** `role` is the person's role in that account. */
  user: SessionUser;
  /** What the account's plan allows right now. */
  access: PlanAccess;
}

/** Create a session in an account and return the raw token for the cookie. Only its hash is stored. */
export async function createSession(
  userId: string,
  accountId: string,
  meta: RequestMeta,
  now = new Date(),
  persistent = false,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = sessionExpiry(now, persistent);
  await asSystem(() =>
    db.session.create({
      data: {
        tokenHash: sha256(token),
        userId,
        accountId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
        persistent,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    }),
  );
  return { token, expiresAt };
}

/**
 * Look up a session token. Returns null when the session is unknown, revoked, idle for
 * too long, past its absolute expiry, or when the person was turned off in the session's
 * account, or that account was suspended.
 */
export function validateSessionToken(
  token: string,
  now = new Date(),
): Promise<ValidSession | null> {
  return asSystem(async () => {
    const session = await db.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            mustChangePassword: true,
            totpConfirmedAt: true,
            twoStepGraceUntil: true,
          },
        },
        account: { select: { status: true } },
      },
    });
    if (!session) return null;
    if (session.supportGrantId) return validateSupportSession(session, now);

    const membership = await db.membership.findUnique({
      where: { accountId_userId: { accountId: session.accountId, userId: session.userId } },
      select: { role: true, isActive: true, createdAt: true },
    });
    let allowed = membership?.isActive === true && session.account.status === "ACTIVE";
    // Read here, inside the same system scope, so every request sees the plan as it is now.
    const access = allowed ? await loadPlanAccess(session.accountId, now, db) : null;
    if (allowed && membership && access) {
      // Members beyond the plan's user limit are suspended (not deleted) until it upgrades.
      allowed = await memberWithinUserLimit(
        db,
        { accountId: session.accountId, role: membership.role, createdAt: membership.createdAt },
        access.plan,
      );
    }

    // "Keep me signed in": no idle timeout, except for Owners and Admins while the account's
    // setting (on by default, for shared computers) says so.
    const idleTimeout =
      membership !== null &&
      idleTimeoutApplies({
        persistent: session.persistent,
        isAdmin: isAdminRole(membership.role),
        adminIdleTimeoutSetting: session.persistent
          ? await adminIdleTimeoutSetting(session.accountId)
          : true,
      });
    if (
      checkSession(session, now, { idleTimeout }) !== "valid" ||
      !allowed ||
      !membership ||
      !access
    ) {
      if (!session.revokedAt) {
        await db.session.update({ where: { id: session.id }, data: { revokedAt: now } });
      }
      return null;
    }

    if (shouldTouch(session, now)) {
      await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }

    const { totpConfirmedAt, twoStepGraceUntil, ...user } = session.user;
    const accepted = await db.legalAcceptance.findMany({
      where: { userId: session.userId },
      select: { document: true, version: true },
    });
    return {
      sessionId: session.id,
      accountId: session.accountId,
      access,
      user: {
        ...user,
        role: membership.role,
        legalToAccept: documentsToAccept(accepted),
        twoStep: twoStepState(
          {
            role: membership.role,
            enrolled: totpConfirmedAt !== null,
            graceUntil: twoStepGraceUntil,
          },
          now,
        ),
      },
    };
  });
}

/**
 * A support session is valid while the account's support access lasts (not turned off, not
 * past its end), the account is active, and within the usual idle and absolute limits. Support
 * works with User Admin rights minus the support exclusions (see domain/auth/support-access).
 */
async function validateSupportSession(
  session: {
    id: string;
    accountId: string;
    supportGrantId: string | null;
    supportAdminId: string | null;
    supportAdminName: string | null;
    lastSeenAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    account: { status: string };
    user: { id: string; name: string; email: string };
  },
  now: Date,
): Promise<ValidSession | null> {
  const grant = await db.supportAccessGrant.findUnique({ where: { id: session.supportGrantId! } });
  const access =
    grant && grant.accountId === session.accountId && session.account.status === "ACTIVE"
      ? await loadPlanAccess(session.accountId, now, db)
      : null;
  if (
    !grant ||
    !access ||
    !grantIsActive(grant, now) ||
    !session.supportAdminId ||
    checkSession(session, now, { idleTimeout: true }) !== "valid"
  ) {
    if (!session.revokedAt) {
      await db.session.update({ where: { id: session.id }, data: { revokedAt: now } });
    }
    return null;
  }
  if (shouldTouch(session, now)) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  return {
    sessionId: session.id,
    accountId: session.accountId,
    access,
    support: {
      adminId: session.supportAdminId,
      adminName: session.supportAdminName ?? "Propfolio support",
      grantId: grant.id,
      accessEndsAt: grant.expiresAt,
    },
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: "ADMIN",
      mustChangePassword: false,
      twoStep: "on",
      legalToAccept: [],
    },
  };
}

export async function revokeSession(sessionId: string, now = new Date()): Promise<void> {
  await asSystem(() =>
    db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now },
    }),
  );
}

/**
 * Sign a user out everywhere, optionally keeping the current session. With `accountId`, only
 * their sessions in that account end (e.g. when an Admin turns them off there).
 */
export async function revokeUserSessions(
  userId: string,
  options: { exceptSessionId?: string; accountId?: string } = {},
  now = new Date(),
): Promise<number> {
  const { count } = await asSystem(() =>
    db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options.accountId ? { accountId: options.accountId } : {}),
        ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
      },
      data: { revokedAt: now },
    }),
  );
  return count;
}

/** Remove sessions that ended more than a day ago. Run by the worker. */
export async function purgeOldSessions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 3_600_000);
  const { count } = await asSystem(() =>
    db.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoff } },
          { revokedAt: { lt: cutoff } },
          { lastSeenAt: { lt: cutoff } },
        ],
      },
    }),
  );
  return count;
}

/** The account's "sign Owners and Admins out after 30 idle minutes" setting (default on). */
async function adminIdleTimeoutSetting(accountId: string): Promise<boolean> {
  const row = await db.setting.findUnique({
    where: { accountId_key: { accountId, key: "adminIdleTimeout" } },
    select: { value: true },
  });
  return row?.value !== false;
}
