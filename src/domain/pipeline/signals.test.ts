import { describe, expect, it } from "vitest";

import { rankLeads, scoreLead, type LeadFacts } from "./signals";

const today = "2026-11-26";
const base: LeadFacts = {
  stage: "NEW",
  source: "MY_NETWORK",
  portfolioSize: null,
  nextFollowUp: null,
  daysSinceActivity: 1,
  demoRequestedDaysAgo: null,
  account: null,
};

describe("scoreLead", () => {
  it.each<[string, Partial<LeadFacts>, number, string[]]>([
    ["nothing going on", {}, 0, []],
    [
      "trial ending soon, stuck before leases",
      { stage: "TRIAL", account: { trialDaysLeft: 3, units: 12, leases: 0, daysSinceActive: 10 } },
      30 + 20 + 2,
      ["Trial ends in 3 days", "Added 12 units but no leases yet", "About 12 units"],
    ],
    ["demo request yesterday", { demoRequestedDaysAgo: 1 }, 25, ["Asked for a demo 1 day ago"]],
    ["follow-up due today", { nextFollowUp: today }, 15, ["Follow-up is due today"]],
    ["follow-up overdue", { nextFollowUp: "2026-11-20" }, 15, ["Follow-up is overdue"]],
    ["follow-up later", { nextFollowUp: "2026-12-01" }, 0, []],
    ["gone quiet", { daysSinceActivity: 20 }, 10, ["No contact for 20 days"]],
    [
      "referral, big portfolio (capped)",
      { source: "REFERRAL", portfolioSize: 500 },
      10 + 20,
      ["Came by referral", "About 500 units"],
    ],
    [
      "recently active",
      { account: { trialDaysLeft: null, units: 0, leases: 0, daysSinceActive: 1 } },
      10,
      ["Used Propfolio in the last few days"],
    ],
    ["paying customers are left alone", { stage: "PAYING", demoRequestedDaysAgo: 0 }, 0, []],
    ["lost leads are left alone", { stage: "LOST", nextFollowUp: today }, 0, []],
  ])("%s", (_name, over, score, reasons) => {
    const r = scoreLead({ ...base, ...over }, today);
    expect(r.score).toBe(score);
    expect(r.reasons).toEqual(reasons);
  });
});

describe("rankLeads", () => {
  it("highest first, only those with a reason, at most the list size", () => {
    const leads = [
      { id: "a", facts: { ...base, nextFollowUp: today } },
      { id: "b", facts: { ...base, demoRequestedDaysAgo: 0 } },
      { id: "c", facts: base },
    ];
    expect(rankLeads(leads, today).map((l) => l.id)).toEqual(["b", "a"]);
    expect(rankLeads(leads, today, 1).map((l) => l.id)).toEqual(["b"]);
  });
});
