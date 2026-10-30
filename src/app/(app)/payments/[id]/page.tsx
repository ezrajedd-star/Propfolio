import type { Metadata } from "next";
import Link from "next/link";

import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { can } from "@/domain/auth/roles";
import { formatPeso } from "@/domain/money/money";
import { formatDateTime, formatIsoDate } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { assertIdOrNotFound, orNotFound } from "@/server/pages";
import { getPaymentAcknowledgement } from "@/server/billing/payments";
import { getSettings } from "@/server/settings/service";
import { AcknowledgementActions } from "./acknowledgement-actions";

export const metadata: Metadata = { title: "Payment acknowledgement" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageUser("payment.view");
  const { id } = await params;
  assertIdOrNotFound(id);
  const [p, settings] = await orNotFound(
    Promise.all([getPaymentAcknowledgement(actor, id), getSettings()]),
  );
  const companyName = settings.companyName;
  const voided = p.status === "VOID";
  return (
    <>
      <div className="print:hidden">
        <BackLink href={`/leases/${p.lease.id}`}>{p.lease.refNo}</BackLink>
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-semibold sm:text-3xl">Payment {p.paymentNo}</h1>
        <AcknowledgementActions
          paymentId={id}
          paymentNo={p.paymentNo}
          canVoid={!voided && can(actor.role, "payment.record")}
          leaseId={p.lease.id}
        />
      </div>

      <article className="bg-card mx-auto max-w-2xl rounded-xl border p-8 print:max-w-none print:border-0 print:p-0">
        <header className="mb-6 border-b pb-4">
          <p className="text-lg font-semibold">{companyName || "Propfolio"}</p>
          <h2 className="mt-2 text-xl font-semibold">Payment acknowledgement</h2>
          <p className="text-muted-foreground mt-1 font-medium">
            Acknowledgement — not an official receipt
          </p>
          {voided ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="danger">Voided</Badge>
              <span>Reason: {p.voidReason}</span>
            </div>
          ) : null}
        </header>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="text-muted-foreground">Number</dt>
          <dd className="font-medium">{p.paymentNo}</dd>
          <dt className="text-muted-foreground">Received from</dt>
          <dd className="font-medium">{p.tenantName}</dd>
          <dt className="text-muted-foreground">For</dt>
          <dd>
            {p.unitLabel}
            {p.address ? <span className="text-muted-foreground block">{p.address}</span> : null}
            <span className="text-muted-foreground block">Lease {p.lease.refNo}</span>
          </dd>
          <dt className="text-muted-foreground">Date received</dt>
          <dd>{formatIsoDate(p.receivedDate)}</dd>
          <dt className="text-muted-foreground">Paid by</dt>
          <dd>
            {p.method}
            {p.reference ? ` · Ref. ${p.reference}` : ""}
          </dd>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className={voided ? "text-2xl font-semibold line-through" : "text-2xl font-semibold"}>
            {p.amountLabel}
          </dd>
        </dl>

        <h3 className="mt-8 mb-2 font-semibold">Applied to</h3>
        {p.lines.length ? (
          <table className="w-full text-left">
            <thead className="text-muted-foreground border-b text-sm">
              <tr>
                <th className="py-2 font-medium">Charge</th>
                <th className="py-2 font-medium">Due</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {p.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2">{l.description}</td>
                  <td className="py-2">{formatIsoDate(l.dueDate)}</td>
                  <td className="py-2 text-right tabular-nums">{formatPeso(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted-foreground">Not applied to any charge yet.</p>
        )}
        {Number(p.unapplied) > 0 && !voided ? (
          <p className="mt-3">
            Kept as credit for future charges: <strong>{formatPeso(p.unapplied)}</strong>
          </p>
        ) : null}

        <footer className="text-muted-foreground mt-8 border-t pt-4 text-sm">
          Recorded{p.recordedBy ? ` by ${p.recordedBy}` : ""} on {formatDateTime(p.recordedAt)}.
          This acknowledgement is for the tenant&apos;s reference only. It is not an official
          receipt or invoice.
        </footer>
      </article>
      <p className="mt-6 text-center print:hidden">
        <Link href="/payments" className="text-primary underline">
          Back to all payments
        </Link>
      </p>
    </>
  );
}
