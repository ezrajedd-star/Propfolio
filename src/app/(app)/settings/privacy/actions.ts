"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { anonymiseTenant, purgePastRetention } from "@/server/privacy/service";
import { requestMeta } from "@/server/request-meta";

export async function anonymiseTenantAction(tenantId: string, reason: string) {
  return runAction(async () => {
    const actor = await requireActor("privacy.manage");
    await anonymiseTenant(actor, tenantId, { reason }, await requestMeta());
    revalidatePath("/", "layout");
    return null;
  });
}

export async function purgeRetentionAction() {
  return runAction(async () => {
    const actor = await requireActor("privacy.manage");
    const count = await purgePastRetention(actor, await requestMeta());
    revalidatePath("/", "layout");
    return { count };
  });
}
