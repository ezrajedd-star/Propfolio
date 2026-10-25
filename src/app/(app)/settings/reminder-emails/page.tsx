import { Ban, CircleCheck, Loader2, MailX } from "lucide-react";
import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FormAlert } from "@/components/form/form-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS } from "@/domain/auth/roles";
import { formatDateTime, formatIsoDate, manilaToday } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { listDigests } from "@/server/reminders/queries";
import { getSettings } from "@/server/settings/service";
import { OverdueToggle, RetryButton } from "./reminder-email-controls";

export const metadata: Metadata = { title: "Reminder emails" };

function DigestBadge({ status }: { status: "SENDING" | "SENT" | "FAILED" | "EMPTY" }) {
  switch (status) {
    case "SENT":
      return <StatusBadge tone="success" label="Sent" icon={CircleCheck} />;
    case "FAILED":
      return <StatusBadge tone="danger" label="Couldn't send" icon={MailX} />;
    case "SENDING":
      return <StatusBadge tone="warning" label="Sending" icon={Loader2} />;
    default:
      return <StatusBadge tone="neutral" label="Nothing to send" icon={Ban} />;
  }
}

export default async function ReminderEmailsPage() {
  const actor = await requirePageUser("settings.manage");
  const [{ digests, recipients }, settings] = await Promise.all([
    listDigests(actor),
    getSettings(),
  ]);
  const today = manilaToday();
  const todays = digests.find((d) => d.date === today);
  const recentFailures = digests.filter((d) => d.status === "FAILED");

  return (
    <>
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader
        title="Reminder emails"
        description="Every morning at 6:00 AM, Propfolio sends one email listing the leases that need attention. Failed emails are retried automatically."
      />

      {todays?.status === "FAILED" ? (
        <FormAlert className="mb-6">
          <div className="space-y-3">
            <p>
              <strong>Today&apos;s reminder email couldn&apos;t be sent</strong> (tried{" "}
              {todays.attempts} time
              {todays.attempts === 1 ? "" : "s"}). It will be retried automatically, and anything
              missed is included in tomorrow&apos;s email.
            </p>
            {todays.lastError ? <p className="font-mono text-sm">{todays.lastError}</p> : null}
            <RetryButton />
          </div>
        </FormAlert>
      ) : recentFailures.length > 0 ? (
        <FormAlert tone="info" className="mb-6">
          {recentFailures.length} email{recentFailures.length === 1 ? "" : "s"} in the last 30 days
          couldn&apos;t be sent. Their reminders were included in the next day&apos;s email.
        </FormAlert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Who receives them</CardTitle>
            <CardDescription>
              Every active Admin and Leasing Staff user. Property Management never receives
              reminders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recipients.length === 0 ? (
              <p className="text-danger">
                Nobody. Add an active Admin or Leasing Staff user so reminders can be sent.
              </p>
            ) : (
              <ul className="divide-y">
                {recipients.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3 py-2">
                    <span>{r.name}</span>
                    <span className="text-muted-foreground">{ROLE_LABELS[r.role]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What&apos;s in the email</CardTitle>
            <CardDescription>
              Leases with a reminder due that day (or missed in the past week), soonest first, each
              with a link. When reminders are sent is set per unit type in Unit types and reminders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OverdueToggle initial={settings.digestIncludeOverdue} />
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-10 mb-3 text-xl font-semibold">Last 30 days</h2>
      {digests.length === 0 ? (
        <p className="text-muted-foreground">
          No reminder emails yet. The first one goes out at 6:00 AM on a day when a reminder is due.
        </p>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Day</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Leases</TableHead>
                <TableHead>Sent to</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {digests.map((d) => (
                <TableRow key={d.id} className="align-top">
                  <TableCell className="whitespace-nowrap">{formatIsoDate(d.date)}</TableCell>
                  <TableCell>
                    <DigestBadge status={d.status} />
                  </TableCell>
                  <TableCell>{d.status === "EMPTY" ? "—" : d.leaseCount}</TableCell>
                  <TableCell>{d.recipientCount ? `${d.recipientCount} people` : "—"}</TableCell>
                  <TableCell className="text-sm">
                    {d.sentAt ? `Sent ${formatDateTime(d.sentAt)}` : null}
                    {d.attempts > 1 ? (
                      <span className="text-muted-foreground block">{d.attempts} attempts</span>
                    ) : null}
                    {d.status === "FAILED" && d.lastError ? (
                      <span className="text-danger block font-mono">{d.lastError}</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
