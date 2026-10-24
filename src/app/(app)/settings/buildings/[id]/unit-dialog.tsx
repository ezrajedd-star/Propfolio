"use client";

import { Loader2 } from "lucide-react";
import { Controller } from "react-hook-form";
import { toast } from "sonner";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { OCCUPANCY_LABELS } from "@/domain/leases/occupancy";
import { useActionForm } from "@/hooks/use-action-form";
import { unitSchema, type UnitInput } from "@/schemas/property";
import { saveUnitAction } from "../../property-actions";

export function UnitDialog({
  unit,
  buildingId,
  unitTypes,
  open,
  onOpenChange,
}: {
  unit: (UnitInput & { id: string }) | null;
  buildingId: string;
  unitTypes: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { form, error, pending, onSubmit, errors } = useActionForm(
    unitSchema,
    unit ?? {
      buildingId,
      unitNumber: "",
      unitTypeId: unitTypes[0]?.id ?? "",
      floor: "",
      floorArea: "",
      isStandalone: false,
      statusOverride: null,
      notes: "",
    },
    async (values) => {
      const result = await saveUnitAction(unit?.id ?? null, values);
      if (result.ok) {
        toast.success(unit ? "Saved ✓" : `Unit ${values.unitNumber} added ✓`);
        if (unit) onOpenChange(false);
        else form.reset({ ...values, unitNumber: "", notes: "" });
      }
      return result;
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{unit ? `Edit unit ${unit.unitNumber}` : "Add a unit"}</DialogTitle>
          <DialogDescription>
            {unit
              ? "Occupancy is worked out from leases automatically."
              : "After saving, the form stays open so you can add the next unit."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="unitNumber"
              label="Unit number or name"
              required
              error={errors.unitNumber?.message}
            >
              <Input
                {...fieldAria("unitNumber", errors.unitNumber?.message)}
                autoFocus
                {...form.register("unitNumber")}
              />
            </Field>
            <Field id="unitTypeId" label="Unit type" required error={errors.unitTypeId?.message}>
              <NativeSelect
                {...fieldAria("unitTypeId", errors.unitTypeId?.message)}
                {...form.register("unitTypeId")}
              >
                {unitTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="floor" label="Floor" error={errors.floor?.message}>
              <Input
                {...fieldAria("floor", errors.floor?.message)}
                placeholder="e.g. 12 or G"
                {...form.register("floor")}
              />
            </Field>
            <Field id="floorArea" label="Floor area (sqm)" error={errors.floorArea?.message}>
              <Input
                {...fieldAria("floorArea", errors.floorArea?.message)}
                inputMode="decimal"
                {...form.register("floorArea")}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="isStandalone"
              render={({ field }) => (
                <Checkbox
                  id="isStandalone"
                  checked={field.value ?? false}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              )}
            />
            <Label htmlFor="isStandalone" className="font-normal">
              Standalone structure (for example a warehouse)
            </Label>
          </div>
          <Field
            id="statusOverride"
            label="Availability"
            help="Use this only for units that can't be leased right now. A unit with a current lease always shows as Occupied."
          >
            <Controller
              control={form.control}
              name="statusOverride"
              render={({ field }) => (
                <NativeSelect
                  id="statusOverride"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                >
                  <option value="">Available to lease</option>
                  <option value="UNDER_RENOVATION">{OCCUPANCY_LABELS.UNDER_RENOVATION}</option>
                  <option value="UNAVAILABLE">{OCCUPANCY_LABELS.UNAVAILABLE}</option>
                </NativeSelect>
              )}
            />
          </Field>
          <Field id="notes" label="Notes" error={errors.notes?.message}>
            <Textarea
              {...fieldAria("notes", errors.notes?.message)}
              rows={2}
              {...form.register("notes")}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {unit ? "Cancel" : "Done"}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {unit ? "Save changes" : "Add unit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
