import { formatTime } from "@/domain/time/manila";
import type { SignInResult } from "@/server/auth/sign-in";
import { waitText } from "@/server/rate-limit";

type Failure = Exclude<SignInResult, { ok: true }>;

/** What a person sees when signing in (with a password or with Google) doesn't work. */
export function signInFailureMessage(
  r:
    | Exclude<Failure, { reason: "code_needed" }>
    | { ok: false; reason: "google_mismatch" | "google_failed" },
): string {
  switch (r.reason) {
    case "locked":
      return `This sign-in is locked for 15 minutes after too many wrong tries. Try again after ${formatTime(r.lockedUntil)}, or use “Forgot your password?”.`;
    case "rate_limited":
      return `Too many sign-in attempts. For your security, please wait ${waitText(r.retryAfterSeconds)} and try again.`;
    case "inactive":
      return "Your sign-in has been turned off by your company's Owner or Admin. Please ask them.";
    case "user_limit":
      return "Your company's plan doesn't include your sign-in right now. Ask your account's Owner to upgrade, then try again.";
    case "suspended":
      return "Your company's Propfolio account is paused. Your account's Owner can contact Propfolio to restore it.";
    case "google_mismatch":
      return "This email is linked to a different Google account. Sign in with that one, or with your password.";
    case "google_failed":
      return "Signing in with Google didn't work. Please try again, or use your email and password.";
    default:
      return "That email and password don't match. Check for typos, or use “Forgot your password?”.";
  }
}
