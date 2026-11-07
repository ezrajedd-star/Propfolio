import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FormAlert } from "@/components/form/form-alert";
import { getCurrentSession } from "@/server/auth/current";
import { googleEnabled } from "@/server/auth/google";
import { signInFailureMessage } from "../sign-in-messages";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const error = (text: string) => ({ tone: "error" as const, text });

/** Notices by `?reason=`: only these fixed texts can appear (nothing from the address itself). */
const NOTICES: Record<string, { tone: "info" | "success" | "error"; text: string }> = {
  "google-failed": error(signInFailureMessage({ ok: false, reason: "google_failed" })),
  "google-mismatch": error(signInFailureMessage({ ok: false, reason: "google_mismatch" })),
  inactive: error(signInFailureMessage({ ok: false, reason: "inactive" })),
  "user-limit": error(signInFailureMessage({ ok: false, reason: "user_limit" })),
  suspended: error(signInFailureMessage({ ok: false, reason: "suspended" })),
  locked: error(
    "This sign-in is locked for 15 minutes after too many wrong tries. Try again later, or use “Forgot your password?”.",
  ),
  "rate-limited": error(
    "Too many sign-in attempts. For your security, please wait a few minutes and try again.",
  ),
  idle: {
    tone: "info",
    text: "You were signed out after 30 minutes without activity. Please sign in again.",
  },
  "signed-out": { tone: "info", text: "You have been signed out." },
  "password-reset": { tone: "success", text: "Your new password is set. Sign in with it below." },
  "code-expired": {
    tone: "info",
    text: "The code step timed out (5 minutes) or had too many tries. Please sign in again.",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const { reason, next } = await searchParams;
  const session = await getCurrentSession();
  if (session) redirect(session.user.mustChangePassword ? "/change-password" : "/");
  const notice = reason ? NOTICES[reason] : undefined;

  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="text-muted-foreground mt-1.5 mb-6">Welcome back to Propfolio.</p>
      {notice ? (
        <FormAlert tone={notice.tone} className="mb-6">
          {notice.text}
        </FormAlert>
      ) : null}
      <SignInForm next={next} google={googleEnabled()} />
    </>
  );
}
