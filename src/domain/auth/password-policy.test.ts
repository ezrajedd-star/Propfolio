import { describe, expect, it } from "vitest";

import { checkPassword } from "./password-policy";

describe("checkPassword", () => {
  it.each([
    ["short", undefined, "too_short"],
    ["123456789", undefined, "too_short"],
    ["ñandú-ñu", undefined, "too_short"], // 8 characters even though some are multi-byte
    ["x".repeat(129), undefined, "too_long"],
    ["Password123", undefined, "too_common"],
    ["aaaaaaaaaaaa", undefined, "too_common"],
    ["maria.santos-2026!", "maria.santos@example.com", "contains_email"],
    ["blue mango river", "maria.santos@example.com", null],
    ["abc!defghijk", "abc@example.com", null], // 3-char local parts are ignored
    ["0123456789x", undefined, null],
  ] as const)("%j → %s", (password, email, expected) => {
    expect(checkPassword(password, email)).toBe(expected);
  });
});
