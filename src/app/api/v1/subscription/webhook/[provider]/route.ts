import type { NextRequest } from "next/server";

import { reportError } from "@/server/monitoring/report-error";
import { handleProviderWebhook } from "@/server/subscription/service";

export const dynamic = "force-dynamic";

/**
 * Messages from the payment provider (payment paid / failed). No session and no Origin: the
 * provider's signature is what proves it's genuine. Answers 200 once a message is logged (also
 * for repeats), so the provider stops retrying; 401 when the signature is wrong.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const raw = await req.text();
  if (raw.length > 64 * 1024) return new Response(null, { status: 413 });
  try {
    const outcome = await handleProviderWebhook(provider, raw, req.headers);
    if (outcome.status === 401) return new Response(null, { status: 401 });
    return Response.json({ received: true, result: outcome.result });
  } catch (err) {
    // The provider retries later; nothing was applied twice (the event log is unique).
    reportError(err, "subscription-webhook");
    return new Response(null, { status: 500 });
  }
}
