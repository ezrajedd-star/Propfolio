import { describe, expect, it } from "vitest";

import { CALENDAR_EVENT_TYPES, leaseEvents, rentDueDates, type CalendarLease } from "./events";

const lease: CalendarLease = {
  id: "L1",
  startDate: "2026-01-15",
  endDate: "2027-01-14",
  terminationDate: null,
  status: "ACTIVE",
  rentDueDay: 5,
  reminderConfig: {
    leadDays: [90, 60, 30],
    repeat: "WEEKLY",
    repeatWeekday: 1,
    afterExpiryDays: 30,
  },
};

describe("rent due dates", () => {
  it("lists the due day of each month inside the lease and the range", () => {
    expect(rentDueDates(lease, "2026-01-01", "2026-04-30")).toEqual([
      "2026-02-05",
      "2026-03-05",
      "2026-04-05",
    ]);
  });

  it.each([
    [28, "2027-02-01", "2027-02-28", ["2027-02-28"]],
    [28, "2028-02-01", "2028-02-29", ["2028-02-28"]],
    [1, "2026-12-01", "2027-01-31", ["2026-12-01", "2027-01-01"]],
  ])("due day %i between %s and %s", (day, from, to, expected) => {
    expect(
      rentDueDates(
        { startDate: "2026-01-01", endDate: "2028-12-31", terminationDate: null, rentDueDay: day },
        from,
        to,
      ),
    ).toEqual(expected);
  });

  it("stops at the termination date", () => {
    expect(
      rentDueDates({ ...lease, terminationDate: "2026-04-04" }, "2026-01-01", "2026-12-31"),
    ).toEqual(["2026-02-05", "2026-03-05"]);
  });

  it("is empty when the range is outside the lease", () => {
    expect(rentDueDates(lease, "2030-01-01", "2030-12-31")).toEqual([]);
  });
});

describe("lease events", () => {
  it("builds start, end, reminder and rent events inside the range", () => {
    const events = leaseEvents(lease, "2026-10-01", "2027-01-31", CALENDAR_EVENT_TYPES);
    expect(
      events.filter((e) => e.type !== "RENT_DUE").map((e) => [e.type, e.date, e.daysBefore]),
    ).toEqual([
      ["END", "2027-01-14", undefined],
      ["REMINDER", "2026-10-16", 90],
      ["REMINDER", "2026-11-15", 60],
      ["REMINDER", "2026-12-15", 30],
    ]);
    expect(events.filter((e) => e.type === "RENT_DUE").map((e) => e.date)).toEqual([
      "2026-10-05",
      "2026-11-05",
      "2026-12-05",
      "2027-01-05",
    ]);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it("only includes the requested types", () => {
    expect(
      leaseEvents(lease, "2026-01-01", "2027-12-31", ["START", "END"]).map((e) => e.type),
    ).toEqual(["START", "END"]);
  });

  it.each(["RENEWED", "TERMINATED"] as const)("no reminders once %s", (status) => {
    expect(leaseEvents({ ...lease, status }, "2026-01-01", "2027-12-31", ["REMINDER"])).toEqual([]);
  });

  it("puts the end event on the termination date", () => {
    expect(
      leaseEvents(
        { ...lease, terminationDate: "2026-06-30", status: "TERMINATED" },
        "2026-01-01",
        "2027-12-31",
        ["END"],
      )[0]?.date,
    ).toBe("2026-06-30");
  });
});
