import { describe, expect, it } from "vitest";

import { decodeLanding, encodeLanding, looksLikeBot, trackedPath, visitSource } from "./analytics";

describe("trackedPath", () => {
  it.each([
    ["/", "/"],
    ["/welcome", "/"],
    ["/pricing?ref=fb#plans", "/pricing"],
    ["/Pricing/", "/pricing"],
    ["/for/industrial", "/for/industrial"],
    ["/resources/lease-renewal-checklist", "/resources/lease-renewal-checklist"],
    ["/leases", null],
    ["/platform", null],
    ["/pricingx", null],
    ["pricing", null],
    [42, null],
  ])("%s → %s", (input, out) => {
    expect(trackedPath(input)).toBe(out);
  });
});

describe("visitSource", () => {
  const own = "propfolioph.com";
  it.each([
    [undefined, "Direct"],
    ["", "Direct"],
    ["not a url", "Direct"],
    ["https://www.propfolioph.com/pricing", "Direct"],
    ["https://www.google.com/search?q=lease+tracker", "Google"],
    ["https://www.google.com.ph/", "Google"],
    ["https://l.facebook.com/l.php?u=x", "Facebook"],
    ["https://m.facebook.com/", "Facebook"],
    ["https://t.co/abc", "X (Twitter)"],
    ["https://lnkd.in/x", "LinkedIn"],
    ["https://blog.example.ph/post/123?id=9", "blog.example.ph"],
  ])("%s → %s", (ref, out) => {
    expect(visitSource(ref, own)).toBe(out);
  });
});

describe("landing cookie", () => {
  it("round-trips, and refuses anything odd", () => {
    expect(decodeLanding(encodeLanding("/pricing", "Google"))).toEqual({
      path: "/pricing",
      source: "Google",
    });
    expect(decodeLanding(encodeLanding("/settings", "Google"))).toBeNull();
    expect(decodeLanding("%%%")).toBeNull();
    expect(decodeLanding(undefined)).toBeNull();
    expect(decodeLanding(encodeURIComponent(JSON.stringify({ a: 1 })))).toBeNull();
  });
});

describe("looksLikeBot", () => {
  it.each([
    [null, true],
    ["Mozilla/5.0 (compatible; Googlebot/2.1)", true],
    ["facebookexternalhit/1.1", true],
    ["Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140", true],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", false],
  ])("%s → %s", (ua, bot) => {
    expect(looksLikeBot(ua)).toBe(bot);
  });
});
