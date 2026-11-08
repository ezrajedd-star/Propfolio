import ExcelJS from "exceljs";

import { isIsoDate, type IsoDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { writeAudit } from "@/server/audit";
import type { PlatformActor } from "@/server/platform/auth";
import type { RequestMeta } from "@/server/request-meta";
import { listPaymentRecords } from "./service";

/** A date range from the address, defaulting to this month so far (Manila). */
export function paymentRange(from?: string | null, to?: string | null, now = new Date()) {
  const today = manilaToday(now);
  const f = from && isIsoDate(from) ? from : `${today.slice(0, 8)}01`;
  const t = to && isIsoDate(to) ? to : today;
  return f <= t ? { from: f, to: t } : { from: t, to: f };
}

export async function listPaymentsForPlatform(
  _admin: PlatformActor,
  range: { from: IsoDate; to: IsoDate },
) {
  return listPaymentRecords(range);
}

/** The bookkeeper's export: every payment record in the range, one row each. Audited. */
export async function exportPayments(
  admin: PlatformActor,
  range: { from: IsoDate; to: IsoDate },
  meta: RequestMeta,
): Promise<Buffer> {
  const rows = await listPaymentRecords(range);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Payments");
  ws.columns = [
    { header: "Number", key: "number", width: 18 },
    { header: "Date (Manila)", key: "date", width: 14 },
    { header: "Customer", key: "customer", width: 32 },
    { header: "Customer address", key: "address", width: 40 },
    { header: "Plan", key: "plan", width: 10 },
    { header: "Description", key: "description", width: 44 },
    { header: "Period from", key: "from", width: 12 },
    { header: "Period to", key: "to", width: 12 },
    { header: "Amount (PHP)", key: "amount", width: 14 },
    { header: "Method", key: "method", width: 12 },
    { header: "Provider", key: "provider", width: 10 },
    { header: "Provider reference", key: "ref", width: 32 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      number: r.number,
      date: manilaToday(r.issuedAt),
      customer: r.customerName,
      address: r.customerAddress,
      plan: r.plan,
      description: r.description,
      from: r.periodStart.toISOString().slice(0, 10),
      to: r.periodEnd.toISOString().slice(0, 10),
      amount: Number(r.amount.toFixed(2)),
      method: r.method,
      provider: r.provider,
      ref: r.providerRef ?? "",
    });
  }
  ws.getColumn("amount").numFmt = "#,##0.00";
  ws.addRow([]);
  ws.addRow(["Payment records, not BIR official invoices."]);
  await writeAudit({
    actor: { id: admin.id, name: admin.name, role: null },
    action: "platform.payments_export",
    entityType: "SubscriptionInvoice",
    metadata: { platform: true, ...range, rows: rows.length },
    meta,
    accountId: null,
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
