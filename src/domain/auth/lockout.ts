/** Lock an account for 15 minutes after 5 failed sign-in attempts in a row. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export interface LockoutState {
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export function isLocked(state: LockoutState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/**
 * State after a failed attempt. Attempts while the account is already locked do not
 * extend the lock. When a lock is applied the counter resets, so after it expires the
 * user gets a fresh set of attempts.
 */
export function afterFailedAttempt(
  state: LockoutState,
  now: Date,
): LockoutState & { justLocked: boolean } {
  if (isLocked(state, now)) return { ...state, justLocked: false };

  const failedLoginCount = state.failedLoginCount + 1;
  if (failedLoginCount >= MAX_FAILED_ATTEMPTS) {
    return {
      failedLoginCount: 0,
      lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000),
      justLocked: true,
    };
  }
  return { failedLoginCount, lockedUntil: null, justLocked: false };
}

export function afterSuccessfulLogin(): LockoutState {
  return { failedLoginCount: 0, lockedUntil: null };
}
