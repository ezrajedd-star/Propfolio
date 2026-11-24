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

describe("MailDeliveryError", () => {
  it("names the mail server's codes only, never the message", async () => {
    const { MailDeliveryError } = await import("./transport");
    const cause = Object.assign(new Error("550 sender owner@example.com not allowed"), {
      code: "EENVELOPE",
      responseCode: 550,
    });
    const e = new MailDeliveryError(cause);
    expect(e.name).toBe("MailDeliveryError EENVELOPE 550");
    expect(`${e.name} ${e.message}`).not.toContain("example.com");
    expect(new MailDeliveryError("odd").name).toBe("MailDeliveryError");
  });
});
