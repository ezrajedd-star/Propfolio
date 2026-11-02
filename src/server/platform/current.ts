import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { isSecureDeployment } from "@/server/env";
import { UnauthenticatedError } from "@/server/errors";
import { validatePlatformSession, type PlatformActor } from "./auth";

/**
 * The platform admin's own cookie, separate from customers' sessions. SameSite=Strict: the back
 * office is never opened from an email link, so other sites can't make use of it at all.
 */
export function platformCookieName(): string {
  return isSecureDeployment() ? "__Host-propfolio_platform" : "propfolio_platform";
}

export async function setPlatformCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(platformCookieName(), token, {
    httpOnly: true,
    secure: isSecureDeployment(),
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearPlatformCookie(): Promise<void> {
  (await cookies()).delete(platformCookieName());
}

export const getPlatformAdmin = cache(async (): Promise<PlatformActor | null> => {
  const token = (await cookies()).get(platformCookieName())?.value;
  if (!token || token.length > 200) return null;
  return validatePlatformSession(token);
});

/** For platform pages: the signed-in platform admin, or off to the platform sign-in. */
export async function requirePlatformPage(): Promise<PlatformActor> {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform/login");
  return admin;
}

/** For platform actions: throws instead of redirecting. */
export async function requirePlatformActor(): Promise<PlatformActor> {
  const admin = await getPlatformAdmin();
  if (!admin) throw new UnauthenticatedError();
  return admin;
}
