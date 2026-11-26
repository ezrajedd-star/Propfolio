import { describe, expect, it } from "vitest";

import { capPercent, formatUsd, overCap, usageCost } from "./cost";
import { maskPersonalDetails } from "./mask";
import {
  detectSensitive,
  draftLockReason,
  effectiveLevel,
  asksForPerson,
  mentionsOffListPrice,
  type AutonomyContext,
} from "./autonomy";

describe("maskPersonalDetails", () => {
  it.each([
    ["Call me at 0917 123 4567", "Call me at [phone]"],
    ["+63 917 123 4567 or 639171234567", "[phone] or [phone]"],
    ["Landline (02) 8123 4567", "Landline [phone]"],
    ["TIN 123-456-789-000 please", "TIN [ID number] please"],
    ["SSS 12-3456789-0", "SSS [ID number]"],
    ["PhilHealth 12-345678901-2", "PhilHealth [ID number]"],
    ["Pag-IBIG 1234-5678-9012", "Pag-IBIG [ID number]"],
    ["Passport P1234567A", "Passport [ID number]"],
    ["Card 4111 1111 1111 1111", "Card [card or account number]"],
    ["BDO account 001234567890", "BDO account [card or account number]"],
    ["email juan@example.com", "email [email]"],
    ["Unit 12 rent is ₱12,500 for 3 months", "Unit 12 rent is ₱12,500 for 3 months"],
  ])("%s", (input, output) => {
    expect(maskPersonalDetails(input)).toBe(output);
  });

  it("hides the account's tenant names, longest first, any case", () => {
    expect(
      maskPersonalDetails("Juan dela Cruz paid; JUAN also called. ABC Corporation is late.", {
        names: ["Juan", "Juan dela Cruz", "ABC Corporation", "Al"],
      }),
    ).toBe("[tenant] paid; [tenant] also called. [tenant] is late.");
  });

  it("doesn't hide parts of other words", () => {
    expect(maskPersonalDetails("Ana's banana", { names: ["Ana"] })).toBe("[tenant]'s banana");
  });
});

describe("detectSensitive", () => {
  it.each([
    ["Can I get a refund for November?", ["refund"]],
    ["Pwede bang ibalik ang bayad ko?", ["refund"]],
    ["You charged twice this month", ["billing_dispute"]],
    ["Please delete my data", ["privacy"]],
    ["Burahin ang aking data", ["privacy"]],
    ["My lawyer will contact you", ["legal"]],
    ["Ireklamo sa DTI kita", ["legal"]],
    ["Make me the owner of the account", ["access_change"]],
    ["Can I get a discount?", ["pricing"]],
    ["May diskwento ba?", ["pricing"]],
    ["How do I add a unit?", []],
  ])("%s", (text, flags) => {
    expect(detectSensitive(text)).toEqual(flags);
  });
});

describe("draftLockReason", () => {
  it.each<[string, Parameters<typeof draftLockReason>[0], AutonomyContext, RegExp | null]>([
    [
      "ordinary reply",
      "TICKET_REPLY",
      { ticketCategory: "HOW_TO", language: "EN", daysSinceStart: 40 },
      null,
    ],
    ["billing ticket", "TICKET_REPLY", { ticketCategory: "BILLING" }, /Billing/],
    ["privacy ticket", "TICKET_REPLY", { ticketCategory: "PRIVACY" }, /Privacy/],
    ["refund flag", "TICKET_REPLY", { flags: ["refund"] }, /refund/],
    ["legal flag", "TICKET_REPLY", { flags: ["legal"] }, /legal threat/],
    ["access flag", "TICKET_REPLY", { flags: ["access_change"] }, /access/],
    ["price not in plans", "NURTURE_EMAIL", { offPriceList: true }, /price/],
    ["Tagalog in month one", "TICKET_REPLY", { language: "TL", daysSinceStart: 3 }, /first month/],
    ["Cebuano after a month", "TICKET_REPLY", { language: "CEB", daysSinceStart: 31 }, null],
    ["help articles always", "HELP_ARTICLE", {}, /always/],
    ["personal follow-ups always", "FOLLOW_UP_DRAFT", {}, /always/],
    ["social posts always", "CONTENT_POST", {}, /always/],
    ["status page always", "STATUS_UPDATE", {}, /always/],
  ])("%s", (_name, type, ctx, expected) => {
    const r = draftLockReason(type, ctx);
    if (expected === null) expect(r).toBeNull();
    else expect(r).toMatch(expected);
  });

  it("a lock overrides an Act setting", () => {
    expect(effectiveLevel("ACT", "TICKET_REPLY", { flags: ["privacy"] }).level).toBe("DRAFT");
    expect(
      effectiveLevel("ACT", "TICKET_REPLY", { language: "EN", daysSinceStart: 40 }).level,
    ).toBe("ACT");
  });
});

describe("mentionsOffListPrice", () => {
  const allowed = ["1500.00", "3500.00", "0.00"];
  it.each([
    ["Pro is ₱1,500 a month", false],
    ["Premium is PHP 3,500.00", false],
    ["I can do ₱1,000 for you", true],
    ["Get 20% off this week", true],
    ["No prices here", false],
  ])("%s", (text, off) => {
    expect(mentionsOffListPrice(text, allowed)).toBe(off);
  });
});

describe("cost", () => {
  it("prices tokens and session time", () => {
    expect(
      usageCost("claude-opus-5-5", {
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheReadTokens: 2_000_000,
        sessionHours: 1.5,
      }).toString(),
    ).toBe("6.52");
    expect(
      usageCost("claude-haiku-5-5", { inputTokens: 10_000, outputTokens: 1_000 }).toString(),
    ).toBe("0.0015");
    expect(() => usageCost("unknown-model", { inputTokens: 1, outputTokens: 1 })).toThrow();
  });

  it.each([
    ["39.99", "40", false, 100],
    ["40", "40", true, 100],
    ["10", "40", false, 25],
  ])("%s of %s", (spent, cap, over, pct) => {
    expect(overCap(spent, cap)).toBe(over);
    expect(capPercent(spent, cap)).toBe(pct);
  });

  it("formats dollars", () => {
    expect(formatUsd("3.456")).toBe("$3.46");
  });
});

describe("asksForPerson", () => {
  it.each([
    ["Can I talk to a person please?", true],
    ["I want to speak with a real human", true],
    ["Human please", true],
    ["Gusto ko ng tao, hindi bot", true],
    ["Pwede ba makausap ang tao?", true],
    ["Gusto ko makig-istorya sa tawo", true],
    ["How do I add a person to my team?", false],
    ["My tenant is a real person", false],
  ])("%s", (text, yes) => {
    expect(asksForPerson(text)).toBe(yes);
  });
});
