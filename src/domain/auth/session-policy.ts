/** Sign users out after 30 minutes without activity, and always after 12 hours. */
export const SESSION_IDLE_MINUTES = 30;
export const SESSION_ABSOLUTE_HOURS = 12;
/** Avoid writing to the database on every request: refresh "last seen" at most this often. */
export const SESSION_TOUCH_SECONDS = 60;

export interface SessionTimes {
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export type SessionCheck = "valid" | "idle" | "expired" | "revoked";

export function checkSession(s: SessionTimes, now: Date): SessionCheck {
  if (s.revokedAt) return "revoked";
  if (s.expiresAt.getTime() <= now.getTime()) return "expired";
  if (now.getTime() - s.lastSeenAt.getTime() >= SESSION_IDLE_MINUTES * 60_000) return "idle";
  return "valid";
}

export function shouldTouch(s: SessionTimes, now: Date): boolean {
  return now.getTime() - s.lastSeenAt.getTime() >= SESSION_TOUCH_SECONDS * 1000;
}

export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_ABSOLUTE_HOURS * 3_600_000);
}
