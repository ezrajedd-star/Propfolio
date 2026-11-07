import { describe, expect, it } from "vitest";

import { codeCheck, codeExpiry, resendCheck, type PendingCode } from "./signup";

const now = new Date("2026-11-07T02:00:00Z");
const sec = (s: number) => new Date(now.getTime() + s * 1000);
const pending = (p: Partial<PendingCode>): PendingCode => ({
  attempts: 0,
  codesSent: 1,
  codeSentAt: sec(-10),
  expiresAt: codeExpiry(sec(-10)),
  ...p,
});

describe("codeCheck", () => {
  it.each<[string, Partial<PendingCode>, string]>([
    ["fresh", {}, "ok"],
    ["four wrong tries", { attempts: 4 }, "ok"],
    ["five wrong tries", { attempts: 5 }, "too_many"],
    ["expired", { expiresAt: sec(0) }, "expired"],
    ["expired beats too many", { expiresAt: sec(-1), attempts: 9 }, "expired"],
  ])("%s → %s", (_n, p, expected) => expect(codeCheck(pending(p), now)).toBe(expected));

  it("a code lasts 15 minutes", () => {
    expect(codeExpiry(now).getTime() - now.getTime()).toBe(15 * 60_000);
  });
});

describe("resendCheck", () => {
  it.each<[string, Partial<PendingCode>, unknown]>([
    ["right after sending", { codeSentAt: sec(-10) }, { ok: false, waitSeconds: 50 }],
    ["a minute later", { codeSentAt: sec(-60) }, { ok: true }],
    ["after five codes", { codeSentAt: sec(-600), codesSent: 5 }, { ok: false, limit: true }],
  ])("%s", (_n, p, expected) => expect(resendCheck(pending(p), now)).toEqual(expected));
});
