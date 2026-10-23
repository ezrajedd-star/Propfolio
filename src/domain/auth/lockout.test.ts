import { describe, expect, it } from "vitest";

import { LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS, afterFailedAttempt, isLocked } from "./lockout";

const t0 = new Date("2026-10-23T02:00:00Z");
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);

describe("lockout", () => {
  it("locks on the fifth failure, not before", () => {
    let state = { failedLoginCount: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      const next = afterFailedAttempt(state, t0);
      expect(next.justLocked).toBe(false);
      expect(next.failedLoginCount).toBe(i);
      state = next;
    }
    const locked = afterFailedAttempt(state, t0);
    expect(locked.justLocked).toBe(true);
    expect(locked.lockedUntil).toEqual(minutes(LOCKOUT_MINUTES));
    expect(isLocked(locked, minutes(14))).toBe(true);
    expect(isLocked(locked, minutes(15))).toBe(false);
  });

  it("does not extend the lock for attempts while locked", () => {
    const state = { failedLoginCount: 0, lockedUntil: minutes(15) };
    const next = afterFailedAttempt(state, minutes(5));
    expect(next.lockedUntil).toEqual(minutes(15));
    expect(next.justLocked).toBe(false);
  });

  it("starts counting again after the lock expires", () => {
    const next = afterFailedAttempt({ failedLoginCount: 0, lockedUntil: minutes(15) }, minutes(16));
    expect(next).toEqual({ failedLoginCount: 1, lockedUntil: null, justLocked: false });
  });
});
