import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it.each([
    ["plain", "plain"],
    ["Santo Niño, Inc.", '"Santo Niño, Inc."'],
    ['He said "hi"', '"He said ""hi"""'],
    ["line\nbreak", '"line\nbreak"'],
    ['=HYPERLINK("x")', '"\'=HYPERLINK(""x"")"'],
    ["+63 917", "'+63 917"],
    ["-5", "'-5"],
    ["@SUM(A1)", "'@SUM(A1)"],
    [" padded ", '" padded "'],
    [null, ""],
  ])("csvCell(%j)", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it("keeps numbers as numbers", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(50000.5)).toBe("50000.5");
  });

  it("adds a BOM and CRLF line endings", () => {
    expect(toCsv(["A", "B"], [[1, "x"]])).toBe("﻿A,B\r\n1,x\r\n");
  });
});
