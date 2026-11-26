import type { NextRequest } from "next/server";

import { reportError } from "@/server/monitoring/report-error";
import { handleOpsCall } from "@/server/monitoring/ops-api";

export const dynamic = "force-dynamic";

/**
 * For the server's own scripts only (deploy/watchdog.sh, deploy/restore-check.sh), with the
 * monitoring token in the `X-Monitoring-Token` header:
 *   GET  /api/v1/ops/requests       restarts waiting to be done
 *   POST /api/v1/ops/result         { id?, kind?, ok, result }
 *   POST /api/v1/ops/restore-check  { backupFile, backupTakenAt, tableCounts, durationSeconds, problem }
 */
async function handle(req: NextRequest, params: Promise<{ action: string }>) {
  const { action } = await params;
  const raw = req.method === "POST" ? await req.text() : "";
  if (raw.length > 64 * 1024) return new Response(null, { status: 413 });
  try {
    const r = await handleOpsCall(req.method, action, req.headers.get("x-monitoring-token"), raw);
    return r.body === undefined
      ? new Response(null, { status: r.status })
      : Response.json(r.body, { status: r.status });
  } catch (err) {
    reportError(err, "ops-api");
    return new Response(null, { status: 500 });
  }
}

export function GET(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  return handle(req, ctx.params);
}
export function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  return handle(req, ctx.params);
}
