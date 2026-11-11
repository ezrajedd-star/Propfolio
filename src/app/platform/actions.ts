"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formatTime } from "@/domain/time/manila";
import { runAction, type ActionResult } from "@/server/actions";
import {
  changePlan,
  extendTrial,
  recordManualPayment,
  setAccountSuspended,
} from "@/server/platform/accounts";
import { completePlatformSetup, platformSignIn, platformSignOut } from "@/server/platform/auth";
import type { PlatformActor } from "@/server/platform/auth";
import {
  clearPlatformCookie,
  getPlatformAdmin,
  setPlatformCookie,
} from "@/server/platform/current";
import { waitText } from "@/server/rate-limit";
import { requestMeta } from "@/server/request-meta";
import { setDemoRequestHandled } from "@/server/demo/service";

/** Platform actions need a platform session; without one, back to the platform sign-in. */
async function asPlatformAdmin<T>(
  fn: (admin: PlatformActor) => Promise<T>,
): Promise<ActionResult<T>> {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform/login?reason=signed-out");
  return runAction(() => fn(admin));
}

export async function platformSignInAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => platformSignIn(input, await requestMeta()));
  if (!result.ok) return result;
  const r = result.data;
  if (!r.ok) {
    return {
      ok: false,
      message:
        r.reason === "locked"
          ? `Sign-in is locked for 15 minutes after too many attempts. Try again after ${formatTime(r.lockedUntil)}.`
          : r.reason === "rate_limited"
            ? `Too many sign-in attempts. Please wait ${waitText(r.retryAfterSeconds)} and try again.`
            : "That didn't work. Check your email, password and the code your app shows right now.",
    };
  }
  await setPlatformCookie(r.token, r.expiresAt);
  redirect("/platform");
}

export async function completePlatformSetupAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => completePlatformSetup(input, await requestMeta()));
  if (!result.ok) return result;
  redirect("/platform/login?reason=setup-done");
}

export async function platformSignOutAction(): Promise<void> {
  const admin = await getPlatformAdmin();
  if (admin) await platformSignOut(admin, await requestMeta());
  await clearPlatformCookie();
  redirect("/platform/login?reason=signed-out");
}

export async function extendTrialAction(accountId: string, input: unknown) {
  const result = await asPlatformAdmin(async (admin) =>
    extendTrial(admin, accountId, input, await requestMeta()),
  );
  revalidatePath(`/platform/accounts/${accountId}`);
  return result;
}

export async function recordManualPaymentAction(accountId: string, input: unknown) {
  const result = await asPlatformAdmin(async (admin) => {
    await recordManualPayment(admin, accountId, input, await requestMeta());
    return null;
  });
  revalidatePath(`/platform/accounts/${accountId}`);
  return result;
}

export async function setAccountSuspendedAction(
  accountId: string,
  suspended: boolean,
  input: unknown,
) {
  const result = await asPlatformAdmin(async (admin) =>
    setAccountSuspended(admin, accountId, suspended, input, await requestMeta()),
  );
  revalidatePath(`/platform/accounts/${accountId}`);
  return result;
}

export async function changePlanAction(accountId: string, input: unknown) {
  const result = await asPlatformAdmin(async (admin) => {
    await changePlan(admin, accountId, input, await requestMeta());
    return null;
  });
  revalidatePath(`/platform/accounts/${accountId}`);
  return result;
}

export async function setDemoRequestHandledAction(id: string, handled: boolean) {
  const r = await asPlatformAdmin(async (admin) =>
    setDemoRequestHandled(admin, id, handled, await requestMeta()),
  );
  if (r.ok) revalidatePath("/platform/demo-requests");
  return r;
}
