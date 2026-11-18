"use server";

import { reopenAccountWithLink } from "@/server/accounts/closing";
import { runAction, type ActionResult } from "@/server/actions";
import { requestMeta } from "@/server/request-meta";

export async function reopenAccountAction(token: string): Promise<ActionResult<{ name: string }>> {
  return runAction(async () => reopenAccountWithLink(token, await requestMeta()));
}
