/**
 * Self-serve sign-up: the 6-digit email code. The code is typed on the sign-up screen itself, so
 * people don't have to leave the app to click a link.
 */
export const SIGNUP_CODE_MINUTES = 15;
/** Wrong codes before the sign-up has to start again. */
export const SIGNUP_MAX_ATTEMPTS = 5;
/** Codes one sign-up can be sent (the first plus resends). */
export const SIGNUP_MAX_CODES = 5;
/** Seconds between "Send a new code". */
export const SIGNUP_RESEND_SECONDS = 60;
/** A Google sign-up has this long to give the company name and accept the documents. */
export const GOOGLE_DETAILS_MINUTES = 30;
/**
 * New Owners set up two-step sign-in during onboarding (an onboarding step), not before anything
 * else; after this many days it is required like for every Owner and Admin.
 */
export const SIGNUP_TWO_STEP_GRACE_DAYS = 14;

export interface PendingCode {
  attempts: number;
  codesSent: number;
  codeSentAt: Date;
  expiresAt: Date;
}

export type CodeCheck = "ok" | "expired" | "too_many";

/** Can a code still be tried for this sign-up? */
export function codeCheck(p: PendingCode, now: Date): CodeCheck {
  if (p.expiresAt.getTime() <= now.getTime()) return "expired";
  if (p.attempts >= SIGNUP_MAX_ATTEMPTS) return "too_many";
  return "ok";
}

export type ResendCheck =
  { ok: true } | { ok: false; waitSeconds: number } | { ok: false; limit: true };

export function resendCheck(p: PendingCode, now: Date): ResendCheck {
  if (p.codesSent >= SIGNUP_MAX_CODES) return { ok: false, limit: true };
  const wait = Math.ceil(
    (p.codeSentAt.getTime() + SIGNUP_RESEND_SECONDS * 1000 - now.getTime()) / 1000,
  );
  return wait > 0 ? { ok: false, waitSeconds: wait } : { ok: true };
}

/** A fresh code lasts SIGNUP_CODE_MINUTES from when it was sent. */
export function codeExpiry(now: Date): Date {
  return new Date(now.getTime() + SIGNUP_CODE_MINUTES * 60_000);
}
