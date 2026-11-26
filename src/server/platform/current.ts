import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { platformCan, type PlatformPermission } from "@/domain/platform/roles";
import { isSecureDeployment } from "@/server/env";
import { ForbiddenError, UnauthenticatedError } from "@/server/errors";
import { requestMeta } from "@/server/request-meta";
import { validatePlatformSession, type PlatformActor } from "./auth";
import { logStaffView } from "./staff-log";

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

export interface PageView {
  /** e.g. "console.account_viewed". */
  action: string;
  entityType?: string;
  entityId?: string;
  accountId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * For console pages: the signed-in staff member, who must have `permission` (otherwise the
 * "not allowed" page). Pass `view` to record the visit in the staff log.
 */
export async function requirePlatformPage(
  permission: PlatformPermission = "console.view",
  view?: PageView,
): Promise<PlatformActor> {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform/login");
  if (!platformCan(admin.role, permission)) redirect("/platform/not-allowed");
  if (view) {
    const { action, metadata, ...target } = view;
    await logStaffView(admin, action, target, await requestMeta(), metadata);
  }
  return admin;
}

/** For console actions and downloads: throws instead of redirecting. */
export async function requirePlatformActor(
  permission: PlatformPermission = "console.view",
): Promise<PlatformActor> {
  const admin = await getPlatformAdmin();
  if (!admin) throw new UnauthenticatedError();
  if (!platformCan(admin.role, permission)) {
    throw new ForbiddenError("Your console role can't do this. Ask a Platform Owner.");
  }
  return admin;
}
