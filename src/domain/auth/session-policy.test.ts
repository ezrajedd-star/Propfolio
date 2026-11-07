import { describe, expect, it } from "vitest";

import { checkSession, idleTimeoutApplies, sessionExpiry, shouldTouch } from "./session-policy";

const now = new Date("2026-10-23T02:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);

describe("checkSession", () => {
  it.each([
    [
      "active a minute ago",
      { lastSeenAt: ago(1), expiresAt: sessionExpiry(ago(60)), revokedAt: null },
      "valid",
    ],
    [
      "idle 29 minutes",
      { lastSeenAt: ago(29), expiresAt: sessionExpiry(ago(60)), revokedAt: null },
      "valid",
    ],
    [
      "idle 30 minutes",
      { lastSeenAt: ago(30), expiresAt: sessionExpiry(ago(60)), revokedAt: null },
      "idle",
    ],
    [
      "older than 12 hours",
      { lastSeenAt: ago(1), expiresAt: sessionExpiry(ago(12 * 60)), revokedAt: null },
      "expired",
    ],
    [
      "revoked",
      { lastSeenAt: ago(1), expiresAt: sessionExpiry(ago(1)), revokedAt: ago(0) },
      "revoked",
    ],
  ] as const)("%s → %s", (_label, s, expected) => {
    expect(checkSession(s, now)).toBe(expected);
  });

  it("touches at most once a minute", () => {
    const s = { lastSeenAt: ago(0.5), expiresAt: sessionExpiry(now), revokedAt: null };
    expect(shouldTouch(s, now)).toBe(false);
    expect(shouldTouch({ ...s, lastSeenAt: ago(1) }, now)).toBe(true);
  });
});

describe("keep me signed in", () => {
  it("lasts 30 days instead of 12 hours", () => {
    expect(sessionExpiry(now, true).getTime() - now.getTime()).toBe(30 * 86_400_000);
    expect(sessionExpiry(now).getTime() - now.getTime()).toBe(12 * 3_600_000);
  });

  it("an idle hour is fine when the idle timeout doesn't apply", () => {
    const s = { lastSeenAt: ago(60), expiresAt: sessionExpiry(ago(60), true), revokedAt: null };
    expect(checkSession(s, now, { idleTimeout: false })).toBe("valid");
    expect(checkSession(s, now, { idleTimeout: true })).toBe("idle");
  });

  it.each([
    [false, false, true, true],
    [false, true, false, true],
    [true, false, true, false],
    [true, true, true, true],
    [true, true, false, false],
  ])(
    "persistent %s, admin %s, setting %s → idle timeout %s",
    (persistent, isAdmin, setting, applies) => {
      expect(idleTimeoutApplies({ persistent, isAdmin, adminIdleTimeoutSetting: setting })).toBe(
        applies,
      );
    },
  );
});
