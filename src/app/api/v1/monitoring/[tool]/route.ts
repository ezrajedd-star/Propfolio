import type { NextRequest } from "next/server";

import { reportError } from "@/server/monitoring/report-error";
import { handleMonitoringWebhook } from "@/server/monitoring/webhook";

export const dynamic = "force-dynamic";

/**
 * Alerts from Better Stack (`/api/v1/monitoring/better-stack`) and Sentry
 * (`/api/v1/monitoring/sentry`). The secret token in the link (`?token=`) or the
 * `X-Monitoring-Token` header proves they are genuine.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const raw = await req.text();
  if (raw.length > 64 * 1024) return new Response(null, { status: 413 });
  const token = req.headers.get("x-monitoring-token") ?? req.nextUrl.searchParams.get("token");
  try {
    const r = await handleMonitoringWebhook(tool, token, raw);
    if (r.status !== 200) return new Response(null, { status: r.status });
    return Response.json({ received: true });
  } catch (err) {
    reportError(err, "monitoring-webhook");
    return new Response(null, { status: 500 });
  }
}
