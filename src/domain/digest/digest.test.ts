import { describe, expect, it } from "vitest";

import { attentionItems, digestRows, type DigestNumbers } from "./digest";

const n: DigestNumbers = {
  signUpsLastWeek: 5,
  payingTotal: 3,
  mrr: "6500.00",
  trialsEndingIn7Days: 2,
  cancellationsThisMonth: 0,
  openTickets: 1,
  ticketsOpenedLastWeek: 4,
  approvalsWaiting: 0,
  openIncidents: 0,
  incidentsLastWeek: 1,
};

describe("digestRows", () => {
  it("shows no change on the first digest", () => {
    expect(digestRows(n).every((r) => r.change === null)).toBe(true);
  });

  it("compares with last week", () => {
    const rows = digestRows(n, {
      ...n,
      signUpsLastWeek: 2,
      payingTotal: 3,
      mrr: "5000.00",
      openTickets: 3,
    });
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(by["Sign-ups last week"]!.change).toBe("+3 vs last week");
    expect(by["Paying customers"]!.change).toBe("same as last week");
    expect(by["Monthly recurring revenue"]).toMatchObject({
      now: "₱6,500.00",
      change: "+₱1,500.00 vs last week",
    });
    expect(by["Open tickets"]!.change).toBe("−2 vs last week");
  });
});

describe("attentionItems", () => {
  it("lists only what needs the founder", () => {
    expect(attentionItems(n)).toEqual([
      "1 ticket is open.",
      "2 trials end this week: a good time to call.",
    ]);
    expect(
      attentionItems({
        ...n,
        openIncidents: 2,
        approvalsWaiting: 1,
        openTickets: 0,
        trialsEndingIn7Days: 0,
      }),
    ).toEqual(["2 incidents are still open.", "1 approval is waiting for you."]);
  });
});
