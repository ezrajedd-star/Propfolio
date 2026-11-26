import type { NextRequest } from "next/server";

import { agentForKey, callAgentAction } from "@/server/agents/gateway";
import { reportError } from "@/server/monitoring/report-error";

export const dynamic = "force-dynamic";

const STATUS = {
  refused: 403,
  invalid: 400,
  not_found: 404,
  rate_limited: 429,
  failed: 500,
} as const;

/**
 * The agent API over HTTP (e.g. for the Engineering agent on GitHub Actions). Each agent has its
 * own key (`Authorization: Bearer …`) and may call only its own actions. No cookies, no sessions.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const agent = agentForKey(key);
  if (!agent) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { action } = await params;
  const raw = await req.text();
  if (raw.length > 64 * 1024) return Response.json({ error: "too_large" }, { status: 413 });
  let input: unknown = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ error: "invalid", message: "The body isn't JSON." }, { status: 400 });
  }
  try {
    const r = await callAgentAction(agent, action, input);
    if (r.ok) return Response.json({ data: r.data }, { headers: { "Cache-Control": "no-store" } });
    return Response.json({ error: r.error, message: r.message }, { status: STATUS[r.error] });
  } catch (err) {
    reportError(err, "agent-api");
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
