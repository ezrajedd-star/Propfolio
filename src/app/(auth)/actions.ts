"use server";

import { redirect } from "next/navigation";

import { formatTime } from "@/domain/time/manila";
import { forgotPasswordSchema, signInSchema } from "@/schemas/auth";
import { runAction, type ActionResult } from "@/server/actions";
import {
  clearPendingSignInCookie,
  clearSessionCookie,
  getCurrentSession,
  getDeviceToken,
  getPendingSignInToken,
  setDeviceCookie,
  setPendingSignInCookie,
  setSessionCookie,
} from "@/server/auth/current";
import {
  changeOwnPassword,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/server/auth/passwords";
import { completeSignInWithCode, signIn, signOut, type SignedIn } from "@/server/auth/sign-in";
import { UnauthenticatedError } from "@/server/errors";
import { waitText } from "@/server/rate-limit";
import { requestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";

/** Only allow redirects to paths inside this app. */
function safeNext(next: unknown): string {
  return typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
    ? next
    : "/";
}

export async function signInAction(input: unknown, next?: string): Promise<ActionResult> {
  const result = await runAction(async () => {
    const data = parseInput(signInSchema, input);
    return signIn(
      data.email,
      data.password,
      await requestMeta(),
      new Date(),
      await getDeviceToken(),
    );
  });
  if (!result.ok) return result;

  const r = result.data;
  if (!r.ok) {
    switch (r.reason) {
      case "code_needed":
        await setPendingSignInCookie(r.challengeToken, r.expiresAt);
        redirect(
          `/login/code${next && safeNext(next) !== "/" ? `?next=${encodeURIComponent(safeNext(next))}` : ""}`,
        );
      case "locked":
        return {
          ok: false,
          message: `This account is locked for 15 minutes after too many wrong passwords. Try again after ${formatTime(r.lockedUntil)}, or ask an Admin to unlock it.`,
        };
      case "rate_limited":
        return {
          ok: false,
          message: `Too many sign-in attempts. For your security, please wait ${waitText(r.retryAfterSeconds)} and try again.`,
        };
      case "inactive":
        return { ok: false, message: "This account has been turned off. Please ask an Admin." };
      case "suspended":
        return {
          ok: false,
          message:
            "Your company's Propfolio account is paused. Your account's Owner can contact Propfolio to restore it.",
        };
      default:
        return {
          ok: false,
          message:
            "That email and password don't match. Check for typos, or use “Forgot your password?”.",
        };
    }
  }
  await startSession(r);
  redirect(r.mustChangePassword ? "/change-password" : safeNext(next));
}

async function startSession(r: SignedIn) {
  await setSessionCookie(r.token, r.expiresAt);
  if (r.deviceToken) await setDeviceCookie(r.deviceToken.token, r.deviceToken.expiresAt);
}

/** The second step of signing in: a code from the authenticator app, or a recovery code. */
export async function signInCodeAction(
  input: { code?: unknown; remember?: unknown },
  next?: string,
): Promise<ActionResult> {
  const challenge = await getPendingSignInToken();
  if (!challenge) redirect("/login?reason=code-expired");
  const code = typeof input.code === "string" ? input.code.trim() : "";
  if (!code) {
    return { ok: false, message: "Enter the code.", fieldErrors: { code: "Enter the code." } };
  }
  const result = await runAction(async () =>
    completeSignInWithCode(challenge, code, input.remember === true, await requestMeta()),
  );
  if (!result.ok) return result;
  const r = result.data;
  if (!r.ok) {
    switch (r.reason) {
      case "expired":
        await clearPendingSignInCookie();
        redirect("/login?reason=code-expired");
      case "rate_limited":
        return {
          ok: false,
          message: `Too many codes tried. For your security, please wait ${waitText(r.retryAfterSeconds)} and try again.`,
        };
      case "locked":
        await clearPendingSignInCookie();
        return {
          ok: false,
          message: `This account is locked for 15 minutes after too many wrong tries. Try again after ${formatTime(r.lockedUntil)}, or ask an Admin to unlock it.`,
        };
      default:
        return {
          ok: false,
          message: "That code didn't work.",
          fieldErrors: {
            code: "Type the 6-digit code your app shows right now, or one of your recovery codes.",
          },
        };
    }
  }
  await clearPendingSignInCookie();
  await startSession(r);
  redirect(r.mustChangePassword ? "/change-password" : safeNext(next));
}

export async function signOutAction(): Promise<void> {
  const session = await getCurrentSession();
  if (session) await signOut(session, await requestMeta());
  await clearSessionCookie();
  redirect("/login?reason=signed-out");
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    const session = await getCurrentSession();
    if (!session) throw new UnauthenticatedError();
    await changeOwnPassword(
      { ...session.user, sessionId: session.sessionId },
      input,
      await requestMeta(),
    );
    return null;
  });
  if (!result.ok) return result;
  redirect("/?welcome=password-changed");
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { email } = parseInput(forgotPasswordSchema, input);
    await requestPasswordReset(email, await requestMeta());
    return null;
  });
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    await resetPasswordWithToken(input, await requestMeta());
    return null;
  });
  if (!result.ok) return result;
  await clearSessionCookie();
  redirect("/login?reason=password-reset");
}
