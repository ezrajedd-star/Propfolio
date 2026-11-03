"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, Loader2, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { ReasonDialog } from "@/components/app/reason-dialog";
import { DateInput } from "@/components/form/date-input";
import { Field, fieldAria } from "@/components/form/field";
import { MoneyInput } from "@/components/form/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { extendTrialSchema, manualPaymentSchema } from "@/schemas/platform";
import type { ActionResult } from "@/server/actions";
import {
  extendTrialAction,
  recordManualPaymentAction,
  setAccountSuspendedAction,
} from "../../../actions";

function useActionForm<V extends Record<string, unknown>>(
  form: ReturnType<typeof useForm<V>>,
  run: (values: V) => Promise<ActionResult<unknown>>,
  done: string,
  reset: V,
) {
  const [pending, start] = useTransition();
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const r = await run(values);
      if (r.ok) {
        toast.success(done);
        form.reset(reset);
      } else {
        toast.error(r.message);
        for (const [k, v] of Object.entries(r.fieldErrors ?? {})) {
          form.setError(k as Path<V>, { message: v });
        }
      }
    }),
  );
  return { pending, onSubmit };
}

type TrialValues = z.input<typeof extendTrialSchema>;

export function ExtendTrialForm({
  accountId,
  current,
}: {
  accountId: string;
  current: string | null;
}) {
  const blank: TrialValues = { trialEndsOn: "", reason: "" };
  const form = useForm<TrialValues>({
    resolver: zodResolver(extendTrialSchema),
    defaultValues: blank,
  });
  const { errors } = form.formState;
  const { pending, onSubmit } = useActionForm(
    form,
    (v) => extendTrialAction(accountId, v),
    "Trial extended ✓",
    blank,
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <p className="text-muted-foreground">
        The account gets Premium free until the end of the day you choose.
        {current ? " It replaces the current end date." : ""}
      </p>
      <Field
        id="trialEndsOn"
        label="Last day of the trial"
        required
        error={errors.trialEndsOn?.message}
      >
        <Controller
          control={form.control}
          name="trialEndsOn"
          render={({ field }) => (
            <DateInput {...fieldAria("trialEndsOn", errors.trialEndsOn?.message)} {...field} />
          )}
        />
      </Field>
      <Field id="trialReason" label="Why" required error={errors.reason?.message}>
        <Input
          {...fieldAria("trialReason", errors.reason?.message)}
          placeholder="e.g. Still importing their units"
          {...form.register("reason")}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Extend trial
      </Button>
    </form>
  );
}

type PaymentValues = z.input<typeof manualPaymentSchema>;

export function ManualPaymentForm({ accountId }: { accountId: string }) {
  const blank: PaymentValues = { amount: "", paidUntil: "", reference: "", note: "" };
  const form = useForm<PaymentValues>({
    resolver: zodResolver(manualPaymentSchema),
    defaultValues: blank,
  });
  const { errors } = form.formState;
  const { pending, onSubmit } = useActionForm(
    form,
    (v) => recordManualPaymentAction(accountId, v),
    "Payment recorded ✓",
    blank,
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <p className="text-muted-foreground">
        For annual or corporate customers who pay by bank transfer. This is a record for Propfolio,
        not an official receipt.
      </p>
      <Field id="amount" label="Amount received" required error={errors.amount?.message}>
        <MoneyInput {...fieldAria("amount", errors.amount?.message)} {...form.register("amount")} />
      </Field>
      <Field id="paidUntil" label="Paid until" required error={errors.paidUntil?.message}>
        <Controller
          control={form.control}
          name="paidUntil"
          render={({ field }) => (
            <DateInput {...fieldAria("paidUntil", errors.paidUntil?.message)} {...field} />
          )}
        />
      </Field>
      <Field id="reference" label="Bank reference" required error={errors.reference?.message}>
        <Input
          {...fieldAria("reference", errors.reference?.message)}
          {...form.register("reference")}
        />
      </Field>
      <Field id="note" label="Note" error={errors.note?.message}>
        <Textarea
          rows={2}
          {...fieldAria("note", errors.note?.message)}
          {...form.register("note")}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Record payment
      </Button>
    </form>
  );
}

export function SuspendButton({
  accountId,
  suspended,
  name,
}: {
  accountId: string;
  suspended: boolean;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (suspended) {
    return (
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setAccountSuspendedAction(accountId, false, {});
            if (r.ok) toast.success(`${name} can sign in again ✓`);
            else toast.error(r.message);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
        Reactivate account
      </Button>
    );
  }
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Ban aria-hidden /> Suspend account
      </Button>
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={`Suspend ${name}?`}
        description="Nobody in this account can sign in until you reactivate it, and their reminder emails stop. Nothing is deleted."
        confirmLabel="Suspend account"
        done="Account suspended"
        placeholder="e.g. Unpaid for 2 months after reminders"
        onConfirm={(reason) => setAccountSuspendedAction(accountId, true, { reason })}
      />
    </>
  );
}
