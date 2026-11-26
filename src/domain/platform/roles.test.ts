import { describe, expect, it } from "vitest";

import {
  PLATFORM_PERMISSIONS,
  platformCan,
  staffChangeProblem,
  type PlatformPermission,
  type PlatformRole,
} from "./roles";

const OWNER_ONLY: PlatformPermission[] = [
  "billing.manage",
  "staff.manage",
  "stafflog.view",
  "agents.manage",
  "approvals.decide",
];
const SUPPORT_CHANGES: PlatformPermission[] = [
  "accounts.support",
  "pipeline.manage",
  "tickets.manage",
  "help.manage",
  "health.manage",
  "data.export",
];

describe("platform permissions", () => {
  it.each(PLATFORM_PERMISSIONS)("Platform Owner: %s", (p) => {
    expect(platformCan("PLATFORM_OWNER", p)).toBe(true);
  });

  const expectedSupport = (p: PlatformPermission) => !OWNER_ONLY.includes(p);
  it.each(PLATFORM_PERMISSIONS)("Platform Support: %s", (p) => {
    expect(platformCan("PLATFORM_SUPPORT", p)).toBe(expectedSupport(p));
  });

  const expectedReadOnly = (p: PlatformPermission) =>
    !OWNER_ONLY.includes(p) && !SUPPORT_CHANGES.includes(p);
  it.each(PLATFORM_PERMISSIONS)("Platform Read-only: %s", (p) => {
    expect(platformCan("PLATFORM_READONLY", p)).toBe(expectedReadOnly(p));
  });

  it("read-only only has view permissions", () => {
    for (const p of PLATFORM_PERMISSIONS) {
      if (platformCan("PLATFORM_READONLY", p)) expect(p).toMatch(/\.view$/);
    }
  });
});

describe("staffChangeProblem", () => {
  const base = {
    actorId: "a",
    targetId: "b",
    targetRole: "PLATFORM_OWNER" as PlatformRole,
    targetActive: true,
    activeOwners: 2,
  };
  it.each([
    ["demote another owner when two exist", { next: { role: "PLATFORM_SUPPORT" } }, null],
    ["turn off another owner when two exist", { next: { isActive: false } }, null],
    [
      "demote the only owner",
      { next: { role: "PLATFORM_SUPPORT" }, activeOwners: 1 },
      /only active Platform Owner/,
    ],
    [
      "turn off the only owner",
      { next: { isActive: false }, activeOwners: 1 },
      /only active Platform Owner/,
    ],
    ["demote yourself", { targetId: "a", next: { role: "PLATFORM_READONLY" } }, /your own role/],
    ["turn yourself off", { targetId: "a", next: { isActive: false } }, /your own role/],
    ["keep your own role", { targetId: "a", next: { role: "PLATFORM_OWNER" } }, null],
    [
      "promote support when one owner",
      { targetRole: "PLATFORM_SUPPORT", next: { role: "PLATFORM_OWNER" }, activeOwners: 1 },
      null,
    ],
    [
      "turn off support when one owner",
      { targetRole: "PLATFORM_SUPPORT", next: { isActive: false }, activeOwners: 1 },
      null,
    ],
    [
      "turn back on an inactive owner",
      { targetActive: false, next: { isActive: true }, activeOwners: 1 },
      null,
    ],
  ] as const)("%s", (_name, over, expected) => {
    const problem = staffChangeProblem({ ...base, ...(over as object) } as Parameters<
      typeof staffChangeProblem
    >[0]);
    if (expected === null) expect(problem).toBeNull();
    else expect(problem).toMatch(expected);
  });
});
