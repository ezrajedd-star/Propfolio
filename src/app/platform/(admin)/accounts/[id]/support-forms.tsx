"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LifeBuoy, Loader2, LockOpen } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { ReasonDialog } from "@/components/app/reason-dialog";
import { Field, fieldAria } from "@/components/form/field";
import { useActionForm } from "@/components/platform/use-action-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  IDENTITY_CHECK_LABELS,
  IDENTITY_CHECK_METHODS,
  billingDetailsSchema,
  resetTwoStepSupportSchema,
} from "@/schemas/platform";
import {
  correctBillingDetailsAction,
  openSupportModeAction,
  resetTwoStepAction,
  unlockUserAction,
} from "../../../actions";

export function OpenSupportModeButton({ accountId }: { accountId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await openSupportModeAction(accountId);
          if (r && !r.ok) toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LifeBuoy aria-hidden />}
      Open their app in support mode
    </Button>
  );
}

export function UnlockUserButton({
  accountId,
  userId,
  name,
}: {
  accountId: string;
  userId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <LockOpen aria-hidden /> Unlock
      </Button>
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={`Unlock ${name}?`}
        description="They can try their password again straight away. Goes in the staff log and the customer's audit log."
        confirmLabel="Unlock"
        done={`${name} is unlocked ✓`}
        placeholder="e.g. Ticket 1042: locked out after a typo"
        onConfirm={(reason) => unlockUserAction(accountId, userId, { reason })}
      />
    </>
  );
}

type ResetValues = z.input<typeof resetTwoStepSupportSchema>;

export function ResetTwoStepButton({
  accountId,
  userId,
  name,
}: {
  accountId: string;
  userId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const blank: ResetValues = { reason: "", identityMethod: "VIDEO_CALL_ID", identityNotes: "" };
  const form = useForm<ResetValues>({
    resolver: zodResolver(resetTwoStepSupportSchema),
    defaultValues: blank,
  });
  const { errors } = form.formState;
  const { pending, onSubmit } = useActionForm(
    form,
    (v) => resetTwoStepAction(accountId, userId, v),
    `${name}'s two-step sign-in is reset ✓`,
    blank,
    () => setOpen(false),
  );
  const id = `reset-${userId}`;
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <KeyRound aria-hidden /> Reset two-step
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset {name}&apos;s two-step sign-in?</DialogTitle>
            <DialogDescription>
              Only after checking who they are. They are signed out and set it up again at their
              next sign-in. Your check is recorded.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field
              id={`${id}-method`}
              label="How did you check who they are?"
              required
              error={errors.identityMethod?.message}
            >
              <NativeSelect id={`${id}-method`} {...form.register("identityMethod")}>
                {IDENTITY_CHECK_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {IDENTITY_CHECK_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id={`${id}-notes`}
              label="What you checked"
              required
              error={errors.identityNotes?.message}
            >
              <Textarea
                {...fieldAria(`${id}-notes`, errors.identityNotes?.message)}
                placeholder="e.g. Driver's licence, name and photo matched; Owner Maria confirmed by phone"
                {...form.register("identityNotes")}
              />
            </Field>
            <Field id={`${id}-reason`} label="Why" required error={errors.reason?.message}>
              <Input
                {...fieldAria(`${id}-reason`, errors.reason?.message)}
                placeholder="e.g. Ticket 1043: lost phone"
                {...form.register("reason")}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Reset two-step
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type BillingValues = z.input<typeof billingDetailsSchema>;

export function BillingDetailsForm({
  accountId,
  name,
  address,
}: {
  accountId: string;
  name: string;
  address: string;
}) {
  const initial: BillingValues = { name, address, reason: "" };
  const form = useForm<BillingValues>({
    resolver: zodResolver(billingDetailsSchema),
    defaultValues: initial,
  });
  const { errors } = form.formState;
  const { pending, onSubmit } = useActionForm(
    form,
    (v) => correctBillingDetailsAction(accountId, v),
    "Billing details corrected ✓",
    initial,
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <p className="text-muted-foreground">
        Used on future payment records. Records already issued keep what they said.
      </p>
      <Field id="billName" label="Name on payment records" required error={errors.name?.message}>
        <Input {...fieldAria("billName", errors.name?.message)} {...form.register("name")} />
      </Field>
      <Field id="billAddress" label="Address" error={errors.address?.message}>
        <Textarea
          {...fieldAria("billAddress", errors.address?.message)}
          {...form.register("address")}
        />
      </Field>
      <Field
        id="billReason"
        label="Why it needs correcting"
        required
        error={errors.reason?.message}
      >
        <Input
          {...fieldAria("billReason", errors.reason?.message)}
          placeholder="e.g. Ticket 1044: new registered name"
          {...form.register("reason")}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Correct billing details
      </Button>
    </form>
  );
}
