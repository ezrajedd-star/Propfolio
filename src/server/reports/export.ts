import ExcelJS from "exceljs";

import { toCsv } from "@/domain/export/csv";
import type { ReportColumn, ReportId, ReportValue } from "@/domain/reports/definitions";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import type { ExportFormat, ExportResult } from "@/server/leases/export";
import type { RequestMeta } from "@/server/request-meta";
import { runReport, type ReportFilters } from "./service";

function csvValue(c: ReportColumn, v: ReportValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (c.kind === "date" && typeof v === "string") return formatIsoDate(v);
  if (c.kind === "percent") return `${v}%`;
  return v;
}

function excelValue(c: ReportColumn, v: ReportValue): string | number | Date | null {
  if (v === null || v === undefined) return null;
  if (c.kind === "date" && typeof v === "string") return new Date(`${v}T00:00:00Z`);
  if (c.kind === "money" || c.kind === "number") return Number(v);
  if (c.kind === "percent") return Number(v) / 100;
  return v;
}

const NUM_FMT: Partial<Record<ReportColumn["kind"], string>> = {
  money: '"₱"#,##0.00',
  date: "d mmm yyyy",
  percent: "0.0%",
};

/** Download a report with the same filters as on screen. Every export is audited. */
export async function exportReport(
  actor: AuditActor,
  id: ReportId,
  filters: ReportFilters,
  format: ExportFormat,
  meta: RequestMeta,
  now = new Date(),
): Promise<ExportResult> {
  assertCan(actor, "data.export");
  const r = await runReport(actor, id, filters, now);
  const lines = r.totals ? [...r.rows, r.totals] : r.rows;
  let body: Buffer;
  if (format === "csv") {
    body = Buffer.from(
      toCsv(
        r.columns.map((c) => c.label),
        lines.map((row) => r.columns.map((c) => csvValue(c, row[c.key] ?? null))),
      ),
      "utf8",
    );
  } else {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Propfolio";
    wb.created = now;
    const ws = wb.addWorksheet(r.info.title.slice(0, 31), {
      views: [{ state: "frozen", ySplit: 3 }],
    });
    ws.addRow([r.info.title]).font = { bold: true, size: 14 };
    ws.addRow([r.subtitle]);
    const header = ws.addRow(r.columns.map((c) => c.label));
    header.font = { bold: true };
    r.columns.forEach((c, i) => {
      const column = ws.getColumn(i + 1);
      column.width = c.kind === "text" ? 28 : 16;
      if (NUM_FMT[c.kind]) column.numFmt = NUM_FMT[c.kind]!;
    });
    for (const row of r.rows) ws.addRow(r.columns.map((c) => excelValue(c, row[c.key] ?? null)));
    if (r.totals) {
      ws.addRow(r.columns.map((c) => excelValue(c, r.totals![c.key] ?? null))).font = {
        bold: true,
      };
    }
    body = Buffer.from(await wb.xlsx.writeBuffer());
  }
  await writeAudit({
    actor,
    action: "data.export",
    entityType: "Report",
    metadata: { report: id, format, rows: r.rows.length, filters },
    meta,
  });
  return {
    filename: `propfolio-${id}-${manilaToday(now)}.${format}`,
    contentType:
      format === "csv"
        ? "text/csv; charset=utf-8"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body,
    count: r.rows.length,
  };
}
