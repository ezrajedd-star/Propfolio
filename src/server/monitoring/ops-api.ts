import { z } from "zod";

import { AppError } from "@/server/errors";
import { recordRestoreCheck, reportOpsResult, waitingOpsRequests } from "./outage";
import { monitoringTokenOk } from "./webhook";

const resultSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["RESTART_WEB", "RESTART_WORKER"]).optional(),
  ok: z.boolean(),
  result: z.string().max(2000).default(""),
});

const restoreSchema = z.object({
  backupFile: z.string().min(1).max(200),
  backupTakenAt: z.string().datetime().nullable().default(null),
  tableCounts: z.record(z.string().max(100), z.number().int().min(0)).default({}),
  durationSeconds: z.number().int().min(0).max(86_400),
  problem: z.string().max(2000).nullable().default(null),
});

/** The server scripts' API. 401 without the monitoring token; 404 for an unknown call. */
export async function handleOpsCall(
  method: string,
  action: string,
  token: string | null,
  raw: string,
  now = new Date(),
): Promise<{ status: number; body?: unknown }> {
  if (!monitoringTokenOk(token)) return { status: 401 };
  if (method === "GET" && action === "requests") {
    return { status: 200, body: { requests: await waitingOpsRequests() } };
  }
  if (method !== "POST" || (action !== "result" && action !== "restore-check")) {
    return { status: 404 };
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { status: 400 };
  }
  try {
    if (action === "result") {
      const p = resultSchema.safeParse(body);
      if (!p.success) return { status: 400 };
      await reportOpsResult(p.data, now);
      return { status: 200, body: { received: true } };
    }
    const p = restoreSchema.safeParse(body);
    if (!p.success) return { status: 400 };
    const row = await recordRestoreCheck(
      { ...p.data, backupTakenAt: p.data.backupTakenAt ? new Date(p.data.backupTakenAt) : null },
      now,
    );
    return { status: 200, body: { ok: row.ok } };
  } catch (err) {
    if (err instanceof AppError) return { status: 400 };
    throw err;
  }
}
