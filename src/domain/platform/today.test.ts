import { describe, expect, it } from "vitest";

import {
  manilaDayStart,
  manilaPeriods,
  monthlyRecurringRevenue,
  ticketAgeBucket,
  versusLastWeek,
} from "./today";

describe("manilaPeriods", () => {
  it.each([
    // now (UTC), today, week start (Monday), month start
    ["2026-11-26T02:00:00Z", "2026-11-26", "2026-11-23", "2026-11-01"], // Thursday
    ["2026-11-22T15:59:00Z", "2026-11-22", "2026-11-16", "2026-11-01"], // Sunday 23:59 Manila
    ["2026-11-22T16:00:00Z", "2026-11-23", "2026-11-23", "2026-11-01"], // Monday 00:00 Manila
    ["2026-11-30T16:30:00Z", "2026-12-01", "2026-11-30", "2026-12-01"], // new month in Manila
  ])("at %s", (now, today, week, month) => {
    const p = manilaPeriods(new Date(now));
    expect(p.today).toBe(today);
    expect(p.weekStartDay).toBe(week);
    expect(p.monthStartDay).toBe(month);
    expect(p.weekStart.toISOString()).toBe(manilaDayStart(week).toISOString());
    expect(p.lastWeekStart.getTime()).toBe(p.weekStart.getTime() - 7 * 86_400_000);
  });

  it("a Manila day starts at 16:00 UTC the day before", () => {
    expect(manilaDayStart("2026-11-26").toISOString()).toBe("2026-11-25T16:00:00.000Z");
  });
});

describe("monthlyRecurringRevenue", () => {
  it.each([
    [[], "0"],
    [["PRO"], "1500"],
    [["PRO", "PREMIUM", "PREMIUM"], "8500"],
    [["FREE", "PRO"], "1500"],
  ] as const)("%j → %s", (plans, total) => {
    expect(monthlyRecurringRevenue(plans).toString()).toBe(total);
  });
});

describe("ticketAgeBucket", () => {
  const now = new Date("2026-11-26T00:00:00Z");
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
  it.each([
    [1, "under1d"],
    [23.9, "under1d"],
    [24, "1to3d"],
    [71, "1to3d"],
    [72, "over3d"],
    [500, "over3d"],
  ] as const)("%s hours → %s", (h, bucket) => {
    expect(ticketAgeBucket(ago(h), now)).toBe(bucket);
  });
});

describe("versusLastWeek", () => {
  it.each([
    [5, 2, "+3 vs last week"],
    [2, 5, "−3 vs last week"],
    [4, 4, "same as last week"],
  ])("%s vs %s", (a, b, text) => {
    expect(versusLastWeek(a, b)).toBe(text);
  });
});
