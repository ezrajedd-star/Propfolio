"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useActionForm } from "@/hooks/use-action-form";
import {
  BUILDING_TYPES,
  BUILDING_TYPE_LABELS,
  buildingSchema,
  type BuildingInput,
} from "@/schemas/property";
import { saveBuildingAction } from "../property-actions";

export function BuildingDialog({
  building,
  open,
  onOpenChange,
}: {
  building: (BuildingInput & { id: string }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { form, error, pending, onSubmit, errors } = useActionForm(
    buildingSchema,
    building ?? { name: "", code: "", address: "", type: "COMMERCIAL", notes: "" },
    async (values) => {
      const result = await saveBuildingAction(building?.id ?? null, values);
      if (result.ok) {
        toast.success(building ? "Saved ✓" : "Building added ✓");
        onOpenChange(false);
        if (!building) router.push(`/settings/buildings/${result.data.id}`);
      }
      return result;
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{building ? `Edit ${building.name}` : "Add a building"}</DialogTitle>
          <DialogDescription>
            {building
              ? "Changes apply everywhere the building appears."
              : "You can add its units on the next screen."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field id="name" label="Building name" required error={errors.name?.message}>
            <Input {...fieldAria("name", errors.name?.message)} {...form.register("name")} />
          </Field>
          <Field
            id="code"
            label="Short code"
            required
            help="A short label used in lists, like TWR1 or WH-A. Letters, numbers and dashes."
            error={errors.code?.message}
          >
            <Input
              {...fieldAria("code", errors.code?.message)}
              className="uppercase"
              maxLength={12}
              {...form.register("code")}
            />
          </Field>
          <Field id="type" label="Type" required error={errors.type?.message}>
            <NativeSelect {...fieldAria("type", errors.type?.message)} {...form.register("type")}>
              {BUILDING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BUILDING_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="address" label="Address" required error={errors.address?.message}>
            <Textarea
              {...fieldAria("address", errors.address?.message)}
              rows={2}
              {...form.register("address")}
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
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {building ? "Save changes" : "Add building"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
