import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MONITORING } from "@/config/ops";
import { platformCan } from "@/domain/platform/roles";
import { formatDateTime } from "@/domain/time/manila";
import { pushConfigured } from "@/server/alerts/pushover";
import { asSystem, db } from "@/server/db";
import { env } from "@/server/env";
import { listIncidents, workerStatus } from "@/server/monitoring/incidents";
import { requirePlatformPage } from "@/server/platform/current";
import { ResolveIncidentButton, TestAlertButton } from "./health-forms";

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
  const [incidents, worker, dbOk] = await Promise.all([
    listIncidents(admin),
    workerStatus(),
    databaseOk(),
  ]);
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
