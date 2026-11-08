import { Download } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPeso, money } from "@/domain/money/money";
import { formatDate } from "@/domain/time/manila";
import { requirePlatformPage } from "@/server/platform/current";
import { listPaymentsForPlatform, paymentRange } from "@/server/subscription/export";

export const metadata: Metadata = { title: "Payments" };

export default async function PlatformPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const admin = await requirePlatformPage();
  const sp = await searchParams;
  const range = paymentRange(sp.from, sp.to);
  const rows = await listPaymentsForPlatform(admin, range);
  const total = rows.reduce((n, r) => n.plus(r.amount.toFixed(2)), money(0));

  return (
    <>
      <PageHeader
        title="Payments"
        description="Subscription payments received. Payment records, not BIR official invoices: export them for the bookkeeper."
        actions={
          <Button asChild>
            <a href={`/platform/payments-export?from=${range.from}&to=${range.to}`}>
              <Download aria-hidden /> Export for the bookkeeper
            </a>
          </Button>
        }
      />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={range.from} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={range.to} />
        </div>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>For</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-6 text-center">
                  No payments in these dates.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums">{r.number}</TableCell>
                  <TableCell>{formatDate(r.issuedAt)}</TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell className="whitespace-normal">{r.description}</TableCell>
                  <TableCell>{r.method}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPeso(r.amount.toFixed(2))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <p className="mt-3 text-right font-medium">
        Total: {formatPeso(total)} ({rows.length} payment{rows.length === 1 ? "" : "s"})
      </p>
    </>
  );
}
