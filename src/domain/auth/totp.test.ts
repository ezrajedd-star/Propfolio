import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  newTotpSecret,
  totpCode,
  totpStep,
  totpUri,
  verifyTotp,
} from "./totp";

// RFC 6238, Appendix B: SHA-1 test vectors for the ASCII secret "12345678901234567890".
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_SECRET_B32 = base32Encode(RFC_SECRET);

describe("TOTP codes (RFC 6238 test vectors)", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("at %i seconds the 8-digit code is %s", (seconds, code) => {
    expect(totpCode(RFC_SECRET, totpStep(new Date(seconds * 1000)), 8)).toBe(code);
  });

  it("6-digit codes are the last six digits", () => {
    expect(totpCode(RFC_SECRET, totpStep(new Date(59_000)))).toBe("287082");
  });
});

describe("base32", () => {
  it.each([
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ])("%j ↔ %s (RFC 4648, without padding)", (text, encoded) => {
    expect(base32Encode(Buffer.from(text))).toBe(encoded);
    expect(base32Decode(encoded).toString()).toBe(text);
  });

  it("ignores spaces, dashes, lower case and padding when reading", () => {
    expect(base32Decode("mzxw 6ytb-oi==").toString()).toBe("foobar");
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => base32Decode("MZXW1")).toThrow();
  });

  it("new secrets are 160 bits (32 characters)", () => {
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s)).toHaveLength(20);
    expect(newTotpSecret()).not.toBe(s);
  });
});

describe("checking a typed code", () => {
  const now = new Date(1_800_000_000_000);
  const step = totpStep(now);
  const codeAt = (s: number) => totpCode(RFC_SECRET, s);

  it.each<[string, number, number | null, number | null]>([
    ["current code", 0, null, step],
    ["previous step (phone clock behind)", -1, null, step - 1],
    ["next step (phone clock ahead)", 1, null, step + 1],
    ["two steps old", -2, null, null],
    ["two steps ahead", 2, null, null],
    ["already used", 0, step, null],
    ["older than the last one used", -1, step, null],
    ["newer than the last one used", 1, step, step + 1],
  ])("%s", (_name, delta, lastUsed, expected) => {
    expect(verifyTotp(RFC_SECRET_B32, codeAt(step + delta), now, lastUsed)).toBe(expected);
  });

  it.each(["", "12345", "1234567", "abcdef", "12 34 5x"])("refuses %j", (code) => {
    expect(verifyTotp(RFC_SECRET_B32, code, now)).toBeNull();
  });

  it("accepts a code typed with spaces", () => {
    const code = codeAt(step);
    expect(verifyTotp(RFC_SECRET_B32, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(step);
  });
});

describe("authenticator link", () => {
  it("names Propfolio and the admin's email, and carries the secret", () => {
    const uri = totpUri("ABC234", "ana@propfolio.ph");
    const [label, query] = uri.split("?");
    expect(decodeURIComponent(label!)).toBe("otpauth://totp/Propfolio:ana@propfolio.ph");
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      secret: "ABC234",
      issuer: "Propfolio",
      algorithm: "SHA1",
      digits: "6",
      period: "30",
    });
  });
});
