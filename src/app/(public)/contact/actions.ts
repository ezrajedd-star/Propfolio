"use server";

import { runAction, type ActionResult } from "@/server/actions";
import { requestDemo } from "@/server/demo/service";
import { requestMeta } from "@/server/request-meta";

/** Public: anyone may ask for a demo (rate-limited in the service). */
export async function requestDemoAction(input: unknown): Promise<ActionResult> {
  const r = await runAction(async () => requestDemo(input, await requestMeta()));
  return r.ok ? { ok: true, data: null } : r;
}
