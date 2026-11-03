"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import {
  adminResetTwoStep,
  confirmTwoStepSetup,
  forgetMyDevices,
  newRecoveryCodesFor,
  turnOffTwoStep,
} from "@/server/auth/two-step";
import { requestMeta } from "@/server/request-meta";

/** Confirm the first code; returns the recovery codes to show once. */
export async function confirmTwoStepAction(input: { code: string }) {
  return runAction(async () =>
    confirmTwoStepSetup(
      await requireActor(undefined, { duringTwoStepSetup: true }),
      input,
      await requestMeta(),
    ),
  );
}

export async function newRecoveryCodesAction(input: { code: string }) {
  return runAction(async () =>
    newRecoveryCodesFor(await requireActor(), input, await requestMeta()),
  );
}

export async function turnOffTwoStepAction(input: { password: string; code: string }) {
  const result = await runAction(async () =>
    turnOffTwoStep(await requireActor(), input, await requestMeta()),
  );
  revalidatePath("/account/two-step");
  return result;
}

export async function forgetDevicesAction() {
  const result = await runAction(async () =>
    forgetMyDevices(await requireActor(), await requestMeta()),
  );
  revalidatePath("/account/two-step");
  return result;
}

export async function resetTwoStepForUserAction(userId: string) {
  const result = await runAction(async () =>
    adminResetTwoStep(await requireActor("user.manage"), userId, await requestMeta()),
  );
  revalidatePath("/settings/users");
  return result;
}
