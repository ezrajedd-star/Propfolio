import { describe, expect, it } from "vitest";

import { recommendPlan } from "./recommend";

describe("recommendPlan", () => {
  it.each([
    [1, 1, {}, "FREE"],
    [3, 1, {}, "FREE"],
    [4, 1, {}, "PRO"],
    [50, 1, {}, "PRO"],
    [51, 1, {}, "PREMIUM"],
    [200, 1, {}, "PREMIUM"],
    [2, 2, {}, "PREMIUM"],
    [2, 5, {}, "PREMIUM"],
    [2, 1, { payments: true }, "PRO"],
    [2, 1, { team: true }, "PREMIUM"],
    [60, 1, { payments: true }, "PREMIUM"],
    [0, 0, {}, "FREE"],
    [2.7, 1, {}, "FREE"],
  ] as const)("%s units, %s users, %o → %s", (units, users, needs, plan) => {
    const r = recommendPlan(units, users, needs);
    expect(r).toMatchObject({ kind: "plan", plan });
    if (r.kind === "plan") expect(r.reason.length).toBeGreaterThan(0);
  });

  it.each([
    [201, 1],
    [10, 6],
  ])("%s units, %s users → talk to us", (units, users) => {
    expect(recommendPlan(units, users).kind).toBe("contact");
  });

  it("explains the choice in plain words", () => {
    expect(recommendPlan(40, 1)).toMatchObject({ reason: "40 units fit in Pro: up to 50 units." });
    expect(recommendPlan(1, 1)).toMatchObject({ reason: "1 unit fits in Free: up to 3 units." });
    expect(recommendPlan(2, 3)).toMatchObject({ reason: "3 people need Premium: up to 5 users." });
    expect(recommendPlan(2, 1, { payments: true })).toMatchObject({
      reason: "Payments, the overdue list and reports start on Pro.",
    });
  });
});
