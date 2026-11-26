import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "./roles";
import { grantIsActive, supportAccessEnds, supportMay, supportSessionEnds } from "./support-access";

const T = new Date("2026-11-26T02:00:00Z");
const h = (n: number) => new Date(T.getTime() + n * 3_600_000);

describe("supportMay", () => {
  const denied = ["user.manage", "billing.manage", "privacy.manage", "record.purge", "data.export"];
  it.each(PERMISSIONS)("%s", (p) => {
    expect(supportMay(p)).toBe(!denied.includes(p));
  });
});

describe("support access times", () => {
  it.each([
    ["24h", 24],
    ["72h", 72],
    ["7d", 168],
  ] as const)("%s lasts %i hours", (d, hours) => {
    expect(supportAccessEnds(T, d)).toEqual(h(hours));
  });

  it.each([
    [h(24), h(8)],
    [h(3), h(3)],
  ])("a session ends at 8 hours or when access ends (%s)", (end, expected) => {
    expect(supportSessionEnds(T, end)).toEqual(expected);
  });

  it.each([
    [{ expiresAt: h(1), revokedAt: null }, true],
    [{ expiresAt: h(-1), revokedAt: null }, false],
    [{ expiresAt: T, revokedAt: null }, false],
    [{ expiresAt: h(1), revokedAt: T }, false],
  ])("grantIsActive %#", (g, active) => {
    expect(grantIsActive(g, T)).toBe(active);
  });
});
