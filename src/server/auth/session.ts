import type { Role } from "@/domain/auth/roles";
import { checkSession, sessionExpiry, shouldTouch } from "@/domain/auth/session-policy";
import { asSystem, db } from "@/server/db";
import type { RequestMeta } from "@/server/request-meta";
import { randomToken, sha256 } from "./tokens";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface ValidSession {
  sessionId: string;
  /** The account this session works in. */
  accountId: string;
  /** `role` is the person's role in that account. */
  user: SessionUser;
}

/** Create a session in an account and return the raw token for the cookie. Only its hash is stored. */
export async function createSession(
  userId: string,
  accountId: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = sessionExpiry(now);
  await asSystem(() =>
    db.session.create({
      data: {
        tokenHash: sha256(token),
        userId,
        accountId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
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
        user: { select: { id: true, name: true, email: true, mustChangePassword: true } },
        account: { select: { status: true } },
      },
    });
    if (!session) return null;

    const membership = await db.membership.findUnique({
      where: { accountId_userId: { accountId: session.accountId, userId: session.userId } },
      select: { role: true, isActive: true },
    });
    const allowed = membership?.isActive === true && session.account.status === "ACTIVE";

    if (checkSession(session, now) !== "valid" || !allowed) {
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
      user: { ...session.user, role: membership.role },
    };
  });
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
