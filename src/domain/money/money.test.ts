import { describe, expect, it } from "vitest";

import { formatPeso, money, moneyString, parseMoney, roundMoney } from "./money";

describe("money", () => {
  it.each([
    ["12500", "₱12,500.00"],
    ["0.5", "₱0.50"],
    ["1234567.891", "₱1,234,567.89"],
    ["-1000", "-₱1,000.00"],
    ["999999999999.99", "₱999,999,999,999.99"],
    ["9007199254740993.01", "₱9,007,199,254,740,993.01"], // beyond float precision
    ["-0.001", "₱0.00"],
  ])("formatPeso(%s) = %s", (v, expected) => {
    expect(formatPeso(v)).toBe(expected);
  });

  it.each([
    ["50000", "50000.00"],
    ["50,000.00", "50000.00"],
    ["₱ 50,000.5", "50000.50"],
    ["PHP1200", "1200.00"],
    ["12.345", null],
    ["abc", null],
    ["", null],
    ["1.2.3", null],
  ])("parseMoney(%j)", (input, expected) => {
    const parsed = parseMoney(input);
    expect(parsed ? moneyString(parsed) : null).toBe(expected);
  });

  it("rounds half away from zero without float errors", () => {
    expect(roundMoney("2.675").toFixed(2)).toBe("2.68"); // 2.675 as a float rounds to 2.67
    expect(roundMoney("-2.675").toFixed(2)).toBe("-2.68");
    expect(money("0.1").plus("0.2").toFixed(2)).toBe("0.30");
  });
});
