"use server";

import { runAction, type ActionResult } from "@/server/actions";
import { requestMeta } from "@/server/request-meta";
import { applyAsPartner } from "@/server/website-leads/service";

/** Public: anyone may apply (rate-limited in the service). */
export async function applyAsPartnerAction(input: unknown): Promise<ActionResult> {
  const r = await runAction(async () => applyAsPartner(input, await requestMeta()));
  return r.ok ? { ok: true, data: null } : r;
}
