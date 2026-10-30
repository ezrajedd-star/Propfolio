import { describe, expect, it } from "vitest";

import { describeUnitList, expandUnitNumbers, MAX_UNITS_AT_ONCE } from "./unit-numbers";

const ok = (text: string) => {
  const r = expandUnitNumbers(text);
  if (!r.ok) throw new Error(r.error);
  return r.numbers;
};

describe("expandUnitNumbers", () => {
  it.each<[string, string[]]>([
    ["101", ["101"]],
    ["101, 102,103", ["101", "102", "103"]],
    ["101\n102\n\n  103  ", ["101", "102", "103"]],
    ["101-105", ["101", "102", "103", "104", "105"]],
    ["101 - 103", ["101", "102", "103"]],
    ["5 to 9", ["5", "6", "7", "8", "9"]],
    ["G-01 to G-03", ["G-01", "G-02", "G-03"]],
    ["G-08 to 11", ["G-08", "G-09", "G-10", "G-11"]],
    ["2A01 to 2A03", ["2A01", "2A02", "2A03"]],
    ["WH-1 – WH-3", ["WH-1", "WH-2", "WH-3"]],
    ["Unit 7 TO Unit 9", ["Unit 7", "Unit 8", "Unit 9"]],
    ["Penthouse, Roof deck", ["Penthouse", "Roof deck"]],
    ["G-01", ["G-01"]],
    ["101, 101, 102", ["101", "102"]],
    ["A1, a1", ["A1"]],
    ["101-103, Penthouse; 201 to 202", ["101", "102", "103", "Penthouse", "201", "202"]],
  ])("%j", (text, expected) => {
    expect(ok(text)).toEqual(expected);
  });

  it.each<[string, RegExp]>([
    ["", /at least one/],
    [" , \n ", /at least one/],
    ["120-101", /backwards/],
    ["G-01 to H-05", /same beginning/],
    [`1-${MAX_UNITS_AT_ONCE + 1}`, /at most 300/],
    [`1-200, 300-450`, /at most 300/],
    ["x".repeat(41), /too long/],
  ])("refuses %j", (text, message) => {
    const r = expandUnitNumbers(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });

  it("describes long lists briefly", () => {
    expect(describeUnitList(ok("101-120"))).toBe("101, 102, 103, 104, 105 … 120");
    expect(describeUnitList(["A", "B"])).toBe("A, B");
  });
});
