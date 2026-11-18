import ExcelJS from "exceljs";

import { IMPORT_COLUMNS } from "@/domain/import/rows";
import { fromDbDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { writeAudit } from "@/server/audit";
import { assertCan, type Actor } from "@/server/auth/authorize";
import { db } from "@/server/db";
import type { RequestMeta } from "@/server/request-meta";
import { BUILDING_TYPE_LABELS } from "@/schemas/property";

const day = (d: Date | null | undefined) => (d ? fromDbDate(d) : "");
const money = (d: { toFixed(n: number): string } | null | undefined) =>
  d ? Number(d.toFixed(2)) : "";
const PRIVACY: Record<string, string> = {
  SIGNED_FORM: "Signed form",
  EMAIL: "Email",
  IN_PERSON: "In person",
};

/**
 * Everything in the account, in one Excel file (the Owner only, on every plan, audited). The
 * first four sheets use the import template's columns, so the file can be imported again into
 * another Propfolio account. Archived records are included and marked.
 */
export async function exportAccountData(
  actor: Actor,
  meta: RequestMeta,
  now = new Date(),
): Promise<{ filename: string; body: Buffer }> {
  assertCan(actor, "billing.manage", { duringReadOnly: true });
  const [account, buildings, units, tenants, leases, charges, payments, documents] =
    await Promise.all([
      db.account.findUniqueOrThrow({ where: { id: actor.accountId }, select: { name: true } }),
      db.building.findMany({ orderBy: { code: "asc" } }),
      db.unit.findMany({
        include: { building: { select: { code: true } }, unitType: { select: { name: true } } },
        orderBy: [{ building: { code: "asc" } }, { unitNumber: "asc" }],
      }),
      db.tenant.findMany({ orderBy: { displayName: "asc" } }),
      db.lease.findMany({
        include: {
          unit: { select: { unitNumber: true, building: { select: { code: true } } } },
          tenant: { select: { displayName: true } },
        },
        orderBy: { startDate: "asc" },
      }),
      db.charge.findMany({
        include: { lease: { select: { refNo: true } } },
        orderBy: { dueDate: "asc" },
      }),
      db.payment.findMany({
        include: { lease: { select: { refNo: true } } },
        orderBy: { receivedDate: "asc" },
      }),
      db.document.findMany({ orderBy: { createdAt: "asc" } }),
    ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Propfolio";
  const sheet = (name: string, headers: string[], rows: (string | number)[][]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(r);
    ws.columns.forEach((c, i) => (c.width = Math.max(12, (headers[i] ?? "").length + 4)));
  };
  const archived = (d: Date | null) => (d ? "Archived" : "");

  sheet(
    "Buildings",
    [...IMPORT_COLUMNS.Buildings, "Archived"],
    buildings.map((b) => [
      b.code,
      b.name,
      b.address,
      BUILDING_TYPE_LABELS[b.type],
      archived(b.archivedAt),
    ]),
  );
  sheet(
    "Units",
    [...IMPORT_COLUMNS.Units, "Archived"],
    units.map((u) => [
      u.building.code,
      u.unitNumber,
      u.unitType.name,
      u.floor ?? "",
      money(u.floorArea),
      archived(u.archivedAt),
    ]),
  );
  sheet(
    "Tenants",
    [...IMPORT_COLUMNS.Tenants, "Archived"],
    tenants.map((t) => [
      t.displayName,
      t.type === "COMPANY" ? "Company" : "Individual",
      t.contactPerson ?? "",
      t.phone ?? "",
      t.email ?? "",
      t.billingAddress ?? "",
      t.tin ?? "",
      t.privacyAckMethod ? PRIVACY[t.privacyAckMethod]! : "",
      t.anonymizedAt ? "Anonymised" : archived(t.archivedAt),
    ]),
  );
  sheet(
    "Leases",
    [...IMPORT_COLUMNS.Leases, "Lease number", "Status", "Archived"],
    leases.map((l) => [
      l.unit.building.code,
      l.unit.unitNumber,
      l.tenant.displayName,
      day(l.startDate),
      day(l.endDate),
      money(l.monthlyRent),
      l.rentDueDay,
      money(l.securityDeposit),
      l.advanceRentType === "MONTHS" ? (l.advanceRentMonths ?? "") : "",
      l.escalationType === "PERCENT" && l.escalationPercent ? Number(l.escalationPercent) : "",
      l.escalationType === "PERCENT" ? (l.escalationEveryMonths ?? "") : "",
      l.refNo,
      l.status,
      archived(l.archivedAt),
    ]),
  );
  sheet(
    "Charges",
    ["Lease number", "Type", "Description", "Due date", "Amount", "Status"],
    charges.map((c) => [
      c.lease.refNo,
      c.type,
      c.description,
      day(c.dueDate),
      money(c.amount),
      c.status,
    ]),
  );
  sheet(
    "Payments",
    ["Payment number", "Lease number", "Received", "Amount", "Method", "Reference", "Status"],
    payments.map((p) => [
      p.paymentNo,
      p.lease.refNo,
      day(p.receivedDate),
      money(p.amount),
      p.method,
      p.reference ?? "",
      p.status,
    ]),
  );
  sheet(
    "Documents",
    ["File name", "Uploaded", "Size (KB)"],
    documents.map((d) => [d.fileName, day(d.createdAt), Math.ceil(d.sizeBytes / 1024)]),
  );
  const readMe = wb.addWorksheet("Read me");
  readMe.columns = [{ width: 110 }];
  [
    `All of ${account.name}'s data in Propfolio, downloaded on ${manilaToday(now)}.`,
    "",
    "Buildings, Units, Tenants and Leases use the import template's columns: this file can be imported into Propfolio again (remove the extra columns on the right first).",
    "Charges and Payments list every amount, including voided ones (marked in Status).",
    "Documents lists the files kept with leases and tenants. Open each lease in Propfolio to download the files themselves.",
    "This file holds tenants' personal details: keep it safe and delete it when you no longer need it.",
  ].forEach((l, i) => (readMe.getCell(i + 1, 1).value = l));
  readMe.getRow(1).font = { bold: true };

  await writeAudit({
    actor: { id: actor.id, name: actor.name, role: actor.role },
    action: "account.export",
    entityType: "Account",
    entityId: actor.accountId,
    metadata: {
      buildings: buildings.length,
      units: units.length,
      tenants: tenants.length,
      leases: leases.length,
      payments: payments.length,
    },
    meta,
  });
  const safe =
    account.name
      .replace(/[^\w .-]+/g, "")
      .trim()
      .slice(0, 60) || "Propfolio";
  return {
    filename: `${safe} - all data ${manilaToday(now)}.xlsx`,
    body: Buffer.from(await wb.xlsx.writeBuffer()),
  };
}
