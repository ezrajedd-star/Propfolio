import { describe, expect, it } from "vitest";

import { isReservedAddress } from "./transport";

describe("isReservedAddress", () => {
  it.each([
    ["admin@propfolio.test", true],
    ["maria@abc.example", true],
    ["someone@example.com", true],
    ["x@mail.localhost", true],
    ["ana@company.com.ph", false],
    ["ops@testing.ph", false],
    ["me@gmail.com", false],
  ])("%s → %s", (a, expected) => expect(isReservedAddress(a)).toBe(expected));
});
