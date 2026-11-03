import { beforeEach, describe, expect, it, vi } from "vitest";

import { pwnedRangeQuery } from "@/domain/auth/breached";
import { isBreachedPassword } from "@/server/auth/breached";
import { requestPasswordReset } from "@/server/auth/passwords";
import { signIn } from "@/server/auth/sign-in";
import { asSystem, db } from "@/server/db";
import { RATE_LIMITS, hitRateLimit } from "@/server/rate-limit";
import { DEFAULT_PASSWORD, makeUser, meta, resetDb } from "./helpers";

beforeEach(resetDb);

const T0 = new Date("2026-11-03T02:00:00Z");
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe("rate limits", () => {
  it("count per window and open again when the window has passed", async () => {
    const { max, windowSeconds } = RATE_LIMITS.platformSignInByIp;
    for (let i = 0; i < max; i++) {
      expect((await hitRateLimit("platformSignInByIp", "198.51.100.7", T0)).allowed).toBe(true);
    }
    expect(await hitRateLimit("platformSignInByIp", "198.51.100.7", later(60))).toEqual({
      allowed: false,
      retryAfterSeconds: windowSeconds - 60,
    });
    // Another address isn't affected; after the window, a fresh start.
    expect((await hitRateLimit("platformSignInByIp", "198.51.100.8", later(60))).allowed).toBe(
      true,
    );
    expect(
      (await hitRateLimit("platformSignInByIp", "198.51.100.7", later(windowSeconds))).allowed,
    ).toBe(true);
  });

  it("store no addresses or emails, only hashes", async () => {
    await hitRateLimit("signInByEmail", "maria@example.test", T0);
    const rows = await asSystem(() => db.rateLimit.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stop sign-in for one email after 20 tries in 10 minutes, even with the right password", async () => {
    const user = await makeUser("LEASING_STAFF");
    // Different addresses each time: the per-email limit still applies.
    for (let i = 0; i < RATE_LIMITS.signInByEmail.max; i++) {
      await signIn(
        user.email,
        "a wrong password",
        { ...meta, ipAddress: `192.0.2.${i}` },
        later(i),
      );
      await asSystem(() =>
        db.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null },
        }),
      );
    }
    const r = await signIn(
      user.email,
      DEFAULT_PASSWORD,
      { ...meta, ipAddress: "192.0.2.99" },
      later(30),
    );
    expect(r).toMatchObject({ ok: false, reason: "rate_limited" });
    expect((await signIn(user.email, DEFAULT_PASSWORD, meta, later(601))).ok).toBe(true);
  });

  it("stop sign-in from one address after 60 tries in 10 minutes, across emails", async () => {
    for (let i = 0; i < RATE_LIMITS.signInByIp.max; i++) {
      await signIn(`nobody${i}@example.test`, "whatever password", meta, later(i));
    }
    const user = await makeUser("VIEWER");
    expect(await signIn(user.email, DEFAULT_PASSWORD, meta, later(70))).toMatchObject({
      reason: "rate_limited",
    });
  });

  it("quietly stop sending reset links to anyone from a flooding address", async () => {
    const users = await Promise.all(
      Array.from({ length: RATE_LIMITS.resetRequestByIp.max + 2 }, (_, i) =>
        makeUser("LEASING_STAFF", { email: `reset${i}@example.test` }),
      ),
    );
    for (const u of users) await requestPasswordReset(u.email, meta, T0);
    expect(await asSystem(() => db.passwordResetToken.count())).toBe(
      RATE_LIMITS.resetRequestByIp.max,
    );
  });
});

describe("breached-password check", () => {
  const { prefix, suffix } = pwnedRangeQuery("blue mango by the river");
  const answer = (body: string, status = 200) =>
    vi.fn<typeof fetch>(async () => new Response(body, { status }));

  it("asks only for the hash prefix, with padding", async () => {
    const fetcher = answer(`${suffix}:12\r\nABCDEF:0`);
    expect(await isBreachedPassword("blue mango by the river", { enabled: true, fetcher })).toBe(
      true,
    );
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${prefix}`);
    expect(String(url)).not.toContain("mango");
    expect((init?.headers as Record<string, string>)["Add-Padding"]).toBe("true");
  });

  it("passes passwords that aren't in the list", async () => {
    expect(
      await isBreachedPassword("blue mango by the river", {
        enabled: true,
        fetcher: answer("ABCDEF:3"),
      }),
    ).toBe(false);
  });

  it("lets people continue when the service is down", async () => {
    const down = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      await isBreachedPassword("blue mango by the river", { enabled: true, fetcher: down }),
    ).toBe(false);
    expect(
      await isBreachedPassword("blue mango by the river", {
        enabled: true,
        fetcher: answer("", 503),
      }),
    ).toBe(false);
    // Only the error type is logged, never the password.
    expect(JSON.stringify(warn.mock.calls)).not.toContain("mango");
    warn.mockRestore();
  });

  it("is off when switched off (tests, offline development)", async () => {
    const fetcher = answer(`${suffix}:12`);
    expect(await isBreachedPassword("blue mango by the river", { enabled: false, fetcher })).toBe(
      false,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
