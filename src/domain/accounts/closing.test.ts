import { describe, expect, it } from "vitest";

import { closedAccountStep, confirmsName, deleteAfterFor } from "./closing";

describe("closing an account", () => {
  it("keeps the data 90 days", () => {
    expect(deleteAfterFor("2026-11-18")).toBe("2027-02-16");
  });

  it.each([
    ["2026-12-01", false, "wait"],
    ["2027-02-08", false, "wait"],
    ["2027-02-09", false, "remind"],
    ["2027-02-09", true, "wait"],
    ["2027-02-16", true, "wait"],
    ["2027-02-16", false, "remind"],
    ["2027-02-17", true, "delete"],
    ["2027-02-17", false, "delete"],
  ] as const)("on %s (reminder sent: %s) → %s", (today, sent, step) => {
    expect(closedAccountStep("2027-02-16", today, sent)).toBe(step);
  });

  it.each([
    ["Santos Realty Corp.", true],
    ["  santos   realty corp. ", true],
    ["Santos Realty", false],
    ["", false],
  ])("typing %j confirms: %s", (typed, ok) => {
    expect(confirmsName(typed, "Santos Realty Corp.")).toBe(ok);
  });
});
