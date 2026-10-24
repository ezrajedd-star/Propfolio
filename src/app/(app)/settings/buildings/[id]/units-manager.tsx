"use client";

import {
  Archive,
  ArchiveRestore,
  DoorOpen,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/app/empty-state";
import { OccupancyBadge } from "@/components/app/lease-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UnitSummary } from "@/server/property/units";
import { archiveUnitAction } from "../../property-actions";
import { UnitDialog } from "./unit-dialog";

export function UnitsManager({
  buildingId,
  units,
  unitTypes,
}: {
  buildingId: string;
  units: UnitSummary[];
  unitTypes: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState<UnitSummary | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const archive = (u: UnitSummary, archived: boolean) =>
    startTransition(async () => {
      const r = await archiveUnitAction(u.id, archived);
      if (!r.ok) return void toast.error(r.message);
      toast.success(
        archived ? `Unit ${u.unitNumber} archived` : `Unit ${u.unitNumber} restored ✓`,
        {
          action: archived ? { label: "Undo", onClick: () => archive(u, false) } : undefined,
        },
      );
    });

  const addButton = (
    <Button onClick={() => setEditing("new")} disabled={unitTypes.length === 0}>
      <Plus aria-hidden /> Add unit
    </Button>
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Units</h2>
        {addButton}
      </div>
      {unitTypes.length === 0 ? (
        <p className="text-muted-foreground mb-4">
          First add at least one{" "}
          <Link href="/settings/unit-types" className="text-primary underline">
            unit type
          </Link>
          .
        </p>
      ) : null}
      {units.length === 0 ? (
        <EmptyState icon={DoorOpen} title="No units in this building yet" action={addButton}>
          Add each office, shop, apartment or warehouse that can be leased.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Unit</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Floor</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Occupancy</TableHead>
                <TableHead className="w-16">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((u) => (
                <TableRow key={u.id} className={u.archived ? "text-muted-foreground" : undefined}>
                  <TableCell className="font-medium">
                    <Link href={`/units/${u.id}`} className="hover:underline">
                      {u.unitNumber}
                    </Link>
                    {u.isStandalone ? (
                      <span className="text-muted-foreground ml-2 text-sm">(standalone)</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{u.unitType.name}</TableCell>
                  <TableCell>{u.floor ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">
                    {u.floorArea ? `${Number(u.floorArea).toLocaleString("en-PH")} sqm` : "—"}
                  </TableCell>
                  <TableCell>
                    {u.archived ? (
                      <Badge variant="neutral">Archived</Badge>
                    ) : (
                      <OccupancyBadge occupancy={u.occupancy} />
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for unit ${u.unitNumber}`}
                          disabled={pending}
                        >
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/units/${u.id}`}>
                            <ExternalLink /> View unit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEditing(u)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {u.archived ? (
                          <DropdownMenuItem onSelect={() => archive(u, false)}>
                            <ArchiveRestore /> Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => archive(u, true)}>
                            <Archive /> Archive
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {editing ? (
        <UnitDialog
          buildingId={buildingId}
          unitTypes={unitTypes}
          unit={
            editing === "new"
              ? null
              : {
                  id: editing.id,
                  buildingId,
                  unitNumber: editing.unitNumber,
                  unitTypeId: editing.unitType.id,
                  floor: editing.floor ?? "",
                  floorArea: editing.floorArea ?? "",
                  isStandalone: editing.isStandalone,
                  statusOverride: editing.statusOverride,
                  notes: editing.notes ?? "",
                }
          }
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      ) : null}
    </>
  );
}
