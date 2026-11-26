/**
 * Turn messages from the monitoring tools into incident changes. Pure: no I/O. Only monitor
 * names, error types, levels and links are kept, never message text (which could quote what a
 * customer typed).
 */

export interface IncidentSignal {
  action: "open" | "resolve";
  externalId: string;
  title: string;
  link: string | null;
  severity: "URGENT" | "NORMAL";
  startedAt: Date | null;
  details: Record<string, string | number | null>;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : null;
const str = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.trim()
    ? v.trim().slice(0, max)
    : typeof v === "number"
      ? String(v)
      : null;
const date = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const httpsLink = (v: unknown): string | null => {
  const s = str(v, 500);
  return s && /^https:\/\//.test(s) ? s : null;
};

/**
 * Better Stack Uptime incident webhook: `{ data: { id, attributes: { name, url, cause, status,
 * started_at, resolved_at } } }`. "Started" opens; "Resolved" (or a resolved time) resolves;
 * "Acknowledged" changes nothing.
 */
export function parseBetterStack(body: unknown): IncidentSignal | null {
  const data = obj(obj(body)?.data);
  const attrs = obj(data?.attributes);
  const id = str(data?.id, 100);
  if (!data || !attrs || !id) return null;
  const status = str(attrs.status)?.toLowerCase() ?? "";
  const resolved = status === "resolved" || date(attrs.resolved_at) !== null;
  if (!resolved && status !== "started" && status !== "") return null;
  const name = str(attrs.name, 100) ?? "A monitor";
  return {
    action: resolved ? "resolve" : "open",
    externalId: id,
    title: `${name} is down`,
    link: httpsLink(attrs.url),
    severity: "URGENT",
    startedAt: date(attrs.started_at),
    details: { monitor: name, cause: str(attrs.cause, 120) },
  };
}

/**
 * A Sentry alert, either the legacy webhook (`{ id, project_name, culprit, level, url }`) or an
 * integration's event alert (`{ data: { event: { issue_id, title, level, web_url } } }`). Fatal
 * errors are urgent; everything else needs a look today.
 */
export function parseSentry(body: unknown): IncidentSignal | null {
  const b = obj(body);
  if (!b) return null;
  const event = obj(obj(b.data)?.event);
  const issueId = str(event?.issue_id ?? b.id, 100);
  if (!issueId) return null;
  const level = (str(event?.level ?? b.level, 20) ?? "error").toLowerCase();
  const where = str(event?.culprit ?? b.culprit, 120);
  const kind = str(event?.title, 80)?.split(":")[0] ?? "Error";
  const project = str(b.project_name ?? b.project, 60);
  return {
    action: "open",
    externalId: issueId,
    title: `${kind}${where ? ` in ${where}` : ""}`.slice(0, 160),
    link: httpsLink(event?.web_url ?? b.url),
    severity: level === "fatal" ? "URGENT" : "NORMAL",
    startedAt: null,
    details: { level, project },
  };
}

/** The push notification text: short, plain, and never personal data. */
export function alertText(
  signal: Pick<IncidentSignal, "title" | "severity">,
  resolved = false,
): { title: string; message: string } {
  if (resolved) return { title: "Resolved", message: `${signal.title}: back to normal.` };
  return signal.severity === "URGENT"
    ? {
        title: "Propfolio: urgent",
        message: `${signal.title}. Open System health in the console.`,
      }
    : { title: "Propfolio: needs a look", message: `${signal.title}.` };
}
