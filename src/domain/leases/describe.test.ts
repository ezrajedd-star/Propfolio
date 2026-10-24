import { describe, expect, it } from "vitest";

import { describeTerms } from "./describe";

describe("describeTerms", () => {
  it("describes a typical commercial lease", () => {
    expect(
      describeTerms({
        monthlyRent: "50,000",
        rentDueDay: 5,
        securityDeposit: "100000.00",
        advanceRentType: "MONTHS",
        advanceRentMonths: 2,
        escalationType: "PERCENT",
        escalationPercent: "5.000",
        escalationEveryMonths: 12,
      }),
    ).toEqual([
      "Rent is ₱50,000.00 a month, due on the 5th of each month.",
      "Security deposit: ₱100,000.00.",
      "Advance rent: 2 months.",
      "Rent goes up 5% every 12 months.",
    ]);
  });

  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [11, "11th"],
    [21, "21st"],
    [22, "22nd"],
    [28, "28th"],
  ])("ordinal due day %i → %s", (day, text) => {
    const [first] = describeTerms({
      monthlyRent: "1",
      rentDueDay: day,
      securityDeposit: "0",
      advanceRentType: "NONE",
      escalationType: "NONE",
    });
    expect(first).toContain(`due on the ${text}`);
  });

  it("lists scheduled rent changes in date order", () => {
    const lines = describeTerms({
      monthlyRent: "30000",
      rentDueDay: 1,
      securityDeposit: "0",
      advanceRentType: "AMOUNT",
      advanceRentAmount: "15000",
      escalationType: "SCHEDULE",
      escalationSteps: [
        { date: "2028-01-01", monthlyRent: "34000" },
        { date: "2027-01-01", monthlyRent: "32000" },
      ],
    });
    expect(lines.slice(2)).toEqual([
      "Advance rent: ₱15,000.00.",
      "From 1 Jan 2027, rent becomes ₱32,000.00 a month.",
      "From 1 Jan 2028, rent becomes ₱34,000.00 a month.",
    ]);
  });
});
