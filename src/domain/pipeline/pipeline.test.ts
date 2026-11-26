import { describe, expect, it } from "vitest";

import {
  autoStage,
  lostLeadExpired,
  parseImportRow,
  type LeadStage,
  type PipelineEvent,
} from "./pipeline";

describe("autoStage", () => {
  it.each([
    ["NEW", "signup", "TRIAL"],
    ["CONTACTED", "signup", "TRIAL"],
    ["TRIAL", "signup", null],
    ["PAYING", "signup", null],
    ["TRIAL", "first_lease", "ACTIVE_TRIAL"],
    ["NEW", "first_lease", "ACTIVE_TRIAL"],
    ["ACTIVE_TRIAL", "first_lease", null],
    ["PAYING", "first_lease", null],
    ["ACTIVE_TRIAL", "first_payment", "PAYING"],
    ["PAYING", "first_payment", null],
    ["PAYING", "trial_started", null],
    ["PAYING", "cancelled", "LOST"],
    ["TRIAL", "cancelled", "LOST"],
    ["LOST", "cancelled", null],
    ["LOST", "signup", "TRIAL"],
    ["LOST", "first_payment", "PAYING"],
  ] as const)("%s + %s → %s", (from, event, to) => {
    expect(autoStage(from as LeadStage, event as PipelineEvent)).toBe(to);
  });
});

describe("lostLeadExpired", () => {
  const now = new Date("2026-11-26T00:00:00Z");
  it.each([
    ["2024-11-25T00:00:00Z", true],
    ["2024-11-27T00:00:00Z", false],
    ["2026-01-01T00:00:00Z", false],
  ])("lost %s", (lostAt, expired) => {
    expect(lostLeadExpired(new Date(lostAt), now, 24)).toBe(expired);
  });
});

describe("parseImportRow", () => {
  const base = { Name: "Maria Santos", Email: "Maria@Example.test" };
  it("defaults: type Other, source My network, stage New, no consent", () => {
    expect(parseImportRow(base)).toEqual({
      lead: expect.objectContaining({
        email: "maria@example.test",
        type: "OTHER",
        source: "MY_NETWORK",
        stage: "NEW",
        marketingConsent: false,
      }),
    });
  });

  it.each([
    [{ Type: "property manager" }, { type: "PROPERTY_MANAGER" }],
    [{ Type: "Lessor" }, { type: "LESSOR" }],
    [{ Source: "LinkedIn" }, { source: "LINKEDIN" }],
    [{ Source: "demo request" }, { source: "DEMO_REQUEST" }],
    [{ Stage: "Active trial" }, { stage: "ACTIVE_TRIAL" }],
    [{ "Portfolio size (units)": "1,200" }, { portfolioSize: 1200 }],
    [
      {
        "Marketing consent (yes/no)": "yes",
        "Consent date (YYYY-MM-DD)": "2026-11-01",
        "Consent source": "Event sign-up sheet",
      },
      { marketingConsent: true, consentDate: "2026-11-01" },
    ],
  ])("%j", (extra, expected) => {
    expect(parseImportRow({ ...base, ...extra })).toEqual({
      lead: expect.objectContaining(expected),
    });
  });

  it.each([
    [{ Name: "" }, /Name is empty/],
    [{ Email: "not-an-email" }, /isn't an email/],
    [{ Type: "landlord" }, /Type "landlord"/],
    [{ Source: "TikTok" }, /Source "TikTok"/],
    [{ Stage: "Won" }, /Stage "Won"/],
    [{ "Portfolio size (units)": "about 20" }, /whole number/],
    [{ "Next follow-up (YYYY-MM-DD)": "next week" }, /Next follow-up/],
    [{ "Marketing consent (yes/no)": "sure" }, /yes or no/],
    [{ "Marketing consent (yes/no)": "yes" }, /consent date/],
  ])("refuses %j", (extra, message) => {
    const r = parseImportRow({ ...base, ...extra });
    expect("error" in r && r.error).toMatch(message);
  });
});
