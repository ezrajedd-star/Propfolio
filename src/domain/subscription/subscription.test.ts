import { describe, expect, it } from "vitest";

import {
  changeKind,
  displayState,
  graceEnd,
  invoiceNumber,
  nextCharge,
  periodEndFor,
  renewalDue,
  upgradeCharge,
  type SubscriptionFacts,
} from "./subscription";

const sub = (o: Partial<SubscriptionFacts> = {}): SubscriptionFacts => ({
  plan: "PRO",
  status: "ACTIVE",
  currentPeriodStart: "2026-11-01",
  currentPeriodEnd: "2026-11-30",
  cancelAtPeriodEnd: false,
  pendingPlan: null,
  ...o,
});

describe("periodEndFor", () => {
  it.each([
    ["2026-11-01", "2026-11-30"],
    ["2026-11-08", "2026-12-07"],
    ["2026-01-31", "2026-02-27"],
    ["2026-12-15", "2027-01-14"],
  ])("%s → %s", (start, end) => expect(periodEndFor(start)).toBe(end));
});

describe("upgradeCharge (Pro ₱1,500 → Premium ₱3,500)", () => {
  const period = { start: "2026-11-01", end: "2026-11-30" };
  it.each([
    ["first day: the whole difference", "2026-11-01", "2000.00"],
    ["half-way (15 of 30 days left)", "2026-11-16", "1000.00"],
    ["last day (1 of 30)", "2026-11-30", "66.67"],
    ["after the period", "2026-12-01", "0.00"],
  ])("%s", (_n, today, amount) => {
    expect(upgradeCharge("PRO", "PREMIUM", today, period)).toBe(amount);
  });
  it("a downgrade never charges", () => {
    expect(upgradeCharge("PREMIUM", "PRO", "2026-11-01", period)).toBe("0.00");
  });
});

describe("changeKind", () => {
  it.each([
    ["PRO", "PREMIUM", "upgrade"],
    ["PREMIUM", "PRO", "downgrade"],
    ["PRO", "PRO", "same"],
  ] as const)("%s → %s: %s", (from, to, kind) => expect(changeKind(from, to)).toBe(kind));
});

describe("displayState", () => {
  it.each<[string, Parameters<typeof displayState>[0], string]>([
    [
      "trial, no subscription",
      { trialRunning: true, subscription: null, effectivePlan: "PREMIUM" },
      "trialing",
    ],
    ["paying", { trialRunning: false, subscription: sub(), effectivePlan: "PRO" }, "active"],
    [
      "cancelled, still paid up",
      { trialRunning: false, subscription: sub({ cancelAtPeriodEnd: true }), effectivePlan: "PRO" },
      "canceled",
    ],
    [
      "renewal failed",
      { trialRunning: false, subscription: sub({ status: "PAST_DUE" }), effectivePlan: "PRO" },
      "past_due",
    ],
    [
      "subscription ended",
      { trialRunning: false, subscription: sub({ status: "CANCELED" }), effectivePlan: "FREE" },
      "free",
    ],
    ["never paid", { trialRunning: false, subscription: null, effectivePlan: "FREE" }, "free"],
    [
      "first customer (no dates)",
      { trialRunning: false, subscription: null, effectivePlan: "PREMIUM" },
      "active",
    ],
  ])("%s → %s", (_n, input, expected) => expect(displayState(input)).toBe(expected));
});

describe("nextCharge and renewals", () => {
  it.each<[string, Partial<SubscriptionFacts>, unknown]>([
    ["active", {}, { date: "2026-12-01", amount: "1500.00", plan: "PRO" }],
    [
      "downgrade waiting",
      { plan: "PREMIUM", pendingPlan: "PRO" },
      { date: "2026-12-01", amount: "1500.00", plan: "PRO" },
    ],
    ["cancelled", { cancelAtPeriodEnd: true }, null],
    ["past due", { status: "PAST_DUE" }, null],
  ])("%s", (_n, o, expected) => expect(nextCharge(sub(o))).toEqual(expected));

  it.each([
    ["2026-11-30", false],
    ["2026-12-01", true],
    ["2026-12-05", true],
  ])("renewal due on %s: %s", (today, due) => expect(renewalDue(sub(), today)).toBe(due));

  it("grace lasts 7 days after the period", () =>
    expect(graceEnd("2026-11-30")).toBe("2026-12-07"));
  it("payment records are numbered per year", () =>
    expect(invoiceNumber(2026, 42)).toBe("PF-2026-000042"));
});
