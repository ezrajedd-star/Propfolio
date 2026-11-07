"use server";

import { redirect } from "next/navigation";

import { runAction, type ActionResult } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { acceptLegalUpdates } from "@/server/auth/legal";
import { requestMeta } from "@/server/request-meta";

export async function acceptTermsAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    const actor = await requireActor(undefined, { duringTwoStepSetup: true });
    await acceptLegalUpdates(actor, input, await requestMeta());
    return null;
  });
  if (!result.ok) return result;
  redirect("/");
}
