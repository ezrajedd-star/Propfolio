import { describe, expect, it } from "vitest";

import {
  anonymisedName,
  isPastRetention,
  retentionDueDate,
  type RetentionInput,
} from "./retention";

const base: RetentionInput = {
  leaseEndDates: [],
  hasLiveLease: false,
  archivedOn: null,
  createdOn: "2015-03-01",
};

describe("retentionDueDate", () => {
  it.each<[string, Partial<RetentionInput>, number, string | null]>([
    [
      "runs from the last lease end",
      { leaseEndDates: ["2014-12-31", "2016-05-31"] },
      10,
      "2026-05-31",
    ],
    [
      "uses archiving if later",
      { leaseEndDates: ["2016-05-31"], archivedOn: "2017-01-10" },
      10,
      "2027-01-10",
    ],
    ["no leases: from when they were added", {}, 10, "2025-03-01"],
    ["no leases but archived", { archivedOn: "2016-02-29" }, 1, "2017-02-28"],
    ["leap day end", { leaseEndDates: ["2016-02-29"] }, 4, "2020-02-29"],
    ["live lease: never", { leaseEndDates: ["2016-05-31"], hasLiveLease: true }, 10, null],
  ])("%s", (_, o, years, expected) => {
    expect(retentionDueDate({ ...base, ...o }, years)).toBe(expected);
  });
});

describe("isPastRetention", () => {
  const t = { ...base, leaseEndDates: ["2016-05-31"] };
  it.each([
    ["2026-05-30", false],
    ["2026-05-31", false],
    ["2026-06-01", true],
  ])("on %s → %s", (today, expected) => {
    expect(isPastRetention(t, 10, today)).toBe(expected);
  });
  it("never for a tenant with a live lease", () => {
    expect(isPastRetention({ ...t, hasLiveLease: true }, 1, "2099-01-01")).toBe(false);
  });
});

describe("anonymisedName", () => {
  it("uses the end of the id, without personal data", () => {
    expect(anonymisedName("0195f3a2-7b1c-7d00-9e00-00000a3f9a21")).toBe("Anonymised tenant 3F9A21");
  });
});
