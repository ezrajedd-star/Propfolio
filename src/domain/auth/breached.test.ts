import { describe, expect, it } from "vitest";

import { pwnedCount, pwnedRangeQuery } from "./breached";

describe("breached-password check", () => {
  it("sends only the first 5 characters of the SHA-1 hash", () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    expect(pwnedRangeQuery("password")).toEqual({
      prefix: "5BAA6",
      suffix: "1E4C9B93F3F0682250B6CF8331B7EE68FD8",
    });
  });

  const body = [
    "003D68EB55068C33ACE09247EE4C639306B:3",
    "1E4C9B93F3F0682250B6CF8331B7EE68FD8:10434004",
    "0018A45C4D1DEF81644B54AB7F969B88D65:0",
  ].join("\r\n");

  it.each([
    ["1E4C9B93F3F0682250B6CF8331B7EE68FD8", 10434004],
    ["1e4c9b93f3f0682250b6cf8331b7ee68fd8", 10434004],
    ["0018A45C4D1DEF81644B54AB7F969B88D65", 0],
    ["FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", 0],
  ])("%s → seen %i times", (suffix, count) => {
    expect(pwnedCount(body, suffix.toUpperCase())).toBe(count);
  });
});
