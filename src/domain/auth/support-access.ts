/**
 * Customer-granted support access: what Propfolio support may do inside a customer's app while
 * the Owner or a User Admin allows it. Pure; the server checks these on every page and action.
 */
import type { Permission } from "./roles";

export const SUPPORT_ACCESS_DURATIONS = ["24h", "72h", "7d"] as const;
export type SupportAccessDuration = (typeof SUPPORT_ACCESS_DURATIONS)[number];

export const SUPPORT_ACCESS_HOURS: Record<SupportAccessDuration, number> = {
  "24h": 24,
  "72h": 72,
  "7d": 168,
};

export const SUPPORT_ACCESS_LABELS: Record<SupportAccessDuration, string> = {
  "24h": "24 hours",
  "72h": "3 days",
  "7d": "7 days",
};

/** A support session itself lasts at most this long (and never past the access's end). */
export const SUPPORT_SESSION_HOURS = 8;

/**
 * Support works like a User Admin, except it can never change who has access, billing, or
 * export, anonymise or permanently delete data.
 */
export const SUPPORT_DENIED: ReadonlySet<Permission> = new Set<Permission>([
  "user.manage",
  "billing.manage",
  "privacy.manage",
  "record.purge",
  "data.export",
]);

export function supportMay(permission: Permission): boolean {
  return !SUPPORT_DENIED.has(permission);
}

export function supportAccessEnds(grantedAt: Date, duration: SupportAccessDuration): Date {
  return new Date(grantedAt.getTime() + SUPPORT_ACCESS_HOURS[duration] * 3_600_000);
}

export function supportSessionEnds(now: Date, accessEndsAt: Date): Date {
  return new Date(
    Math.min(now.getTime() + SUPPORT_SESSION_HOURS * 3_600_000, accessEndsAt.getTime()),
  );
}

export function grantIsActive(g: { expiresAt: Date; revokedAt: Date | null }, now: Date): boolean {
  return g.revokedAt === null && g.expiresAt > now;
}
