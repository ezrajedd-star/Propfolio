import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MONITORING, OUTAGE, RESTORE_CHECK } from "@/config/ops";
import { platformCan } from "@/domain/platform/roles";
import { formatDateTime } from "@/domain/time/manila";
import { pushConfigured } from "@/server/alerts/pushover";
import { asSystem, db } from "@/server/db";
import { env } from "@/server/env";
import { listIncidents, workerStatus } from "@/server/monitoring/incidents";
import { OPS_KIND_LABELS, lastRestoreCheck, listOpsRequests } from "@/server/monitoring/outage";
import { requirePlatformPage } from "@/server/platform/current";
import { ResolveIncidentButton, RestartButton, TestAlertButton } from "./health-forms";

export const metadata: Metadata = { title: "System health" };

const SOURCE_LABELS = {
  UPTIME: "Uptime check (Better Stack)",
  ERROR_TRACKER: "Error alert (Sentry)",
  HEALTH_CHECK: "Propfolio's own check",
  MANUAL: "Opened by staff",
} as const;

async function databaseOk() {
  try {
    await asSystem(() => db.$queryRaw`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

export default async function HealthPage() {
  const admin = await requirePlatformPage("health.view", { action: "console.health_viewed" });
  const now = new Date();
  const [incidents, worker, dbOk, opsRequests, restore] = await Promise.all([
    listIncidents(admin),
    workerStatus(),
    databaseOk(),
    listOpsRequests(admin),
    lastRestoreCheck(),
  ]);
  const waitingKinds = new Set(
    opsRequests.filter((r) => r.status === "WAITING").map((r) => r.kind),
  );
  const e = env();
  const canManage = platformCan(admin.role, "health.manage");
  const open = incidents.filter((i) => i.status === "OPEN");
  const recent = incidents.filter((i) => i.status === "RESOLVED");

  const checks: { label: string; ok: boolean; okText: string; badText: string }[] = [
    { label: "Database", ok: dbOk, okText: "Working", badText: "Not answering" },
    {
      label: "Background jobs (reminders, renewals)",
      ok: worker.ok,
      okText: `Last checked in ${formatDateTime(worker.lastSeen)}`,
      badText: worker.lastSeen
        ? `Stopped: last checked in ${formatDateTime(worker.lastSeen)}`
        : `Never checked in (expected every ${MONITORING.workerStaleMinutes} minutes)`,
    },
    {
      label: "Email sending",
      ok: e.MAIL_TRANSPORT === "smtp" && Boolean(e.SMTP_USER),
      okText: "Set up",
      badText: "Not set up (emails are only logged)",
    },
    {
      label: "Error tracker (Sentry)",
      ok: Boolean(e.SENTRY_DSN),
      okText: "Connected",
      badText: "Not connected",
    },
    {
      label: "Alerts from Better Stack and Sentry",
      ok: Boolean(e.MONITORING_WEBHOOK_TOKEN),
      okText: "Accepted",
      badText: "Not set up (no token)",
    },
    {
      label: "Push alerts to phones (Pushover)",
      ok: pushConfigured(),
      okText: e.PUSHOVER_SECOND_USER_KEY ? "Set up, with a second contact" : "Set up",
      badText: "Not set up",
    },
  ];

  return (
    <>
      <PageHeader
        title="System health"
        description="Is Propfolio working? Problems found by the uptime checks, the error tracker and Propfolio's own checks."
        actions={canManage ? <TestAlertButton configured={pushConfigured()} /> : null}
      />

      <section aria-labelledby="open" className="mb-8">
        <h2 id="open" className="mb-3 text-xl font-semibold">
          Open incidents
        </h2>
        {open.length === 0 ? (
          <p className="bg-card flex items-center gap-2 rounded-xl border p-4">
            <StatusBadge tone="success" label="All systems normal" />
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map((i) => (
              <li key={i.id} className="bg-card space-y-2 rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    tone={i.severity === "URGENT" ? "danger" : "warning"}
                    label={i.severity === "URGENT" ? "Urgent" : "Needs a look"}
                  />
                  <span className="font-medium">{i.title}</span>
                </div>
                <p className="text-muted-foreground">
                  {SOURCE_LABELS[i.source]} · since {formatDateTime(i.startedAt)} ·{" "}
                  {i.alertedAt
                    ? `phone alerted ${formatDateTime(i.alertedAt)}`
                    : "no phone alert sent"}
                </p>
                <Diagnosis value={i.diagnostics} />
                {i.githubIssueNumber ? (
                  <p>
                    <a
                      href={`https://github.com/${e.GITHUB_REPOSITORY}/issues/${i.githubIssueNumber}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex min-h-10 items-center underline-offset-4 hover:underline"
                    >
                      GitHub issue #{i.githubIssueNumber} (the Engineering agent works on it)
                    </a>
                  </p>
                ) : null}
                {i.publicNote ? (
                  <p>
                    <span className="font-medium">On the status page:</span> {i.publicNote}
                  </p>
                ) : i.severity === "URGENT" ? (
                  <p>
                    A status-page message is waiting in{" "}
                    <Link
                      href="/platform/approvals"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Approvals
                    </Link>
                    .
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  {i.link ? (
                    <a
                      href={i.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex min-h-10 items-center underline-offset-4 hover:underline"
                    >
                      Open in the monitoring tool
                    </a>
                  ) : null}
                  {canManage ? <ResolveIncidentButton id={i.id} title={i.title} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Checks</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {checks.map((c) => (
              <li key={c.label} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="font-medium">{c.label}</span>
                <StatusBadge
                  tone={c.ok ? "success" : "warning"}
                  label={c.ok ? c.okText : c.badText}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Safe fixes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Restarting is safe: no data is lost. The server does it within a minute. Steps for
            everything else are in the outage runbook (docs/runbooks/outage.md).
          </p>
          {canManage ? (
            <div className="flex flex-wrap gap-3">
              {(["RESTART_WEB", "RESTART_WORKER"] as const).map((k) => (
                <RestartButton
                  key={k}
                  kind={k}
                  label={OPS_KIND_LABELS[k]}
                  disabled={waitingKinds.has(k)}
                />
              ))}
            </div>
          ) : null}
          {opsRequests.length > 0 ? (
            <ul className="divide-y rounded-xl border">
              {opsRequests.map((r) => {
                const stuck =
                  r.status === "WAITING" &&
                  now.getTime() - r.createdAt.getTime() > OUTAGE.restartStuckMinutes * 60_000;
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <span>
                      <span className="font-medium">{OPS_KIND_LABELS[r.kind]}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {r.requestedByName ?? "The watchdog"} · {formatDateTime(r.createdAt)} ·{" "}
                        {r.reason}
                      </span>
                    </span>
                    <StatusBadge
                      tone={
                        r.status === "DONE"
                          ? "success"
                          : r.status === "FAILED" || stuck
                            ? "danger"
                            : "warning"
                      }
                      label={
                        r.status === "DONE"
                          ? "Done"
                          : r.status === "FAILED"
                            ? `Failed${r.result ? `: ${r.result}` : ""}`
                            : stuck
                              ? "Not picked up: is the watchdog set up?"
                              : "Waiting for the server"
                      }
                    />
                  </li>
                );
              })}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Backups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {restore ? (
            <>
              <p className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={restore.ok ? "success" : "danger"}
                  label={restore.ok ? "Last restore check passed" : "Last restore check failed"}
                />
                <span className="text-muted-foreground">
                  {formatDateTime(restore.checkedAt)} · {restore.backupFile} ·{" "}
                  {restore.durationSeconds} seconds
                </span>
              </p>
              {restore.problem ? <p>{restore.problem}</p> : null}
            </>
          ) : (
            <p className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="warning" label="No restore check yet" />
              <span className="text-muted-foreground">
                The server restores the newest backup into a throw-away copy on the 1st of each
                month and emails you the result. An incident opens if none arrives in{" "}
                {RESTORE_CHECK.overdueDays} days.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="recent">
        <h2 id="recent" className="mb-3 text-xl font-semibold">
          Resolved in the last {MONITORING.recentDays} days
        </h2>
        {recent.length === 0 ? (
          <p className="text-muted-foreground">None.</p>
        ) : (
          <ul className="bg-card divide-y rounded-xl border">
            {recent.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-medium">{i.title}</span>
                  {i.resolvedNote ? (
                    <span className="text-muted-foreground"> — {i.resolvedNote}</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground">
                  {formatDateTime(i.startedAt)} to {formatDateTime(i.resolvedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Diagnosis({ value }: { value: unknown }) {
  const d = value as { findings?: string[]; stepText?: string } | null;
  if (!d?.stepText) return null;
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <p>
        <span className="font-medium">Suggested next step:</span> {d.stepText}
      </p>
      {d.findings?.length ? (
        <ul className="text-muted-foreground mt-1 list-disc pl-5">
          {d.findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
