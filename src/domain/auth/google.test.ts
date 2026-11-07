import { describe, expect, it } from "vitest";

import { checkIdToken, decodeJwtPayload } from "./google";

const now = new Date("2026-11-07T02:00:00Z");
const good = {
  iss: "https://accounts.google.com",
  aud: "client-1",
  exp: now.getTime() / 1000 + 300,
  nonce: "n-1",
  sub: "1234567890",
  email: "Maria@Example.COM",
  email_verified: true,
  name: "Maria Santos",
};
const expected = { clientId: "client-1", nonce: "n-1", now };
const jwt = (p: object) => `e30.${Buffer.from(JSON.stringify(p)).toString("base64url")}.sig`;

describe("checkIdToken", () => {
  it("accepts a good token, with the email lower-cased", () => {
    expect(checkIdToken(good, expected)).toEqual({
      ok: true,
      profile: { sub: "1234567890", email: "maria@example.com", name: "Maria Santos" },
    });
  });

  it.each<[string, Record<string, unknown> | null, string]>([
    ["no payload", null, "malformed"],
    ["another issuer", { ...good, iss: "https://evil.example" }, "issuer"],
    ["another app's token", { ...good, aud: "client-2" }, "audience"],
    ["expired", { ...good, exp: now.getTime() / 1000 - 1 }, "expired"],
    ["replayed (wrong nonce)", { ...good, nonce: "n-2" }, "nonce"],
    ["email not verified by Google", { ...good, email_verified: false }, "unverified_email"],
    ["no subject", { ...good, sub: "" }, "malformed"],
  ])("refuses %s", (_n, payload, reason) => {
    expect(checkIdToken(payload, expected)).toEqual({ ok: false, reason });
  });

  it("uses the email's first part when Google gives no name", () => {
    const r = checkIdToken({ ...good, name: undefined }, expected);
    expect(r.ok && r.profile.name).toBe("maria");
  });
});

describe("decodeJwtPayload", () => {
  it.each([
    [jwt({ a: 1 }), { a: 1 }],
    ["not-a-jwt", null],
    ["a.!!!.c", null],
  ])("%s", (token, payload) => expect(decodeJwtPayload(token)).toEqual(payload));
});
