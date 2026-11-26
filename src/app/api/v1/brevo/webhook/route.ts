import type { NextRequest } from "next/server";

import { monitoringTokenOk } from "@/server/monitoring/webhook";
import { reportError } from "@/server/monitoring/report-error";
import { markUnsubscribed } from "@/server/pipeline/service";

export const dynamic = "force-dynamic";

const UNSUBSCRIBE_EVENTS = new Set(["unsubscribed", "unsubscribe", "spam", "complaint"]);

/**
 * Brevo marketing webhook (Transactional → no; Marketing → Webhooks): unsubscribes and spam
 * complaints turn marketing consent off. The secret token in the link (`?token=`) proves it's
 * Brevo. Answers 200 for anything it ignores, so Brevo doesn't retry.
 */
export async function POST(req: NextRequest) {
  if (!monitoringTokenOk(req.nextUrl.searchParams.get("token"))) {
    return new Response(null, { status: 401 });
  }
  const raw = await req.text();
  if (raw.length > 256 * 1024) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const events = (Array.isArray(body) ? body : [body]).slice(0, 500) as {
    event?: unknown;
    email?: unknown;
  }[];
  try {
    for (const e of events) {
      if (typeof e?.event !== "string" || typeof e.email !== "string") continue;
      if (UNSUBSCRIBE_EVENTS.has(e.event.toLowerCase())) await markUnsubscribed(e.email);
    }
    return Response.json({ received: true });
  } catch (err) {
    reportError(err, "brevo-webhook");
    return new Response(null, { status: 500 });
  }
}
