import type { Role } from "@/domain/auth/roles";
import { checkSession, sessionExpiry, shouldTouch } from "@/domain/auth/session-policy";
import { db } from "@/server/db";
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
  user: SessionUser;
}

/** Create a session and return the raw token for the cookie. Only its hash is stored. */
export async function createSession(
  userId: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = sessionExpiry(now);
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });
  return { token, expiresAt };
}

/**
 * Look up a session token. Returns null when the session is unknown, revoked, idle for
 * too long, past its absolute expiry, or belongs to a deactivated user.
 */
export async function validateSessionToken(
  token: string,
  now = new Date(),
): Promise<ValidSession | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
        },
      },
    },
  });
  if (!session) return null;

  if (checkSession(session, now) !== "valid" || !session.user.isActive) {
    if (!session.revokedAt) {
      await db.session.update({ where: { id: session.id }, data: { revokedAt: now } });
    }
    return null;
  }

  if (shouldTouch(session, now)) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }

  const { isActive: _isActive, ...user } = session.user;
  return { sessionId: session.id, user };
}

export async function revokeSession(sessionId: string, now = new Date()): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
}

/** Sign a user out everywhere, optionally keeping the current session. */
export async function revokeUserSessions(
  userId: string,
  options: { exceptSessionId?: string } = {},
  now = new Date(),
): Promise<number> {
  const { count } = await db.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
    },
    data: { revokedAt: now },
  });
  return count;
}

/** Remove sessions that ended more than a day ago. Run by the worker. */
export async function purgeOldSessions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 3_600_000);
  const { count } = await db.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { revokedAt: { lt: cutoff } },
        { lastSeenAt: { lt: cutoff } },
      ],
    },
  });
  return count;
}
