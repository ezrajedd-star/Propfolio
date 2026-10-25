"use client";

import { Check, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { DateInput } from "@/components/form/date-input";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { MoneyInput } from "@/components/form/money-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { allocateOldestFirst } from "@/domain/billing/ledger";
import { formatPeso, money, parseMoney, roundMoney } from "@/domain/money/money";
import { formatIsoDate } from "@/domain/time/manila";
import { cn } from "@/lib/utils";
import { findLeasesAction, openChargesAction, recordPaymentAction } from "../actions";

type OpenRow = {
  id: string;
  type: "RENT" | "DEPOSIT" | "ADVANCE" | "OTHER";
  description: string;
  dueDate: string;
  amount: string;
  paid: string;
  outstanding: string;
  overdue: boolean;
  createdAt: string;
};
type LeaseOption = {
  id: string;
  refNo: string;
  tenantName: string;
  unitLabel: string;
  balanceDue: string;
};

const METHODS = [
  ["BANK_TRANSFER", "Bank transfer"],
  ["CHEQUE", "Cheque"],
  ["CASH", "Cash"],
  ["ONLINE", "Online"],
] as const;

export function RecordPaymentForm({
  initialLease,
  today,
}: {
  initialLease: LeaseOption | null;
  today: string;
}) {
  const router = useRouter();
  const [lease, setLease] = useState<LeaseOption | null>(initialLease);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LeaseOption[]>([]);
  const [charges, setCharges] = useState<OpenRow[] | null>(null);
  const [amount, setAmount] = useState("");
  const [receivedDate, setReceivedDate] = useState(today);
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [manual, setManual] = useState(false);
  const [split, setSplit] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Lease search.
  useEffect(() => {
    if (lease) return;
    const t = setTimeout(
      () =>
        startTransition(async () => {
          const r = await findLeasesAction(q);
          if (r.ok) setResults(r.data);
        }),
      250,
    );
    return () => clearTimeout(t);
  }, [q, lease]);

  // Open charges of the chosen lease.
  useEffect(() => {
    setCharges(null);
    if (!lease) return;
    void openChargesAction(lease.id).then((r) => {
      if (r.ok) setCharges(r.data);
      else setFormError(r.message);
    });
  }, [lease]);

  const parsedAmount = parseMoney(amount);
  // The suggestion uses the same rule as the server: oldest unpaid charges first.
  const suggestion = useMemo(() => {
    if (!charges || !parsedAmount)
      return { allocations: new Map<string, string>(), unapplied: "0.00" };
    const r = allocateOldestFirst(
      charges.map((c) => ({
        id: c.id,
        type: c.type,
        dueDate: c.dueDate,
        amount: money(c.amount),
        paid: money(c.paid),
        createdAt: c.createdAt,
      })),
      parsedAmount,
    );
    return {
      allocations: new Map(r.allocations.map((a) => [a.chargeId, a.amount.toFixed(2)])),
      unapplied: r.unapplied.toFixed(2),
    };
  }, [charges, parsedAmount]);

  const applied = manual
    ? new Map(Object.entries(split).filter(([, v]) => v.trim() !== ""))
    : suggestion.allocations;
  const appliedTotal = [...applied.values()].reduce((s, v) => s.plus(parseMoney(v) ?? 0), money(0));
  const leftOver = parsedAmount ? roundMoney(parsedAmount.minus(appliedTotal)) : money(0);

  const startManual = (on: boolean) => {
    setManual(on);
    if (on) setSplit(Object.fromEntries(suggestion.allocations));
  };

  const save = () => {
    const errs: Record<string, string> = {};
    if (!lease) errs.lease = "Choose the lease this payment is for.";
    if (!parsedAmount || parsedAmount.lessThanOrEqualTo(0))
      errs.amount = "Enter the amount received, like 50,000.00.";
    if (!receivedDate) errs.receivedDate = "Enter the date the payment was received.";
    if (receivedDate > today) errs.receivedDate = "The date can't be in the future.";
    if (manual && leftOver.isNegative())
      errs.allocations = "The split adds up to more than the payment.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setFormError(null);
    startTransition(async () => {
      const r = await recordPaymentAction({
        leaseId: lease!.id,
        receivedDate,
        amount,
        method,
        reference,
        notes,
        allocations: manual
          ? [...applied.entries()].map(([chargeId, a]) => ({ chargeId, amount: a }))
          : null,
      });
      if (!r.ok) {
        setFormError(r.message);
        setErrors(r.fieldErrors ?? {});
        return;
      }
      toast.success(`Payment ${r.data.paymentNo} recorded ✓`);
      router.push(`/payments/${r.data.id}`);
    });
  };

  return (
    <div className="max-w-4xl space-y-6">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Card>
        <CardHeader>
          <CardTitle>1. Which lease?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lease ? (
            <div className="bg-primary-soft/60 flex flex-wrap items-center gap-3 rounded-lg p-4">
              <Check className="text-primary size-5" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{lease.tenantName}</p>
                <p className="text-muted-foreground">
                  {lease.refNo} · {lease.unitLabel}
                </p>
              </div>
              <Button variant="outline" onClick={() => setLease(null)}>
                Choose another lease
              </Button>
            </div>
          ) : (
            <>
              <div className="relative max-w-md">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  aria-label="Search leases"
                  placeholder="Tenant, unit or lease number"
                  className="pl-10"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              {errors.lease ? (
                <p role="alert" className="text-destructive text-sm font-medium">
                  {errors.lease}
                </p>
              ) : null}
              <ul className="divide-y rounded-lg border">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setLease(r)}
                      className="hover:bg-muted flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{r.tenantName}</span>
                        <span className="text-muted-foreground block text-sm">
                          {r.refNo} · {r.unitLabel}
                        </span>
                      </span>
                      <span className="text-sm">
                        {Number(r.balanceDue) > 0
                          ? `${formatPeso(r.balanceDue)} due`
                          : "Nothing due"}
                      </span>
                    </button>
                  </li>
                ))}
                {results.length === 0 ? (
                  <li className="text-muted-foreground px-4 py-3">No leases match.</li>
                ) : null}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {lease ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>2. Payment details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field id="amount" label="Amount received" required error={errors.amount}>
                <MoneyInput
                  id="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={errors.amount ? true : undefined}
                  autoFocus
                />
              </Field>
              <Field id="receivedDate" label="Date received" required error={errors.receivedDate}>
                <DateInput
                  id="receivedDate"
                  value={receivedDate}
                  max={today}
                  onChange={(e) => setReceivedDate(e.target.value)}
                />
              </Field>
              <Field id="method" label="How it was paid" required>
                <NativeSelect
                  id="method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                >
                  {METHODS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                id="reference"
                label="Reference"
                hint="OR number, cheque number or bank reference."
                error={errors.reference}
              >
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={80}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field id="notes" label="Notes">
                  <Textarea
                    id="notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={1000}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>3. What it pays for</CardTitle>
              <div className="flex items-center gap-2">
                <Switch id="manual" checked={manual} onCheckedChange={startManual} />
                <Label htmlFor="manual" className="font-normal">
                  Change how it&apos;s split
                </Label>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                {manual
                  ? "Type how much goes to each charge."
                  : "We apply payments to the oldest unpaid charges first."}
              </p>
              {charges === null ? (
                <p className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Loading charges…
                </p>
              ) : charges.length === 0 ? (
                <p className="bg-muted rounded-lg p-3">
                  Nothing is unpaid on this lease. The whole payment will be kept as credit.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-base">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left text-sm">
                        <th className="px-3 py-2 font-semibold">Charge</th>
                        <th className="px-3 py-2 font-semibold">Due</th>
                        <th className="px-3 py-2 text-right font-semibold">Unpaid</th>
                        <th className="px-3 py-2 text-right font-semibold">This payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {charges.map((c) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            {c.description}
                            {c.overdue ? (
                              <Badge variant="danger" className="ml-2">
                                Overdue
                              </Badge>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {formatIsoDate(c.dueDate)}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                            {formatPeso(c.outstanding)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {manual ? (
                              <MoneyInput
                                aria-label={`Amount for ${c.description}`}
                                className="ml-auto w-36 text-right"
                                value={split[c.id] ?? ""}
                                onChange={(e) =>
                                  setSplit((s) => ({ ...s, [c.id]: e.target.value }))
                                }
                              />
                            ) : (
                              <span
                                className={cn(
                                  "tabular-nums",
                                  applied.get(c.id) ? "font-semibold" : "text-muted-foreground",
                                )}
                              >
                                {applied.get(c.id) ? formatPeso(applied.get(c.id)) : "—"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {errors.allocations ? (
                <p role="alert" className="text-destructive text-sm font-medium">
                  {errors.allocations}
                </p>
              ) : null}
              {parsedAmount ? (
                <p className="bg-muted rounded-lg p-3" aria-live="polite">
                  {formatPeso(appliedTotal)} goes to {applied.size} charge
                  {applied.size === 1 ? "" : "s"}
                  {leftOver.greaterThan(0)
                    ? `; ${formatPeso(leftOver)} will be kept as credit on the lease`
                    : ""}
                  {leftOver.isNegative()
                    ? ` — that's ${formatPeso(leftOver.abs())} more than the payment`
                    : ""}
                  .
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button size="lg" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              Record payment
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
