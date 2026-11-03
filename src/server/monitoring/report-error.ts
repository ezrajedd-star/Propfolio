import { randomUUID } from "node:crypto";

import { buildEnvelope, parseSentryDsn } from "./sentry";

/**
 * Record an unexpected error: its type in the log (never the message, which can contain personal
 * data), and, when SENTRY_DSN is set, a report to Sentry (see sentry.ts for exactly what is sent).
 * Never throws; reporting must not break the request it reports on.
 */
export function reportError(err: unknown, where: string): void {
  const type = err instanceof Error ? err.name : typeof err;
  console.error(`[error] ${where}: ${type}`);
  const dsn = parseSentryDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  const body = buildEnvelope(err, {
    where,
    environment:
      process.env.SENTRY_ENVIRONMENT || (process.env.UAT_MODE === "true" ? "uat" : "production"),
    eventId: randomUUID().replace(/-/g, ""),
    now: new Date(),
  });
  void fetch(dsn.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=propfolio/1.0`,
    },
    body,
    signal: AbortSignal.timeout(5000),
  }).catch(() => console.error("[error] could not reach the error tracker"));
}
