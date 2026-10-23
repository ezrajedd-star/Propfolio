"use server";

import { redirect } from "next/navigation";

import { formatTime } from "@/domain/time/manila";
import { forgotPasswordSchema, signInSchema } from "@/schemas/auth";
import { runAction, type ActionResult } from "@/server/actions";
import { clearSessionCookie, getCurrentSession, setSessionCookie } from "@/server/auth/current";
import {
  changeOwnPassword,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/server/auth/passwords";
import { signIn, signOut } from "@/server/auth/sign-in";
import { UnauthenticatedError } from "@/server/errors";
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
    return signIn(data.email, data.password, await requestMeta());
  });
  if (!result.ok) return result;

  const r = result.data;
  if (!r.ok) {
    switch (r.reason) {
      case "locked":
        return {
          ok: false,
          message: `This account is locked for 15 minutes after too many wrong passwords. Try again after ${formatTime(r.lockedUntil)}, or ask an Admin to unlock it.`,
        };
      case "inactive":
        return { ok: false, message: "This account has been turned off. Please ask an Admin." };
      default:
        return {
          ok: false,
          message:
            "That email and password don't match. Check for typos, or use “Forgot your password?”.",
        };
    }
  }
  await setSessionCookie(r.token, r.expiresAt);
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
