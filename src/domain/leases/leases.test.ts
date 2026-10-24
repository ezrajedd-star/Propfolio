import { describe, expect, it } from "vitest";

import { countOccupancy, unitOccupancy } from "./occupancy";
import {
  computeLeaseStatus,
  daysLeft,
  effectiveEndDate,
  findOverlap,
  formatLeaseRef,
  leaseCovers,
  periodsOverlap,
  statusDetail,
  timeLeftText,
  type LeaseDates,
} from "./status";

const lease = (o: Partial<LeaseDates> = {}): LeaseDates => ({
  startDate: "2026-01-01",
  endDate: "2027-12-31",
  terminationDate: null,
  renewed: false,
  ...o,
});

describe("lease status", () => {
  it.each([
    ["before start", lease(), "2025-12-31", "UPCOMING"],
    ["first day", lease(), "2026-01-01", "ACTIVE"],
    ["day before window", lease(), "2027-10-01", "ACTIVE"],
    ["first day of 90-day window", lease(), "2027-10-02", "EXPIRING"],
    ["last day", lease(), "2027-12-31", "EXPIRING"],
    ["day after end", lease(), "2028-01-01", "EXPIRED"],
    ["renewed beats expiring", lease({ renewed: true }), "2027-12-01", "RENEWED"],
    ["renewed after end", lease({ renewed: true }), "2028-06-01", "RENEWED"],
    [
      "terminated beats everything",
      lease({ terminationDate: "2026-06-30", renewed: true }),
      "2026-03-01",
      "TERMINATED",
    ],
    [
      "leap-day end",
      lease({ startDate: "2027-03-01", endDate: "2028-02-29" }),
      "2028-02-29",
      "EXPIRING",
    ],
    [
      "leap-day end, next day",
      lease({ startDate: "2027-03-01", endDate: "2028-02-29" }),
      "2028-03-01",
      "EXPIRED",
    ],
    [
      "short lease inside window from day one",
      lease({ startDate: "2026-01-01", endDate: "2026-02-28" }),
      "2026-01-01",
      "EXPIRING",
    ],
  ])("%s → %s", (_label, l, today, expected) => {
    expect(computeLeaseStatus(l, today, 90)).toBe(expected);
  });

  it("uses the unit's window size", () => {
    expect(computeLeaseStatus(lease(), "2027-09-01", 180)).toBe("EXPIRING");
    expect(computeLeaseStatus(lease(), "2027-09-01", 30)).toBe("ACTIVE");
  });
});

describe("periods and overlap", () => {
  it.each([
    [
      { startDate: "2026-01-01", endDate: "2026-12-31" },
      { startDate: "2027-01-01", endDate: "2027-12-31" },
      false,
    ],
    [
      { startDate: "2026-01-01", endDate: "2026-12-31" },
      { startDate: "2026-12-31", endDate: "2027-12-31" },
      true,
    ],
    [
      { startDate: "2026-03-01", endDate: "2026-03-31" },
      { startDate: "2026-01-01", endDate: "2026-12-31" },
      true,
    ],
    [
      { startDate: "2026-01-01", endDate: "2026-01-01" },
      { startDate: "2026-01-01", endDate: "2026-01-01" },
      true,
    ],
  ])("%j vs %j → %s", (a, b, expected) => {
    expect(periodsOverlap(a, b)).toBe(expected);
    expect(periodsOverlap(b, a)).toBe(expected);
  });

  it("uses the termination date as the effective end", () => {
    const terminated = lease({ terminationDate: "2026-06-30" });
    expect(effectiveEndDate(terminated)).toBe("2026-06-30");
    expect(
      findOverlap({ startDate: "2026-07-01", endDate: "2027-06-30" }, [terminated]),
    ).toBeUndefined();
    expect(findOverlap({ startDate: "2026-06-30", endDate: "2027-06-30" }, [terminated])).toBe(
      terminated,
    );
    expect(leaseCovers(terminated, "2026-07-01")).toBe(false);
  });

  it("renewal starting the day after the old end does not overlap", () => {
    expect(
      findOverlap({ startDate: "2028-01-01", endDate: "2029-12-31" }, [lease()]),
    ).toBeUndefined();
  });
});

describe("time left", () => {
  it.each([
    ["2027-11-16", "Ends in 45 days"],
    ["2027-12-30", "Ends tomorrow"],
    ["2027-12-31", "Ends today"],
    ["2028-01-01", "Ended yesterday"],
    ["2028-01-03", "Ended 3 days ago"],
    ["2025-12-22", "Starts in 10 days"],
    ["2025-12-31", "Starts tomorrow"],
    ["2027-11-01", "Ends in 60 days"],
    ["2027-10-31", "Ends in 2 months"],
    ["2026-10-23", "Ends in 1 year, 2 months"],
    ["2026-01-01", "Ends in 1 year, 11 months"],
    ["2025-09-01", "Starts in 4 months"],
    ["2029-01-01", "Ended 1 year ago"],
  ])("on %s: %s", (today, expected) => {
    expect(timeLeftText(lease(), today)).toBe(expected);
  });

  it("counts to the termination date when terminated", () => {
    expect(daysLeft(lease({ terminationDate: "2026-06-30" }), "2026-06-20")).toBe(10);
    expect(statusDetail("TERMINATED", lease({ terminationDate: "2026-06-30" }))).toBe(
      "Ended early on 30 Jun 2026",
    );
    expect(statusDetail("ACTIVE", lease())).toBeNull();
  });

  it("formats reference numbers", () => {
    expect(formatLeaseRef(2026, 1)).toBe("LSE-2026-0001");
    expect(formatLeaseRef(2026, 12345)).toBe("LSE-2026-12345");
  });
});

describe("occupancy", () => {
  it.each([
    ["active lease → occupied", null, [lease()], "OCCUPIED"],
    ["active lease beats override", "UNDER_RENOVATION", [lease()], "OCCUPIED"],
    ["no lease → vacant", null, [], "VACANT"],
    ["expired lease → vacant", null, [lease({ endDate: "2026-06-30" })], "VACANT"],
    ["override when empty", "UNAVAILABLE", [], "UNAVAILABLE"],
    ["terminated lease → vacant", null, [lease({ terminationDate: "2026-09-30" })], "VACANT"],
    ["upcoming lease → vacant today", null, [lease({ startDate: "2026-11-01" })], "VACANT"],
  ] as const)("%s", (_label, override, leases, expected) => {
    expect(unitOccupancy(override, [...leases], "2026-10-23")).toBe(expected);
  });

  it("counts occupancy percent over leasable units only", () => {
    expect(
      countOccupancy(["OCCUPIED", "OCCUPIED", "VACANT", "UNAVAILABLE", "UNDER_RENOVATION"]),
    ).toEqual({
      occupied: 2,
      vacant: 1,
      unavailable: 2,
      total: 5,
      occupancyPercent: 66.7,
    });
    expect(countOccupancy([]).occupancyPercent).toBe(0);
  });
});
