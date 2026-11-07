/** Sign users out after 30 minutes without activity, and always after 12 hours. */
export const SESSION_IDLE_MINUTES = 30;
export const SESSION_ABSOLUTE_HOURS = 12;
/** "Keep me signed in on this device": the session lasts 30 days, with no idle timeout (except
 * for Owners and Admins while their account's "sign out after 30 idle minutes" setting is on). */
export const SESSION_PERSISTENT_DAYS = 30;
/** Avoid writing to the database on every request: refresh "last seen" at most this often. */
export const SESSION_TOUCH_SECONDS = 60;

export interface SessionTimes {
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export type SessionCheck = "valid" | "idle" | "expired" | "revoked";

export function checkSession(
  s: SessionTimes,
  now: Date,
  options: { idleTimeout?: boolean } = {},
): SessionCheck {
  if (s.revokedAt) return "revoked";
  if (s.expiresAt.getTime() <= now.getTime()) return "expired";
  const idleTimeout = options.idleTimeout ?? true;
  if (idleTimeout && now.getTime() - s.lastSeenAt.getTime() >= SESSION_IDLE_MINUTES * 60_000) {
    return "idle";
  }
  return "valid";
}

/**
 * Whether the 30-minute idle timeout applies: always for ordinary sessions; for "keep me signed
 * in" sessions only for Owners and Admins, and only while the account's setting is on (default).
 */
export function idleTimeoutApplies(o: {
  persistent: boolean;
  isAdmin: boolean;
  adminIdleTimeoutSetting: boolean;
}): boolean {
  if (!o.persistent) return true;
  return o.isAdmin && o.adminIdleTimeoutSetting;
}

export function shouldTouch(s: SessionTimes, now: Date): boolean {
  return now.getTime() - s.lastSeenAt.getTime() >= SESSION_TOUCH_SECONDS * 1000;
}

export function sessionExpiry(now: Date, persistent = false): Date {
  if (persistent) return new Date(now.getTime() + SESSION_PERSISTENT_DAYS * 86_400_000);
  return new Date(now.getTime() + SESSION_ABSOLUTE_HOURS * 3_600_000);
}
