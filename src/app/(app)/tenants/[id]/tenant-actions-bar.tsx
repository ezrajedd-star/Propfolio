"use client";

import { Archive, ArchiveRestore, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { TenantFields } from "@/components/app/tenant-fields";
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
import { useActionForm } from "@/hooks/use-action-form";
import { updateTenantSchema } from "@/schemas/tenant";
import type { z } from "zod";
import { archiveTenantAction, updateTenantAction } from "../actions";

type Values = z.input<typeof updateTenantSchema>;

export function TenantActionsBar({
  tenantId,
  values,
  archived,
  canEdit,
  canArchive,
}: {
  tenantId: string;
  values: Values;
  archived: boolean;
  canEdit: boolean;
  canArchive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const {
    form,
    error,
    pending: saving,
    onSubmit,
    errors,
  } = useActionForm(updateTenantSchema, values, async (v) => {
    const r = await updateTenantAction(tenantId, v);
    if (r.ok) {
      toast.success("Saved ✓");
      setOpen(false);
    }
    return r;
  });

  const archive = (to: boolean) =>
    startTransition(async () => {
      const r = await archiveTenantAction(tenantId, to);
      if (!r.ok) return void toast.error(r.message);
      toast.success(to ? "Tenant archived" : "Tenant restored ✓", {
        action: to ? { label: "Undo", onClick: () => archive(false) } : undefined,
      });
      router.refresh();
    });

  return (
    <>
      {canArchive ? (
        archived ? (
          <Button variant="outline" onClick={() => archive(false)} disabled={pending}>
            <ArchiveRestore aria-hidden /> Restore
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => archive(true)} disabled={pending}>
            <Archive aria-hidden /> Archive
          </Button>
        )
      ) : null}
      {canEdit && !archived ? (
        <Button
          onClick={() => {
            form.reset(values);
            setOpen(true);
          }}
        >
          <Pencil aria-hidden /> Edit details
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit tenant details</DialogTitle>
            <DialogDescription>
              Changes are logged. Property Management only ever sees the display name.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate className="space-y-6">
            {error ? <FormAlert>{error}</FormAlert> : null}
            <TenantFields register={form.register} errors={errors} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
