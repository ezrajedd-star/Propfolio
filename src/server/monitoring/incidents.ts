import type { IncidentSource, Prisma } from "@prisma/client";

import { ALERT_PRIORITY, MONITORING } from "@/config/ops";
import { alertText, type IncidentSignal } from "@/domain/monitoring/webhooks";
import { sendPush, type PushSender } from "@/server/alerts/pushover";
import { asSystem, db } from "@/server/db";
import { env } from "@/server/env";
import { NotFoundError, ValidationError } from "@/server/errors";
import { isUuid } from "@/server/db-errors";
import type { PlatformActor } from "@/server/platform/auth";
import { assertPlatformCan, writeStaffLog } from "@/server/platform/staff-log";
import type { RequestMeta } from "@/server/request-meta";

/**
 * Incidents: something wrong with Propfolio itself. Opened by Better Stack, Sentry and our own
 * checks; resolved by the tool or by staff on System health. Urgent ones push to phones.
 */

const consoleLink = () => `${env().APP_URL}/platform/health`;

async function alert(
  incident: { id: string; title: string; severity: "URGENT" | "NORMAL" },
  send: PushSender,
  now: Date,
  resolved = false,
) {
  const text = alertText(incident, resolved);
  const priority = resolved
    ? 0
    : incident.severity === "URGENT"
      ? ALERT_PRIORITY.URGENT
      : ALERT_PRIORITY.NORMAL;
  const r = await send({ ...text, priority, url: consoleLink() });
  if (resolved) return;
  await asSystem(() =>
    db.incident.update({
      where: { id: incident.id },
      data:
        r.sent > 0
          ? { alertedAt: now, alertTries: { increment: 1 } }
          : { alertTries: { increment: 1 } },
    }),
  );
}

/** Apply a signal from a monitoring tool. Returns the incident id, or null if nothing changed. */
export async function applySignal(
  source: IncidentSource,
  signal: IncidentSignal,
  now = new Date(),
  send: PushSender = sendPush,
): Promise<string | null> {
  const key = { source_externalId: { source, externalId: signal.externalId } };
  if (signal.action === "resolve") {
    const open = await asSystem(() => db.incident.findUnique({ where: key }));
    if (!open || open.status === "RESOLVED") return null;
    await asSystem(() =>
      db.incident.update({ where: { id: open.id }, data: { status: "RESOLVED", resolvedAt: now } }),
    );
    if (open.severity === "URGENT") await alert(open, send, now, true);
    return open.id;
  }
  const existing = await asSystem(() => db.incident.findUnique({ where: key }));
  if (existing?.status === "OPEN") return existing.id;
  const data = {
    severity: signal.severity,
    title: signal.title,
    link: signal.link,
    details: signal.details as Prisma.InputJsonValue,
    startedAt: signal.startedAt ?? now,
    status: "OPEN" as const,
    resolvedAt: null,
    resolvedById: null,
    resolvedNote: null,
    alertedAt: null,
    alertTries: 0,
  };
  const incident = await asSystem(() =>
    db.incident.upsert({
      where: key,
      create: { source, externalId: signal.externalId, ...data },
      update: data,
    }),
  );
  await alert(incident, send, now);
  return incident.id;
}

/** The worker retries alerts that didn't go out (e.g. Pushover was unreachable). */
export async function retryAlerts(now = new Date(), send: PushSender = sendPush): Promise<number> {
  const pending = await asSystem(() =>
    db.incident.findMany({
      where: { status: "OPEN", alertedAt: null, alertTries: { lt: MONITORING.alertMaxTries } },
      take: 20,
    }),
  );
  for (const i of pending) await alert(i, send, now);
  return pending.length;
}

export async function countOpenIncidents(): Promise<number> {
  return asSystem(() => db.incident.count({ where: { status: "OPEN" } }));
}

export async function listIncidents(actor: PlatformActor, now = new Date()) {
  assertPlatformCan(actor, "health.view");
  const since = new Date(now.getTime() - MONITORING.recentDays * 86_400_000);
  return asSystem(() =>
    db.incident.findMany({
      where: { OR: [{ status: "OPEN" }, { startedAt: { gte: since } }] },
      orderBy: [{ status: "asc" }, { startedAt: "desc" }],
      take: 200,
    }),
  );
}

/** Staff mark an incident as dealt with, with a short note. */
export async function resolveIncident(
  actor: PlatformActor,
  id: string,
  note: string,
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(actor, "health.manage");
  const text = note.trim();
  if (!text || text.length > 500) {
    throw new ValidationError("Say in a few words what was done (up to 500 characters).", {
      note: "Say what was done.",
    });
  }
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that incident.");
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.incident.updateMany({
        where: { id, status: "OPEN" },
        data: { status: "RESOLVED", resolvedAt: now, resolvedById: actor.id, resolvedNote: text },
      });
      if (count !== 1) throw new NotFoundError("This incident is already resolved.");
      await writeStaffLog(
        {
          actor,
          kind: "CHANGE",
          action: "incident.resolved",
          entityType: "Incident",
          entityId: id,
          meta,
        },
        tx,
      );
    }),
  );
}

/** Send a test push so staff can check their phone gets alerts. */
export async function sendTestAlert(
  actor: PlatformActor,
  meta: RequestMeta,
  send: PushSender = sendPush,
) {
  assertPlatformCan(actor, "health.manage");
  const r = await send({
    title: "Propfolio test alert",
    message: `${actor.name} sent this from System health. Alerts reach this phone.`,
    priority: 1,
    url: consoleLink(),
  });
  await asSystem(() =>
    writeStaffLog({ actor, kind: "SETTING", action: "alerts.test_sent", metadata: r, meta }),
  );
  return r;
}

// Heartbeats -------------------------------------------------------------------------------

export function recordHeartbeat(name: string, now = new Date()) {
  return asSystem(() =>
    db.systemHeartbeat.upsert({ where: { name }, create: { name, at: now }, update: { at: now } }),
  );
}

export async function workerStatus(now = new Date()) {
  const beat = await asSystem(() => db.systemHeartbeat.findUnique({ where: { name: "worker" } }));
  const staleAfter = MONITORING.workerStaleMinutes * 60_000;
  return {
    lastSeen: beat?.at ?? null,
    ok: beat !== null && now.getTime() - beat.at.getTime() <= staleAfter,
  };
}
