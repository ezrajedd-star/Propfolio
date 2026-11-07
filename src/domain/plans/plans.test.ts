import { describe, expect, it } from "vitest";

import { PERMISSIONS, type Permission } from "@/domain/auth/roles";
import {
  PLAN_CONFIG,
  TRIAL_DAYS,
  availableOnMessage,
  canAddUnits,
  effectivePlan,
  planAccess,
  planDenial,
  planIncludes,
  trialEndsAtFor,
  trialReminderDue,
  unitLimitMessage,
  userLimitMessage,
  withinUserLimit,
  type AccountPlanFacts,
  type PlanName,
} from "./plans";

// 4 Nov 2026, 10:00 in Manila.
const NOW = new Date("2026-11-04T02:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const facts = (f: Partial<AccountPlanFacts>): AccountPlanFacts => ({
  plan: "PREMIUM",
  trialEndsAt: null,
  paidUntil: null,
  ...f,
});

describe("configuration", () => {
  it("matches the confirmed prices and limits", () => {
    expect(PLAN_CONFIG).toEqual({
      FREE: { label: "Free", pricePerMonth: "0.00", units: 3, users: 1 },
      PRO: { label: "Pro", pricePerMonth: "1500.00", units: 50, users: 1 },
      PREMIUM: { label: "Premium", pricePerMonth: "3500.00", units: 200, users: 5 },
    });
    expect(TRIAL_DAYS).toBe(30);
  });
});

describe("effectivePlan", () => {
  it.each<[string, Partial<AccountPlanFacts>, PlanName, boolean, boolean]>([
    // name, facts, plan, on trial, lapsed
    ["no dates: stored plan, no end", { plan: "PREMIUM" }, "PREMIUM", false, false],
    ["no dates, Pro", { plan: "PRO" }, "PRO", false, false],
    ["no dates, Free", { plan: "FREE" }, "FREE", false, false],
    ["trial running", { plan: "PREMIUM", trialEndsAt: days(10) }, "PREMIUM", true, false],
    [
      "trial running on a Free account",
      { plan: "FREE", trialEndsAt: days(1) },
      "PREMIUM",
      true,
      false,
    ],
    ["trial ended", { plan: "PREMIUM", trialEndsAt: days(-1) }, "FREE", false, true],
    [
      "trial ended a second ago",
      { trialEndsAt: new Date(NOW.getTime() - 1000) },
      "FREE",
      false,
      true,
    ],
    [
      "paid Pro, today is the last day",
      { plan: "PRO", paidUntil: "2026-11-04" },
      "PRO",
      false,
      false,
    ],
    ["paid Pro, ended yesterday", { plan: "PRO", paidUntil: "2026-11-03" }, "FREE", false, true],
    [
      "trial ended but paid",
      { plan: "PRO", trialEndsAt: days(-5), paidUntil: "2026-12-01" },
      "PRO",
      false,
      false,
    ],
    [
      "paid ended but trial running",
      { plan: "PRO", trialEndsAt: days(3), paidUntil: "2026-10-01" },
      "PREMIUM",
      true,
      false,
    ],
    [
      "paid Premium during trial: no countdown",
      { plan: "PREMIUM", trialEndsAt: days(3), paidUntil: "2026-12-01" },
      "PREMIUM",
      false,
      false,
    ],
  ])("%s", (_name, f, plan, onTrial, lapsed) => {
    const result = effectivePlan(facts(f), NOW);
    expect(result.plan).toBe(plan);
    expect(result.trial !== null).toBe(onTrial);
    expect(result.lapsed).toBe(lapsed);
  });

  it.each([
    [days(30), 30],
    [days(6.5), 7],
    [days(1), 1],
    [new Date(NOW.getTime() + 60_000), 1],
  ])("trial ending %s has %i day(s) left", (endsAt, left) => {
    expect(effectivePlan(facts({ trialEndsAt: endsAt }), NOW).trial?.daysLeft).toBe(left);
  });
});

describe("planIncludes", () => {
  it.each<[PlanName, boolean, boolean, boolean]>([
    // plan, payments (Pro), customReminders (Pro), documents (Premium)
    ["FREE", false, false, false],
    ["PRO", true, true, false],
    ["PREMIUM", true, true, true],
  ])("%s", (plan, payments, reminders, documents) => {
    expect(planIncludes(plan, "payments")).toBe(payments);
    expect(planIncludes(plan, "customReminders")).toBe(reminders);
    expect(planIncludes(plan, "documents")).toBe(documents);
  });
});

describe("planDenial", () => {
  const ok = { plan: "PREMIUM" as const, readOnly: false };

  it.each<[PlanName, Permission, string | null]>([
    ["FREE", "lease.edit", null],
    ["FREE", "data.export", null],
    ["FREE", "privacy.manage", null],
    ["FREE", "document.view", null],
    ["FREE", "payment.view", "PRO"],
    ["FREE", "payment.record", "PRO"],
    ["FREE", "report.view", "PRO"],
    ["FREE", "document.upload", "PREMIUM"],
    ["FREE", "audit.view", "PREMIUM"],
    ["FREE", "user.manage", "PREMIUM"],
    ["PRO", "payment.record", null],
    ["PRO", "report.view", null],
    ["PRO", "document.upload", "PREMIUM"],
    ["PRO", "user.manage", "PREMIUM"],
    ["PREMIUM", "audit.view", null],
  ])("%s / %s → needs %s", (plan, permission, needs) => {
    const denial = planDenial({ plan, readOnly: false }, permission);
    expect(denial?.reason === "feature" ? denial.plan : null).toBe(needs);
  });

  it("Premium allows every permission", () => {
    for (const p of PERMISSIONS) expect(planDenial(ok, p)).toBeNull();
  });

  it.each<[Permission, boolean]>([
    ["lease.view", true],
    ["tenant.view", true],
    ["data.export", true],
    ["privacy.manage", true],
    ["document.view", true],
    ["lease.edit", false],
    ["tenant.edit", false],
    ["property.manage", false],
    ["record.archive", false],
    ["settings.manage", false],
    ["reminder.handle", false],
  ])("read-only Free account: %s allowed = %s", (permission, allowed) => {
    expect(planDenial({ plan: "FREE", readOnly: true }, permission) === null).toBe(allowed);
  });

  it("archiving a unit is allowed while read-only when the caller says so", () => {
    const ro = { plan: "FREE" as const, readOnly: true };
    expect(planDenial(ro, "property.manage")).toEqual({ reason: "readOnly" });
    expect(planDenial(ro, "property.manage", { duringReadOnly: true })).toBeNull();
  });
});

describe("planAccess and limits", () => {
  it.each<[Partial<AccountPlanFacts>, number, boolean]>([
    [{ plan: "FREE" }, 3, false],
    [{ plan: "FREE" }, 4, true],
    [{ trialEndsAt: days(-1) }, 10, true],
    [{ trialEndsAt: days(-1) }, 2, false],
    [{ plan: "PRO" }, 50, false],
    [{ plan: "PRO" }, 51, true],
    [{ plan: "PREMIUM" }, 200, false],
  ])("%o with %i units → read-only %s", (f, units, readOnly) => {
    expect(planAccess(facts(f), units, NOW).readOnly).toBe(readOnly);
  });

  it.each([
    [2, 1, true],
    [3, 1, false],
    [0, 3, true],
    [1, 3, false],
  ])("Free with %i units can add %i: %s", (used, adding, ok) => {
    expect(canAddUnits({ units: { used, limit: 3 } }, adding)).toBe(ok);
  });

  it.each<[PlanName, string, number, boolean]>([
    ["FREE", "OWNER", 9, true],
    ["FREE", "ADMIN", 0, false],
    ["PRO", "VIEWER", 0, false],
    ["PREMIUM", "ADMIN", 0, true],
    ["PREMIUM", "VIEWER", 3, true],
    ["PREMIUM", "VIEWER", 4, false],
  ])("%s: %s with %i earlier members may sign in = %s", (plan, role, earlier, ok) => {
    expect(withinUserLimit(plan, role, earlier)).toBe(ok);
  });
});

describe("messages", () => {
  it.each([
    [availableOnMessage("payments"), "Available on Pro"],
    [availableOnMessage("documents"), "Available on Premium"],
    [unitLimitMessage("FREE"), "The Free plan includes up to 3 units. Upgrade to add more."],
    [
      unitLimitMessage("PREMIUM"),
      "Your plan includes up to 200 units. For more, please contact us.",
    ],
    [userLimitMessage("PRO"), "The Pro plan includes 1 user. Upgrade to Premium to add your team."],
  ])("%s", (actual, expected) => expect(actual).toBe(expected));
});

describe("trialReminderDue", () => {
  it.each<[number, number[], number | null]>([
    [8, [], null],
    [7, [], 7],
    [6, [], 7], // missed a day: catch up
    [6, [7], null],
    [2, [7], null],
    [1, [7], 1],
    [1, [], 1], // never send the 7-day one late on top
    [0, [7], 1], // the last day, still not reminded
    [1, [7, 1], null],
    [1, [1], null],
    [-1, [], null],
  ])("%i day(s) left, sent %o → %s", (left, sent, due) => {
    expect(trialReminderDue(left, sent)).toBe(due);
  });
});

describe("trialEndsAtFor", () => {
  it.each([
    // 7 Nov 2026, 10:00 Manila → last day 7 Dec, end of that Manila day
    ["2026-11-07T02:00:00Z", "2026-12-07T15:59:59.999Z"],
    // 7 Nov 2026, 23:30 Manila (15:30 UTC) is still 7 Nov in Manila
    ["2026-11-07T15:30:00Z", "2026-12-07T15:59:59.999Z"],
    // 8 Nov 2026, 00:30 Manila (16:30 UTC on the 7th) is already the 8th in Manila
    ["2026-11-07T16:30:00Z", "2026-12-08T15:59:59.999Z"],
  ])("signing up at %s → trial ends %s", (at, end) => {
    expect(trialEndsAtFor(new Date(at)).toISOString()).toBe(end);
  });
});
