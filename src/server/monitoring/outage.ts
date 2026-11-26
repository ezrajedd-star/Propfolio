import type { Incident, OpsRequestKind, Prisma } from "@prisma/client";

import { OUTAGE, RESTORE_CHECK } from "@/config/ops";
import { maskPersonalDetails } from "@/domain/agents/mask";
import {
  diagnose,
  publicNoteVisible,
  restoreOverdue,
  restoreReport,
  restoreVerdict,
  statusDraft,
  type Diagnostics,
} from "@/domain/ops/outage";
import { formatDateTime } from "@/domain/time/manila";
import { createGithubIssue } from "@/server/agents/github";
import { submitApproval } from "@/server/agents/approvals";
import { emailOwners } from "@/server/agents/notify";
import { asSystem, db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { env } from "@/server/env";
import { NotFoundError, ValidationError } from "@/server/errors";
import { reportError } from "@/server/monitoring/report-error";
import type { PlatformActor } from "@/server/platform/auth";
import { assertPlatformCan, writeStaffLog } from "@/server/platform/staff-log";
import type { RequestMeta } from "@/server/request-meta";

/**
 * What happens around an incident (phase 7): diagnostics, a status-page draft for approval, a
 * GitHub issue for error alerts, runbook-safe restarts carried out by the server's watchdog,
 * and the monthly backup-restore check. Nothing here touches customer data.
 */

async function collectDiagnostics(now: Date): Promise<Diagnostics> {
  let database = true;
  try {
    await asSystem(() => db.$queryRaw`SELECT 1`);
  } catch {
    database = false;
  }
  if (!database) {
    return {
      database,
      worker: { ok: false, minutesSinceLastSeen: null },
      incidentsLastHour: 0,
      checkedAt: now.toISOString(),
    };
  }
  const [beat, recent] = await asSystem(() =>
    Promise.all([
      db.systemHeartbeat.findUnique({ where: { name: "worker" } }),
      db.incident.count({ where: { startedAt: { gte: new Date(now.getTime() - 3_600_000) } } }),
    ]),
  );
  const { MONITORING } = await import("@/config/ops");
  const minutes = beat ? Math.floor((now.getTime() - beat.at.getTime()) / 60_000) : null;
  return {
    database,
    worker: {
      ok: minutes !== null && minutes <= MONITORING.workerStaleMinutes,
      minutesSinceLastSeen: minutes,
    },
    incidentsLastHour: recent,
    checkedAt: now.toISOString(),
  };
}

/** Called once when an incident opens (or re-opens). Never throws. */
export async function afterIncidentOpened(incident: Incident, now = new Date()): Promise<void> {
  try {
    const d = await collectDiagnostics(now);
    const diagnosis = diagnose(d, incident.source);
    await asSystem(() =>
      db.incident.update({
        where: { id: incident.id },
        data: { diagnostics: { ...d, ...diagnosis } as unknown as Prisma.InputJsonValue },
      }),
    );
    if (incident.severity === "URGENT") await draftStatusUpdate(incident, "investigating", now);
    if (
      incident.source === "ERROR_TRACKER" &&
      OUTAGE.githubIssueForErrors &&
      env().GITHUB_ISSUES_TOKEN &&
      incident.githubIssueNumber === null
    ) {
      await openAlertIssue(incident);
    }
  } catch (err) {
    reportError(err, "incident-follow-up");
  }
}

/** Called when an incident is resolved. A "fixed" draft follows an approved public message. */
export async function afterIncidentResolved(incidentId: string, now = new Date()): Promise<void> {
  try {
    const i = await asSystem(() => db.incident.findUnique({ where: { id: incidentId } }));
    if (!i) return;
    // A waiting "we're working on it" draft is no longer true.
    await asSystem(() =>
      db.approval.updateMany({
        where: {
          entityType: "Incident",
          entityId: i.id,
          status: "PENDING",
          actionType: "STATUS_UPDATE",
        },
        data: { status: "REJECTED", reason: "The incident was resolved first.", decidedAt: now },
      }),
    );
    if (i.publicNote) await draftStatusUpdate(i, "resolved", now);
  } catch (err) {
    reportError(err, "incident-follow-up");
  }
}

async function draftStatusUpdate(
  i: Pick<Incident, "id" | "title" | "source">,
  phase: "investigating" | "resolved",
  now: Date,
) {
  const body = statusDraft(i.source, phase);
  await submitApproval(
    {
      agentKey: "ENGINEERING",
      actionType: "STATUS_UPDATE",
      title:
        phase === "resolved" ? `Status page: "fixed" for ${i.title}` : `Status page: ${i.title}`,
      preview: `Shown on the public status page once you approve:\n\n${body}`,
      payload: { incidentId: i.id, phase, body },
      entityType: "Incident",
      entityId: i.id,
    },
    now,
  );
}

async function openAlertIssue(i: Incident) {
  const details = (i.details ?? {}) as Record<string, unknown>;
  const body = maskPersonalDetails(
    [
      "An error alert came in from the error tracker. Engineering agent: find the cause, write a failing test, fix it and open a pull request (see agents/engineering/role.md).",
      "",
      `- What: ${i.title}`,
      `- Level: ${String(details.level ?? "error")}`,
      i.link ? `- In Sentry: ${i.link}` : null,
      `- Started: ${i.startedAt.toISOString()}`,
      "",
      "No customer data is included here. Use the Sentry link for the stack trace.",
    ]
      .filter((l) => l !== null)
      .join("\n"),
  );
  const issue = await createGithubIssue({
    title: maskPersonalDetails(`Error alert: ${i.title}`).slice(0, 200),
    body,
    labels: ["alert"],
  });
  await asSystem(() =>
    db.incident.update({ where: { id: i.id }, data: { githubIssueNumber: issue.number } }),
  );
}

/** The STATUS_UPDATE executor: the approved text goes on /status. */
export async function publishStatusNote(payload: Record<string, unknown>, now: Date) {
  const id = typeof payload.incidentId === "string" ? payload.incidentId : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) throw new ValidationError("The message is empty.");
  if (body.length > 600) throw new ValidationError("Keep the status message under 600 characters.");
  const { count } = await asSystem(() =>
    db.incident.updateMany({
      where: { id: isUuid(id) ? id : "00000000-0000-7000-8000-000000000000" },
      data: { publicNote: maskPersonalDetails(body), publicNoteAt: now },
    }),
  );
  if (count !== 1) throw new NotFoundError("The incident has gone.");
  return "Shown on the status page";
}

/** Messages for the public status page: no internal details, only the approved text. */
export async function publicNotices(now = new Date()) {
  const since = new Date(now.getTime() - OUTAGE.publicNoteHoursAfterResolve * 3_600_000);
  const rows = await asSystem(() =>
    db.incident.findMany({
      where: {
        publicNote: { not: null },
        OR: [{ status: "OPEN" }, { resolvedAt: { gte: since } }],
      },
      orderBy: { publicNoteAt: "desc" },
      select: { id: true, publicNote: true, publicNoteAt: true, status: true, resolvedAt: true },
      take: 5,
    }),
  );
  return rows
    .filter((r) => publicNoteVisible(r, now, OUTAGE.publicNoteHoursAfterResolve))
    .map((r) => ({
      id: r.id,
      text: r.publicNote!,
      at: r.publicNoteAt,
      resolved: r.status === "RESOLVED",
    }));
}

// Runbook-safe actions -----------------------------------------------------------------------

export const OPS_KIND_LABELS: Record<OpsRequestKind, string> = {
  RESTART_WEB: "Restart the web app",
  RESTART_WORKER: "Restart background jobs",
};

export async function requestRestart(
  actor: PlatformActor,
  kind: OpsRequestKind,
  reason: string,
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(actor, "health.manage");
  if (!(kind in OPS_KIND_LABELS)) throw new ValidationError("Unknown action.");
  const text = reason.trim();
  if (!text || text.length > 300) {
    throw new ValidationError("Say why in a few words (up to 300 characters).", {
      reason: "Say why.",
    });
  }
  return asSystem(() =>
    db.$transaction(async (tx) => {
      const waiting = await tx.opsRequest.findFirst({ where: { kind, status: "WAITING" } });
      if (waiting) throw new ValidationError("That restart is already waiting for the server.");
      const r = await tx.opsRequest.create({
        data: {
          kind,
          reason: text,
          requestedById: actor.id,
          requestedByName: actor.name,
          createdAt: now,
        },
      });
      await writeStaffLog(
        {
          actor,
          kind: "CHANGE",
          action: "ops.restart_requested",
          entityType: "OpsRequest",
          entityId: r.id,
          metadata: { kind },
          meta,
        },
        tx,
      );
      return r;
    }),
  );
}

export async function listOpsRequests(actor: PlatformActor) {
  assertPlatformCan(actor, "health.view");
  return asSystem(() => db.opsRequest.findMany({ orderBy: { createdAt: "desc" }, take: 10 }));
}

/** For the watchdog: restarts waiting to be done (oldest first). */
export async function waitingOpsRequests() {
  return asSystem(() =>
    db.opsRequest.findMany({
      where: { status: "WAITING" },
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true },
      take: 5,
    }),
  );
}

/** The watchdog reports back. `id` absent: it restarted something on its own. */
export async function reportOpsResult(
  input: { id?: string; kind?: string; ok: boolean; result: string },
  now = new Date(),
) {
  const result = input.result.slice(0, 300);
  if (input.id) {
    if (!isUuid(input.id)) throw new NotFoundError("No such request.");
    const { count } = await asSystem(() =>
      db.opsRequest.updateMany({
        where: { id: input.id, status: "WAITING" },
        data: { status: input.ok ? "DONE" : "FAILED", result, doneAt: now },
      }),
    );
    if (count !== 1) throw new NotFoundError("No such waiting request.");
    return;
  }
  if (input.kind !== "RESTART_WEB" && input.kind !== "RESTART_WORKER") {
    throw new ValidationError("Unknown action.");
  }
  await asSystem(() =>
    db.opsRequest.create({
      data: {
        kind: input.kind as OpsRequestKind,
        status: input.ok ? "DONE" : "FAILED",
        reason: "The watchdog found it not answering",
        result,
        createdAt: now,
        doneAt: now,
      },
    }),
  );
}

// Monthly backup-restore check ---------------------------------------------------------------

export async function recordRestoreCheck(
  input: {
    backupFile: string;
    backupTakenAt: Date | null;
    tableCounts: Record<string, number>;
    durationSeconds: number;
    problem: string | null;
  },
  now = new Date(),
) {
  const verdict = restoreVerdict(input.tableCounts, RESTORE_CHECK.mustHaveRows, input.problem);
  const row = await asSystem(() =>
    db.restoreCheck.create({
      data: {
        ok: verdict.ok,
        backupFile: input.backupFile.slice(0, 200),
        backupTakenAt: input.backupTakenAt,
        tableCounts: input.tableCounts,
        durationSeconds: input.durationSeconds,
        problem: verdict.problem,
        checkedAt: now,
      },
    }),
  );
  const report = restoreReport({ ...verdict, ...input, formatDate: formatDateTime });
  await emailOwners(report.subject, report.body, "/platform/health");
  if (!verdict.ok) {
    const { applySignal } = await import("./incidents");
    await applySignal(
      "HEALTH_CHECK",
      {
        action: "open",
        externalId: `restore-check-${row.id}`,
        title: "The monthly backup restore check failed",
        link: null,
        severity: "NORMAL",
        startedAt: now,
        details: { backupFile: row.backupFile },
      },
      now,
    );
  }
  return row;
}

export async function lastRestoreCheck() {
  return asSystem(() => db.restoreCheck.findFirst({ orderBy: { checkedAt: "desc" } }));
}

/** Daily: opens an incident when no restore check has come in for too long. */
export async function watchRestoreChecks(now = new Date()): Promise<boolean> {
  const last = await lastRestoreCheck();
  // With no check yet, count from the first time this watch ran (a new server isn't overdue).
  const since = await asSystem(() =>
    db.systemHeartbeat.upsert({
      where: { name: "restore-watch-since" },
      create: { name: "restore-watch-since", at: now },
      update: {},
    }),
  );
  if (!restoreOverdue(last?.checkedAt ?? since.at, now, RESTORE_CHECK.overdueDays)) return false;
  const { applySignal } = await import("./incidents");
  const month = now.toISOString().slice(0, 7);
  await applySignal(
    "HEALTH_CHECK",
    {
      action: "open",
      externalId: `restore-check-overdue-${month}`,
      title: `No backup restore check in ${RESTORE_CHECK.overdueDays} days`,
      link: null,
      severity: "NORMAL",
      startedAt: now,
      details: {},
    },
    now,
  );
  return true;
}
