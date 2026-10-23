import { describe, expect, it } from "vitest";

import { checkSession, sessionExpiry, shouldTouch } from "./session-policy";

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
