"use server";

import { runAction, type ActionResult } from "@/server/actions";
import { requestMeta } from "@/server/request-meta";
import { requestResource } from "@/server/website-leads/service";

/** Public: anyone may ask for a free resource (rate-limited in the service). */
export async function requestResourceAction(input: unknown): Promise<ActionResult> {
  const r = await runAction(async () => requestResource(input, await requestMeta()));
  return r.ok ? { ok: true, data: null } : r;
}
