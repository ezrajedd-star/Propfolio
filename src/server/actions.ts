import { redirect } from "next/navigation";

import {
  AppError,
  PasswordChangeRequiredError,
  UnauthenticatedError,
  ValidationError,
} from "@/server/errors";

export type ActionResult<T = null> =
  { ok: true; data: T } | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * Run a server action body and turn service errors into a result the form can show.
 * Server actions are POST-only and Next.js checks their Origin header (CSRF protection).
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof UnauthenticatedError) redirect("/login?reason=signed-out");
    if (err instanceof PasswordChangeRequiredError) redirect("/change-password");
    if (err instanceof ValidationError) {
      return { ok: false, message: err.message, fieldErrors: err.fieldErrors };
    }
    if (err instanceof AppError) return { ok: false, message: err.message };
    // Let Next.js redirects/notFound propagate.
    if (err instanceof Error && "digest" in err) throw err;
    console.error("[action] unexpected error:", err instanceof Error ? err.name : typeof err);
    if (process.env.NODE_ENV !== "production") console.error(err);
    return { ok: false, message: "Something went wrong on our side. Please try again." };
  }
}
