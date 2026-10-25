"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import {
  DEFAULT_GRID_LAYOUT,
  GRID_COLUMNS,
  moveColumn,
  type GridColumnId,
  type GridLayout,
} from "@/domain/leases/grid-columns";

const label = (id: GridColumnId) => GRID_COLUMNS.find((c) => c.id === id)!.label;
const required = (id: GridColumnId) =>
  GRID_COLUMNS.some((c) => c.id === id && "required" in c && c.required);

/** Show, hide and reorder columns. Uses buttons (not drag and drop) so it works with a keyboard. */
export function ColumnsDialog({
  open,
  onOpenChange,
  layout,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: GridLayout;
  onChange: (layout: GridLayout) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Columns</DialogTitle>
          <DialogDescription>
            Choose which columns to show and their order. Your choice is remembered for you.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[55dvh] divide-y overflow-y-auto rounded-lg border">
          {layout.order.map((id, i) => {
            const shown = !layout.hidden.includes(id);
            return (
              <li key={id} className="flex items-center gap-3 px-3 py-1.5">
                <Checkbox
                  id={`col-${id}`}
                  checked={shown}
                  disabled={required(id)}
                  onCheckedChange={(v) =>
                    onChange({
                      ...layout,
                      hidden:
                        v === true ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id],
                    })
                  }
                />
                <Label htmlFor={`col-${id}`} className="flex-1 font-normal">
                  {label(id)}
                  {required(id) ? (
                    <span className="text-muted-foreground text-sm"> (always shown)</span>
                  ) : null}
                </Label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${label(id)} up`}
                  disabled={i === 0}
                  onClick={() => onChange({ ...layout, order: moveColumn(layout.order, id, -1) })}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${label(id)} down`}
                  disabled={i === layout.order.length - 1}
                  onClick={() => onChange({ ...layout, order: moveColumn(layout.order, id, 1) })}
                >
                  <ArrowDown aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() =>
              onChange({ ...DEFAULT_GRID_LAYOUT, groupByBuilding: layout.groupByBuilding })
            }
          >
            Reset to default
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
