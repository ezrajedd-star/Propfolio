"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { requestMeta } from "@/server/request-meta";
import { createTicket, replyToMyTicket } from "@/server/tickets/service";

/** "Help": a new request, with an optional screenshot (sent as form data). */
export async function createTicketAction(form: FormData) {
  const r = await runAction(async () => {
    const actor = await requireActor(undefined, { personal: true });
    const file = form.get("screenshot");
    const screenshot =
      file instanceof File && file.size > 0
        ? { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name }
        : null;
    return createTicket(
      actor,
      {
        category: form.get("category"),
        language: form.get("language") ?? "EN",
        description: form.get("description"),
        pagePath: form.get("pagePath") ?? undefined,
      },
      screenshot,
      await requestMeta(),
    );
  });
  revalidatePath("/requests");
  return r;
}

export async function replyToMyTicketAction(id: string, input: unknown) {
  const r = await runAction(async () => {
    await replyToMyTicket(
      await requireActor(undefined, { personal: true }),
      id,
      input,
      await requestMeta(),
    );
    return null;
  });
  revalidatePath(`/requests/${id}`);
  return r;
}
