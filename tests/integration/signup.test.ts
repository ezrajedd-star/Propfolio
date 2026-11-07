import { beforeEach, describe, expect, it } from "vitest";

import { validateSessionToken } from "@/server/auth/session";
import { signIn } from "@/server/auth/sign-in";
import { asSystem, db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import type { OutgoingMail } from "@/server/mail/transport";
import {
  completeGoogleSignUp,
  googleSignIn,
  resendSignUpCode,
  startSignUp,
  verifySignUpCode,
  type SignUpDeps,
} from "@/server/signup/service";
import { DEFAULT_PASSWORD, makeUser, meta, resetDb } from "./helpers";

beforeEach(resetDb);

// 7 Nov 2026, 10:00 in Manila.
const T0 = new Date("2026-11-07T02:00:00Z");
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

function fakeDeps(botOk = true) {
  const sent: OutgoingMail[] = [];
  const deps: SignUpDeps = {
    botCheck: async () => botOk,
    send: async (mail) => {
      sent.push(mail);
    },
  };
  // The email shows the code as "123 456".
  const lastCode = () => /\b(\d{3}) (\d{3})\b/.exec(sent.at(-1)!.text)!.slice(1).join("");
  return { deps, sent, lastCode };
}

const form = (o: Record<string, unknown> = {}) => ({
  name: "Maria Santos",
  email: "Maria@Santos-Realty.example",
  password: "a long sunny afternoon",
  companyName: "Santos Realty",
  acceptLegal: true,
  ...o,
});

async function started(o: Record<string, unknown> = {}) {
  const f = fakeDeps();
  const r = await startSignUp(form(o), meta, T0, f.deps);
  if (!r.ok) throw new Error(r.message);
  return { ...f, token: r.token };
}

describe("sign up with email and password", () => {
  it("emails a code, nothing exists until it is typed, then the account starts its trial", async () => {
    const { token, sent, lastCode } = await started();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual(["maria@santos-realty.example"]);
    expect(lastCode()).toMatch(/^\d{6}$/);
    expect(
      await asSystem(() => db.user.count({ where: { email: "maria@santos-realty.example" } })),
    ).toBe(0);

    const r = await verifySignUpCode(token, { code: lastCode() }, meta, later(60));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const account = await asSystem(() =>
      db.account.findUniqueOrThrow({ where: { id: r.accountId } }),
    );
    expect(account).toMatchObject({ name: "Santos Realty", plan: "PREMIUM" });
    expect(account.trialEndsAt?.toISOString()).toBe("2026-12-07T15:59:59.999Z");

    const session = await validateSessionToken(r.session.token, later(61));
    expect(session?.user).toMatchObject({ role: "OWNER", name: "Maria Santos", legalToAccept: [] });
    // Two-step sign-in is an onboarding step, not the first thing they see.
    expect(session?.user.twoStep).not.toBe("setup_required");
    expect(session?.access).toMatchObject({ plan: "PREMIUM", trial: { daysLeft: 31 } });

    await asSystem(async () => {
      expect(await db.unitType.count({ where: { accountId: r.accountId } })).toBe(6);
      expect(await db.legalAcceptance.count()).toBe(3);
      expect(await db.pendingSignUp.count()).toBe(0);
      const steps = (await db.funnelEvent.findMany()).map((e) => e.step).sort();
      expect(steps).toEqual(["EMAIL_VERIFIED", "SIGNUP_STARTED"]);
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "account.signup" } });
      expect(audit.accountId).toBe(r.accountId);
    });

    // And they can sign in with their password later.
    expect(
      await signIn("maria@santos-realty.example", "a long sunny afternoon", meta, later(120)),
    ).toMatchObject({
      ok: true,
    });
  });

  it("a duplicate email gets a friendly message", async () => {
    await makeUser("ADMIN", { email: "taken@example.test" });
    const { deps } = fakeDeps();
    await expect(
      startSignUp(form({ email: "Taken@Example.test" }), meta, T0, deps),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ValidationError &&
        e.fieldErrors.email === "That email already has an account. Sign in instead?",
    );
  });

  it("wrong codes count down; the fifth ends the sign-up", async () => {
    const { token, lastCode } = await started();
    const wrong = lastCode() === "000000" ? "111111" : "000000";
    expect(await verifySignUpCode(token, { code: wrong }, meta, later(10))).toEqual({
      ok: false,
      reason: "invalid",
      attemptsLeft: 4,
    });
    for (let i = 0; i < 3; i++) await verifySignUpCode(token, { code: wrong }, meta, later(11 + i));
    expect(await verifySignUpCode(token, { code: wrong }, meta, later(20))).toEqual({
      ok: false,
      reason: "too_many",
    });
    // Even the right code is refused now.
    expect(await verifySignUpCode(token, { code: lastCode() }, meta, later(21))).toMatchObject({
      ok: false,
      reason: "too_many",
    });
  });

  it("codes expire after 15 minutes; a new code works", async () => {
    const { token, lastCode, deps } = await started();
    const first = lastCode();
    expect(await verifySignUpCode(token, { code: first }, meta, later(15 * 60))).toMatchObject({
      ok: false,
      reason: "expired",
    });
    expect(await resendSignUpCode(token, later(15 * 60), deps)).toMatchObject({ ok: true });
    expect(
      await verifySignUpCode(token, { code: lastCode() }, meta, later(15 * 60 + 5)),
    ).toMatchObject({
      ok: true,
    });
  });

  it("new codes wait a minute between sends", async () => {
    const { token, deps } = await started();
    expect(await resendSignUpCode(token, later(10), deps)).toEqual({
      ok: false,
      message: "Please wait 50 seconds before asking for a new code.",
    });
  });

  it("a failed bot check stops the sign-up before anything is kept", async () => {
    const { deps, sent } = fakeDeps(false);
    const r = await startSignUp(form(), meta, T0, deps);
    expect(r.ok).toBe(false);
    expect(sent).toHaveLength(0);
    expect(await asSystem(() => db.pendingSignUp.count())).toBe(0);
  });

  it("a weak password is refused with the usual message", async () => {
    const { deps } = fakeDeps();
    await expect(startSignUp(form({ password: "short" }), meta, T0, deps)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("Continue with Google", () => {
  const profile = { sub: "google-123", email: "ana@gmail.example", name: "Ana Reyes" };

  it("someone new gives their company name, then lands in a new account", async () => {
    const r = await googleSignIn(profile, meta, T0);
    expect(r).toMatchObject({ ok: false, reason: "needs_details" });
    if (r.ok || r.reason !== "needs_details") return;
    const done = await completeGoogleSignUp(
      r.token,
      { companyName: "Reyes Rentals", acceptLegal: true },
      meta,
      later(30),
    );
    expect(done.ok).toBe(true);
    const user = await asSystem(() =>
      db.user.findUniqueOrThrow({ where: { email: profile.email } }),
    );
    expect(user.googleSub).toBe("google-123");

    // Next time, Google signs them straight in.
    expect(await googleSignIn(profile, meta, later(60))).toMatchObject({ ok: true });
  });

  it("an email that already has an account signs into it (no duplicate) and links Google", async () => {
    const existing = await makeUser("LEASING_STAFF", { email: "ana@gmail.example" });
    expect(await googleSignIn(profile, meta, T0)).toMatchObject({ ok: true });
    const user = await asSystem(() => db.user.findUniqueOrThrow({ where: { id: existing.id } }));
    expect(user.googleSub).toBe("google-123");
    expect(await asSystem(() => db.account.count())).toBe(1);
  });

  it("an account linked to another Google account isn't taken over", async () => {
    const existing = await makeUser("LEASING_STAFF", { email: "ana@gmail.example" });
    await asSystem(() =>
      db.user.update({ where: { id: existing.id }, data: { googleSub: "google-999" } }),
    );
    expect(await googleSignIn(profile, meta, T0)).toEqual({ ok: false, reason: "google_mismatch" });
  });

  it("two-step sign-in still applies to Google sign-ins", async () => {
    const existing = await makeUser("ADMIN", { email: "ana@gmail.example" });
    await asSystem(() =>
      db.user.update({
        where: { id: existing.id },
        data: { totpConfirmedAt: T0, totpSecretEnc: "x" },
      }),
    );
    expect(await googleSignIn(profile, meta, T0)).toMatchObject({
      ok: false,
      reason: "code_needed",
    });
  });

  it("the details step can't be finished twice", async () => {
    const r = await googleSignIn(profile, meta, T0);
    if (r.ok || r.reason !== "needs_details") throw new Error("expected details");
    const input = { companyName: "Reyes Rentals", acceptLegal: true };
    const [a, b] = await Promise.all([
      completeGoogleSignUp(r.token, input, meta, later(5)),
      completeGoogleSignUp(r.token, input, meta, later(5)),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await asSystem(() => db.account.count({ where: { name: "Reyes Rentals" } }))).toBe(1);
  });
});

describe("keep me signed in", () => {
  it("lasts 30 days; Leasing Staff aren't timed out when idle, Owners and Admins are (setting on)", async () => {
    const staff = await makeUser("LEASING_STAFF");
    const admin = await makeUser("ADMIN");
    const s = await signIn(staff.email, DEFAULT_PASSWORD, meta, T0, undefined, {
      persistent: true,
    });
    const a = await signIn(admin.email, DEFAULT_PASSWORD, meta, T0, undefined, {
      persistent: true,
    });
    if (!s.ok || !a.ok) throw new Error("sign-in failed");
    expect(s.expiresAt.getTime() - T0.getTime()).toBe(30 * 86_400_000);

    const twoHoursLater = later(2 * 3600);
    expect(await validateSessionToken(s.token, twoHoursLater)).not.toBeNull();
    expect(await validateSessionToken(a.token, twoHoursLater)).toBeNull();
  });

  it("with the account's setting off, Admins stay signed in too", async () => {
    const admin = await makeUser("ADMIN");
    await asSystem(() =>
      db.setting.create({
        data: { accountId: admin.accountId, key: "adminIdleTimeout", value: false },
      }),
    );
    const a = await signIn(admin.email, DEFAULT_PASSWORD, meta, T0, undefined, {
      persistent: true,
    });
    if (!a.ok) throw new Error("sign-in failed");
    expect(await validateSessionToken(a.token, later(2 * 3600))).not.toBeNull();
  });

  it("without it, the 30-minute idle timeout applies to everyone", async () => {
    const staff = await makeUser("LEASING_STAFF");
    const s = await signIn(staff.email, DEFAULT_PASSWORD, meta, T0);
    if (!s.ok) throw new Error("sign-in failed");
    expect(await validateSessionToken(s.token, later(31 * 60))).toBeNull();
  });
});

describe("legal documents", () => {
  it("people who haven't accepted the current versions are asked to", async () => {
    const staff = await makeUser("LEASING_STAFF");
    const s = await signIn(staff.email, DEFAULT_PASSWORD, meta, T0);
    if (!s.ok) throw new Error("sign-in failed");
    expect((await validateSessionToken(s.token, later(1)))?.user.legalToAccept).toEqual([
      "TERMS",
      "PRIVACY",
      "DPA",
    ]);
  });
});
