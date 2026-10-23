import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatIsoDate, manilaToday } from "./manila";

describe("Manila time", () => {
  it.each([
    // Manila is UTC+8 with no daylight saving, so 16:00 UTC is midnight in Manila.
    ["2026-10-22T15:59:00Z", "2026-10-22"],
    ["2026-10-22T16:00:00Z", "2026-10-23"],
    ["2026-12-31T16:30:00Z", "2027-01-01"],
  ])("manilaToday(%s) = %s", (iso, expected) => {
    expect(manilaToday(new Date(iso))).toBe(expected);
  });

  it("formats dates as 23 Oct 2026", () => {
    expect(formatDate(new Date("2026-10-23T01:00:00Z"))).toBe("23 Oct 2026");
    expect(formatIsoDate("2028-02-29")).toBe("29 Feb 2028");
    expect(formatDate("2026-01-05")).toBe("5 Jan 2026");
    expect(formatDate(null)).toBe("—");
  });

  it("formats date-times in Manila time", () => {
    expect(formatDateTime(new Date("2026-10-23T06:05:00Z"))).toBe("23 Oct 2026, 2:05 PM");
  });
});

import { greeting } from "./greeting";

describe("greeting", () => {
  it.each([
    ["2026-10-22T23:30:00Z", "Good morning"], // 7:30 AM Manila
    ["2026-10-23T05:00:00Z", "Good afternoon"], // 1:00 PM
    ["2026-10-23T11:00:00Z", "Good evening"], // 7:00 PM
  ])("%s → %s", (iso, expected) => {
    expect(greeting(new Date(iso))).toBe(expected);
  });
});
