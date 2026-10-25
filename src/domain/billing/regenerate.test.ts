import { describe, expect, it } from "vitest";

import { money } from "../money/money";
import { chargesToCancelOnTermination, planRegeneration, type ExistingCharge } from "./regenerate";
import { planCharges, type RentTerms } from "./rent-schedule";

const terms = (o: Partial<RentTerms> = {}): RentTerms => ({
  startDate: "2026-01-01",
  endDate: "2026-06-30",
  monthlyRent: "50000.00",
  rentDueDay: 5,
  securityDeposit: "100000",
  advanceRentType: "NONE",
  advanceRentMonths: null,
  advanceRentAmount: null,
  escalationType: "NONE",
  escalationPercent: null,
  escalationEveryMonths: null,
  escalationSteps: null,
  ...o,
});

/** Turn a plan into "existing" charges, with some paid. */
function existingFrom(t: RentTerms, paidKeys: string[] = []): ExistingCharge[] {
  return planCharges(t).map((p, i) => ({
    id: `c${i}`,
    type: p.type,
    key: p.key,
    dueDate: p.dueDate,
    amount: p.amount,
    paid: paidKeys.includes(p.key) ? p.amount : money(0),
    description: p.description,
  }));
}

describe("regenerating charges after a terms change", () => {
  it("changes nothing when the terms are the same", () => {
    const plan = planRegeneration(existingFrom(terms()), planCharges(terms()), "2026-03-10");
    expect(plan).toEqual({ create: [], cancel: [], keptDifferent: [] });
  });

  it("replaces only future unpaid rent when the rent changes", () => {
    const existing = existingFrom(terms(), ["DEPOSIT", "2026-01-01", "2026-02-01"]);
    const plan = planRegeneration(
      existing,
      planCharges(terms({ monthlyRent: "52000" })),
      "2026-03-10",
    );
    // March (due 5 Mar) has passed but is unpaid → kept for review; April–June are replaced.
    expect(plan.cancel.map((c) => c.key)).toEqual(["2026-04-01", "2026-05-01", "2026-06-01"]);
    expect(plan.create.map((c) => [c.key, c.amount.toFixed(2)])).toEqual([
      ["2026-04-01", "52000.00"],
      ["2026-05-01", "52000.00"],
      ["2026-06-01", "52000.00"],
    ]);
    expect(plan.keptDifferent.map((k) => k.existing.key)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });

  it("adds new periods when the lease is extended, and cancels unpaid ones when shortened", () => {
    const longer = planRegeneration(
      existingFrom(terms()),
      planCharges(terms({ endDate: "2026-08-31" })),
      "2026-03-10",
    );
    expect(longer.create.map((c) => c.key)).toEqual(["2026-07-01", "2026-08-01"]);
    expect(longer.cancel).toEqual([]);

    const shorter = planRegeneration(
      existingFrom(terms()),
      planCharges(terms({ endDate: "2026-04-30" })),
      "2026-03-10",
    );
    expect(shorter.cancel.map((c) => c.key)).toEqual(["2026-05-01", "2026-06-01"]);
  });

  it("never touches a paid future charge, and reports it", () => {
    const existing = existingFrom(terms(), ["2026-05-01"]);
    const plan = planRegeneration(
      existing,
      planCharges(terms({ endDate: "2026-04-30" })),
      "2026-03-10",
    );
    expect(plan.cancel.map((c) => c.key)).toEqual(["2026-06-01"]);
    expect(plan.keptDifferent).toEqual([
      expect.objectContaining({
        planned: null,
        existing: expect.objectContaining({ key: "2026-05-01" }),
      }),
    ]);
  });

  it("leaves manual 'other' charges alone", () => {
    const other: ExistingCharge = {
      id: "x",
      type: "OTHER",
      key: null,
      dueDate: "2026-12-01",
      amount: money(500),
      paid: money(0),
      description: "Parking",
    };
    const plan = planRegeneration(
      [...existingFrom(terms()), other],
      planCharges(terms()),
      "2026-03-10",
    );
    expect(plan.cancel).toEqual([]);
  });

  it("cancels unpaid rent due after an early end date", () => {
    const existing = existingFrom(terms(), ["2026-06-01"]);
    expect(chargesToCancelOnTermination(existing, "2026-03-31").map((c) => c.key)).toEqual([
      "2026-04-01",
      "2026-05-01",
    ]);
  });
});
