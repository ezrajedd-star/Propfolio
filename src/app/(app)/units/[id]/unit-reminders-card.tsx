"use client";

import { Loader2, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { isValidReminderConfig, ReminderEditor } from "@/components/app/reminder-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ReminderConfig, ReminderSource } from "@/domain/reminders/config";
import { describeConfig } from "@/domain/reminders/schedule";
import { saveUnitRemindersAction } from "@/app/(app)/settings/property-actions";

const SOURCE_TEXT: Record<ReminderSource, string> = {
  unit: "Set for this unit only",
  unitType: "From the unit type",
  system: "From the default settings",
};

export function UnitRemindersCard({
  unitId,
  unitTypeName,
  effective,
  source,
  inherited,
  canEdit,
}: {
  unitId: string;
  unitTypeName: string;
  effective: ReminderConfig;
  source: ReminderSource;
  /** What this unit would use without its own override. */
  inherited: ReminderConfig;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(effective);
  const [pending, startTransition] = useTransition();

  const save = (config: ReminderConfig | null, message: string) =>
    startTransition(async () => {
      const r = await saveUnitRemindersAction(unitId, { reminderConfig: config });
      if (!r.ok) return void toast.error(r.message);
      toast.success(message);
      setOpen(false);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminder settings</CardTitle>
        <CardDescription>
          {SOURCE_TEXT[source]}
          {source === "unitType" ? ` (${unitTypeName})` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>{describeConfig(effective)}</p>
        {canEdit ? (
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Pencil aria-hidden />{" "}
              {source === "unit" ? "Change override" : "Override for this unit"}
            </Button>
            {source === "unit" ? (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => save(null, "This unit now uses the unit type's settings ✓")}
              >
                Remove override
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reminders for this unit only</DialogTitle>
            <DialogDescription>
              Without an override this unit uses: {describeConfig(inherited)}. Future reminders for
              its leases will follow the new settings.
            </DialogDescription>
          </DialogHeader>
          <ReminderEditor value={value} onChange={setValue} idPrefix="unit" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !isValidReminderConfig(value)}
              onClick={() => save(value, "Reminder override saved ✓")}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Save override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
