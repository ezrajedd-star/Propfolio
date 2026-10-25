"use client";

import {
  Archive,
  ArchiveRestore,
  Ban,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller } from "react-hook-form";
import { toast } from "sonner";

import { DateInput } from "@/components/form/date-input";
import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { formatIsoDate } from "@/domain/time/manila";
import { useActionForm } from "@/hooks/use-action-form";
import { terminateLeaseSchema } from "@/schemas/lease";
import { archiveLeaseAction, terminateLeaseAction } from "../actions";

interface Props {
  leaseId: string;
  refNo: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  today: string;
  actions: {
    canEdit: boolean;
    canRenew: boolean;
    canTerminate: boolean;
    canArchive: boolean;
    canRestore: boolean;
  };
}

function TerminateDialog({
  open,
  onOpenChange,
  ...p
}: Props & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const defaultDate =
    p.today < p.startDate ? p.startDate : p.today > p.endDate ? p.endDate : p.today;
  const { form, error, pending, onSubmit, errors } = useActionForm(
    terminateLeaseSchema,
    { terminationDate: defaultDate, reason: "" },
    async (values) => {
      const r = await terminateLeaseAction(p.leaseId, values);
      if (r.ok) {
        toast.success(`${p.refNo} ended early`);
        onOpenChange(false);
      }
      return r;
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End this lease early?</DialogTitle>
          <DialogDescription>
            {p.tenantName}&apos;s lease ({p.refNo}) will end on the date you choose instead of{" "}
            {formatIsoDate(p.endDate)}. Expiry reminders stop. This is recorded in the history and
            can&apos;t be undone here.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field
            id="terminationDate"
            label="Last day of the lease"
            required
            error={errors.terminationDate?.message}
          >
            <Controller
              control={form.control}
              name="terminationDate"
              render={({ field }) => (
                <DateInput
                  {...fieldAria("terminationDate", errors.terminationDate?.message)}
                  min={p.startDate}
                  max={p.endDate}
                  {...field}
                />
              )}
            />
          </Field>
          <Field id="reason" label="Reason" required error={errors.reason?.message}>
            <Textarea
              {...fieldAria("reason", errors.reason?.message)}
              rows={3}
              placeholder="e.g. Tenant is relocating; mutual agreement"
              {...form.register("reason")}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Keep the lease
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              End lease early
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One obvious primary action (Renew) and the rest in a "More" menu. */
export function LeaseActions(p: Props) {
  const [terminating, setTerminating] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const a = p.actions;

  const archive = (to: boolean) =>
    startTransition(async () => {
      const r = await archiveLeaseAction(p.leaseId, to);
      if (!r.ok) return void toast.error(r.message);
      toast.success(to ? `${p.refNo} archived` : `${p.refNo} restored ✓`, {
        duration: 8000,
        action: to ? { label: "Undo", onClick: () => archive(false) } : undefined,
      });
      router.refresh();
    });

  const hasMenu = a.canEdit || a.canTerminate || a.canArchive || a.canRestore;
  return (
    <>
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={pending}>
              <MoreHorizontal aria-hidden /> More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {a.canEdit ? (
              <DropdownMenuItem asChild>
                <Link href={`/leases/${p.leaseId}/edit`}>
                  <Pencil /> Change dates, rent or terms
                </Link>
              </DropdownMenuItem>
            ) : null}
            {a.canTerminate ? (
              <DropdownMenuItem onSelect={() => setTerminating(true)}>
                <Ban /> End lease early
              </DropdownMenuItem>
            ) : null}
            {(a.canEdit || a.canTerminate) && (a.canArchive || a.canRestore) ? (
              <DropdownMenuSeparator />
            ) : null}
            {a.canArchive ? (
              <DropdownMenuItem onSelect={() => archive(true)}>
                <Archive /> Archive
              </DropdownMenuItem>
            ) : null}
            {a.canRestore ? (
              <DropdownMenuItem onSelect={() => archive(false)}>
                <ArchiveRestore /> Restore
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {a.canRenew ? (
        <Button asChild size="lg">
          <Link href={`/leases/${p.leaseId}/renew`} data-guide="lease-primary">
            <RefreshCw aria-hidden /> Renew lease
          </Link>
        </Button>
      ) : null}
      {terminating ? <TerminateDialog {...p} open onOpenChange={setTerminating} /> : null}
    </>
  );
}
