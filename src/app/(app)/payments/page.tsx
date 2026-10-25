import { Download, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/roles";
import { AGING_BUCKETS } from "@/domain/billing/ledger";
import { formatPeso } from "@/domain/money/money";
import { addDays } from "@/domain/time/calendar-date";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { overdueReport } from "@/server/billing/balances";
import { listPayments, PAYMENT_METHOD_LABELS } from "@/server/billing/payments";

export const metadata: Metadata = { title: "Payments" };

const BUCKET_VARIANT = {
  "1–30": "warning",
  "31–60": "warning",
  "61–90": "danger",
  "90+": "danger",
} as const;

export default async function PaymentsPage() {
  const actor = await requirePageUser("payment.view");
  const today = manilaToday();
  const [report, recent] = await Promise.all([
    overdueReport(actor),
    listPayments(actor, { from: addDays(today, -60), includeVoid: true }),
  ]);
  const canRecord = can(actor.role, "payment.record");
  const canExport = can(actor.role, "data.export");

  return (
    <>
      <PageHeader
        title="Payments"
        description="Record what tenants paid and see who is overdue."
        actions={
          canRecord ? (
            <Button asChild>
              <Link href="/payments/new" data-guide="record-payment">
                <Plus aria-hidden /> Record payment
              </Link>
            </Button>
          ) : null
        }
      />

      <section id="overdue" className="scroll-mt-24 space-y-4" data-guide="overdue-list">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Overdue</h2>
            <p className="text-muted-foreground">
              {report.count
                ? `${report.rows.length} lease(s) owe ${formatPeso(report.total)} that is past due.`
                : "Nobody is overdue. Well done."}
            </p>
          </div>
          {canExport && report.rows.length ? (
            <div className="flex flex-wrap gap-2" data-guide="overdue-export">
              <Button variant="outline" asChild>
                <a href="/api/v1/payments/overdue/export?format=xlsx">
                  <Download aria-hidden /> Excel
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href="/api/v1/payments/overdue/export?format=csv">
                  <Download aria-hidden /> CSV
                </a>
              </Button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">Total overdue</p>
              <p className="text-2xl font-semibold tabular-nums">{formatPeso(report.total)}</p>
            </CardContent>
          </Card>
          {AGING_BUCKETS.map((b) => (
            <Card key={b}>
              <CardContent className="pt-6">
                <p className="text-muted-foreground">{b} days late</p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatPeso(report.buckets[b])}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {report.rows.length ? (
          <Card>
            <CardContent className="overflow-x-auto pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Amount overdue</TableHead>
                    <TableHead>Oldest due date</TableHead>
                    <TableHead>Days late</TableHead>
                    {canRecord ? <TableHead className="sr-only">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r) => (
                    <TableRow key={r.leaseId}>
                      <TableCell>
                        <Link
                          href={`/leases/${r.leaseId}`}
                          className="text-primary font-medium underline"
                        >
                          {r.tenantName}
                        </Link>
                        <span className="text-muted-foreground block text-sm">{r.refNo}</span>
                      </TableCell>
                      <TableCell>{r.unitLabel}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatPeso(r.overdue)}
                      </TableCell>
                      <TableCell>{formatIsoDate(r.oldestDueDate)}</TableCell>
                      <TableCell>
                        <Badge variant={BUCKET_VARIANT[r.bucket]}>{r.bucket} days</Badge>
                      </TableCell>
                      {canRecord ? (
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              href={`/payments/new?lease=${r.leaseId}`}
                              aria-label={`Record payment for ${r.tenantName}`}
                            >
                              Record payment
                            </Link>
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">Payments in the last 60 days</h2>
        {recent.length ? (
          <Card>
            <CardHeader className="sr-only">
              <CardTitle>Recent payments</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Paid by</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatIsoDate(p.receivedDate)}</TableCell>
                      <TableCell>
                        <Link href={`/payments/${p.id}`} className="text-primary underline">
                          {p.paymentNo}
                        </Link>
                        {p.status === "VOID" ? (
                          <Badge variant="neutral" className="ml-2">
                            Voided
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {p.tenantName}
                        <span className="text-muted-foreground block text-sm">{p.unitLabel}</span>
                      </TableCell>
                      <TableCell>{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                      <TableCell
                        className={
                          p.status === "VOID"
                            ? "text-right tabular-nums line-through"
                            : "text-right tabular-nums"
                        }
                      >
                        {formatPeso(p.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <EmptyState icon={Wallet} title="No payments recorded recently">
            Payments you record will be listed here.
          </EmptyState>
        )}
      </section>
    </>
  );
}
