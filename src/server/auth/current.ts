import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { can, type Permission } from "@/domain/auth/roles";
import { isSecureDeployment } from "@/server/env";
import { ForbiddenError, PasswordChangeRequiredError, UnauthenticatedError } from "@/server/errors";
import type { Actor } from "./authorize";
import { validateSessionToken, type ValidSession } from "./session";

/**
 * Over HTTPS the cookie uses the `__Host-` prefix (Secure, no Domain, Path=/), so it can't be
 * set or overwritten by a subdomain. Plain-HTTP local development uses an unprefixed name.
 */
export function sessionCookieName(): string {
  return isSecureDeployment() ? "__Host-propfolio_session" : "propfolio_session";
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isSecureDeployment(),
    // Lax (not Strict) so links in reminder emails open the app already signed in.
    // Mutations are protected by Origin checks (server actions and API wrapper).
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(sessionCookieName());
}

/** The current session for this request (memoised per request). */
export const getCurrentSession = cache(async (): Promise<ValidSession | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token || token.length > 200) return null;
  return validateSessionToken(token);
});

function toActor(s: ValidSession): Actor {
  return { ...s.user, sessionId: s.sessionId };
}

/**
 * For pages and layouts: returns the signed-in user, or redirects to sign-in, to the
 * password change screen, or to the "no access" page.
 */
export async function requirePageUser(permission?: Permission): Promise<Actor> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");
  if (permission && !can(session.user.role, permission)) redirect("/no-access");
  return toActor(session);
}

/** For server actions and API routes: throws instead of redirecting. */
export async function requireActor(permission?: Permission): Promise<Actor> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthenticatedError();
  if (session.user.mustChangePassword) throw new PasswordChangeRequiredError();
  if (permission && !can(session.user.role, permission)) throw new ForbiddenError();
  return toActor(session);
}
