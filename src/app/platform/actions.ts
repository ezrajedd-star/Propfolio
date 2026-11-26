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
import { platformReopenAccount } from "@/server/accounts/closing";
import { setDemoRequestHandled } from "@/server/demo/service";
import { setWebsiteLeadHandled } from "@/server/website-leads/service";
import { resolveIncident, sendTestAlert } from "@/server/monitoring/incidents";
import { setSessionCookie } from "@/server/auth/current";
import { startSupportSession } from "@/server/support-access/service";
import { replyToTicket, setTicketResolved } from "@/server/tickets/service";
import {
  correctBillingDetails,
  findPendingSignUp,
  resendSignUpCodeForCustomer,
  resetTwoStepForCustomer,
  unlockUserForCustomer,
} from "@/server/platform/support-tools";
import {
  addStaff,
  changeStaffRole,
  resetStaffSignIn,
  setStaffActive,
} from "@/server/platform/staff";

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

export async function setWebsiteLeadHandledAction(id: string, handled: boolean) {
  const r = await asPlatformAdmin(async (admin) =>
    setWebsiteLeadHandled(admin, id, handled, await requestMeta()),
  );
  if (r.ok) revalidatePath("/platform/website-leads");
  return r;
}

export async function reopenAccountAction(accountId: string) {
  const r = await asPlatformAdmin(async (admin) =>
    platformReopenAccount(admin, accountId, await requestMeta()),
  );
  revalidatePath(`/platform/accounts/${accountId}`);
  return r;
}

export async function addStaffAction(input: unknown) {
  const r = await asPlatformAdmin(async (admin) => addStaff(admin, input, await requestMeta()));
  revalidatePath("/platform/staff");
  return r;
}

export async function changeStaffRoleAction(id: string, input: unknown) {
  const r = await asPlatformAdmin(async (admin) =>
    changeStaffRole(admin, id, input, await requestMeta()),
  );
  revalidatePath("/platform/staff");
  return r;
}

export async function setStaffActiveAction(id: string, active: boolean) {
  const r = await asPlatformAdmin(async (admin) =>
    setStaffActive(admin, id, active, await requestMeta()),
  );
  revalidatePath("/platform/staff");
  return r;
}

export async function resetStaffSignInAction(id: string) {
  const r = await asPlatformAdmin(async (admin) =>
    resetStaffSignIn(admin, id, await requestMeta()),
  );
  revalidatePath("/platform/staff");
  return r;
}

export async function resolveIncidentAction(id: string, input: { note: string }) {
  const r = await asPlatformAdmin(async (admin) => {
    await resolveIncident(admin, id, String(input?.note ?? ""), await requestMeta());
    return null;
  });
  revalidatePath("/platform/health");
  return r;
}

export async function sendTestAlertAction() {
  return asPlatformAdmin(async (admin) => sendTestAlert(admin, await requestMeta()));
}

// ─── Support tools (Platform Support and Owner) ──────────────────────────────────────────

export async function openSupportModeAction(accountId: string) {
  const r = await asPlatformAdmin(async (admin) =>
    startSupportSession(admin, accountId, await requestMeta()),
  );
  if (!r.ok) return r;
  await setSessionCookie(r.data.token, r.data.expiresAt);
  redirect("/");
}

export async function unlockUserAction(accountId: string, userId: string, input: unknown) {
  const r = await asPlatformAdmin(async (admin) => {
    await unlockUserForCustomer(admin, accountId, userId, input, await requestMeta());
    return null;
  });
  revalidatePath(`/platform/accounts/${accountId}`);
  return r;
}

export async function resetTwoStepAction(accountId: string, userId: string, input: unknown) {
  const r = await asPlatformAdmin(async (admin) => {
    await resetTwoStepForCustomer(admin, accountId, userId, input, await requestMeta());
    return null;
  });
  revalidatePath(`/platform/accounts/${accountId}`);
  return r;
}

export async function correctBillingDetailsAction(accountId: string, input: unknown) {
  const r = await asPlatformAdmin(async (admin) => {
    await correctBillingDetails(admin, accountId, input, await requestMeta());
    return null;
  });
  revalidatePath(`/platform/accounts/${accountId}`);
  return r;
}

export async function findPendingSignUpAction(input: unknown) {
  return asPlatformAdmin(async (admin) => findPendingSignUp(admin, input));
}

export async function resendSignUpCodeAction(pendingId: string, input: unknown) {
  return asPlatformAdmin(async (admin) => {
    await resendSignUpCodeForCustomer(admin, pendingId, input, await requestMeta());
    return null;
  });
}

// ─── Tickets ─────────────────────────────────────────────────────────────────────────────

export async function staffReplyAction(id: string, input: unknown) {
  const r = await asPlatformAdmin(async (admin) =>
    replyToTicket(admin, id, input, await requestMeta()),
  );
  revalidatePath(`/platform/tickets/${id}`);
  return r;
}

export async function setTicketResolvedAction(id: string, resolved: boolean) {
  const r = await asPlatformAdmin(async (admin) => {
    await setTicketResolved(admin, id, resolved, await requestMeta());
    return null;
  });
  revalidatePath(`/platform/tickets/${id}`);
  return r;
}
