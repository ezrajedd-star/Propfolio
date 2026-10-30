"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { describeUnitList, expandUnitNumbers } from "@/domain/property/unit-numbers";
import { addUnitsAction } from "../../property-actions";

/** Add many units at once, e.g. after buying a building: "101 to 120", "G-01 to G-12". */
export function BulkUnitsDialog({
  buildingId,
  unitTypes,
  open,
  onOpenChange,
}: {
  buildingId: string;
  unitTypes: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [unitTypeId, setUnitTypeId] = useState(unitTypes[0]?.id ?? "");
  const [floor, setFloor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const preview = text.trim() ? expandUnitNumbers(text) : null;
  const count = preview?.ok ? preview.numbers.length : 0;

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await addUnitsAction({ buildingId, unitTypeId, unitNumbers: text, floor });
      if (!r.ok) {
        setError(r.fieldErrors?.unitNumbers ?? r.message);
        return;
      }
      const { created, skipped } = r.data;
      toast.success(
        `${created.length} unit${created.length === 1 ? "" : "s"} added ✓` +
          (skipped.length ? ` · ${skipped.length} already existed and were skipped` : ""),
      );
      setText("");
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add several units</DialogTitle>
          <DialogDescription>
            For a new building or floor. Type unit numbers one per line or separated by commas, or a
            range like <b>101 to 120</b> or <b>G-01 to G-12</b>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="space-y-2">
            <Label htmlFor="bulk-numbers">Unit numbers</Label>
            <Textarea
              id="bulk-numbers"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"101 to 120\n201 to 220\nPenthouse"}
              aria-describedby="bulk-preview"
            />
            <p id="bulk-preview" className="min-h-6 text-sm" aria-live="polite">
              {preview === null ? (
                <span className="text-muted-foreground">Nothing typed yet.</span>
              ) : preview.ok ? (
                <span>
                  <b>
                    {count} unit{count === 1 ? "" : "s"}:
                  </b>{" "}
                  {describeUnitList(preview.numbers)}
                </span>
              ) : (
                <span className="text-destructive font-medium">{preview.error}</span>
              )}
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-type">Unit type (for all of them)</Label>
              <NativeSelect
                id="bulk-type"
                value={unitTypeId}
                onChange={(e) => setUnitTypeId(e.target.value)}
              >
                {unitTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-floor">Floor (optional)</Label>
              <Input
                id="bulk-floor"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                placeholder="e.g. 2F"
              />
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            Units the building already has are skipped. Add floor areas and notes later by editing
            each unit.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !preview?.ok}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {count ? `Add ${count} unit${count === 1 ? "" : "s"}` : "Add units"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
