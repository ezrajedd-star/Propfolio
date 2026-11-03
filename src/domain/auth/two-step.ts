import { randomInt } from "node:crypto";

import { isAdminRole, type Role } from "./roles";

/**
 * Two-step sign-in for customers: a password, then a 6-digit code from an authenticator app
 * (see totp.ts). Required for Owners and Admins, optional for everyone else.
 */

/** A device can skip the code for this long after the person ticks "Don't ask again". */
export const TRUSTED_DEVICE_DAYS = 30;
/** The code must be typed within this long after the password. */
export const CODE_STEP_MINUTES = 5;
/** Wrong codes allowed on one sign-in before starting again with the password. */
export const MAX_CODE_ATTEMPTS = 5;
export const RECOVERY_CODE_COUNT = 10;

export type TwoStepState =
  /** Set up: the code is asked at sign-in. */
  | "on"
  /** Required but not set up: the person must set it up before doing anything else. */
  | "setup_required"
  /** Required, not set up, but they may wait until `graceUntil` (e.g. new sign-ups). */
  | "grace"
  /** Not required and not set up. */
  | "optional";

export function requiresTwoStep(role: Role): boolean {
  return isAdminRole(role);
}

export function twoStepState(
  person: { role: Role; enrolled: boolean; graceUntil: Date | null },
  now: Date,
): TwoStepState {
  if (person.enrolled) return "on";
  if (!requiresTwoStep(person.role)) return "optional";
  if (person.graceUntil && person.graceUntil.getTime() > now.getTime()) return "grace";
  return "setup_required";
}

// Recovery codes: no 0/O, 1/I/L, so they're easy to read off paper.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Ten one-time codes like "K7PM-Q2XR", each with about 40 bits of randomness. */
export function newRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from(
      { length: 8 },
      () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
    );
    return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
  });
}

/** How a typed recovery code is compared: capitals, no spaces or dashes. */
export function normaliseRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

/** Does this look like a recovery code (as opposed to a 6-digit app code)? */
export function looksLikeRecoveryCode(input: string): boolean {
  return (
    /^[A-Z0-9]{8}$/.test(normaliseRecoveryCode(input)) &&
    !/^\d+$/.test(normaliseRecoveryCode(input))
  );
}
