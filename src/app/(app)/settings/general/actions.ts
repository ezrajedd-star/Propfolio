"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { requestMeta } from "@/server/request-meta";
import { updateSettings } from "@/server/settings/service";

export async function updateSettingsAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("settings.manage");
    await updateSettings(actor, input, await requestMeta());
    revalidatePath("/", "layout");
    return null;
  });
}
