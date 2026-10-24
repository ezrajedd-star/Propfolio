import { describe, expect, it } from "vitest";

import {
  SYSTEM_REMINDER_DEFAULT,
  effectiveReminderConfig,
  expiringWindowDays,
  parseStoredReminderConfig,
  reminderConfigSchema,
  type ReminderConfig,
} from "./config";
import { describeConfig, describeRepeat, formatDateList, reminderSchedule } from "./schedule";

const office: ReminderConfig = {
  leadDays: [90, 60, 30],
  repeat: "NONE",
  repeatWeekday: null,
  afterExpiryDays: 0,
};
const residential: ReminderConfig = { ...office, leadDays: [60, 30, 7] };
const unitOverride: ReminderConfig = { ...office, leadDays: [14] };

describe("reminder inheritance", () => {
  it.each([
    ["unit override wins", residential, unitOverride, unitOverride, "unit"],
    ["unit type when no override", residential, null, residential, "unitType"],
    ["system default when neither", null, null, SYSTEM_REMINDER_DEFAULT, "system"],
    ["unit override even without a type setting", null, unitOverride, unitOverride, "unit"],
  ] as const)("%s", (_label, type, unit, expected, source) => {
    expect(effectiveReminderConfig(SYSTEM_REMINDER_DEFAULT, type, unit)).toEqual({
      config: expected,
      source,
    });
  });

  it("treats invalid stored values as not set", () => {
    expect(parseStoredReminderConfig({ leadDays: [] })).toBeNull();
    expect(parseStoredReminderConfig(null)).toBeNull();
    expect(parseStoredReminderConfig(office)).toEqual(office);
  });

  it("sorts and de-duplicates lead days", () => {
    const parsed = reminderConfigSchema.parse({ ...office, leadDays: [30, 90, 30, 60] });
    expect(parsed.leadDays).toEqual([90, 60, 30]);
    expect(expiringWindowDays(parsed)).toBe(90);
  });

  it("requires a weekday for weekly repeats", () => {
    expect(
      reminderConfigSchema.safeParse({ ...office, repeat: "WEEKLY", repeatWeekday: null }).success,
    ).toBe(false);
  });
});

describe("reminder schedule", () => {
  it("matches the brief's example: 2 Aug, 1 Sep and 1 Oct 2027 for a lease ending 31 Oct 2027", () => {
    const dates = reminderSchedule("2025-11-01", "2027-10-31", office).map((r) => r.date);
    expect(dates).toEqual(["2027-08-02", "2027-09-01", "2027-10-01"]);
    expect(formatDateList(dates)).toBe("2 Aug, 1 Sep and 1 Oct 2027");
  });

  it.each([
    // Month ends and leap years
    ["2028-03-31", [30], ["2028-03-01"]],
    ["2028-02-29", [30], ["2028-01-30"]],
    ["2027-03-01", [1], ["2027-02-28"]],
    ["2028-03-01", [1], ["2028-02-29"]],
    ["2027-01-15", [60], ["2026-11-16"]],
    ["2028-12-31", [366], ["2027-12-31"]],
  ])("lease ending %s with lead days %j", (end, leadDays, expected) => {
    const dates = reminderSchedule("2020-01-01", end, { ...office, leadDays }).map((r) => r.date);
    expect(dates).toEqual(expected);
  });

  it("drops reminders before the lease starts", () => {
    expect(reminderSchedule("2026-11-15", "2027-01-15", office).map((r) => r.daysBefore)).toEqual([
      60, 30,
    ]);
  });

  it("repeats weekly on the chosen weekday until 30 days after the end", () => {
    const config: ReminderConfig = {
      leadDays: [30],
      repeat: "WEEKLY",
      repeatWeekday: 1,
      afterExpiryDays: 30,
    };
    // Lease ends Sunday 31 Jan 2027; last lead reminder is Fri 1 Jan 2027.
    const repeats = reminderSchedule("2026-01-01", "2027-01-31", config).filter(
      (r) => r.kind === "REPEAT",
    );
    expect(repeats.map((r) => r.date)).toEqual([
      "2027-01-04",
      "2027-01-11",
      "2027-01-18",
      "2027-01-25",
      "2027-02-01",
      "2027-02-08",
      "2027-02-15",
      "2027-02-22",
      "2027-03-01",
    ]);
    expect(repeats.at(-1)?.daysBefore).toBe(-29);
  });

  it("repeats daily until the end date when there is no grace period", () => {
    const config: ReminderConfig = {
      leadDays: [5],
      repeat: "DAILY",
      repeatWeekday: null,
      afterExpiryDays: 0,
    };
    const dates = reminderSchedule("2026-01-01", "2026-12-31", config).map((r) => r.date);
    expect(dates).toEqual([
      "2026-12-26",
      "2026-12-27",
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
    ]);
  });

  it("describes settings in plain words", () => {
    expect(describeConfig(office)).toBe("90, 60 and 30 days before");
    expect(describeConfig(SYSTEM_REMINDER_DEFAULT)).toBe(
      "90, 60 and 30 days before · then weekly on Mondays (until 30 days after)",
    );
    expect(describeConfig({ ...office, leadDays: [14], repeat: "DAILY" })).toBe(
      "14 days before · then daily",
    );
    expect(describeRepeat(office, "2027-10-31")).toBeNull();
    expect(describeRepeat(SYSTEM_REMINDER_DEFAULT, "2027-10-31")).toContain(
      "every Monday until 30 Nov 2027",
    );
  });

  it("formats date lists across years", () => {
    expect(formatDateList(["2026-12-01", "2027-01-01"])).toBe("1 Dec 2026 and 1 Jan 2027");
    expect(formatDateList(["2027-01-01"])).toBe("1 Jan 2027");
    expect(formatDateList([])).toBe("");
  });
});
