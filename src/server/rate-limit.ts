import { asSystem, db } from "@/server/db";
import { sha256 } from "@/server/auth/tokens";

/**
 * Rate limits on sign-in and recovery, on top of the per-account lockout (5 wrong passwords →
 * 15 minutes). They slow down guessing across many accounts from one address, and many
 * addresses against one account. Fixed windows, counted in the database (so they hold across
 * restarts and several app processes); keys are hashed, so no address or email is stored.
 */
export const RATE_LIMITS = {
  /** Sign-in attempts from one IP address (a whole office often shares one). */
  signInByIp: { max: 60, windowSeconds: 600 },
  /** Sign-in attempts for one email, from anywhere. */
  signInByEmail: { max: 20, windowSeconds: 600 },
  /** Two-step codes typed from one IP address. */
  codeByIp: { max: 60, windowSeconds: 600 },
  /** "Forgot password?" requests from one IP address (per-account limits apply too). */
  resetRequestByIp: { max: 10, windowSeconds: 3600 },
  /** New passwords set from reset links, from one IP address. */
  resetCompleteByIp: { max: 20, windowSeconds: 3600 },
  /** Platform admin sign-in attempts from one IP address. */
  platformSignInByIp: { max: 10, windowSeconds: 600 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Count one attempt for `subject` (an IP address or email) and say whether it is allowed. A
 * missing subject (no IP address known) is not limited.
 */
export function hitRateLimit(
  name: RateLimitName,
  subject: string | null | undefined,
  now = new Date(),
): Promise<RateLimitResult> {
  if (!subject) return Promise.resolve({ allowed: true });
  const { max, windowSeconds } = RATE_LIMITS[name];
  const key = sha256(`${name}:${subject.trim().toLowerCase()}`);
  const windowOpen = new Date(now.getTime() - windowSeconds * 1000);
  return asSystem(async () => {
    const [row] = await db.$queryRaw<{ count: number; windowStart: Date }[]>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${now}, 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."windowStart" <= ${windowOpen} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimit"."windowStart" <= ${windowOpen} THEN ${now} ELSE "RateLimit"."windowStart" END
      RETURNING "count", "windowStart"`;
    if (row!.count <= max) return { allowed: true };
    const reopens = row!.windowStart.getTime() + windowSeconds * 1000;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((reopens - now.getTime()) / 1000)),
    };
  });
}

/** Both limits must allow it; the longer wait wins. */
export async function hitRateLimits(
  checks: [RateLimitName, string | null | undefined][],
  now = new Date(),
): Promise<RateLimitResult> {
  let wait = 0;
  for (const [name, subject] of checks) {
    const r = await hitRateLimit(name, subject, now);
    if (!r.allowed) wait = Math.max(wait, r.retryAfterSeconds);
  }
  return wait > 0 ? { allowed: false, retryAfterSeconds: wait } : { allowed: true };
}

/** "Please wait 7 minutes" */
export function waitText(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}

/** Worker housekeeping: drop counters older than a day. */
export async function purgeOldRateLimits(now = new Date()): Promise<number> {
  const { count } = await asSystem(() =>
    db.rateLimit.deleteMany({
      where: { windowStart: { lt: new Date(now.getTime() - 86_400_000) } },
    }),
  );
  return count;
}
