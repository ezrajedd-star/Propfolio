import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { can, type Permission } from "@/domain/auth/roles";
import { setRequestAccountResolver } from "@/server/db";
import { isSecureDeployment } from "@/server/env";
import {
  ForbiddenError,
  PasswordChangeRequiredError,
  TwoStepSetupRequiredError,
  UnauthenticatedError,
} from "@/server/errors";
import { planDenial } from "@/domain/plans/plans";
import { planLimitError, type Actor, type CanOptions } from "./authorize";
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

const secureName = (name: string) => (isSecureDeployment() ? `__Host-${name}` : name);

/** Between the password and the two-step code (5 minutes). */
export async function setPendingSignInCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(secureName("propfolio_signin"), token, {
    httpOnly: true,
    secure: isSecureDeployment(),
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function getPendingSignInToken(): Promise<string | undefined> {
  const value = (await cookies()).get(secureName("propfolio_signin"))?.value;
  return value && value.length <= 200 ? value : undefined;
}

export async function clearPendingSignInCookie(): Promise<void> {
  (await cookies()).delete(secureName("propfolio_signin"));
}

/** "Don't ask for a code on this device for 30 days". */
export async function setDeviceCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(secureName("propfolio_device"), token, {
    httpOnly: true,
    secure: isSecureDeployment(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getDeviceToken(): Promise<string | undefined> {
  return (await cookies()).get(secureName("propfolio_device"))?.value;
}

/** The current session for this request (memoised per request). */
export const getCurrentSession = cache(async (): Promise<ValidSession | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token || token.length > 200) return null;
  return validateSessionToken(token);
});

// Queries in a web request work for the signed-in person's current account.
setRequestAccountResolver(async () => {
  try {
    return (await getCurrentSession())?.accountId ?? null;
  } catch {
    // Outside a request (no cookies): no account.
    return null;
  }
});

function toActor(s: ValidSession): Actor {
  return { ...s.user, accountId: s.accountId, access: s.access, sessionId: s.sessionId };
}

/** The two-step set-up page and its actions are the only things allowed before set-up. */
export const TWO_STEP_SETUP_PATH = "/setup-two-step";

interface Options extends CanOptions {
  /** Allow Owners and Admins who still have to set up two-step sign-in. */
  duringTwoStepSetup?: boolean;
}

/**
 * For pages and layouts: returns the signed-in user, or redirects to sign-in, to the
 * password change screen, to two-step set-up, or to the "no access" page.
 */
export async function requirePageUser(
  permission?: Permission,
  options: Options = {},
): Promise<Actor> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");
  if (session.user.twoStep === "setup_required" && !options.duringTwoStepSetup) {
    redirect(TWO_STEP_SETUP_PATH);
  }
  if (permission && !can(session.user.role, permission)) redirect("/no-access");
  if (permission) {
    // The role allows it but the plan doesn't: show what upgrading would unlock.
    const denial = planDenial(session.access, permission, options);
    if (denial?.reason === "feature") redirect(`/plan/locked?feature=${denial.feature}`);
    if (denial?.reason === "readOnly") redirect("/plan/locked?reason=read-only");
  }
  return toActor(session);
}

/** For server actions and API routes: throws instead of redirecting. */
export async function requireActor(permission?: Permission, options: Options = {}): Promise<Actor> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthenticatedError();
  if (session.user.mustChangePassword) throw new PasswordChangeRequiredError();
  if (session.user.twoStep === "setup_required" && !options.duringTwoStepSetup) {
    throw new TwoStepSetupRequiredError();
  }
  if (permission && !can(session.user.role, permission)) throw new ForbiddenError();
  if (permission) {
    const planError = planLimitError(session.access, permission, options);
    if (planError) throw planError;
  }
  return toActor(session);
}
