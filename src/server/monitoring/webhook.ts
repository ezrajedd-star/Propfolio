import { timingSafeEqual } from "node:crypto";

import type { IncidentSource } from "@prisma/client";

import { parseBetterStack, parseSentry, type IncidentSignal } from "@/domain/monitoring/webhooks";
import { env } from "@/server/env";
import { applySignal } from "./incidents";

const TOOLS: Record<
  string,
  { source: IncidentSource; parse: (b: unknown) => IncidentSignal | null }
> = {
  "better-stack": { source: "UPTIME", parse: parseBetterStack },
  sentry: { source: "ERROR_TRACKER", parse: parseSentry },
};

export function monitoringTokenOk(given: string | null): boolean {
  const expected = env().MONITORING_WEBHOOK_TOKEN;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * A message from Better Stack or Sentry. 401 without the right token, 404 for an unknown tool,
 * 200 otherwise (also when the message changes nothing, so the tool doesn't retry).
 */
export async function handleMonitoringWebhook(
  tool: string,
  token: string | null,
  raw: string,
  now = new Date(),
): Promise<{ status: 200 | 400 | 401 | 404; incidentId?: string | null }> {
  if (!monitoringTokenOk(token)) return { status: 401 };
  const t = TOOLS[tool];
  if (!t) return { status: 404 };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { status: 400 };
  }
  const signal = t.parse(body);
  if (!signal) return { status: 200, incidentId: null };
  return { status: 200, incidentId: await applySignal(t.source, signal, now) };
}
