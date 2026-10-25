import ExcelJS from "exceljs";

import { GRID_COLUMNS, GRID_COLUMN_IDS, type GridColumnId } from "@/domain/leases/grid-columns";
import { LEASE_STATUS_LABELS } from "@/domain/leases/status";
import { toCsv } from "@/domain/export/csv";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import type { RequestMeta } from "@/server/request-meta";
import { listLeases, type LeaseFilters, type LeaseRow } from "./service";

export type ExportFormat = "xlsx" | "csv";

type Cell = string | number | Date | null;

/** Columns that can't be exported yet (the balance arrives with Payments). */
const NOT_YET: GridColumnId[] = ["balanceDue"];

function cell(row: LeaseRow, id: GridColumnId, forExcel: boolean): Cell {
  const date = (iso: string) => (forExcel ? new Date(`${iso}T00:00:00Z`) : formatIsoDate(iso));
  switch (id) {
    case "refNo":
      return row.refNo;
    case "building":
      return row.building.name;
    case "unit":
      return row.unit.unitNumber;
    case "unitType":
      return row.unitType.name;
    case "tenant":
      return row.tenant.displayName;
    case "contactPerson":
      return row.tenant.contactPerson;
    case "startDate":
      return date(row.startDate);
    case "endDate":
      return date(row.terminationDate ?? row.endDate);
    case "daysLeft":
      return row.daysLeft;
    case "monthlyRent":
      // Exported as a number for spreadsheets; values are exact to the centavo.
      return Number(row.monthlyRent);
    case "rentDueDay":
      return row.rentDueDay;
    case "status":
      return LEASE_STATUS_LABELS[row.status];
    case "remarks":
      return row.remarks;
    case "reminderStatus":
      return row.reminder?.label ?? null;
    default:
      return null;
  }
}

export interface ExportResult {
  filename: string;
  contentType: string;
  body: Buffer;
  count: number;
}

/**
 * Export the leases the user is looking at (same filters as the grid, their visible columns,
 * or just the selected rows). Every export is recorded in the audit log.
 */
export async function exportLeases(
  actor: AuditActor,
  opts: { filters: LeaseFilters; columns: string[]; format: ExportFormat },
  meta: RequestMeta,
  now = new Date(),
): Promise<ExportResult> {
  assertCan(actor, "data.export");
  const columns = opts.columns.filter(
    (c): c is GridColumnId =>
      (GRID_COLUMN_IDS as string[]).includes(c) && !NOT_YET.includes(c as GridColumnId),
  );
  const cols = columns.length
    ? columns
    : ([
        "refNo",
        "building",
        "unit",
        "tenant",
        "startDate",
        "endDate",
        "monthlyRent",
        "status",
      ] as GridColumnId[]);
  const rows = await listLeases(actor, opts.filters, now);
  const labels = cols.map((id) => GRID_COLUMNS.find((c) => c.id === id)!.label);
  const stamp = manilaToday(now);

  let body: Buffer;
  if (opts.format === "csv") {
    body = Buffer.from(
      toCsv(
        labels,
        rows.map((r) => cols.map((c) => cell(r, c, false) as string | number | null)),
      ),
      "utf8",
    );
  } else {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Propfolio";
    wb.created = now;
    const ws = wb.addWorksheet("Leases", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map((id, i) => ({
      header: labels[i],
      key: id,
      width: id === "remarks" ? 40 : id === "tenant" || id === "building" ? 28 : 16,
      style:
        id === "monthlyRent"
          ? { numFmt: '"₱"#,##0.00' }
          : id === "startDate" || id === "endDate"
            ? { numFmt: "d mmm yyyy" }
            : {},
    }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(Object.fromEntries(cols.map((c) => [c, cell(r, c, true)])));
    body = Buffer.from(await wb.xlsx.writeBuffer());
  }

  await writeAudit({
    actor,
    action: "data.export",
    entityType: "Lease",
    metadata: {
      format: opts.format,
      rows: rows.length,
      columns: cols,
      filters: {
        ...opts.filters,
        ids: opts.filters.ids ? `${opts.filters.ids.length} selected` : undefined,
      },
    },
    meta,
  });

  return {
    filename: `propfolio-leases-${stamp}.${opts.format}`,
    contentType:
      opts.format === "csv"
        ? "text/csv; charset=utf-8"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body,
    count: rows.length,
  };
}
