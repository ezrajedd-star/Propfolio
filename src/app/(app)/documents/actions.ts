"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { archiveDocument } from "@/server/documents/service";
import { requestMeta } from "@/server/request-meta";

export async function archiveDocumentAction(documentId: string, reason: string) {
  return runAction(async () => {
    const actor = await requireActor("document.upload");
    await archiveDocument(actor, documentId, { reason }, await requestMeta());
    revalidatePath("/", "layout");
    return null;
  });
}
