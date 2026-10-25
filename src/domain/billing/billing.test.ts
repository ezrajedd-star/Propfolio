import { describe, expect, it } from "vitest";

import { money } from "../money/money";
import {
  agingBucket,
  allocateOldestFirst,
  balanceDue,
  isOverdue,
  summariseOverdue,
  validateAllocation,
  type OpenCharge,
} from "./ledger";
import { nextDueDate, planCharges, type RentTerms } from "./rent-schedule";

const terms = (o: Partial<RentTerms> = {}): RentTerms => ({
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  monthlyRent: "50000.00",
  rentDueDay: 5,
  securityDeposit: "0",
  advanceRentType: "NONE",
  advanceRentMonths: null,
  advanceRentAmount: null,
  escalationType: "NONE",
  escalationPercent: null,
  escalationEveryMonths: null,
  escalationSteps: null,
  ...o,
});

const rents = (t: RentTerms) => planCharges(t).filter((c) => c.type === "RENT");
const amounts = (t: RentTerms) => rents(t).map((c) => c.amount.toFixed(2));

describe("due dates", () => {
  it.each([
    ["2026-01-01", 5, "2026-01-05"],
    ["2026-01-05", 5, "2026-01-05"],
    ["2026-01-15", 5, "2026-02-05"],
    ["2026-12-20", 1, "2027-01-01"],
    ["2028-02-29", 28, "2028-03-28"],
    ["2026-01-31", 28, "2026-02-28"],
  ])("first due date on/after %s with due day %i is %s", (from, day, expected) => {
    expect(nextDueDate(from, day)).toBe(expected);
  });
});

describe("rent schedule", () => {
  it("a 12-month lease has 12 full rent charges", () => {
    const r = rents(terms());
    expect(r).toHaveLength(12);
    expect(r[0]).toMatchObject({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      dueDate: "2026-01-05",
    });
    expect(r[11]).toMatchObject({
      periodStart: "2026-12-01",
      periodEnd: "2026-12-31",
      dueDate: "2026-12-05",
    });
    expect(new Set(amounts(terms()))).toEqual(new Set(["50000.00"]));
  });

  it("handles month-end starts without drifting (31 Jan → 28/29 Feb → 31 Mar)", () => {
    const r = rents(terms({ startDate: "2028-01-31", endDate: "2028-05-30" }));
    expect(r.map((c) => [c.periodStart, c.periodEnd])).toEqual([
      ["2028-01-31", "2028-02-28"],
      ["2028-02-29", "2028-03-30"],
      ["2028-03-31", "2028-04-29"],
      ["2028-04-30", "2028-05-30"],
    ]);
  });

  it.each([
    // [start, end, expected last amount] — prorated by days of the would-be full period
    ["2026-01-01", "2026-03-15", "24193.55"], // 15 of 31 days of March
    ["2028-01-01", "2028-02-10", "17241.38"], // 10 of 29 days (leap February)
    ["2027-01-01", "2027-02-10", "17857.14"], // 10 of 28 days
  ])("prorates a short last period (%s – %s)", (startDate, endDate, last) => {
    const a = amounts(terms({ startDate, endDate }));
    expect(a.at(-1)).toBe(last);
    expect(rents(terms({ startDate, endDate })).at(-1)?.description).toContain("part month");
  });

  it("compounds a percentage increase every N months, rounding at each step", () => {
    const a = amounts(
      terms({
        startDate: "2026-01-01",
        endDate: "2028-12-31",
        monthlyRent: "33333.33",
        escalationType: "PERCENT",
        escalationPercent: "5",
        escalationEveryMonths: 12,
      }),
    );
    expect(a[0]).toBe("33333.33");
    expect(a[11]).toBe("33333.33");
    expect(a[12]).toBe("35000.00"); // 33333.33 × 1.05 = 34999.9965 → 35000.00
    expect(a[24]).toBe("36750.00");
  });

  it("applies scheduled rent changes from the first period starting on or after the date", () => {
    const a = amounts(
      terms({
        escalationType: "SCHEDULE",
        escalationSteps: [
          { date: "2026-07-01", monthlyRent: "55000.00" },
          { date: "2026-10-15", monthlyRent: "60000.00" },
        ],
      }),
    );
    expect(a.slice(5, 7)).toEqual(["50000.00", "55000.00"]);
    expect(a.slice(9, 12)).toEqual(["55000.00", "60000.00", "60000.00"]);
  });

  it("adds deposit and advance as separate charges due on the start date", () => {
    const c = planCharges(
      terms({ securityDeposit: "100000", advanceRentType: "MONTHS", advanceRentMonths: 2 }),
    );
    expect(
      c.slice(0, 2).map((x) => [x.type, x.dueDate, x.amount.toFixed(2), x.description]),
    ).toEqual([
      ["DEPOSIT", "2026-01-01", "100000.00", "Security deposit"],
      ["ADVANCE", "2026-01-01", "100000.00", "Advance rent (2 months)"],
    ]);
    expect(
      planCharges(
        terms({ advanceRentType: "AMOUNT", advanceRentAmount: "12345.67" }),
      )[0]?.amount.toFixed(2),
    ).toBe("12345.67");
  });
});

const charge = (
  id: string,
  dueDate: string,
  amount: string,
  paid = "0",
  type: OpenCharge["type"] = "RENT",
): OpenCharge => ({
  id,
  dueDate,
  type,
  amount: money(amount),
  paid: money(paid),
});

describe("allocation", () => {
  const open = [
    charge("mar", "2026-03-05", "50000"),
    charge("jan", "2026-01-05", "50000", "20000"),
    charge("feb", "2026-02-05", "50000"),
    charge("dep", "2026-01-05", "100000", "0", "DEPOSIT"),
  ];

  it.each([
    [
      "exact",
      "130000",
      [
        ["dep", "100000.00"],
        ["jan", "30000.00"],
      ],
      "0.00",
    ],
    ["partial", "1000.50", [["dep", "1000.50"]], "0.00"],
    [
      "over-payment",
      "300000",
      [
        ["dep", "100000.00"],
        ["jan", "30000.00"],
        ["feb", "50000.00"],
        ["mar", "50000.00"],
      ],
      "70000.00",
    ],
    ["zero", "0", [], "0.00"],
  ])("%s", (_l, amt, expected, unapplied) => {
    const r = allocateOldestFirst(open, money(amt));
    expect(r.allocations.map((a) => [a.chargeId, a.amount.toFixed(2)])).toEqual(expected);
    expect(r.unapplied.toFixed(2)).toBe(unapplied);
  });

  it("checks hand-adjusted allocations", () => {
    expect(
      validateAllocation(open, money("60000"), [
        { chargeId: "feb", amount: money("50000") },
        { chargeId: "mar", amount: money("10000") },
      ]),
    ).toBeNull();
    expect(
      validateAllocation(open, money("60000"), [{ chargeId: "jan", amount: money("30000.01") }]),
    ).toMatchObject({ kind: "over_charge" });
    expect(
      validateAllocation(open, money("10"), [{ chargeId: "feb", amount: money("20") }]),
    ).toMatchObject({ kind: "over_payment" });
    expect(
      validateAllocation(open, money("10"), [{ chargeId: "nope", amount: money("1") }]),
    ).toMatchObject({ kind: "unknown_charge" });
    expect(
      validateAllocation(open, money("10"), [{ chargeId: "feb", amount: money("0") }]),
    ).toMatchObject({ kind: "not_positive" });
    expect(
      validateAllocation(open, money("10"), [{ chargeId: "feb", amount: money("1.234") }]),
    ).toMatchObject({ kind: "too_many_decimals" });
  });
});

describe("overdue and aging", () => {
  it.each([
    ["2026-10-23", "2026-10-23", null],
    ["2026-10-22", "2026-10-23", "1–30"],
    ["2026-09-23", "2026-10-23", "1–30"],
    ["2026-09-22", "2026-10-23", "31–60"],
    ["2026-08-24", "2026-10-23", "31–60"], // exactly 60 days
    ["2026-08-23", "2026-10-23", "61–90"],
    ["2026-07-25", "2026-10-23", "61–90"], // exactly 90 days
    ["2026-07-24", "2026-10-23", "90+"],
    ["2028-02-29", "2028-03-30", "1–30"],
  ])("due %s, today %s → %s", (due, today, expected) => {
    expect(agingBucket(due, today)).toBe(expected);
  });

  it("is overdue only after the due date and only while unpaid", () => {
    expect(isOverdue(charge("a", "2026-10-22", "100"), "2026-10-23")).toBe(true);
    expect(isOverdue(charge("a", "2026-10-23", "100"), "2026-10-23")).toBe(false);
    expect(isOverdue(charge("a", "2026-10-01", "100", "100"), "2026-10-23")).toBe(false);
  });

  it("totals by bucket and agrees with the per-charge view", () => {
    const list = [
      charge("a", "2026-10-05", "50000", "10000"),
      charge("b", "2026-09-05", "50000"),
      charge("c", "2026-06-05", "50000", "49999.99"),
      charge("d", "2026-11-05", "50000"),
      charge("e", "2026-10-23", "50000"),
    ];
    const s = summariseOverdue(list, "2026-10-23");
    expect(s.total.toFixed(2)).toBe("90000.01");
    expect(s.count).toBe(3);
    expect(s.oldestDueDate).toBe("2026-06-05");
    expect(
      Object.fromEntries(Object.entries(s.buckets).map(([k, v]) => [k, v.toFixed(2)])),
    ).toEqual({
      "1–30": "40000.00",
      "31–60": "50000.00",
      "61–90": "0.00",
      "90+": "0.01",
    });
    // Balance due now includes today's charge, not future ones.
    expect(balanceDue(list, "2026-10-23").toFixed(2)).toBe("140000.01");
  });
});
