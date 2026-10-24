import { describe, expect, it } from "vitest";

import { buildSearchText, matchesSearch, normalizeForSearch, searchTokens } from "./search";

describe("forgiving search", () => {
  it.each([
    ["ABC Corporation", "abc corp", true],
    ["ABC Corporation", "corp abc", true],
    ["A.B.C. Corporation", "abc", true],
    ["Santo Niño Trading", "nino", true],
    ["Santo Niño Trading", "NIÑO trad", true],
    ["Juan dela Cruz", "dela cruz", true],
    ["O'Neil Foods", "oneil", true],
    ["ABC Corporation", "xyz", false],
    ["ABC Corporation", "abc xyz", false],
    ["Unit 3B, Tower One", "3b", true],
  ])("%j matches %j: %s", (text, query, expected) => {
    expect(matchesSearch(text, query)).toBe(expected);
  });

  it("normalises", () => {
    expect(normalizeForSearch("  Café   del Mar, Inc. ")).toBe("cafe del mar inc");
    expect(searchTokens("abc  abc corp")).toEqual(["abc", "corp"]);
    expect(searchTokens("   ")).toEqual([]);
    expect(buildSearchText("ABC Corp", null, "LSE-2026-0001")).toBe("abc corp lse 2026 0001");
  });
});
