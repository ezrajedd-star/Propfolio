import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { render } from "@react-email/render";

import type { GoogleProfile } from "@/domain/auth/google";
import { isLocked } from "@/domain/auth/lockout";
import {
  GOOGLE_DETAILS_MINUTES,
  SIGNUP_CODE_MINUTES,
  SIGNUP_MAX_ATTEMPTS,
  codeCheck,
  codeExpiry,
  resendCheck,
} from "@/domain/auth/signup";
import { googleDetailsSchema, signUpCodeSchema, signUpSchema } from "@/schemas/signup";
import { createAccountWithOwner } from "@/server/accounts/create";
import { recordFunnelStep } from "@/server/accounts/funnel";
import { writeAudit } from "@/server/audit";
import { turnstileCheck, type BotCheck } from "@/server/auth/bot-check";
import { signInTarget } from "@/server/auth/memberships";
import { hashPassword } from "@/server/auth/password";
import { assertPolicy } from "@/server/auth/passwords";
import { createSession } from "@/server/auth/session";
import { identityConfirmed, type SignInResult } from "@/server/auth/sign-in";
import { appSecret } from "@/server/env";
import { asSystem, db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { SignUpCodeEmail } from "@/server/mail/templates/account-emails";
import { deliver, type OutgoingMail } from "@/server/mail/transport";
import { hitRateLimit, waitText } from "@/server/rate-limit";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { randomToken, sha256 } from "@/server/auth/tokens";

export interface SignUpDeps {
  botCheck: BotCheck;
  send: (mail: OutgoingMail, fromName: string) => Promise<void>;
}

const defaultDeps = (): SignUpDeps => ({ botCheck: turnstileCheck(), send: deliver });

/** HMAC of the code with APP_SECRET, tied to this sign-up: a stolen database can't test guesses. */
function codeHash(pendingId: string, code: string): string {
  return createHmac("sha256", appSecret()).update(`signup:${pendingId}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

const sixDigits = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

const EMAIL_TAKEN = "That email already has an account. Sign in instead?";

async function sendCode(deps: SignUpDeps, to: { name: string; email: string }, code: string) {
  const element = <SignUpCodeEmail name={to.name} code={code} validMinutes={SIGNUP_CODE_MINUTES} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  await deps.send(
    // The code is only in the body: subjects appear in mail logs.
    { to: [to.email], subject: "Your Propfolio sign-up code", html, text },
    "Propfolio",
  );
}

export type StartResult =
  | { ok: true; token: string; expiresAt: Date; email: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * Step 1 of "Start free": check the form, the bot check and the rate limits, keep the sign-up
 * waiting (nothing is created yet) and email a 6-digit code. Returns the token for the sign-up
 * cookie.
 */
export async function startSignUp(
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
  deps: SignUpDeps = defaultDeps(),
): Promise<StartResult> {
  const data = parseInput(signUpSchema, input);
  return asSystem(async () => {
    const limit = await hitRateLimit("signUpByIp", meta.ipAddress, now);
    if (!limit.allowed) {
      return {
        ok: false,
        message: `Too many sign-ups from this network. Please wait ${waitText(limit.retryAfterSeconds)} and try again.`,
      };
    }
    if (!(await deps.botCheck(data.botToken, meta.ipAddress))) {
      return {
        ok: false,
        message: "We couldn't confirm you're a person. Please reload the page and try again.",
      };
    }
    if (await db.user.count({ where: { email: data.email } })) {
      throw new ValidationError(EMAIL_TAKEN, { email: EMAIL_TAKEN });
    }
    await assertPolicy(data.password, data.email).catch((err: unknown) => {
      // The policy names the field newPassword; here it is password.
      if (err instanceof ValidationError) {
        throw new ValidationError(err.message, { password: Object.values(err.fieldErrors)[0]! });
      }
      throw err;
    });

    const token = randomToken();
    const code = sixDigits();
    const expiresAt = codeExpiry(now);
    // One waiting sign-up per email: starting again replaces the old one.
    await db.pendingSignUp.deleteMany({ where: { email: data.email } });
    const pending = await db.pendingSignUp.create({
      data: {
        tokenHash: sha256(token),
        email: data.email,
        name: data.name,
        companyName: data.companyName,
        passwordHash: await hashPassword(data.password),
        codeHash: "",
        codeSentAt: now,
        expiresAt,
        createdAt: now,
      },
    });
    await db.pendingSignUp.update({
      where: { id: pending.id },
      data: { codeHash: codeHash(pending.id, code) },
    });
    await recordFunnelStep("SIGNUP_STARTED", null, now);
    await sendCode(deps, data, code);
    return { ok: true, token, expiresAt, email: data.email };
  });
}

export type VerifyResult =
  | { ok: true; session: { token: string; expiresAt: Date }; accountId: string }
  | { ok: false; reason: "invalid"; attemptsLeft: number }
  | { ok: false; reason: "expired" | "too_many" | "unknown" | "email_taken" };

/** Step 2: the 6-digit code. Right code → the account is created and the person is signed in. */
export async function verifySignUpCode(
  token: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<VerifyResult> {
  const { code } = parseInput(signUpCodeSchema, input);
  const result = await asSystem(async (): Promise<VerifyResult | { ok: "create"; id: string }> => {
    const limit = await hitRateLimit("codeByIp", meta.ipAddress, now);
    if (!limit.allowed) return { ok: false, reason: "too_many" };
    const pending = await db.pendingSignUp.findUnique({ where: { tokenHash: sha256(token) } });
    if (!pending || !pending.codeHash) return { ok: false, reason: "unknown" };
    const check = codeCheck(pending, now);
    if (check !== "ok") return { ok: false, reason: check };
    if (!sameHash(pending.codeHash, codeHash(pending.id, code))) {
      const after = await db.pendingSignUp.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      const left = Math.max(0, SIGNUP_MAX_ATTEMPTS - after.attempts);
      return left === 0
        ? { ok: false, reason: "too_many" }
        : { ok: false, reason: "invalid", attemptsLeft: left };
    }
    return { ok: "create", id: pending.id };
  });
  if (result.ok !== "create") return result;
  return completePending(result.id, meta, now, false);
}

/** Create the account from a finished sign-up (code checked, or Google details given). */
async function completePending(
  pendingId: string,
  meta: RequestMeta,
  now: Date,
  persistent: boolean,
): Promise<VerifyResult> {
  // Claim it: a double-click or a second tab can't create two accounts.
  const pending = await asSystem(async () => {
    const row = await db.pendingSignUp.findUnique({ where: { id: pendingId } });
    if (!row) return null;
    const { count } = await db.pendingSignUp.deleteMany({ where: { id: pendingId } });
    return count === 1 ? row : null;
  });
  if (!pending) return { ok: false, reason: "unknown" };
  // Someone may have signed up with this email (e.g. with Google) in the meantime.
  if (await asSystem(() => db.user.count({ where: { email: pending.email } }))) {
    return { ok: false, reason: "email_taken" };
  }
  const { accountId, userId } = await createAccountWithOwner(
    {
      name: pending.name,
      email: pending.email,
      companyName: pending.companyName,
      passwordHash: pending.passwordHash,
      googleSub: pending.googleSub,
    },
    meta,
    now,
  );
  const session = await createSession(userId, accountId, meta, now, persistent);
  return { ok: true, session, accountId };
}

export type ResendResult = { ok: true; expiresAt: Date } | { ok: false; message: string };

export async function resendSignUpCode(
  token: string,
  now = new Date(),
  deps: SignUpDeps = defaultDeps(),
): Promise<ResendResult> {
  return asSystem(async () => {
    const pending = await db.pendingSignUp.findUnique({ where: { tokenHash: sha256(token) } });
    if (!pending || !pending.codeHash) {
      return { ok: false, message: "This sign-up has expired. Please start again." };
    }
    const check = resendCheck(pending, now);
    if (!check.ok) {
      return {
        ok: false,
        message:
          "limit" in check
            ? "We've sent the most codes we can for this sign-up. Please start again."
            : `Please wait ${check.waitSeconds} seconds before asking for a new code.`,
      };
    }
    const code = sixDigits();
    const expiresAt = codeExpiry(now);
    await db.pendingSignUp.update({
      where: { id: pending.id },
      data: {
        codeHash: codeHash(pending.id, code),
        codesSent: { increment: 1 },
        attempts: 0,
        codeSentAt: now,
        expiresAt,
      },
    });
    await sendCode(deps, pending, code);
    return { ok: true, expiresAt };
  });
}

export type GoogleResult =
  | SignInResult
  /** Someone new: ask for the name they lease under and the legal checkbox. */
  | { ok: false; reason: "needs_details"; token: string; expiresAt: Date }
  | { ok: false; reason: "google_mismatch" };

/**
 * "Continue with Google". An email that already has an account signs into that account (and is
 * linked to this Google account), with two-step sign-in and every other rule as for a password.
 * Someone new is asked for their company name and the checkbox first.
 */
export async function googleSignIn(
  profile: GoogleProfile,
  meta: RequestMeta,
  now = new Date(),
  deviceToken?: string,
  persistent = false,
): Promise<GoogleResult> {
  return asSystem(async () => {
    const limit = await hitRateLimit("signInByIp", meta.ipAddress, now);
    if (!limit.allowed) {
      return { ok: false, reason: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };
    }
    const user =
      (await db.user.findUnique({ where: { googleSub: profile.sub } })) ??
      (await db.user.findUnique({ where: { email: profile.email } }));

    if (user) {
      // The email's account is linked to a different Google account: don't take it over.
      if (user.googleSub && user.googleSub !== profile.sub) {
        return { ok: false, reason: "google_mismatch" };
      }
      if (isLocked(user, now))
        return { ok: false, reason: "locked", lockedUntil: user.lockedUntil! };
      const target = await signInTarget(user.id, now);
      if (!user.googleSub) {
        await db.user.update({ where: { id: user.id }, data: { googleSub: profile.sub } });
        if (target) {
          await writeAudit({
            actor: { id: user.id, name: user.name, role: target.role },
            action: "auth.google_linked",
            entityType: "User",
            entityId: user.id,
            meta,
            accountId: target.accountId,
          });
        }
      }
      return identityConfirmed(
        { ...user, googleSub: profile.sub },
        target,
        meta,
        now,
        deviceToken,
        {
          persistent,
          method: "google",
        },
      );
    }

    const token = randomToken();
    const expiresAt = new Date(now.getTime() + GOOGLE_DETAILS_MINUTES * 60_000);
    await db.pendingSignUp.deleteMany({ where: { email: profile.email } });
    await db.pendingSignUp.create({
      data: {
        tokenHash: sha256(token),
        email: profile.email,
        name: profile.name,
        googleSub: profile.sub,
        codeSentAt: now,
        expiresAt,
        createdAt: now,
      },
    });
    await recordFunnelStep("SIGNUP_STARTED", null, now);
    return { ok: false, reason: "needs_details", token, expiresAt };
  });
}

/** What a new Google sign-up shows on the details step. */
export async function getGoogleSignUp(token: string, now = new Date()) {
  return asSystem(async () => {
    const p = await db.pendingSignUp.findUnique({ where: { tokenHash: sha256(token) } });
    if (!p || !p.googleSub || p.expiresAt <= now) return null;
    return { name: p.name, email: p.email };
  });
}

/** The details step of a new Google sign-up: company name and checkbox → account created. */
export async function completeGoogleSignUp(
  token: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
  persistent = false,
): Promise<VerifyResult> {
  const data = parseInput(googleDetailsSchema, input);
  const pending = await asSystem(() =>
    db.pendingSignUp.findUnique({ where: { tokenHash: sha256(token) } }),
  );
  if (!pending || !pending.googleSub) return { ok: false, reason: "unknown" };
  if (pending.expiresAt <= now) return { ok: false, reason: "expired" };
  // updateMany: a second click may already have used this sign-up.
  const { count } = await asSystem(() =>
    db.pendingSignUp.updateMany({
      where: { id: pending.id },
      data: { companyName: data.companyName },
    }),
  );
  if (count !== 1) return { ok: false, reason: "unknown" };
  return completePending(pending.id, meta, now, persistent);
}

/** Remove waiting sign-ups whose time ran out (housekeeping). */
export async function purgeExpiredSignUps(now = new Date()): Promise<number> {
  const { count } = await asSystem(() =>
    db.pendingSignUp.deleteMany({ where: { expiresAt: { lt: now } } }),
  );
  return count;
}
