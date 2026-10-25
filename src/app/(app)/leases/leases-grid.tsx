"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  CircleCheck,
  Clock,
  MailCheck,
  MinusCircle,
  TriangleAlert,
  Columns3,
  Download,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { LeaseStatusBadge } from "@/components/app/lease-badges";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { GRID_COLUMNS, type GridColumnId, type GridLayout } from "@/domain/leases/grid-columns";
import { LEASE_STATUSES } from "@/domain/leases/status";
import { formatPeso } from "@/domain/money/money";
import { formatIsoDate } from "@/domain/time/manila";
import { cn } from "@/lib/utils";
import type { LeaseRow } from "@/server/leases/service";
import { archiveLeasesAction, quickEditLeaseAction, saveGridLayoutAction } from "./actions";
import { ColumnsDialog } from "./columns-dialog";
import { EditableCell } from "./editable-cell";

type Field = "remarks" | "rentDueDay" | "contactPerson";

const SORTABLE = new Set<GridColumnId>([
  "refNo",
  "building",
  "unit",
  "unitType",
  "tenant",
  "startDate",
  "endDate",
  "daysLeft",
  "monthlyRent",
  "rentDueDay",
  "status",
]);
const STATUS_ORDER = Object.fromEntries(LEASE_STATUSES.map((s, i) => [s, i]));

export function LeasesGrid({
  rows: initialRows,
  layout: initialLayout,
  exportQuery,
  can,
}: {
  rows: LeaseRow[];
  layout: GridLayout;
  /** The page's current filters as a query string, reused for export. */
  exportQuery: string;
  can: { edit: boolean; editTenant: boolean; archive: boolean; export: boolean };
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);
  const [layout, setLayout] = useState(initialLayout);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, startTransition] = useTransition();

  // Remember the layout for this user (debounced).
  const firstLayout = useRef(true);
  useEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    const t = setTimeout(() => void saveGridLayoutAction(layout), 600);
    return () => clearTimeout(t);
  }, [layout]);

  /** Save one in-line edit, then offer Undo for a few seconds. */
  const save = async (row: LeaseRow, field: Field, raw: string) => {
    const r = await quickEditLeaseAction(row.id, { field, value: raw });
    if (!r.ok) return { ok: false, message: r.fieldErrors?.value ?? r.message };
    const apply = (value: string | number | null) =>
      setRows((cur) =>
        cur.map((x) => {
          if (field === "contactPerson")
            return x.tenant.id === row.tenant.id
              ? { ...x, tenant: { ...x.tenant, contactPerson: value as string | null } }
              : x;
          return x.id === row.id ? { ...x, [field]: value } : x;
        }),
      );
    apply(r.data.value);
    toast.success("Saved ✓", {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: async () => {
          const u = await quickEditLeaseAction(row.id, { field, value: r.data.previous ?? "" });
          if (u.ok) {
            apply(u.data.value);
            toast.success("Change undone");
          } else toast.error(u.message);
        },
      },
    });
    return { ok: true };
  };

  const columns = useMemo<ColumnDef<LeaseRow>[]>(() => {
    const defs: Record<GridColumnId, ColumnDef<LeaseRow>> = {
      refNo: {
        id: "refNo",
        accessorFn: (r) => r.refNo,
        cell: ({ row }) => (
          <Link
            href={`/leases/${row.original.id}`}
            className="text-primary inline-flex min-h-10 items-center font-medium whitespace-nowrap hover:underline"
          >
            {row.original.refNo}
          </Link>
        ),
      },
      building: { id: "building", accessorFn: (r) => r.building.name },
      unit: { id: "unit", accessorFn: (r) => r.unit.unitNumber, sortingFn: "alphanumeric" },
      unitType: { id: "unitType", accessorFn: (r) => r.unitType.name },
      tenant: { id: "tenant", accessorFn: (r) => r.tenant.displayName },
      contactPerson: {
        id: "contactPerson",
        accessorFn: (r) => r.tenant.contactPerson,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.tenant.contactPerson}
            label={`contact person for ${row.original.tenant.displayName}`}
            disabled={!can.editTenant || row.original.archived}
            onSave={(v) => save(row.original, "contactPerson", v)}
          />
        ),
      },
      startDate: {
        id: "startDate",
        accessorFn: (r) => r.startDate,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatIsoDate(row.original.startDate)}</span>
        ),
      },
      endDate: {
        id: "endDate",
        accessorFn: (r) => r.terminationDate ?? r.endDate,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {formatIsoDate(row.original.terminationDate ?? row.original.endDate)}
          </span>
        ),
      },
      daysLeft: {
        id: "daysLeft",
        accessorFn: (r) => r.daysLeft,
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.timeLeft}</span>,
      },
      monthlyRent: {
        id: "monthlyRent",
        accessorFn: (r) => Number(r.monthlyRent),
        cell: ({ row }) => (
          <span className="block text-right whitespace-nowrap tabular-nums">
            {formatPeso(row.original.monthlyRent)}
          </span>
        ),
      },
      rentDueDay: {
        id: "rentDueDay",
        accessorFn: (r) => r.rentDueDay,
        cell: ({ row }) => (
          <EditableCell
            kind="day"
            value={row.original.rentDueDay}
            label={`rent due day for ${row.original.refNo}`}
            disabled={!can.edit || row.original.archived || row.original.status === "TERMINATED"}
            onSave={(v) => save(row.original, "rentDueDay", v)}
          />
        ),
      },
      balanceDue: {
        id: "balanceDue",
        accessorFn: () => null,
        cell: () => (
          <span className="text-muted-foreground" title="Available once payments are added">
            —
          </span>
        ),
      },
      status: {
        id: "status",
        accessorFn: (r) => r.status,
        sortingFn: (a, b) => STATUS_ORDER[a.original.status]! - STATUS_ORDER[b.original.status]!,
        cell: ({ row }) => <LeaseStatusBadge status={row.original.status} />,
      },
      reminderStatus: {
        id: "reminderStatus",
        accessorFn: (r) => r.reminder?.label ?? null,
        cell: ({ row }) => <ReminderStatusCell summary={row.original.reminder} />,
      },
      remarks: {
        id: "remarks",
        accessorFn: (r) => r.remarks,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.remarks}
            label={`remarks for ${row.original.refNo}`}
            disabled={!can.edit || row.original.archived}
            onSave={(v) => save(row.original, "remarks", v)}
          />
        ),
      },
    };
    const visible = layout.order
      .filter((id) => !layout.hidden.includes(id))
      .map((id) => ({
        ...defs[id],
        header: GRID_COLUMNS.find((c) => c.id === id)!.label,
        enableSorting: SORTABLE.has(id),
      }));
    return [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all leases"
            checked={
              table.getIsAllRowsSelected()
                ? true
                : table.getIsSomeRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select ${row.original.refNo}`}
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(v === true)}
          />
        ),
        enableSorting: false,
      },
      ...visible,
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowMenu
            row={row.original}
            can={can}
            onArchive={(to) => archive([row.original.id], to)}
          />
        ),
        enableSorting: false,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, can]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, rowSelection: selection },
    getRowId: (r) => r.id,
    // Plain text cells stay on one line; the grid scrolls sideways instead of growing tall.
    defaultColumn: {
      cell: (ctx) => <span className="whitespace-nowrap">{String(ctx.getValue() ?? "—")}</span>,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedIds = Object.keys(selection).filter((k) => selection[k]);
  const visibleCols = layout.order.filter((id) => !layout.hidden.includes(id));
  const exportHref = (format: "xlsx" | "csv", ids?: string[]) => {
    const p = new URLSearchParams(exportQuery);
    p.set("format", format);
    p.set("columns", visibleCols.join(","));
    if (ids?.length) p.set("ids", ids.join(","));
    return `/api/v1/leases/export?${p.toString()}`;
  };

  const archive = (ids: string[], to: boolean) =>
    startTransition(async () => {
      const r = await archiveLeasesAction(ids, to);
      if (!r.ok) return void toast.error(r.message);
      const { done, failed } = r.data;
      setSelection({});
      if (done.length) {
        toast.success(
          to
            ? `${done.length} lease${done.length === 1 ? "" : "s"} archived`
            : `${done.length} restored ✓`,
          {
            duration: 8000,
            action: to ? { label: "Undo", onClick: () => archive(done, false) } : undefined,
          },
        );
      }
      for (const f of failed)
        toast.error(`${rows.find((x) => x.id === f.id)?.refNo ?? "A lease"}: ${f.message}`);
      router.refresh();
    });

  // Group rows by building (after sorting) when asked.
  const sortedRows = table.getRowModel().rows;
  const groups = layout.groupByBuilding
    ? [
        ...sortedRows.reduce(
          (m, r) =>
            m.set(r.original.building.name, [...(m.get(r.original.building.name) ?? []), r]),
          new Map<string, typeof sortedRows>(),
        ),
      ].sort(([a], [b]) => a.localeCompare(b))
    : [["", sortedRows] as const];

  return (
    <div className="space-y-3">
      {/* Grid controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setColumnsOpen(true)}>
          <Columns3 aria-hidden /> Columns
        </Button>
        <div className="flex h-11 items-center gap-2">
          <Switch
            id="group-building"
            checked={layout.groupByBuilding}
            onCheckedChange={(v) => setLayout({ ...layout, groupByBuilding: v })}
          />
          <Label htmlFor="group-building" className="font-normal">
            Group by building
          </Label>
        </div>
        <div className="flex-1" />
        {can.export ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download aria-hidden /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{rows.length} leases in this view</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a href={exportHref("xlsx")}>Excel (.xlsx)</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={exportHref("csv")}>CSV</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {/* Bulk actions: only export and archive (brief §5.3) */}
      {selectedIds.length > 0 ? (
        <div
          role="region"
          aria-label="Selected leases"
          className="border-primary/30 bg-primary-soft/60 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2"
        >
          <span className="font-medium">{selectedIds.length} selected</span>
          {can.export ? (
            <Button asChild variant="outline" size="sm">
              <a href={exportHref("xlsx", selectedIds)}>
                <Download aria-hidden /> Export selected
              </a>
            </Button>
          ) : null}
          {can.archive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmArchive(true)}
              disabled={pending}
            >
              <Archive aria-hidden /> Archive selected
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setSelection({})}>
            <X aria-hidden /> Clear selection
          </Button>
        </div>
      ) : null}

      <div className="bg-card overflow-x-auto rounded-xl border shadow-sm">
        <table className="w-full text-base">
          <thead className="bg-card sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                      className={cn(
                        "text-muted-foreground h-11 px-3 text-left text-sm font-semibold whitespace-nowrap",
                        h.column.id === "select" && "w-10",
                        h.column.id === "monthlyRent" && "text-right",
                      )}
                    >
                      {h.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="hover:text-foreground inline-flex min-h-10 items-center gap-1"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp className="size-4" aria-hidden />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-4" aria-hidden />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {groups.map(([name, groupRows]) => (
              <Fragment key={name || "all"}>
                {name ? (
                  <tr className="bg-muted/60">
                    <th
                      scope="colgroup"
                      colSpan={columns.length}
                      className="px-3 py-2 text-left font-semibold"
                    >
                      {name}{" "}
                      <span className="text-muted-foreground font-normal">
                        · {groupRows.length}
                      </span>
                    </th>
                  </tr>
                ) : null}
                {groupRows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "hover:bg-muted/40 border-b last:border-0",
                      row.getIsSelected() && "bg-primary-soft/40",
                      row.original.archived && "text-muted-foreground",
                    )}
                  >
                    {row.getVisibleCells().map((c) => (
                      <td key={c.id} className="px-3 py-1.5 align-middle">
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <ColumnsDialog
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        layout={layout}
        onChange={setLayout}
      />

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive {selectedIds.length} lease{selectedIds.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Archived leases are hidden from lists and the calendar, and their units become free
              for those dates. Nothing is deleted; you can restore them from &ldquo;Show
              archived&rdquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={() => archive(selectedIds, true)}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const REMINDER_ICONS = {
  HANDLED: CircleCheck,
  STOPPED: MinusCircle,
  SENT: MailCheck,
  SCHEDULED: Clock,
  FAILED: TriangleAlert,
  NONE: MinusCircle,
} as const;

/** Reminder status with an icon (never colour alone). */
function ReminderStatusCell({ summary }: { summary: LeaseRow["reminder"] }) {
  if (!summary) return <span className="text-muted-foreground">—</span>;
  const Icon = REMINDER_ICONS[summary.state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        summary.state === "FAILED" && "text-danger font-medium",
        summary.state === "HANDLED" && "text-success",
        (summary.state === "STOPPED" || summary.state === "NONE") && "text-muted-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {summary.label}
    </span>
  );
}

/** The visible "⋯" menu on each row. */
function RowMenu({
  row,
  can,
  onArchive,
}: {
  row: LeaseRow;
  can: { edit: boolean; archive: boolean };
  onArchive: (archived: boolean) => void;
}) {
  const live = !row.archived && row.status !== "TERMINATED";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${row.refNo}`}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/leases/${row.id}`}>
            <ExternalLink /> View
          </Link>
        </DropdownMenuItem>
        {can.edit && live ? (
          <DropdownMenuItem asChild>
            <Link href={`/leases/${row.id}/edit`}>
              <Pencil /> Edit dates, rent or terms
            </Link>
          </DropdownMenuItem>
        ) : null}
        {can.edit && live && row.status !== "RENEWED" ? (
          <DropdownMenuItem asChild>
            <Link href={`/leases/${row.id}/renew`}>
              <RefreshCw /> Renew
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled>
          <Wallet /> Record payment (coming soon)
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/calendar?date=${row.terminationDate ?? row.endDate}`}>
            <CalendarDays /> Show on calendar
          </Link>
        </DropdownMenuItem>
        {can.archive ? (
          <>
            <DropdownMenuSeparator />
            {row.archived ? (
              <DropdownMenuItem onSelect={() => onArchive(false)}>
                <ArchiveRestore /> Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onArchive(true)}>
                <Archive /> Archive
              </DropdownMenuItem>
            )}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
