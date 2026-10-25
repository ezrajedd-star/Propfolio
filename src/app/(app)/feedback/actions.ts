"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { env } from "@/server/env";
import { ForbiddenError } from "@/server/errors";
import { sendFeedback, setFeedbackDone } from "@/server/feedback/service";
import { requestMeta } from "@/server/request-meta";

export async function sendFeedbackAction(input: { message: string; pagePath: string }) {
  return runAction(async () => {
    if (!env().UAT_MODE)
      throw new ForbiddenError("Feedback is only collected in the test version.");
    const actor = await requireActor();
    await sendFeedback(actor, input, await requestMeta());
    return null;
  });
}

export async function setFeedbackDoneAction(id: string, done: boolean) {
  return runAction(async () => {
    const actor = await requireActor("settings.manage");
    await setFeedbackDone(actor, id, done, await requestMeta());
    revalidatePath("/settings/feedback");
    return null;
  });
}
