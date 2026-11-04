import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/app/back-link";
import { DetailList } from "@/components/app/detail-list";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPeso } from "@/domain/money/money";
import { formatDate, formatDateTime, formatIsoDate } from "@/domain/time/manila";
import { NotFoundError } from "@/server/errors";
import { getAccountDetail } from "@/server/platform/accounts";
import { requirePlatformPage } from "@/server/platform/current";
import { AccountStatusBadge, PLAN_LABELS, planLabel } from "../../account-badges";
import { ChangePlanForm, ExtendTrialForm, ManualPaymentForm, SuspendButton } from "./account-forms";

export const metadata: Metadata = { title: "Account" };

const ACTION_LABELS: Record<string, string> = {
  "platform.trial_extended": "Trial extended",
  "platform.manual_payment": "Payment recorded",
  "platform.account_suspended": "Account suspended",
  "platform.account_reactivated": "Account reactivated",
  "platform.plan_changed": "Plan changed",
};

export default async function PlatformAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformPage();
  const { id } = await params;
  const account = await getAccountDetail(admin, id).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const suspended = account.status === "SUSPENDED";

  return (
    <>
      <BackLink href="/platform">All accounts</BackLink>
      <PageHeader
        title={account.name}
        description={`Joined ${formatDate(account.createdAt)}.`}
        actions={<SuspendButton accountId={account.id} suspended={suspended} name={account.name} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: "Status", value: <AccountStatusBadge status={account.status} /> },
                ...(suspended
                  ? [
                      {
                        label: "Suspended",
                        value: `${formatDateTime(account.suspendedAt)}: ${account.suspendedReason ?? ""}`,
                      },
                    ]
                  : []),
                { label: "Plan now", value: planLabel(account) },
                { label: "Plan chosen", value: PLAN_LABELS[account.plan] },
                {
                  label: "Trial ends",
                  value: account.trialEndsOn ? formatIsoDate(account.trialEndsOn) : "No trial",
                },
                {
                  label: "Paid until",
                  value: account.paidUntil
                    ? formatIsoDate(account.paidUntil)
                    : "Not paid by transfer",
                },
                {
                  label: "Owner",
                  value: account.owner ? `${account.owner.name} (${account.owner.email})` : "—",
                },
                {
                  label: "People",
                  value:
                    account.activeUsers > account.userLimit
                      ? `${account.activeUsers} active: over the plan's ${account.userLimit}, so the ${account.activeUsers - account.userLimit} newest can't sign in`
                      : `${account.activeUsers} active of ${account.userLimit}`,
                },
                { label: "Units", value: String(account.units) },
              ]}
            />
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Change plan</CardTitle>
            </CardHeader>
            <CardContent>
              <ChangePlanForm accountId={account.id} current={account.plan} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Extend the free trial</CardTitle>
            </CardHeader>
            <CardContent>
              <ExtendTrialForm accountId={account.id} current={account.trialEndsOn} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Record a bank transfer</CardTitle>
            </CardHeader>
            <CardContent>
              <ManualPaymentForm accountId={account.id} />
            </CardContent>
          </Card>
        </div>
      </div>

      <h2 className="mt-10 mb-4 text-xl font-semibold">Payments recorded by hand</h2>
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recorded</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Paid until</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {account.payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
                  None yet.
                </TableCell>
              </TableRow>
            ) : (
              account.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDateTime(p.recordedAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPeso(p.amount)}</TableCell>
                  <TableCell>{formatIsoDate(p.paidUntil)}</TableCell>
                  <TableCell>{p.reference}</TableCell>
                  <TableCell>{p.note ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <h2 className="mt-10 mb-4 text-xl font-semibold">What Propfolio staff did</h2>
      {account.history.length === 0 ? (
        <p className="text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {account.history.map((h) => {
            const reason = (h.metadata as { reason?: string } | null)?.reason;
            return (
              <li key={h.seq} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-medium">{ACTION_LABELS[h.action] ?? h.action}</span>
                  {reason ? <span className="text-muted-foreground"> — {reason}</span> : null}
                </span>
                <span className="text-muted-foreground">
                  {h.actorName ?? "—"}, {formatDateTime(h.at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
