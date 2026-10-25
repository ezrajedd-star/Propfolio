import { Ban, BellRing, CircleCheck, Clock, MailCheck, TriangleAlert } from "lucide-react";

import { MarkHandledButton, ResumeRemindersButton } from "@/components/app/mark-handled-button";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReminderConfig, ReminderSource } from "@/domain/reminders/config";
import { describeConfig } from "@/domain/reminders/schedule";
import { formatDateTime, formatIsoDate } from "@/domain/time/manila";
import type { LeaseReminderView } from "@/server/reminders/queries";

const SOURCE = {
  unit: "this unit's own settings",
  unitType: "the unit type",
  system: "the default settings",
} as const;

function EventBadge({
  status,
  date,
  today,
}: {
  status: LeaseReminderView["events"][number]["status"];
  date: string;
  today: string;
}) {
  switch (status) {
    case "SENT":
      return <StatusBadge tone="success" label="Sent" icon={MailCheck} />;
    case "FAILED":
      return <StatusBadge tone="danger" label="Couldn't send — will retry" icon={TriangleAlert} />;
    case "SKIPPED":
      return <StatusBadge tone="neutral" label="Not needed" icon={Ban} />;
    default:
      return date <= today ? (
        <StatusBadge tone="warning" label="Sending at the next 6:00 AM run" icon={Clock} />
      ) : (
        <StatusBadge tone="default" label="Scheduled" icon={Clock} />
      );
  }
}

function describeEvent(e: LeaseReminderView["events"][number]): string {
  if (e.kind === "EXPIRY") return `${e.daysBefore} days before the lease ends`;
  if (e.daysBefore > 0) return `Repeat reminder (${e.daysBefore} days before the end)`;
  if (e.daysBefore === 0) return "Repeat reminder (last day of the lease)";
  return `Repeat reminder (${-e.daysBefore} days after the end)`;
}

/** The lease's Reminders tab: settings, every scheduled/sent reminder, and "Mark as handled". */
export function RemindersTab({
  leaseId,
  tenantName,
  config,
  source,
  view,
  today,
}: {
  leaseId: string;
  tenantName: string;
  config: ReminderConfig;
  source: ReminderSource;
  view: LeaseReminderView;
  today: string;
}) {
  const upcoming = view.events.filter((e) => e.status === "PENDING");
  const history = view.events.filter((e) => e.status !== "PENDING");
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Expiry reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p>
            The Leasing team gets one email each morning at 6:00 AM listing every lease that needs
            attention. For this lease, reminders come from {SOURCE[source]}:{" "}
            {describeConfig(config)}.
          </p>

          {view.handled ? (
            <div className="bg-success-soft flex flex-wrap items-start gap-3 rounded-lg p-4">
              <CircleCheck className="text-success mt-0.5 size-5" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Marked as handled — no more reminders</p>
                <p className="text-muted-foreground text-sm">
                  {view.handled.byName ?? "Someone"} on {formatDateTime(view.handled.at)}
                </p>
                {view.handled.note ? (
                  <p className="mt-1 whitespace-pre-line">&ldquo;{view.handled.note}&rdquo;</p>
                ) : null}
              </div>
              {view.canHandle && !view.stoppedReason ? (
                <ResumeRemindersButton leaseId={leaseId} />
              ) : null}
            </div>
          ) : view.stoppedReason ? (
            <p className="bg-muted rounded-lg p-4">
              {view.stoppedReason} No more expiry reminders are sent.
            </p>
          ) : view.canHandle ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
              <BellRing className="text-primary size-5" aria-hidden />
              <p className="min-w-0 flex-1">
                Already dealing with this renewal or move-out? Stop the reminders.
              </p>
              <MarkHandledButton leaseId={leaseId} tenantName={tenantName} />
            </div>
          ) : null}

          <section aria-labelledby="upcoming-reminders">
            <h3 id="upcoming-reminders" className="mb-2 font-semibold">
              Coming up
            </h3>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground">No reminders scheduled.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {upcoming.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <span>
                      <span className="font-medium">{formatIsoDate(e.date)}</span>{" "}
                      <span className="text-muted-foreground">· {describeEvent(e)}</span>
                    </span>
                    <EventBadge status={e.status} date={e.date} today={today} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sent so far</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground">No reminder emails about this lease yet.</p>
          ) : (
            <ul className="divide-y">
              {[...history].reverse().map((e) => (
                <li key={e.id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{formatIsoDate(e.date)}</span>
                    <EventBadge status={e.status} date={e.date} today={today} />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {describeEvent(e)}
                    {e.sentAt ? ` · emailed ${formatDateTime(e.sentAt)}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
