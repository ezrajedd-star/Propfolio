import ExcelJS from "exceljs";

import { toCsv } from "@/domain/export/csv";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import type { ExportFormat, ExportResult } from "@/server/leases/export";
import type { RequestMeta } from "@/server/request-meta";
import { overdueReport } from "./balances";

const HEADERS = [
  "Lease",
  "Tenant",
  "Unit",
  "Amount overdue",
  "Oldest due date",
  "Days overdue (bucket)",
  "Unpaid charges",
];

/** Download the overdue list (Payments page). Every export is recorded in the audit log. */
export async function exportOverdue(
  actor: AuditActor,
  format: ExportFormat,
  meta: RequestMeta,
  now = new Date(),
): Promise<ExportResult> {
  assertCan(actor, "data.export");
  const report = await overdueReport(actor, now);
  const stamp = manilaToday(now);
  let body: Buffer;
  if (format === "csv") {
    body = Buffer.from(
      toCsv(
        HEADERS,
        report.rows.map((r) => [
          r.refNo,
          r.tenantName,
          r.unitLabel,
          r.overdue,
          formatIsoDate(r.oldestDueDate),
          r.bucket,
          r.count,
        ]),
      ),
      "utf8",
    );
  } else {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Propfolio";
    wb.created = now;
    const ws = wb.addWorksheet("Overdue", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: HEADERS[0], key: "refNo", width: 16 },
      { header: HEADERS[1], key: "tenant", width: 30 },
      { header: HEADERS[2], key: "unit", width: 30 },
      { header: HEADERS[3], key: "overdue", width: 18, style: { numFmt: '"₱"#,##0.00' } },
      { header: HEADERS[4], key: "oldest", width: 16, style: { numFmt: "d mmm yyyy" } },
      { header: HEADERS[5], key: "bucket", width: 20 },
      { header: HEADERS[6], key: "count", width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of report.rows) {
      ws.addRow({
        refNo: r.refNo,
        tenant: r.tenantName,
        unit: r.unitLabel,
        overdue: Number(r.overdue),
        oldest: new Date(`${r.oldestDueDate}T00:00:00Z`),
        bucket: r.bucket,
        count: r.count,
      });
    }
    body = Buffer.from(await wb.xlsx.writeBuffer());
  }
  await writeAudit({
    actor,
    action: "data.export",
    entityType: "Payment",
    metadata: { format, rows: report.rows.length, report: "overdue" },
    meta,
  });
  return {
    filename: `propfolio-overdue-${stamp}.${format}`,
    contentType:
      format === "csv"
        ? "text/csv; charset=utf-8"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body,
    count: report.rows.length,
  };
}
