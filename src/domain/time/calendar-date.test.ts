import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  daysBetween,
  formatDuration,
  isIsoDate,
  weekday,
} from "./calendar-date";

describe("calendar dates", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2028-01-31", 1, "2028-02-29"], // leap year
    ["2028-02-29", 12, "2029-02-28"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2026-12-15", 1, "2027-01-15"],
    ["2026-05-31", 6, "2026-11-30"],
    ["2026-01-15", -13, "2024-12-15"],
  ])("addMonths(%s, %i) = %s", (d, n, expected) => {
    expect(addMonths(d, n)).toBe(expected);
  });

  it.each([
    ["2026-12-31", 1, "2027-01-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2027-02-28", 1, "2027-03-01"],
    ["2026-03-01", -1, "2026-02-28"],
  ])("addDays(%s, %i) = %s", (d, n, expected) => {
    expect(addDays(d, n)).toBe(expected);
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-10-23", "2026-12-22")).toBe(60);
    expect(daysBetween("2028-02-01", "2028-03-01")).toBe(29);
    expect(daysBetween("2026-10-23", "2026-10-20")).toBe(-3);
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("23 Oct 2026")).toBe(false);
  });

  it("knows weekdays", () => {
    expect(weekday("2026-10-23")).toBe(5); // Friday
  });

  it.each([
    ["2026-01-01", "2027-12-31", "2 years, 0 months"],
    ["2026-01-01", "2026-12-31", "1 year, 0 months"],
    ["2026-01-15", "2027-03-14", "1 year, 2 months"],
    ["2026-01-01", "2026-06-30", "6 months"],
    ["2026-01-01", "2026-01-31", "1 month"],
    ["2026-01-01", "2026-01-10", "10 days"],
    ["2026-01-01", "2026-02-15", "1 month, 15 days"],
    // Month ends clamp: a lease from 29 Feb ends a year later on the day before 28 Feb.
    ["2028-02-29", "2029-02-27", "1 year, 0 months"],
    ["2028-02-29", "2029-02-26", "11 months, 29 days"],
    ["2026-01-31", "2026-02-27", "1 month"],
    ["2026-01-31", "2026-02-26", "27 days"],
  ])("duration %s → %s = %s", (s, e, expected) => {
    expect(formatDuration(s, e)).toBe(expected);
  });
});
