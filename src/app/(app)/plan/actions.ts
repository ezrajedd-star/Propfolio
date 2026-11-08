"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { runAction, type ActionResult } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { requestMeta } from "@/server/request-meta";
import {
  cancelSubscription,
  choosePlan,
  payDemoCheckout,
  type ChooseResult,
} from "@/server/subscription/service";

/** Upgrade, start, pay, downgrade or keep a plan. A checkout comes back as a URL to go to. */
export async function choosePlanAction(plan: string): Promise<ActionResult<ChooseResult>> {
  const result = await runAction(async () => {
    const actor = await requireActor("billing.manage");
    return choosePlan(actor, { plan }, await requestMeta());
  });
  revalidatePath("/plan");
  return result;
}

export async function cancelSubscriptionAction(): Promise<ActionResult<{ until: string }>> {
  const result = await runAction(async () => {
    const actor = await requireActor("billing.manage");
    return cancelSubscription(actor, await requestMeta());
  });
  revalidatePath("/plan");
  return result;
}

/** The demo checkout's buttons (test site only). */
export async function payDemoAction(ref: string, outcome: string): Promise<ActionResult> {
  const result = await runAction(async () => {
    const actor = await requireActor("billing.manage");
    return payDemoCheckout(actor, ref, { outcome });
  });
  if (!result.ok) return result;
  const r = result.data;
  redirect(
    r.status === 200 && r.result === "failed" ? "/plan?payment=failed" : "/plan?payment=paid",
  );
}
