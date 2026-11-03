import { describe, expect, it } from "vitest";

import type { Role } from "./roles";
import {
  looksLikeRecoveryCode,
  newRecoveryCodes,
  normaliseRecoveryCode,
  requiresTwoStep,
  twoStepState,
  type TwoStepState,
} from "./two-step";

const NOW = new Date("2026-11-03T02:00:00Z");
const tomorrow = new Date(NOW.getTime() + 86_400_000);
const yesterday = new Date(NOW.getTime() - 86_400_000);

describe("who needs two-step sign-in", () => {
  it.each<[Role, boolean]>([
    ["OWNER", true],
    ["ADMIN", true],
    ["LEASING_STAFF", false],
    ["VIEWER", false],
  ])("%s: required = %s", (role, required) => {
    expect(requiresTwoStep(role)).toBe(required);
  });

  it.each<[Role, boolean, Date | null, TwoStepState]>([
    ["OWNER", true, null, "on"],
    ["VIEWER", true, null, "on"],
    ["ADMIN", false, null, "setup_required"],
    ["ADMIN", false, yesterday, "setup_required"],
    ["OWNER", false, tomorrow, "grace"],
    ["LEASING_STAFF", false, null, "optional"],
    ["VIEWER", false, tomorrow, "optional"],
  ])("%s, set up %s, grace until %s → %s", (role, enrolled, graceUntil, expected) => {
    expect(twoStepState({ role, enrolled, graceUntil }, NOW)).toBe(expected);
  });
});

describe("recovery codes", () => {
  it("are ten easy-to-read, different codes", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
  });

  it.each([
    ["k7pm-q2xr", "K7PMQ2XR"],
    [" K7PM Q2XR ", "K7PMQ2XR"],
    ["K7PMQ2XR", "K7PMQ2XR"],
  ])("%j is compared as %s", (typed, normal) => {
    expect(normaliseRecoveryCode(typed)).toBe(normal);
  });

  it.each([
    ["K7PM-Q2XR", true],
    ["k7pmq2xr", true],
    ["123456", false],
    ["12345678", false],
    ["K7PM", false],
  ])("%j looks like a recovery code: %s", (typed, expected) => {
    expect(looksLikeRecoveryCode(typed)).toBe(expected);
  });
});
