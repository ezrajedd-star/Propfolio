"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { retryTodaysDigest } from "@/server/reminders/queries";
import { requestMeta } from "@/server/request-meta";

export async function retryDigestAction() {
  const result = await runAction(async () => {
    const actor = await requireActor("settings.manage");
    try {
      return await retryTodaysDigest(actor, await requestMeta());
    } catch {
      // The failure is recorded on the digest and shown on the page.
      return { status: "FAILED" as const };
    }
  });
  revalidatePath("/settings/reminder-emails");
  return result;
}
