"use server";

import { redirect } from "next/navigation";

import { runAction, type ActionResult } from "@/server/actions";
import {
  clearSignUpCookie,
  getSignUpToken,
  setSessionCookie,
  setSignUpCookie,
} from "@/server/auth/current";
import { requestMeta } from "@/server/request-meta";
import {
  completeGoogleSignUp,
  resendSignUpCode,
  startSignUp,
  verifySignUpCode,
  type VerifyResult,
} from "@/server/signup/service";

const START_AGAIN = "This sign-up has expired. Please start again.";

/** Step 1: the form. On success the code step shows, on the same screen. */
export async function startSignUpAction(input: unknown): Promise<ActionResult<{ email: string }>> {
  const result = await runAction(async () => startSignUp(input, await requestMeta()));
  if (!result.ok) return result;
  if (!result.data.ok) {
    return { ok: false, message: result.data.message, fieldErrors: result.data.fieldErrors };
  }
  await setSignUpCookie(result.data.token, new Date(Date.now() + 60 * 60_000));
  return { ok: true, data: { email: result.data.email } };
}

function verifyMessage(r: Exclude<VerifyResult, { ok: true }>): ActionResult {
  switch (r.reason) {
    case "invalid":
      return {
        ok: false,
        message: "That code isn't right.",
        fieldErrors: {
          code: `That code isn't right. Check the email and try again (${r.attemptsLeft} ${r.attemptsLeft === 1 ? "try" : "tries"} left).`,
        },
      };
    case "expired":
      return {
        ok: false,
        message: "That code has expired. Send a new code below.",
        fieldErrors: { code: "That code has expired. Send a new code below." },
      };
    case "too_many":
      return { ok: false, message: "Too many wrong codes. Please start again." };
    case "email_taken":
      return { ok: false, message: "That email already has an account. Sign in instead." };
    default:
      return { ok: false, message: START_AGAIN };
  }
}

/** Step 2: the code. Right → account created, signed in, into the app. */
export async function verifySignUpCodeAction(input: unknown): Promise<ActionResult> {
  const token = await getSignUpToken();
  if (!token) return { ok: false, message: START_AGAIN };
  const result = await runAction(async () => verifySignUpCode(token, input, await requestMeta()));
  if (!result.ok) return result;
  if (!result.data.ok) return verifyMessage(result.data);
  await clearSignUpCookie();
  await setSessionCookie(result.data.session.token, result.data.session.expiresAt);
  redirect("/?welcome=signed-up");
}

export async function resendSignUpCodeAction(): Promise<ActionResult> {
  const token = await getSignUpToken();
  if (!token) return { ok: false, message: START_AGAIN };
  const result = await runAction(() => resendSignUpCode(token));
  if (!result.ok) return result;
  return result.data.ok ? { ok: true, data: null } : { ok: false, message: result.data.message };
}

/** After "Continue with Google", for someone new: company name and the checkbox. */
export async function googleDetailsAction(input: unknown): Promise<ActionResult> {
  const token = await getSignUpToken();
  if (!token) return { ok: false, message: START_AGAIN };
  const result = await runAction(async () =>
    completeGoogleSignUp(token, input, await requestMeta()),
  );
  if (!result.ok) return result;
  if (!result.data.ok) return verifyMessage(result.data);
  await clearSignUpCookie();
  await setSessionCookie(result.data.session.token, result.data.session.expiresAt);
  redirect("/?welcome=signed-up");
}

/** "Use a different email": forget the waiting sign-up in this browser. */
export async function restartSignUpAction(): Promise<void> {
  await clearSignUpCookie();
}
