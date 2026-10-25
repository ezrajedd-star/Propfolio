"use client";

import { Ban, Loader2, Plus, Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/app/empty-state";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { DateInput } from "@/components/form/date-input";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { MoneyInput } from "@/components/form/money-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPeso } from "@/domain/money/money";
import { formatIsoDate } from "@/domain/time/manila";
import type { LeaseLedger } from "@/server/billing/payments";
import {
  addChargeAction,
  applyCreditAction,
  voidChargeAction,
  voidPaymentAction,
} from "../../payments/actions";

const METHOD_LABELS = {
  CASH: "Cash",
  CHEQUE: "Cheque",
  BANK_TRANSFER: "Bank transfer",
  ONLINE: "Online",
} as const;

function stateVariant(state: string) {
  if (state.startsWith("Overdue")) return "danger" as const;
  if (state === "Paid") return "success" as const;
  if (state === "Part paid" || state === "Due today") return "warning" as const;
  if (state === "Cancelled" || state === "Voided") return "neutral" as const;
  return "outline" as const;
}

function AddChargeDialog({
  leaseId,
  today,
  open,
  onOpenChange,
}: {
  leaseId: string;
  today: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await addChargeAction(leaseId, { description, amount, dueDate });
      if (r.ok) {
        toast.success("Charge added");
        setDescription("");
        setAmount("");
        setErrors({});
        setError(null);
        onOpenChange(false);
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        setError(r.message);
      }
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a charge</DialogTitle>
          <DialogDescription>
            For one-off amounts the tenant owes, such as parking, utilities or repairs.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-5">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field id="charge-description" label="What it's for" required error={errors.description}>
            <Input
              id="charge-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Parking for October"
            />
          </Field>
          <Field id="charge-amount" label="Amount" required error={errors.amount}>
            <MoneyInput
              id="charge-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field id="charge-due" label="Due date" required error={errors.dueDate}>
            <DateInput
              id="charge-due"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Add charge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentsTab({
  leaseId,
  ledger,
  today,
}: {
  leaseId: string;
  ledger: LeaseLedger;
  today: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [voidCharge, setVoidCharge] = useState<{ id: string; description: string } | null>(null);
  const [voidPayment, setVoidPayment] = useState<{ id: string; paymentNo: string } | null>(null);
  const [creditPending, startCredit] = useTransition();
  const t = ledger.totals;
  const credit = Number(t.credit);
  const visibleCharges = ledger.charges.filter((c) => c.status !== "CANCELLED");
  const cancelledCount = ledger.charges.length - visibleCharges.length;

  const applyCredit = () =>
    startCredit(async () => {
      const r = await applyCreditAction(leaseId);
      if (r.ok) {
        toast.success(
          Number(r.data.applied) > 0
            ? `${formatPeso(r.data.applied)} of credit used`
            : "There were no unpaid charges to use the credit on",
        );
        router.refresh();
      } else toast.error(r.message);
    });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Balance due now</p>
            <p className="text-2xl font-semibold tabular-nums">{formatPeso(t.balanceDue)}</p>
          </CardContent>
        </Card>
        <Card className={Number(t.overdue) > 0 ? "border-danger" : undefined}>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Overdue</p>
            <p
              className={
                Number(t.overdue) > 0
                  ? "text-danger text-2xl font-semibold tabular-nums"
                  : "text-2xl font-semibold tabular-nums"
              }
            >
              {formatPeso(t.overdue)}
            </p>
            {t.overdueCount ? (
              <p className="text-muted-foreground text-sm">
                {t.overdueCount} unpaid charge(s) past due
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Paid so far</p>
            <p className="text-2xl font-semibold tabular-nums">{formatPeso(t.paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Unused credit</p>
            <p className="text-2xl font-semibold tabular-nums">{formatPeso(t.credit)}</p>
          </CardContent>
        </Card>
      </div>

      {ledger.canRecord ? (
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={`/payments/new?lease=${leaseId}`}>
              <Wallet aria-hidden /> Record payment
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> Add a charge
          </Button>
          {credit > 0 ? (
            <Button variant="outline" onClick={applyCredit} disabled={creditPending}>
              {creditPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Use {formatPeso(t.credit)} credit
            </Button>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Charges</CardTitle>
          <p className="text-muted-foreground">
            Rent, deposit and advance are created from the lease terms. Total still to pay over the
            lease: {formatPeso(t.totalOutstanding)}.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {visibleCharges.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due</TableHead>
                  <TableHead>Charge</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Still to pay</TableHead>
                  <TableHead>Status</TableHead>
                  {ledger.canRecord ? <TableHead className="sr-only">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCharges.map((c) => (
                  <TableRow
                    key={c.id}
                    className={c.status === "VOID" ? "text-muted-foreground" : undefined}
                  >
                    <TableCell className="whitespace-nowrap">{formatIsoDate(c.dueDate)}</TableCell>
                    <TableCell className="min-w-56">
                      {c.description}
                      {c.statusReason ? (
                        <span className="text-muted-foreground block text-sm">
                          Reason: {c.statusReason}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(c.amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPeso(c.paid)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.status === "ACTIVE" ? formatPeso(c.outstanding) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={stateVariant(c.state)}>{c.state}</Badge>
                    </TableCell>
                    {ledger.canRecord ? (
                      <TableCell className="text-right">
                        {c.status === "ACTIVE" && Number(c.paid) === 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVoidCharge({ id: c.id, description: c.description })}
                            aria-label={`Void charge: ${c.description}`}
                          >
                            <Ban aria-hidden /> Void
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">No charges yet.</p>
          )}
          {cancelledCount ? (
            <p className="text-muted-foreground mt-3 text-sm">
              {cancelledCount} charge(s) were replaced when the lease terms changed or the lease
              ended early. See History for details.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments received</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.payments.length ? (
            <ul className="divide-y">
              {ledger.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      <span className={p.status === "VOID" ? "line-through" : undefined}>
                        {formatPeso(p.amount)}
                      </span>{" "}
                      <span className="text-muted-foreground font-normal">
                        · {formatIsoDate(p.receivedDate)} · {METHOD_LABELS[p.method]}
                        {p.reference ? ` · Ref. ${p.reference}` : ""}
                      </span>
                      {p.status === "VOID" ? (
                        <Badge variant="neutral" className="ml-2">
                          Voided
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {p.status === "VOID"
                        ? `Reason: ${p.voidReason}`
                        : p.allocations.length
                          ? `Paid: ${p.allocations
                              .slice(0, 3)
                              .map((a) => `${a.description} (${formatPeso(a.amount)})`)
                              .join(
                                ", ",
                              )}${p.allocations.length > 3 ? ` and ${p.allocations.length - 3} more` : ""}`
                          : "Not applied to a charge yet"}
                      {p.status === "POSTED" && Number(p.unapplied) > 0
                        ? ` · ${formatPeso(p.unapplied)} kept as credit`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/payments/${p.id}`}>
                        <Receipt aria-hidden /> {p.paymentNo}
                      </Link>
                    </Button>
                    {ledger.canRecord && p.status === "POSTED" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVoidPayment({ id: p.id, paymentNo: p.paymentNo })}
                        aria-label={`Void payment ${p.paymentNo}`}
                      >
                        <Ban aria-hidden /> Void
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Wallet} title="No payments yet">
              Payments recorded for this lease will show here.
            </EmptyState>
          )}
        </CardContent>
      </Card>

      <AddChargeDialog leaseId={leaseId} today={today} open={adding} onOpenChange={setAdding} />
      <ReasonDialog
        open={voidCharge !== null}
        onOpenChange={(o) => !o && setVoidCharge(null)}
        title="Void this charge?"
        description={`"${voidCharge?.description ?? ""}" will no longer be owed. It stays on record, marked as voided, with your reason.`}
        confirmLabel="Void charge"
        done="Charge voided"
        onConfirm={async (reason) => {
          const r = await voidChargeAction(voidCharge!.id, reason);
          if (r.ok) router.refresh();
          return r;
        }}
      />
      <ReasonDialog
        open={voidPayment !== null}
        onOpenChange={(o) => !o && setVoidPayment(null)}
        title={`Void payment ${voidPayment?.paymentNo ?? ""}?`}
        description="Use this if the payment was entered by mistake or a cheque bounced. The payment stays on record, marked as voided, and the charges it paid become unpaid again."
        confirmLabel="Void payment"
        done="Payment voided"
        onConfirm={async (reason) => {
          const r = await voidPaymentAction(voidPayment!.id, reason);
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </div>
  );
}
