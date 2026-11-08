import { describe, expect, it } from "vitest";

import { COMPANY, PUBLIC_PAGES, isPlaceholder } from "./company";

describe("company details", () => {
  it.each([
    ["[TO SUPPLY: business address]", true],
    ["", true],
    [null, true],
    ["Propfolio Inc., 1 Ayala Ave, Makati", false],
  ])("%s is a placeholder: %s", (v, expected) => expect(isPlaceholder(v)).toBe(expected));

  it("the trade name is set; every page the payment partner checks is listed", () => {
    expect(isPlaceholder(COMPANY.tradeName)).toBe(false);
    expect(PUBLIC_PAGES.map((p) => p.label)).toEqual([
      "Pricing",
      "Terms of Service",
      "Privacy Policy",
      "Data Processing Agreement",
      "Refunds and cancellation",
      "Contact",
    ]);
  });
});
