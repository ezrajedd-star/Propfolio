/**
 * Error reports in Sentry's "envelope" format, built by hand so that exactly this leaves the
 * server: the error's type, where in the code it happened (file, function, line), and where in
 * the app (a label). Never the error message (database errors can quote what someone typed),
 * request data, cookies, or who was signed in.
 */

export interface SentryDsn {
  endpoint: string;
  publicKey: string;
}

/** https://<key>@<host>/<project> → where to send, and the key. Null if it isn't a DSN. */
export function parseSentryDsn(dsn: string | undefined): SentryDsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const project = url.pathname.replace(/^\/+/, "");
    if (url.protocol !== "https:" || !url.username || !/^\d+$/.test(project)) return null;
    return {
      endpoint: `https://${url.host}/api/${project}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

interface Frame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

/** Stack lines like "at fn (/app/src/x.ts:12:5)" → frames, oldest first (as Sentry expects). */
export function stackFrames(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n").slice(1, 41)) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!m) continue;
    const filename = m[2]!.replace(/^file:\/\//, "");
    frames.push({
      filename,
      function: m[1] ?? "?",
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes("node_modules") && !filename.startsWith("node:"),
    });
  }
  return frames.reverse();
}

export function buildEnvelope(
  err: unknown,
  info: { where: string; environment: string; eventId: string; now: Date },
): string {
  const type = err instanceof Error ? err.name || "Error" : typeof err;
  const event = {
    event_id: info.eventId,
    timestamp: info.now.getTime() / 1000,
    platform: "node",
    level: "error",
    environment: info.environment,
    tags: { where: info.where },
    exception: {
      values: [
        {
          type,
          value: "(message not sent)",
          stacktrace: { frames: stackFrames(err instanceof Error ? err.stack : undefined) },
        },
      ],
    },
  };
  return [
    JSON.stringify({ event_id: info.eventId, sent_at: info.now.toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}
