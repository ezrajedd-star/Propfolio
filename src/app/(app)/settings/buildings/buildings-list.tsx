"use client";

import {
  Archive,
  ArchiveRestore,
  Building2,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/app/empty-state";
import { OccupancyBar } from "@/components/app/occupancy-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BUILDING_TYPE_LABELS } from "@/schemas/property";
import type { BuildingSummary } from "@/server/property/buildings";
import { archiveBuildingAction } from "../property-actions";
import { BuildingDialog } from "./building-dialog";

export function BuildingsList({ buildings }: { buildings: BuildingSummary[] }) {
  const [editing, setEditing] = useState<BuildingSummary | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const archive = (b: BuildingSummary, archived: boolean) =>
    startTransition(async () => {
      const r = await archiveBuildingAction(b.id, archived);
      if (!r.ok) return void toast.error(r.message);
      toast.success(archived ? `${b.name} archived` : `${b.name} restored ✓`, {
        action: archived ? { label: "Undo", onClick: () => archive(b, false) } : undefined,
      });
    });

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button onClick={() => setEditing("new")} data-guide="building-add">
          <Plus aria-hidden /> Add building
        </Button>
      </div>
      {buildings.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No buildings yet"
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus aria-hidden /> Add your first building
            </Button>
          }
        >
          Add a building, then its units. Leases are created for units.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" data-guide="building-list">
          {buildings.map((b) => (
            <li key={b.id} className="bg-card rounded-xl border p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/settings/buildings/${b.id}`}
                    className="text-lg font-semibold hover:underline"
                  >
                    {b.name}
                  </Link>
                  <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">{b.code}</Badge>
                    {BUILDING_TYPE_LABELS[b.type]}
                    {b.archived ? <Badge variant="neutral">Archived</Badge> : null}
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-sm">{b.address}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for ${b.name}`}
                      disabled={pending}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(b)}>
                      <Pencil /> Edit details
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/settings/buildings/${b.id}`}>
                        <Building2 /> Manage units
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {b.archived ? (
                      <DropdownMenuItem onSelect={() => archive(b, false)}>
                        <ArchiveRestore /> Restore
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => archive(b, true)}>
                        <Archive /> Archive
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-4">
                <OccupancyBar counts={b.occupancy} />
              </div>
              <Link
                href={`/settings/buildings/${b.id}`}
                className="text-primary mt-4 inline-flex h-10 items-center gap-1 font-medium hover:underline"
              >
                {b.occupancy.total} unit{b.occupancy.total === 1 ? "" : "s"}{" "}
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <BuildingDialog
          building={editing === "new" ? null : { ...editing, notes: editing.notes ?? "" }}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      ) : null}
    </>
  );
}
